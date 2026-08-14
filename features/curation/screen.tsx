import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, ActivityIndicator, TextInput, Keyboard, KeyboardAvoidingView, BackHandler, Animated as RNAnimated, Alert } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import CharacterSvg from '@/components/CharacterSvg';
import { AppBannerAd, useTabContentBottomInset, useAdsBottomInset } from '@/components/ads/AppBannerAd';
import { useScrollToTop } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { byokGenerateContentUrl } from '@/lib/ai/model';
import { useTheme } from '@/features/theme';
import { useAuth, isCloudAuthMode } from '@/features/auth';
import {
  useLists,
  useFetchCloudCurations,
  useDeleteCloudCuration,
  createCuratedList,
  addBatchWords,
} from '@/features/vocab';
import { useSettings } from '@/features/settings';
import { VocaList, Word } from '@/lib/types';
import { AIWordResultSchema, AI_GENERATED_TAG, DIFFICULTY_TAGS, type AiDifficulty } from '@shared/contracts';
import { displayTag } from '@/lib/tag-display';
import { cleanPhonetic } from '@/lib/phonetic';
import { generateWordsViaEdge } from '@/lib/ai/edge-generate';
import { useCurationPresets } from './presets';
import ReportCurationModal from './ReportCurationModal';

// 키 없는 로그인 사용자는 운영자 키(Edge)로 생성. 단어 자동완성과 동일한 게이트 환경변수.
const EDGE_ENABLED = process.env.EXPO_PUBLIC_ENRICH_VIA_EDGE === '1';

import { SUPPORTED_LANGUAGES, getLanguageFlag, getLanguageLabel, type LanguageCode } from '@/constants/languages';
import WordDetailModal from '@/components/WordDetailModal';
import { Snackbar } from '@/components/ui/Snackbar';
import { ModalPicker, PickerOption } from '@/components/ui/ModalPicker';
import DialogModal from '@/components/ui/DialogModal';

const DIFFICULTY_PROMPT: Record<AiDifficulty, string> = {
    beginner: '초급 수준의 쉬운',
    intermediate: '중급 수준의',
    advanced: '고급/전문적인',
};

const DIFFICULTY_TAG = DIFFICULTY_TAGS;

const LANG_LABEL_KO: Record<string, string> = {
    en: '영어',
    ko: '한국어',
    ja: '일본어',
    zh: '중국어',
    vi: '베트남어',
    es: '스페인어',
};

// 발음 표기는 도착어(독자)에 독립적인 각 출발어의 표준 표기를 쓴다(세계인 대상).
// en/es/vi=IPA, ja=후리가나, zh=병음, ko=로마자(RR). 한글 전사는 한국어 독자 전용이라 배제.
// Edge(gemini-vertex)·enrich(gemini-client)와 동일 규칙으로 통일.
const PHONETIC_INSTRUCTION: Record<string, string> = {
    en: 'IPA 발음기호 (슬래시 없이, 예: prəˈnʌnsiˌeɪʃən)',
    ko: '로마자 표기 (국립국어원 로마자 표기법, 예: 안녕 → annyeong, 값 → gap)',
    ja: '후리가나 — 히라가나·가타카나로만. 한글·로마자 전사 금지, 괄호 병기 금지, 공백 없이. 표제어가 이미 가나뿐이면 그대로 반복한다 (예: 会議 → かいぎ, ワイン → ワイン, ここ → ここ)',
    zh: '병음 (성조 포함, 예: nǐ hǎo)',
    vi: 'IPA 발음기호 (성조 막대 기호 없이 분절음만 — 성조는 철자의 성조 부호로 충분, 예: đi → ɗi)',
    es: 'IPA 발음기호 (예: gracias → ˈɡɾasjas)',
};

// NOTE: 응답 필드 meaningKr/exampleEn/exampleKr은 레거시 명칭. 실제로는 targetLang 뜻/sourceLang 예문/targetLang 예문 번역.
// 한국어 라벨(`${tgtLabel} 뜻` 등)로 모델에 가이드를 주므로 비-한국어 쌍에서도 동작. 새 함수 추가 시 같은 함정 주의.
function buildPrompt(query: string, wordCount: number, difficulty: AiDifficulty, sourceLang: string, targetLang: string, excludeTerms?: string[]): string {
    const diffLabel = DIFFICULTY_PROMPT[difficulty];
    const srcLabel = LANG_LABEL_KO[sourceLang] ?? sourceLang;
    const tgtLabel = LANG_LABEL_KO[targetLang] ?? targetLang;
    const phoneticInstr = PHONETIC_INSTRUCTION[sourceLang] ?? '해당 언어의 표준 발음 표기';
    const sameLangNote = sourceLang === targetLang
        ? `\n  (참고: 학습 언어와 모국어가 같음. 동의어·유의어 또는 고급 어휘 위주로 생성. meaningKr=같은 언어의 쉬운 뜻풀이, exampleKr=빈 문자열 "" — 같은 언어로의 예문 번역은 무의미. 다른 언어 절대 금지.)`
        : '';
    const excludeNote = excludeTerms && excludeTerms.length > 0
        ? `\n  중요: 다음 단어들은 절대 포함하지 말고 새로운 단어로만 ${wordCount}개 생성해줘 — ${excludeTerms.join(', ')}`
        : '';
    return `성인 학습자가 '${query}' 상황에서 사용할 수 있는 ${diffLabel} ${srcLabel} 단어 ${wordCount}개를 생성해줘.${sameLangNote}${excludeNote}
  응답은 오직 JSON 배열만 반환해야 해. 모든 필드를 빠짐없이 채워야 하며, 비워두지 마.
  - term: ${srcLabel} 단어
  - pos: 품사 (예: noun, verb, adj, adv)
  - phonetic: ${phoneticInstr}
  - definition: ${srcLabel}로 작성한 정의
  - meaningKr: ${tgtLabel} 뜻
  - exampleEn: ${srcLabel} 예문
  - exampleKr: 위 예문의 ${tgtLabel} 번역
  - tags: 주제 태그 배열
  포맷: [{"term": "단어", "pos": "noun", "phonetic": "발음기호", "definition": "${srcLabel} 정의", "meaningKr": "${tgtLabel} 뜻", "exampleEn": "${srcLabel} 예문", "exampleKr": "${tgtLabel} 번역", "tags": ["${query}"]}]`;
}

type GenerateAIWordsResult = { words: Word[]; droppedCount: number };

// AI가 같은 단어를 중복 생성해도 요청 개수를 채우도록 버퍼만큼 더 생성한다.
// 검증·중복제거 후 정확히 요청 개수로 자른다(아래 generateAIWords). quota 차감은
// 요청 개수만 — 버퍼는 운영자 흡수. Edge 경로도 동일 공식으로 서버에서 오버제너레이트.
const aiOverCount = (wordCount: number): number =>
    wordCount + Math.min(6, Math.max(3, Math.ceil(wordCount * 0.2)));

/**
 * AI 생성 실패 사유 — 문장이 아니라 **코드**로 던진다.
 *
 * 아래 generateViaByok·generateAIWords는 컴포넌트 밖의 모듈 함수라 `useTranslation`을
 * 쓸 수 없다. 그래서 예전에는 한국어 문장을 그대로 Error에 담아 던졌고, 화면은 그걸
 * `e.message`로 받아 그대로 보여줬다 — 영어 사용자에게도 한국어가 그대로 나갔다.
 * 코드만 던지고 문구는 화면에서 `aiErrorMessage`가 만든다.
 */
type AiErrorCode =
    | 'dailyQuota'        // Google 무료 등급 일일 한도(BYOK)
    | 'perMinuteQuota'
    | 'quotaReached'      // 그 밖의 한도 — detail에 quotaMetric
    | 'permissionDenied'
    | 'invalidKey'
    | 'timeout'
    | 'unparseable'
    | 'badFormat'
    | 'quotaExceeded'     // 운영자 키(Edge) 경로의 한도
    | 'rateLimited'
    | 'unauthorized'
    | 'failed';           // detail에 API 원문 사유 또는 HTTP 상태

class AiGenerateError extends Error {
    readonly code: AiErrorCode;
    /** API가 준 원문(quotaMetric·에러 메시지·HTTP 상태). 우리 문장이 아니라 번역하지 않는다. */
    readonly detail?: string;

    constructor(code: AiErrorCode, detail?: string) {
        super(detail ? `${code}: ${detail}` : code);
        this.name = 'AiGenerateError';
        this.code = code;
        this.detail = detail;
    }
}

// Edge Function이 주는 실패 종류 → 화면 코드.
const EDGE_GENERATE_CODE: Record<string, AiErrorCode> = {
    quota_exceeded: 'quotaExceeded',
    rate_limited: 'rateLimited',
    unauthorized: 'unauthorized',
};

/**
 * AI 생성 실패를 사용자 문구로. 우리 코드가 아닌 에러는 기존 동작대로 message를 쓴다.
 *
 * detail이 있으면 `_detail` 키를 쓴다 — "한도에 도달했습니다 (metric)"처럼 괄호를
 * 붙일지 말지는 언어마다 문장 구조가 달라 문자열 안에서 조건 분기할 수 없다.
 */
function aiErrorMessage(e: any, t: TFunction): string {
    if (e instanceof AiGenerateError) {
        // 키 배열 = 순서대로 있는 것을 고른다. `_detail`이 없는 코드에 detail이 붙어도
        // 키 문자열이 그대로 노출되지 않고 기본 문구로 떨어진다.
        const keys = e.detail
            ? [`aiError.${e.code}_detail`, `aiError.${e.code}`]
            : [`aiError.${e.code}`];
        return t(keys, { detail: e.detail ?? '' });
    }
    return e?.message || t('curation.aiGenerateError');
}

const generateViaByok = async (
    query: string,
    apiKey: string,
    wordCount: number,
    difficulty: AiDifficulty,
    sourceLang: string,
    targetLang: string,
    excludeTerms?: string[],
    signal?: AbortSignal,
): Promise<unknown> => {
    const url = byokGenerateContentUrl(apiKey);
    const prompt = buildPrompt(query, wordCount, difficulty, sourceLang, targetLang, excludeTerms);

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: 'application/json',
            // Gemini 3.x는 숫자 thinkingBudget 대신 thinkingLevel을 쓴다. Flash-Lite는
            // thinking 완전 비활성화를 지원하지 않으므로 가장 낮은 minimal로 비용·지연을
            // 줄인다. temperature도 3.x 권장대로 기본값을 유지한다.
            thinkingConfig: { thinkingLevel: 'minimal' },
        },
    };

    // 내부 60초 타임아웃과 외부(사용자 중단) 신호를 하나의 컨트롤러로 합친다.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    const onExternalAbort = () => controller.abort();
    if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', onExternalAbort);
    }

    let data: any;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        if (!response.ok) {
            const errorBody = await response.json().catch(() => null);
            const error = errorBody?.error;
            const status: string | undefined = error?.status;
            const message: string | undefined = error?.message;
            const quotaViolations = error?.details?.find((d: any) => typeof d?.['@type'] === 'string' && d['@type'].includes('QuotaFailure'))?.violations;
            const quotaMetric: string = quotaViolations?.[0]?.quotaMetric || '';

            console.log('[gemini:curation] error', response.status, { status, message, quotaMetric, violations: quotaViolations });

            if (status === 'RESOURCE_EXHAUSTED' || response.status === 429) {
                if (/per_?day|PerDay/i.test(quotaMetric)) {
                    throw new AiGenerateError('dailyQuota');
                }
                if (/per_?minute|PerMinute/i.test(quotaMetric)) {
                    throw new AiGenerateError('perMinuteQuota');
                }
                throw new AiGenerateError('quotaReached', quotaMetric || undefined);
            }
            if (status === 'PERMISSION_DENIED' || response.status === 403) {
                throw new AiGenerateError('permissionDenied');
            }
            // 400/INVALID_ARGUMENT은 payload·스키마 오류일 수도 있다. 예전에는 전부 키
            // 오류로 단정해, 2.5용 thinkingBudget이 3.5에서 거부된 것도 "키가 올바르지
            // 않다"고 표시했다. 메시지가 실제 키를 가리킬 때만 키 오류로 분류한다.
            if (/API_KEY_INVALID|API key not valid|api key expired/i.test(message ?? '')) {
                throw new AiGenerateError('invalidKey');
            }
            // 원문은 위 진단 로그에만 남긴다. Google의 영어 내부 메시지를 UI로 내보내면
            // 정상적인 요청 거절도 개발자용 오류처럼 보인다.
            throw new AiGenerateError('failed');
        }
        data = await response.json();
    } catch (e: any) {
        if (e?.name === 'AbortError') {
            // 사용자가 직접 중단했으면 AbortError를 그대로 전파(호출부에서 조용히 처리),
            // 그 외(내부 60초 타임아웃)는 안내 메시지로 변환.
            if (signal?.aborted) throw e;
            throw new AiGenerateError('timeout');
        }
        throw e;
    } finally {
        clearTimeout(timeoutId);
        if (signal) signal.removeEventListener('abort', onExternalAbort);
    }
    let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    textResponse = textResponse.trim();
    if (textResponse.startsWith('```')) {
        const firstNewLine = textResponse.indexOf('\n');
        const lastBacktick = textResponse.lastIndexOf('```');
        if (firstNewLine !== -1 && lastBacktick !== -1) {
            textResponse = textResponse.slice(firstNewLine, lastBacktick).trim();
        }
    }

    try {
        return JSON.parse(textResponse);
    } catch (e) {
        console.error('Failed to parse AI response:', textResponse);
        throw new AiGenerateError('unparseable');
    }
};

const generateAIWords = async (
    query: string,
    apiKey: string,
    wordCount: number,
    difficulty: AiDifficulty,
    sourceLang: string,
    targetLang: string,
    excludeTerms?: string[],
    signal?: AbortSignal,
): Promise<GenerateAIWordsResult> => {
    // BYOK 키가 있으면 본인 키로 직접 호출, 없으면 운영자 키(Edge, quota 적용).
    // 오버제너레이트: BYOK는 여기서 버퍼 포함 개수로 요청. Edge는 wordCount만 보내고
    // 서버 내부에서 버퍼만큼 더 생성한다(차감은 wordCount). 둘 다 아래에서 정확히 N개로 자름.
    const overCount = aiOverCount(wordCount);
    let raw: unknown;
    if (apiKey) {
        raw = await generateViaByok(query, apiKey, overCount, difficulty, sourceLang, targetLang, excludeTerms, signal);
    } else {
        const res = await generateWordsViaEdge(query, wordCount, difficulty, sourceLang, targetLang, excludeTerms, signal);
        if (res.kind !== 'ok') throw new AiGenerateError(EDGE_GENERATE_CODE[res.kind] ?? 'failed');
        raw = res.result;
    }

    if (!Array.isArray(raw)) {
        console.error('AI curation: expected array, got:', raw);
        throw new AiGenerateError('badFormat');
    }

    const validated: { item: ReturnType<typeof AIWordResultSchema.parse>; originalIndex: number }[] = [];
    let droppedCount = 0;
    for (let i = 0; i < raw.length; i++) {
        const parsed = AIWordResultSchema.safeParse(raw[i]);
        if (parsed.success) {
            validated.push({ item: parsed.data, originalIndex: i });
        } else {
            droppedCount++;
            console.warn('[gemini:curation] dropped invalid word at index', i, parsed.error.issues);
        }
    }

    if (validated.length === 0) {
        console.error('AI curation: all items failed validation, raw:', raw);
        throw new AiGenerateError('badFormat');
    }

    // 오버제너레이트 보정: 세트 내부 중복(같은 lemma·대소문자만 다른 단어) 제거 후
    // 정확히 요청 개수로 자른다. → 사용자는 항상 요청한 N개를 받는다.
    const seenTerms = new Set<string>();
    const unique = validated.filter(({ item }) => {
        const key = (item.term ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (!key || seenTerms.has(key)) return false;
        seenTerms.add(key);
        return true;
    });
    const finalItems = unique.slice(0, wordCount);

    const now = Date.now();
    const difficultyTag = DIFFICULTY_TAG[difficulty];
    const words: Word[] = finalItems.map(({ item: w, originalIndex }) => {
        const baseTags = w.tags && w.tags.length > 0 ? w.tags : [query];
        return {
            id: `ai-word-${originalIndex}-${now}`,
            term: w.term,
            definition: w.definition,
            meaningKr: w.meaningKr,
            exampleEn: w.exampleEn,
            exampleKr: w.exampleKr ?? '',
            pos: w.pos ?? '',
            phonetic: cleanPhonetic(w.phonetic ?? '', sourceLang, w.term),
            isMemorized: false,
            isStarred: false,
            tags: [...baseTags, AI_GENERATED_TAG, difficultyTag],
            sourceLang,
            targetLang,
        };
    });

    return { words, droppedCount };
};

const getUniqueName = (base: string, existingNames: string[]): string => {
    const lowerNames = existingNames.map(n => n.trim().toLowerCase());
    let candidate = base;
    let suffix = 1;
    while (lowerNames.includes(candidate.trim().toLowerCase())) {
        candidate = `${base}-${suffix}`;
        suffix++;
    }
    return candidate;
};

export default function CurationScreen() {
    const scrollRef = useRef<ScrollView>(null);
    useScrollToTop(scrollRef);
    const scrollY = useRef(new RNAnimated.Value(0)).current;
    const fabAnim = useRef(new RNAnimated.Value(0)).current;
    const isTopBtnVisible = useRef(false);

    const detailScrollRef = useRef<ScrollView>(null);
    const detailScrollY = useRef(new RNAnimated.Value(0)).current;
    const detailFabAnim = useRef(new RNAnimated.Value(0)).current;
    const isDetailTopBtnVisible = useRef(false);

    const insets = useSafeAreaInsets();
    const { colors, isDark, fontFamily } = useTheme();
    const { t } = useTranslation();
    const router = useRouter();
    const [viewMode, setViewMode] = useState<'detailed' | 'compact'>('detailed');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTheme, setSelectedTheme] = useState<VocaList | null>(null);
    const [saving, setSaving] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [isCommunityLoading, setIsCommunityLoading] = useState(true);
    const [detailWord, setDetailWord] = useState<Word | null>(null);
    const [activeTab, setActiveTab] = useState<'official' | 'community'>('official');
    const [communityThemes, setCommunityThemes] = useState<VocaList[]>([]);
    const [languageFilter, setLanguageFilter] = useState<string>('all');
    const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());
    const [showListPicker, setShowListPicker] = useState(false);
    const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; actionLabel?: string; onAction?: () => void }>({ visible: false, message: '' });
    const [masterBarHeight, setMasterBarHeight] = useState(0);

    const lists = useLists();
    // 공식 덱 8.16MB는 앱 시작 경로에서 떼어 뒀다 — 이 화면이 마운트될 때 처음 읽는다.
    // 이름을 그대로 둔 것은 아래 사용처를 건드리지 않기 위해서다(→ ./presets).
    const { presets: curationPresets, loading: isPresetsLoading } = useCurationPresets();
    const fetchCloudCurations = useFetchCloudCurations();
    const deleteCloudCuration = useDeleteCloudCuration();
    const { user, authMode } = useAuth();
    const { apiKey, aiCurationSettings, updateAiCurationSettings } = useSettings();
    const { sourceLang: aiSourceLang, targetLang: aiTargetLang, difficulty: aiDifficulty, wordCount: aiWordCount } = aiCurationSettings;
    const [aiModalVisible, setAiModalVisible] = useState(false);
    const [aiTopic, setAiTopic] = useState('');
    const [aiModalError, setAiModalError] = useState<{ title: string; message: string } | null>(null);
    const [aiSourceLangPickerOpen, setAiSourceLangPickerOpen] = useState(false);
    const [aiTargetLangPickerOpen, setAiTargetLangPickerOpen] = useState(false);
    // 목록 끝의 "뜻 언어" 줄에서 여는 시트. AI 모달 안의 도착어 피커와 같은 값을
    // 고치지만, 이쪽은 화면에서 바로 열리므로 상태를 따로 둔다.
    const [meaningLangPickerOpen, setMeaningLangPickerOpen] = useState(false);
    const [lastGenParams, setLastGenParams] = useState<{ topic: string; difficulty: AiDifficulty; wordCount: number; sourceLang: string; targetLang: string } | null>(null);
    const [regenerating, setRegenerating] = useState(false);
    // 진행 중 생성 요청을 취소(중단)하기 위한 AbortController. 사용자가 닫기를 누르면 abort.
    const genAbortRef = useRef<AbortController | null>(null);
    // 생성은 비스트리밍 단일 호출이라 보통 15~25초 걸린다. 실제 진행률은 알 수 없으므로
    // 경과 시간에 맞춰 안내 문구를 단계적으로 바꿔 "멈춘 게 아니라 작업 중"임을 보여준다.
    const [genStep, setGenStep] = useState(0);

    useEffect(() => {
        let mounted = true;
        setIsCommunityLoading(true);
        fetchCloudCurations().then(data => {
            if (mounted) {
                // Server curations have a superset of VocaList fields via
                // `.passthrough()`; the UI reads only what it needs so this
                // cast is safe.
                setCommunityThemes(data as unknown as VocaList[]);
                setIsCommunityLoading(false);
            }
        });
        return () => { mounted = false; };
    }, [fetchCloudCurations]);

    // 생성 중일 때만 안내 문구를 ~4.5초 간격으로 다음 단계로 넘긴다(마지막 단계에서 멈춤).
    const aiGeneratingSteps = useMemo(
        () => t('curation.aiGeneratingSteps', { returnObjects: true }) as string[],
        [t],
    );
    useEffect(() => {
        const busy = generating || regenerating;
        if (!busy) { setGenStep(0); return; }
        setGenStep(0);
        const id = setInterval(() => {
            setGenStep(prev => Math.min(prev + 1, aiGeneratingSteps.length - 1));
        }, 4500);
        return () => clearInterval(id);
    }, [generating, regenerating, aiGeneratingSteps.length]);

    // Initialize word selection when theme is selected
    useEffect(() => {
        if (selectedTheme) {
            setSelectedWordIds(new Set(selectedTheme.words.map((_, i) => String(i))));
        } else {
            setSelectedWordIds(new Set());
        }
    }, [selectedTheme]);

    useEffect(() => {
        const backAction = () => {
            if (showListPicker) {
                setShowListPicker(false);
                return true;
            }
            if (detailWord) {
                setDetailWord(null);
                return true;
            }
            if (selectedTheme) {
                setSelectedTheme(null);
                return true;
            }
            return false;
        };

        const backHandler = BackHandler.addEventListener(
            "hardwareBackPress",
            backAction
        );

        return () => backHandler.remove();
    }, [selectedTheme, detailWord, showListPicker]);

    useEffect(() => {
        const listener = scrollY.addListener(({ value }) => {
            const shouldShow = value > 300;
            if (shouldShow !== isTopBtnVisible.current) {
                isTopBtnVisible.current = shouldShow;
                RNAnimated.spring(fabAnim, { toValue: shouldShow ? 1 : 0, useNativeDriver: true, tension: 60, friction: 8 }).start();
            }
        });
        return () => scrollY.removeListener(listener);
    }, [scrollY, fabAnim]);

    useEffect(() => {
        const listener = detailScrollY.addListener(({ value }) => {
            const shouldShow = value > 200;
            if (shouldShow !== isDetailTopBtnVisible.current) {
                isDetailTopBtnVisible.current = shouldShow;
                RNAnimated.spring(detailFabAnim, { toValue: shouldShow ? 1 : 0, useNativeDriver: true, tension: 60, friction: 8 }).start();
            }
        });
        return () => detailScrollY.removeListener(listener);
    }, [detailScrollY, detailFabAnim]);

    const sourceThemes = activeTab === 'official' ? curationPresets : communityThemes;
    /*
     * 필터 축이 둘에서 셋으로 늘어난다: 검색어 · 배울 언어(칩) · 뜻 언어.
     *
     * 뜻 언어를 안 보던 동안, 일본어로 앱을 쓰는 사람이 "영어" 칩을 눌러도 뜻이
     * 한국어인 덱 35개가 그대로 나왔다 — 읽을 수 없는 목록이다. 반대로 한국어
     * 사용자에게는 외국인용 한국어 교재 13개가 섞여 보였다.
     *
     * 공식 덱에만 건다. 커뮤니티는 덱 수가 적어 같은 규칙을 걸면 탭이 통째로 빌
     * 수 있고, 남이 공유한 것을 구경하는 성격이라 덜 엄격해도 자연스럽다.
     * targetLanguage가 없는 덱(구버전·커뮤니티)은 거르지 않고 통과시킨다.
     */
    const filteredThemes = useMemo(() => sourceThemes.filter(th => {
        const matchesSearch = th.title.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesLang = languageFilter === 'all' || th.sourceLanguage === languageFilter;
        const matchesMeaning = activeTab !== 'official'
            || !th.targetLanguage
            || th.targetLanguage === aiTargetLang;
        return matchesSearch && matchesLang && matchesMeaning;
    }), [sourceThemes, searchQuery, languageFilter, activeTab, aiTargetLang]);

    /*
     * 뜻 언어 시트에 붙는 덱 수. 공식 덱 전체를 센다 — 검색어나 배울 언어 칩이
     * 걸린 상태에서 세면 "그 언어로 바꾸면 뭐가 있는지"를 오히려 가린다.
     */
    const meaningLangCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const preset of curationPresets) {
            const tg = preset.targetLanguage;
            if (!tg) continue;
            counts.set(tg, (counts.get(tg) ?? 0) + 1);
        }
        return counts;
        // 덱이 지연 로드라 처음엔 빈 배열이다 — 도착하면 다시 세야 한다.
    }, [curationPresets]);

    /* 덱이 하나도 없는 언어는 숨긴다 — 고르면 빈 화면이 되는 선택지다. 다만 지금
     * 고른 언어는 개수가 0이어도 남겨야 자기 상태가 보인다. */
    const meaningLangOptions = useMemo(
        () => SUPPORTED_LANGUAGES
            .filter(l => (meaningLangCounts.get(l.code) ?? 0) > 0 || l.code === aiTargetLang)
            .map(l => ({
                id: l.code,
                title: getLanguageLabel(l.code, t),
                subtitle: t('curation.nDecks', { count: meaningLangCounts.get(l.code) ?? 0 }),
            })),
        [meaningLangCounts, aiTargetLang, t],
    );

    const langFilterChips = useMemo(() => [
        { code: 'all', label: t('curation.langAll') },
        ...SUPPORTED_LANGUAGES.map(l => ({ code: l.code, label: getLanguageLabel(l.code, t) })),
    ], [t]);

    const getLevelStyle = (level?: string) => {
        switch (level) {
            case 'beginner': return { label: t('curation.beginner'), bg: colors.difficulty.beginnerBg, color: colors.difficulty.beginnerText };
            case 'intermediate': return { label: t('curation.intermediate'), bg: colors.difficulty.intermediateBg, color: colors.difficulty.intermediateText };
            case 'advanced': return { label: t('curation.advanced'), bg: colors.difficulty.advancedBg, color: colors.difficulty.advancedText };
            default: return null;
        }
    };

    const getTopTags = (theme: VocaList): string[] => {
        const counts: Record<string, number> = {};
        for (const w of theme.words) {
            if (w.tags) {
                for (const t of w.tags) {
                    counts[t] = (counts[t] || 0) + 1;
                }
            }
        }
        if (theme.category && !counts[theme.category]) {
            counts[theme.category] = theme.words.length;
        }
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(e => e[0]);
    };

    const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

    const dailyTip = useMemo(() => {
        const tips = t('curation.tips', { returnObjects: true }) as string[];
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
        return tips[dayOfYear % tips.length];
    }, [t]);
    const tabBarHeight = useBottomTabBarHeight();
    const bottomInset = Platform.OS === 'web' ? 84 + 34 : tabBarHeight;
    const tabContentBottomPadding = useTabContentBottomInset(24);
    const adsInset = useAdsBottomInset();

    const selectedCount = selectedWordIds.size;
    const totalCount = selectedTheme?.words.length ?? 0;
    const allSelected = selectedCount === totalCount && totalCount > 0;

    const toggleWordSelection = useCallback((index: number) => {
        setSelectedWordIds(prev => {
            const next = new Set(prev);
            const key = String(index);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const toggleSelectAll = useCallback(() => {
        if (!selectedTheme) return;
        if (allSelected) {
            setSelectedWordIds(new Set());
        } else {
            setSelectedWordIds(new Set(selectedTheme.words.map((_, i) => String(i))));
        }
    }, [selectedTheme, allSelected]);

    const getSelectedWords = useCallback(() => {
        if (!selectedTheme) return [];
        return selectedTheme.words
            .filter((_, i) => selectedWordIds.has(String(i)))
            .map(w => ({
                term: w.term,
                meaningKr: w.meaningKr,
                definition: w.definition,
                phonetic: w.phonetic,
                pos: w.pos,
                exampleEn: w.exampleEn,
                exampleKr: w.exampleKr,
                isStarred: false,
                tags: w.tags || []
            }));
    }, [selectedTheme, selectedWordIds]);

    const importOptions: PickerOption[] = useMemo(() =>
        lists.map(l => ({
            id: l.id,
            title: l.title,
            subtitle: t('curation.wordsIncluded', { count: l.words.length }),
        })),
        [lists, t]
    );

    const isAlreadySaved = useCallback((theme: VocaList): boolean => {
        return lists.some(l => l.isCurated && l.title.startsWith(theme.title));
    }, [lists]);

    const canDeleteCuration = useCallback((theme: VocaList): boolean => {
        if (!user) return false;
        return theme.creatorId === user.id || user.isAdmin;
    }, [user]);

    // 신고는 로그인 사용자가 자신의 큐레이션이 아닌 경우 노출. admin은 신고 대신
    // 삭제가 정답이라 신고 버튼은 안 보임 (canDeleteCuration이 admin도 포함).
    const canReportCuration = useCallback((theme: VocaList): boolean => {
        if (!user) return false;
        if (canDeleteCuration(theme)) return false;
        return true;
    }, [user, canDeleteCuration]);

    const [reportModalTheme, setReportModalTheme] = useState<VocaList | null>(null);

    const handleDeleteCuration = useCallback((theme: VocaList) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert(
            t('curation.deleteConfirmTitle'),
            t('curation.deleteConfirmMessage', { title: theme.title }),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteCloudCuration(theme.id);
                            setCommunityThemes(prev => prev.filter(c => c.id !== theme.id));
                            if (selectedTheme?.id === theme.id) setSelectedTheme(null);
                            setSnackbar({ visible: true, message: t('curation.deleteSuccess') });
                        } catch (e: any) {
                            setSnackbar({ visible: true, message: t('curation.deleteError') });
                        }
                    },
                },
            ],
        );
    }, [t, deleteCloudCuration, selectedTheme]);

    const hasApiKey = !!apiKey;
    // 키 없는 로그인 사용자는 운영자 키(Edge)로 생성 가능. 게스트(미로그인)·키없음만 차단.
    const canGenerateAi = hasApiKey || (isCloudAuthMode(authMode) && EDGE_ENABLED);

    const handleOpenAiModal = () => {
        if (!canGenerateAi) {
            Alert.alert(
                t('common.aiApiKeyRequired'),
                t('common.aiApiKeyRequiredDesc'),
                [
                    { text: t('common.later'), style: 'cancel' },
                    {
                        text: t('common.setupNow'),
                        onPress: () => router.push('/advanced-settings?openApiKey=1' as any),
                    },
                ],
            );
            return;
        }
        setAiTopic(searchQuery);
        setAiModalError(null);
        setAiModalVisible(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handleGenerateAI = async () => {
        if (!aiTopic.trim()) {
            setSnackbar({ visible: true, message: t('curation.enterSearchFirst') });
            return;
        }
        const controller = new AbortController();
        genAbortRef.current = controller;
        setAiModalError(null);
        setGenerating(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const topic = aiTopic.trim();
        const sourceLang = aiSourceLang;
        const targetLang = aiTargetLang;
        try {
            const { words, droppedCount } = await generateAIWords(topic, apiKey, aiWordCount, aiDifficulty, sourceLang, targetLang, undefined, controller.signal);
            // supabase.functions.invoke의 signal이 fetch까지 전파되지 않는 환경이 있어,
            // abort 후 응답이 늦게 도착할 수 있다. abort된 요청의 결과는 버린다.
            if (controller.signal.aborted) return;
            const newTheme: VocaList = {
                id: `ai-theme-${Date.now()}`,
                title: `AI: ${topic}`,
                icon: '✨',
                words,
                isVisible: true,
                createdAt: Date.now(),
                isCurated: true,
                sourceLanguage: sourceLang,
                targetLanguage: targetLang,
            };
            setLastGenParams({ topic, difficulty: aiDifficulty, wordCount: aiWordCount, sourceLang, targetLang });
            setAiModalVisible(false);
            setSelectedTheme(newTheme);
            if (droppedCount > 0) {
                setSnackbar({
                    visible: true,
                    message: t('curation.aiPartialResult', { kept: words.length, dropped: droppedCount }),
                });
            }
        } catch (e: any) {
            // 사용자가 직접 중단했거나 abort 이후 도착한 에러는 조용히 무시 — UI는 cancel 시 이미 정리됨.
            if (e?.name === 'AbortError' || controller.signal.aborted) return;
            const isByokQuota = e instanceof AiGenerateError
                && (e.code === 'dailyQuota' || e.code === 'perMinuteQuota' || e.code === 'quotaReached');
            setAiModalError(isByokQuota
                ? {
                    title: t('scanError.quotaTitle'),
                    message: t('scanError.byokQuotaExceeded'),
                }
                : {
                    title: t('common.error'),
                    message: aiErrorMessage(e, t),
                });
        } finally {
            // abort된 요청은 cancel 핸들러가 이미 generating=false로 만들었으니 덮어쓰지 않는다.
            if (!controller.signal.aborted) setGenerating(false);
            if (genAbortRef.current === controller) genAbortRef.current = null;
        }
    };

    // 진행 중 닫기 시도 → 중단 확인. "중단" 누르면 UI는 즉시 정리하고, 백엔드 요청은
    // best-effort로 abort. supabase.functions.invoke의 signal이 fetch까지 전파되지 않는
    // 환경이 있어, abort가 통하지 않아도 UI는 안 막히도록 동기적으로 닫는다.
    const handleCancelGenerate = () => {
        Alert.alert(
            t('curation.aiCancelTitle'),
            t('curation.aiCancelMessage'),
            [
                { text: t('curation.aiCancelKeep'), style: 'cancel' },
                {
                    text: t('curation.aiCancelConfirm'),
                    style: 'destructive',
                    onPress: () => {
                        genAbortRef.current?.abort();
                        setGenerating(false);
                        setAiModalVisible(false);
                    },
                },
            ],
        );
    };

    const handleRegenerate = async () => {
        if (!lastGenParams || regenerating || !selectedTheme) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setRegenerating(true);
        try {
            const excludeTerms = selectedTheme.words.map(w => w.term);
            const { words } = await generateAIWords(
                lastGenParams.topic,
                apiKey,
                lastGenParams.wordCount,
                lastGenParams.difficulty,
                lastGenParams.sourceLang,
                lastGenParams.targetLang,
                excludeTerms,
            );
            const seenLower = new Set(excludeTerms.map(t => t.trim().toLowerCase()));
            const fresh = words.filter(w => !seenLower.has(w.term.trim().toLowerCase()));

            if (fresh.length === 0) {
                setSnackbar({ visible: true, message: t('curation.aiNoNewWords') });
                return;
            }
            setSelectedTheme(prev => prev ? { ...prev, words: fresh } : prev);
            if (fresh.length < lastGenParams.wordCount) {
                setSnackbar({
                    visible: true,
                    message: t('curation.aiRegeneratePartial', { count: fresh.length }),
                });
            }
        } catch (e: any) {
            if (e?.name === 'AbortError') return;
            setSnackbar({ visible: true, message: aiErrorMessage(e, t) });
        } finally {
            setRegenerating(false);
        }
    };

    const handleCreateNew = async () => {
        if (!selectedTheme) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const words = getSelectedWords();

        // AI가 같은 lemma를 두 번 뱉거나 대소문자만 다른 단어를 만들면
        // words 테이블의 (listId, LOWER(TRIM(term))) UNIQUE 인덱스에 걸린다.
        // INSERT 직전에 결정론적으로 dedup.
        const normalizeTerm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
        const seen = new Set<string>();
        const deduped = words.filter(w => {
            const key = normalizeTerm(w.term ?? '');
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        const skippedCount = words.length - deduped.length;

        if (deduped.length === 0) {
            setSnackbar({ visible: true, message: t('curation.allDuplicates') });
            return;
        }

        setSaving(true);
        try {
            const uniqueTitle = getUniqueName(selectedTheme.title, lists.map(l => l.title));
            const newList = await createCuratedList(uniqueTitle, selectedTheme.icon || '✨', deduped, {
                sourceLanguage: selectedTheme.sourceLanguage,
                targetLanguage: selectedTheme.targetLanguage,
            });
            const message = skippedCount > 0
                ? t('curation.createdWithSkipped', { skipped: skippedCount })
                : t('curation.savedSuccess');
            setSnackbar({
                visible: true,
                message,
                actionLabel: t('curation.goToVocabList'),
                onAction: () => router.push(`/list/${newList.id}`),
            });
            setSelectedTheme(null);
        } catch (e: any) {
            setSnackbar({ visible: true, message: t('curation.saveError') });
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    const handleImport = async (targetListId: string) => {
        if (!selectedTheme) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSaving(true);
        setShowListPicker(false);
        const incomingWords = getSelectedWords();
        const targetList = lists.find(l => l.id === targetListId);

        const normalizeTerm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
        const existing = new Set((targetList?.words ?? []).map(w => normalizeTerm(w.term)));
        const wordsToAdd = incomingWords.filter(w => !existing.has(normalizeTerm(w.term)));
        const skippedCount = incomingWords.length - wordsToAdd.length;

        try {
            // 전체 중복: DB 호출 없이 알림만 표시, 단어장 이동 액션도 비활성
            if (wordsToAdd.length === 0) {
                setSnackbar({ visible: true, message: t('curation.allDuplicates') });
                return;
            }

            await addBatchWords(targetListId, wordsToAdd);
            const message = skippedCount > 0
                ? t('curation.addedWithSkipped', { title: targetList?.title ?? '', added: wordsToAdd.length, skipped: skippedCount })
                : t('curation.addedToExistingList', { title: targetList?.title ?? '' });
            setSnackbar({
                visible: true,
                message,
                actionLabel: t('curation.goToVocabList'),
                onAction: () => router.push(`/list/${targetListId}`),
            });
            setSelectedTheme(null);
        } catch (e: any) {
            setSnackbar({ visible: true, message: t('curation.saveError') });
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.container, { backgroundColor: colors.background }]}>
            {selectedTheme ? (
                <View style={[styles.container, { backgroundColor: colors.background }]}>
                    <ScrollView
                        ref={detailScrollRef}
                        style={{ flex: 1 }}
                        contentContainerStyle={{ paddingBottom: masterBarHeight > 0 ? masterBarHeight + 8 : 140 }}
                        onScroll={RNAnimated.event([{ nativeEvent: { contentOffset: { y: detailScrollY } } }], { useNativeDriver: false })}
                        scrollEventThrottle={16}
                    >
                        <View style={[styles.detailHero, { backgroundColor: colors.surfaceSecondary, paddingTop: topInset + 16 }]}>
                            <Pressable onPress={() => setSelectedTheme(null)} style={[styles.backBtn, { backgroundColor: 'rgba(255,255,255,0.7)' }]}>
                                <Ionicons name="arrow-back" size={24} color={colors.text} />
                            </Pressable>
                            {activeTab === 'community' && canDeleteCuration(selectedTheme) && (
                                <Pressable
                                    onPress={() => handleDeleteCuration(selectedTheme)}
                                    style={[styles.backBtn, { backgroundColor: 'rgba(255,255,255,0.7)', left: undefined, right: 20 }]}
                                    hitSlop={8}
                                >
                                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                                </Pressable>
                            )}
                            {activeTab === 'community' && canReportCuration(selectedTheme) && (
                                <Pressable
                                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setReportModalTheme(selectedTheme); }}
                                    style={[styles.backBtn, { backgroundColor: 'rgba(255,255,255,0.7)', left: undefined, right: 20 }]}
                                    hitSlop={8}
                                >
                                    <Ionicons name="flag-outline" size={20} color={colors.text} />
                                </Pressable>
                            )}
                            <View style={styles.heroContent}>
                                <Text style={{ fontSize: 64 }}>{selectedTheme.icon}</Text>
                            </View>
                            <View style={styles.heroTextContainer}>
                                <Text style={[styles.detailTitle, { color: colors.text }]}>{selectedTheme.title}</Text>
                                <View style={styles.heroMetaRow}>
                                    <Text style={[styles.detailDesc, { color: colors.textSecondary }]}>
                                        {t('curation.nExpertWords', { count: selectedTheme.words.length })}
                                    </Text>
                                    {(() => {
                                        const levelStyle = getLevelStyle(selectedTheme.level);
                                        return levelStyle ? (
                                            <View style={[styles.levelBadge, { backgroundColor: levelStyle.bg }]}>
                                                <Text style={[styles.levelBadgeText, { color: levelStyle.color }]}>{levelStyle.label}</Text>
                                            </View>
                                        ) : null;
                                    })()}
                                    {selectedTheme.creatorName && (
                                        <Text style={[styles.detailDesc, { color: colors.textSecondary }]}>• by {selectedTheme.creatorName}</Text>
                                    )}
                                </View>
                                {selectedTheme.description && (
                                    <Text style={[styles.detailDescription, { color: colors.textSecondary }]}>
                                        {selectedTheme.description}
                                    </Text>
                                )}
                                {selectedTheme.isAiGenerated && (
                                    <Text style={[styles.aiGeneratedNote, { color: colors.textTertiary }]}>
                                        {t('curation.aiGeneratedNote')}
                                    </Text>
                                )}
                                {(selectedTheme.downloadCount ?? 0) > 0 && (
                                    <View style={styles.downloadRow}>
                                        <Ionicons name="download-outline" size={14} color={colors.textTertiary} />
                                        <Text style={{ fontSize: 12, color: colors.textTertiary, fontFamily: 'Pretendard_500Medium' }}>{selectedTheme.downloadCount}</Text>
                                    </View>
                                )}
                                {(() => {
                                    const tags = getTopTags(selectedTheme);
                                    return tags.length > 0 ? (
                                        <View style={[styles.tagRow, { marginTop: 8, justifyContent: 'flex-end' }]}>
                                            {tags.map(tag => (
                                                <View key={tag} style={[styles.tagChip, { backgroundColor: isDark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.65)' }]}>
                                                    <Text style={[styles.tagText, { color: colors.text }]}>#{displayTag(tag, t)}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    ) : null;
                                })()}
                            </View>
                        </View>
                        <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 0 }}>
                            <View style={styles.selectionBar}>
                                <Text style={[styles.selectionText, { color: colors.textSecondary, marginRight: 8 }]}>
                                    {t('curation.selectedCount', { selected: selectedCount, total: totalCount })}
                                </Text>
                                <View style={{ paddingRight: 16 }}>
                                    <Pressable onPress={toggleSelectAll} hitSlop={8}>
                                        <Ionicons
                                            name={allSelected ? 'checkbox' : selectedCount > 0 ? 'checkbox-outline' : 'square-outline'}
                                            size={24}
                                            color={selectedCount > 0 ? colors.primary : colors.textTertiary}
                                        />
                                    </Pressable>
                                </View>
                            </View>
                        </View>
                        <View style={{ padding: 24, paddingTop: 4 }}>
                            {selectedTheme.words.map((w, i) => {
                                const isSelected = selectedWordIds.has(String(i));
                                return (
                                    <Pressable
                                        key={i}
                                        onPress={() => { Haptics.selectionAsync(); setDetailWord(w); }}
                                        style={({ pressed }) => [
                                            styles.wordItem,
                                            { backgroundColor: colors.surface, borderColor: colors.borderLight, opacity: pressed ? 0.7 : isSelected ? 1 : 0.4 }
                                        ]}
                                    >
                                        <View style={styles.checkboxRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.wordTerm, { color: colors.text }]}>{w.term}</Text>
                                                <Text style={[styles.wordMeaning, { color: colors.primary }]}>{w.meaningKr}</Text>
                                                {w.exampleEn ? (
                                                    <Text style={[styles.wordDesc, { color: colors.textTertiary, marginTop: 4, fontStyle: 'italic' }]}>
                                                        {w.exampleEn}
                                                    </Text>
                                                ) : null}
                                            </View>
                                            <Pressable
                                                onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync(); toggleWordSelection(i); }}
                                                hitSlop={8}
                                                style={styles.checkboxHit}
                                            >
                                                <Ionicons
                                                    name={isSelected ? 'checkbox' : 'square-outline'}
                                                    size={24}
                                                    color={isSelected ? colors.primary : colors.textTertiary}
                                                />
                                            </Pressable>
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </ScrollView>
                    <View
                        style={[styles.masterBar, {
                            paddingBottom: bottomInset + 10,
                            backgroundColor: isDark ? 'rgba(18, 18, 18, 0.92)' : 'rgba(255, 255, 255, 0.92)',
                            borderTopColor: colors.border,
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                        }]}
                        onLayout={(e) => setMasterBarHeight(e.nativeEvent.layout.height)}
                    >
                        <BlurView
                            intensity={80}
                            tint={isDark ? 'dark' : 'light'}
                            style={StyleSheet.absoluteFill}
                        />
                        {selectedTheme.id.startsWith('ai-theme-') && lastGenParams && (
                            <Pressable
                                onPress={handleRegenerate}
                                disabled={regenerating || saving}
                                style={({ pressed }) => [styles.regenerateBtn, { borderColor: colors.borderLight, opacity: pressed ? 0.6 : 1 }]}
                                hitSlop={6}
                                accessibilityLabel={t('curation.aiRegenerateAction')}
                            >
                                {regenerating ? (
                                    <>
                                        <ActivityIndicator size="small" color={colors.primary} />
                                        <Text style={[styles.regenerateBtnText, { color: colors.primary }]}>{aiGeneratingSteps[genStep]}</Text>
                                    </>
                                ) : (
                                    <>
                                        <Ionicons name="refresh" size={16} color={colors.primary} />
                                        <Text style={[styles.regenerateBtnText, { color: colors.primary }]}>{t('curation.aiRegenerateAction')}</Text>
                                    </>
                                )}
                            </Pressable>
                        )}
                        <View style={styles.masterBtnRow}>
                            <Pressable
                                onPress={() => setShowListPicker(true)}
                                disabled={saving || regenerating || selectedCount === 0 || lists.length === 0}
                                style={[styles.masterBtnSecondary, {
                                    backgroundColor: colors.surface,
                                    borderColor: colors.border,
                                }]}
                            >
                                <Text style={[styles.masterBtnSecondaryText, {
                                    color: (saving || regenerating || selectedCount === 0 || lists.length === 0) ? colors.textTertiary : colors.textSecondary,
                                }]}>
                                    {t('curation.addToExisting')}
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={handleCreateNew}
                                disabled={saving || regenerating || selectedCount === 0}
                                style={[styles.masterBtn, {
                                    backgroundColor: (saving || regenerating || selectedCount === 0) ? colors.surface : colors.primaryLight,
                                    borderWidth: 1.5,
                                    borderColor: (saving || regenerating || selectedCount === 0) ? colors.border : colors.primary,
                                }]}
                            >
                                {saving ? <ActivityIndicator color={colors.primary} /> : (
                                    <Text style={[styles.masterBtnText, {
                                        color: (saving || regenerating || selectedCount === 0) ? colors.textTertiary : colors.primary,
                                    }]}>{t('curation.createNewList')}</Text>
                                )}
                            </Pressable>
                        </View>
                    </View>
                    <RNAnimated.View
                        style={{
                            position: 'absolute',
                            right: 20,
                            bottom: tabBarHeight + 88,
                            opacity: detailFabAnim,
                            transform: [{ scale: detailFabAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
                        }}
                        pointerEvents="box-none"
                    >
                        <Pressable
                            onPress={() => { detailScrollRef.current?.scrollTo({ y: 0, animated: true }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                            style={({ pressed }) => [styles.fab, { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', shadowColor: colors.shadow, opacity: pressed ? 0.7 : 1 }]}
                        >
                            {Platform.OS === 'ios' && (
                                <View style={[StyleSheet.absoluteFill, { borderRadius: 24, overflow: 'hidden' }]}>
                                    <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                                </View>
                            )}
                            <Ionicons name="arrow-up" size={24} color={colors.text} />
                        </Pressable>
                    </RNAnimated.View>
                </View>
            ) : (
                <>
                    <View style={[styles.header, { paddingTop: topInset + 16 }]}>
                        <CharacterSvg size={56} isDark={isDark} />
                        <View style={styles.headerTextArea}>
                            <Text style={[styles.headerTitle, { color: colors.text, fontFamily: fontFamily.bold }]}>{t('curation.title')}</Text>
                            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>{dailyTip}</Text>
                        </View>
                        <Pressable onPress={() => setViewMode(prev => prev === 'detailed' ? 'compact' : 'detailed')} style={[styles.actionBtn, { borderColor: colors.border }]}>
                            <Ionicons name={viewMode === 'detailed' ? 'reorder-three-outline' : 'reader-outline'} size={22} color={colors.textSecondary} />
                        </Pressable>
                    </View>

                    <View style={{ paddingHorizontal: 20, paddingVertical: 8 }}>
                        <View style={styles.searchRow}>
                            <View style={[styles.searchBox, { flex: 1, backgroundColor: colors.surface, borderColor: colors.borderLight, shadowColor: colors.shadow }]}>
                                <Ionicons name="search" size={20} color={colors.textTertiary} />
                                <TextInput
                                    placeholder={t('curation.searchPlaceholder')}
                                    placeholderTextColor={colors.textTertiary}
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                    style={[styles.searchInput, { color: colors.text }]}
                                />
                                {searchQuery.length > 0 && (
                                    <Pressable onPress={() => setSearchQuery('')}>
                                        <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
                                    </Pressable>
                                )}
                            </View>
                            <Pressable
                                onPress={handleOpenAiModal}
                                style={[styles.searchAiBtn, { backgroundColor: colors.surface, borderColor: colors.borderLight, shadowColor: colors.shadow }]}
                                accessibilityLabel={t('curation.aiGenerate')}
                            >
                                <Ionicons name="sparkles" size={22} color={colors.accent} />
                            </Pressable>
                        </View>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={styles.langChipContainer}>
                        {langFilterChips.map(chip => {
                            const isActive = languageFilter === chip.code;
                            return (
                                <Pressable
                                    key={chip.code}
                                    onPress={() => { Haptics.selectionAsync(); setLanguageFilter(chip.code); }}
                                    style={[styles.langChip, { backgroundColor: isActive ? colors.primaryButton : colors.surfaceSecondary }]}
                                >
                                    <Text style={[styles.langChipText, { color: isActive ? colors.onPrimary : colors.textSecondary }]}>{chip.label}</Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>

                    <View style={[styles.tabContainer, { borderBottomColor: colors.border }]}>
                        <Pressable
                            style={[styles.tabButton, activeTab === 'official' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                            onPress={() => { Haptics.selectionAsync(); setActiveTab('official'); }}
                        >
                            <Text style={[styles.tabText, { color: activeTab === 'official' ? colors.primary : colors.textSecondary }]}>{t('curation.officialTab')}</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.tabButton, activeTab === 'community' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                            onPress={() => { Haptics.selectionAsync(); setActiveTab('community'); }}
                        >
                            <Text style={[styles.tabText, { color: activeTab === 'community' ? colors.primary : colors.textSecondary }]}>{t('curation.communityTab')}</Text>
                        </Pressable>
                    </View>

                    {(activeTab === 'community' ? isCommunityLoading : isPresetsLoading) ? (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <ActivityIndicator size="large" color={colors.primary} />
                        </View>
                    ) : (
                    <ScrollView
                        ref={scrollRef}
                        style={{ flex: 1 }}
                        contentContainerStyle={[{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: tabContentBottomPadding }, viewMode === 'compact' && { flexDirection: 'column', gap: 12 }]}
                        onScroll={RNAnimated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
                        scrollEventThrottle={16}
                    >
                        {filteredThemes.map(theme => {
                            const levelStyle = getLevelStyle(theme.level);
                            const tags = getTopTags(theme);
                            const srcFlag = getLanguageFlag(theme.sourceLanguage || 'en');
                            const tgtFlag = getLanguageFlag(theme.targetLanguage || 'ko');
                            const srcCode = (theme.sourceLanguage || 'en').toUpperCase();
                            const tgtCode = (theme.targetLanguage || 'ko').toUpperCase();
                            const alreadySaved = isAlreadySaved(theme);
                            const canDelete = activeTab === 'community' && canDeleteCuration(theme);
                            // 언어 미상 덱(언어 컬럼 이전의 구버전 앱이 공유한 것)은
                            // en→ko 폴백이 틀린 정보라 언어쌍 줄 자체를 숨긴다.
                            const showLangPair = languageFilter === 'all' && !!theme.sourceLanguage;

                            return (
                                <Pressable key={theme.id} onPress={() => { Haptics.selectionAsync(); setSelectedTheme(theme); }} style={[styles.themeCard, { backgroundColor: colors.surface, borderColor: isDark ? colors.border : colors.primary + '1A', shadowColor: colors.cardShadow }, viewMode === 'detailed' ? styles.cardDetailed : styles.cardCompact]}>
                                    <View style={{ flex: 1 }}>
                                        <View style={styles.cardHeader}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                                                {theme.icon && <Text style={{ fontSize: 16 }}>{theme.icon}</Text>}
                                                <Text style={[styles.cardTitle, { color: colors.text, flex: 1 }]} numberOfLines={1}>{theme.title}</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                {alreadySaved && (
                                                    <View style={[styles.savedBadge, { backgroundColor: colors.successLight }]}>
                                                        <Ionicons name="checkmark" size={10} color={colors.success} />
                                                        <Text style={[styles.savedBadgeText, { color: colors.success }]}>{t('curation.saved')}</Text>
                                                    </View>
                                                )}
                                                {levelStyle && (
                                                    <View style={[styles.levelBadge, { backgroundColor: levelStyle.bg }]}>
                                                        <Text style={[styles.levelBadgeText, { color: levelStyle.color }]}>{levelStyle.label}</Text>
                                                    </View>
                                                )}
                                                {canDelete && (
                                                    <Pressable
                                                        onPress={(e) => { e.stopPropagation(); handleDeleteCuration(theme); }}
                                                        hitSlop={8}
                                                        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 2 })}
                                                    >
                                                        <Ionicons name="trash-outline" size={16} color={colors.error} />
                                                    </Pressable>
                                                )}
                                            </View>
                                        </View>
                                        {viewMode === 'detailed' && (
                                            <>
                                                {tags.length > 0 && (
                                                    <View style={styles.tagRow}>
                                                        {tags.map(tag => (
                                                            <View key={tag} style={[styles.tagChip, { backgroundColor: colors.surfaceSecondary }]}>
                                                                <Text style={[styles.tagText, { color: colors.textSecondary }]}>#{displayTag(tag, t)}</Text>
                                                            </View>
                                                        ))}
                                                    </View>
                                                )}
                                                {theme.description && (
                                                    <Text style={[styles.cardDesc, { color: colors.textSecondary }]} numberOfLines={1}>{theme.description}</Text>
                                                )}
                                                {showLangPair && (
                                                    <Text style={[styles.langPair, { color: colors.textTertiary }]}>
                                                        {srcFlag} {srcCode} → {tgtFlag} {tgtCode}
                                                    </Text>
                                                )}
                                                <View style={styles.cardFooter}>
                                                    <View style={[styles.wordCountPill, { backgroundColor: colors.primaryLight }]}>
                                                        <Text style={[styles.cardCount, { color: colors.primary }]}>{t('curation.wordsIncluded', { count: theme.words.length })}</Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                        {theme.creatorName && (
                                                            <Text style={{ fontSize: 11, color: colors.textTertiary }}>by {theme.creatorName}</Text>
                                                        )}
                                                        {activeTab === 'community' && (theme.downloadCount ?? 0) > 0 && (
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                                                <Ionicons name="download-outline" size={12} color={colors.textTertiary} />
                                                                <Text style={{ fontSize: 11, color: colors.textTertiary }}>{theme.downloadCount}</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                </View>
                                            </>
                                        )}
                                        {viewMode === 'compact' && (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                                                <View style={[styles.wordCountPill, { backgroundColor: colors.primaryLight }]}>
                                                    <Text style={[styles.cardCount, { color: colors.primary }]}>{t('curation.nWordsCompact', { count: theme.words.length })}</Text>
                                                </View>
                                                {levelStyle && (
                                                    <View style={[styles.levelBadge, { backgroundColor: levelStyle.bg }]}>
                                                        <Text style={[styles.levelBadgeText, { color: levelStyle.color }]}>{levelStyle.label}</Text>
                                                    </View>
                                                )}
                                                {tags.length > 0 && (
                                                    <View style={[styles.tagChip, { backgroundColor: colors.surfaceSecondary }]}>
                                                        <Text style={[styles.tagText, { color: colors.textSecondary }]}>#{displayTag(tags[0], t)}</Text>
                                                    </View>
                                                )}
                                            </View>
                                        )}
                                    </View>
                                </Pressable>
                            );
                        })}

                        {filteredThemes.length === 0 && (
                            <View style={{ alignItems: 'center', marginTop: 40, marginBottom: 8, paddingHorizontal: 32 }}>
                                <Ionicons name="search-outline" size={48} color={colors.textTertiary} />
                                <Text style={{ marginTop: 16, color: colors.textSecondary, fontFamily: 'Pretendard_500Medium' }}>{t('curation.noResults')}</Text>
                            </View>
                        )}

                        {/*
                          * 목록 끝 두 줄 — 뜻 언어를 바꾸는 길과 AI로 만드는 길.
                          *
                          * "몇 개 이하일 때 띄울까"를 정하지 않는다. 위치가 그 일을 대신하기
                          * 때문이다: 46개가 보이는 사람은 46장을 다 넘겨야 만나므로 방해가
                          * 되지 않고, 덱이 1개뿐인 사람에게는 이 두 줄이 곧 첫 화면이다.
                          * 가벼운 해결(언어 바꾸기)을 위에, 무거운 해결(만들기)을 아래에 둔다.
                          */}
                        {activeTab === 'official' && (
                            <View style={{ marginTop: filteredThemes.length === 0 ? 8 : 20, marginBottom: 8 }}>
                                <Pressable
                                    onPress={() => { Haptics.selectionAsync(); setMeaningLangPickerOpen(true); }}
                                    style={({ pressed }) => [
                                        styles.meaningLangRow,
                                        { backgroundColor: colors.surface, borderColor: colors.borderLight, opacity: pressed ? 0.7 : 1 },
                                    ]}
                                >
                                    <Text style={[styles.meaningLangLabel, { color: colors.textSecondary }]}>{t('curation.meaningLang')}</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <Text style={[styles.meaningLangValue, { color: colors.text }]}>{getLanguageLabel(aiTargetLang, t)}</Text>
                                        <Ionicons name="chevron-down" size={15} color={colors.textTertiary} />
                                    </View>
                                </Pressable>

                                <View style={[styles.tailAiBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.borderLight }]}>
                                    <Ionicons name="sparkles" size={20} color={colors.accent} />
                                    <Text style={[styles.tailAiTitle, { color: colors.text }]}>{t('curation.noThemeFound')}</Text>
                                    <Text style={[styles.tailAiBody, { color: colors.textSecondary }]}>{t('curation.noDeckForLangBody')}</Text>
                                    <Pressable
                                        onPress={handleOpenAiModal}
                                        style={({ pressed }) => [
                                            styles.tailAiBtn,
                                            { backgroundColor: colors.primaryButton, opacity: pressed ? 0.8 : 1 },
                                        ]}
                                    >
                                        <Text style={[styles.tailAiBtnText, { color: colors.onPrimary }]}>{t('curation.createWithAi')}</Text>
                                    </Pressable>
                                </View>
                            </View>
                        )}
                    </ScrollView>
                    )}

                    <RNAnimated.View
                        style={{
                            position: 'absolute',
                            right: 20,
                            bottom: insets.bottom + 84 + adsInset,
                            opacity: fabAnim,
                            transform: [{ scale: fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
                        }}
                        pointerEvents="box-none"
                    >
                        <Pressable
                            onPress={() => { scrollRef.current?.scrollTo({ y: 0, animated: true }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                            style={({ pressed }) => [styles.fab, { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', shadowColor: colors.shadow, opacity: pressed ? 0.7 : 1 }]}
                        >
                            {Platform.OS === 'ios' && (
                                <View style={[StyleSheet.absoluteFill, { borderRadius: 24, overflow: 'hidden' }]}>
                                    <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                                </View>
                            )}
                            <Ionicons name="arrow-up" size={24} color={colors.text} />
                        </Pressable>
                    </RNAnimated.View>
                </>
            )}

            <WordDetailModal
                visible={!!detailWord}
                mode="read"
                readOnly={true}
                listId="curation"
                word={detailWord}
                sourceLanguage={selectedTheme?.sourceLanguage}
                targetLanguage={selectedTheme?.targetLanguage}
                onClose={() => setDetailWord(null)}
            />

            <ModalPicker
                visible={showListPicker}
                onClose={() => setShowListPicker(false)}
                title={t('curation.chooseDestination')}
                options={importOptions}
                onSelect={handleImport}
            />

            {/* 뜻 언어 시트. AI 생성 모달의 도착어와 같은 값을 고치므로 저장 경로도 같다. */}
            <ModalPicker
                visible={meaningLangPickerOpen}
                onClose={() => setMeaningLangPickerOpen(false)}
                title={t('curation.meaningLang')}
                options={meaningLangOptions}
                selectedValue={aiTargetLang}
                onSelect={(id) => {
                    Haptics.selectionAsync();
                    void updateAiCurationSettings({ targetLang: id as LanguageCode });
                    setMeaningLangPickerOpen(false);
                }}
            />

            <DialogModal
                visible={aiModalVisible}
                onClose={() => { if (generating) handleCancelGenerate(); else setAiModalVisible(false); }}
                title={t('curation.aiGenerate')}
                scrollable={true}
                footer={generating ? null : (
                    <Pressable
                        onPress={handleGenerateAI}
                        disabled={!aiTopic.trim()}
                        style={{
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                            backgroundColor: aiTopic.trim() ? colors.accent : colors.border,
                            paddingVertical: 14, borderRadius: 14,
                        }}
                    >
                        <Ionicons name="sparkles" size={18} color={colors.onPrimary} />
                        <Text style={{ color: colors.onPrimary, fontFamily: 'Pretendard_600SemiBold', fontSize: 15 }}>{t('curation.aiGenerateAction')}</Text>
                    </Pressable>
                )}
            >
                {generating ? (
                    <View style={{ paddingHorizontal: 20, paddingVertical: 28, alignItems: 'center', gap: 14 }}>
                        <CharacterSvg size={72} isDark={isDark} />
                        <Text style={{ fontSize: 16, fontFamily: 'Pretendard_700Bold', color: colors.text, textAlign: 'center' }}>
                            {t('curation.aiGeneratingTitle')}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <ActivityIndicator size="small" color={colors.accent} />
                            <Text style={{ fontSize: 14, fontFamily: 'Pretendard_600SemiBold', color: colors.accent }}>
                                {aiGeneratingSteps[genStep]}
                            </Text>
                        </View>
                        <Text style={{ fontSize: 13, fontFamily: 'Pretendard_400Regular', color: colors.textTertiary, textAlign: 'center', lineHeight: 18 }}>
                            {t('curation.aiGeneratingHint')}
                        </Text>
                    </View>
                ) : (
                <View style={{ gap: 16, paddingBottom: 8 }}>
                    {aiModalError && (
                        <View style={{
                            flexDirection: 'row', gap: 10, alignItems: 'flex-start',
                            padding: 12, borderRadius: 12,
                            backgroundColor: colors.warningLight,
                        }}>
                            <Ionicons name="information-circle" size={20} color={colors.warning} />
                            <View style={{ flex: 1, gap: 3 }}>
                                <Text style={{ fontSize: 14, fontFamily: 'Pretendard_700Bold', color: colors.text }}>
                                    {aiModalError.title}
                                </Text>
                                <Text style={{ fontSize: 13, lineHeight: 18, fontFamily: 'Pretendard_400Regular', color: colors.textSecondary }}>
                                    {aiModalError.message}
                                </Text>
                            </View>
                        </View>
                    )}
                    <View style={{ gap: 6 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'Pretendard_600SemiBold', color: colors.textSecondary }}>{t('curation.aiTopicLabel')}</Text>
                        <TextInput
                            style={{
                                height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14,
                                fontSize: 16, fontFamily: 'Pretendard_400Regular',
                                color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border,
                            }}
                            value={aiTopic}
                            onChangeText={(value) => {
                                setAiTopic(value);
                                if (aiModalError) setAiModalError(null);
                            }}
                            placeholder={t('curation.aiTopicPlaceholder')}
                            placeholderTextColor={colors.textTertiary}
                            autoFocus
                            editable={!generating}
                            maxLength={100}
                        />
                    </View>

                    <View style={{ gap: 6 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'Pretendard_600SemiBold', color: colors.textSecondary }}>{t('curation.aiLanguagePairLabel')}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Pressable
                                onPress={() => { if (!generating) { Keyboard.dismiss(); setAiSourceLangPickerOpen(true); } }}
                                style={{
                                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    paddingVertical: 10, borderRadius: 12,
                                    backgroundColor: colors.surfaceSecondary,
                                }}
                            >
                                <Text style={{ fontSize: 14 }}>{getLanguageFlag(aiSourceLang)}</Text>
                                <Text style={{ fontSize: 14, fontFamily: 'Pretendard_600SemiBold', color: colors.text }}>{getLanguageLabel(aiSourceLang, t)}</Text>
                                <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
                            </Pressable>
                            <Ionicons name="arrow-forward" size={16} color={colors.textTertiary} />
                            <Pressable
                                onPress={() => { if (!generating) { Keyboard.dismiss(); setAiTargetLangPickerOpen(true); } }}
                                style={{
                                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    paddingVertical: 10, borderRadius: 12,
                                    backgroundColor: colors.surfaceSecondary,
                                }}
                            >
                                <Text style={{ fontSize: 14 }}>{getLanguageFlag(aiTargetLang)}</Text>
                                <Text style={{ fontSize: 14, fontFamily: 'Pretendard_600SemiBold', color: colors.text }}>{getLanguageLabel(aiTargetLang, t)}</Text>
                                <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
                            </Pressable>
                        </View>
                    </View>

                    <View style={{ gap: 6 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'Pretendard_600SemiBold', color: colors.textSecondary }}>{t('curation.aiDifficultyLabel')}</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {([
                                { key: 'beginner' as AiDifficulty, label: t('curation.beginner') },
                                { key: 'intermediate' as AiDifficulty, label: t('curation.intermediate') },
                                { key: 'advanced' as AiDifficulty, label: t('curation.advanced') },
                            ]).map(d => (
                                <Pressable
                                    key={d.key}
                                    onPress={() => !generating && updateAiCurationSettings({ difficulty: d.key })}
                                    style={{
                                        flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                                        backgroundColor: aiDifficulty === d.key ? colors.primaryButton : colors.surfaceSecondary,
                                    }}
                                >
                                    <Text style={{
                                        fontSize: 14, fontFamily: 'Pretendard_600SemiBold',
                                        color: aiDifficulty === d.key ? colors.onPrimary : colors.textSecondary,
                                        textAlign: 'center',
                                    }}>{d.label}</Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>

                    <View style={{ gap: 6 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'Pretendard_600SemiBold', color: colors.textSecondary }}>{t('curation.aiWordCount')}</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {([10, 20, 30, 50] as const).map(n => (
                                <Pressable
                                    key={n}
                                    onPress={() => !generating && updateAiCurationSettings({ wordCount: n })}
                                    style={{
                                        flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                                        backgroundColor: aiWordCount === n ? colors.primaryButton : colors.surfaceSecondary,
                                    }}
                                >
                                    <Text style={{
                                        fontSize: 14, fontFamily: 'Pretendard_600SemiBold',
                                        color: aiWordCount === n ? colors.onPrimary : colors.textSecondary,
                                        textAlign: 'center',
                                    }}>{n}</Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                </View>
                )}
                <ModalPicker
                    visible={aiSourceLangPickerOpen}
                    onClose={() => setAiSourceLangPickerOpen(false)}
                    title={t('addWord.inputLanguageSelect')}
                    options={SUPPORTED_LANGUAGES
                        .map(l => ({ id: l.code, title: `${l.flag} ${getLanguageLabel(l.code, t)}` }))}
                    selectedValue={aiSourceLang}
                    onSelect={(code: string) => {
                        updateAiCurationSettings({ sourceLang: code as LanguageCode });
                        setAiSourceLangPickerOpen(false);
                    }}
                />

                <ModalPicker
                    visible={aiTargetLangPickerOpen}
                    onClose={() => setAiTargetLangPickerOpen(false)}
                    title={t('addWord.meaningLanguageSelect')}
                    options={SUPPORTED_LANGUAGES
                        .map(l => ({ id: l.code, title: `${l.flag} ${getLanguageLabel(l.code, t)}` }))}
                    selectedValue={aiTargetLang}
                    onSelect={(code: string) => {
                        updateAiCurationSettings({ targetLang: code as LanguageCode });
                        setAiTargetLangPickerOpen(false);
                    }}
                />
            </DialogModal>

            <Snackbar
                visible={snackbar.visible}
                message={snackbar.message}
                actionLabel={snackbar.actionLabel}
                onAction={snackbar.onAction}
                onDismiss={() => setSnackbar(prev => ({ ...prev, visible: false }))}
            />

            {/* 상세 화면 진입 시엔 배너 숨김 — masterBar(단어장 추가) 가림 방지 */}
            {!selectedTheme && <AppBannerAd mode="tab-anchor" />}

            {/* UGC 신고 모달 — Play 정책 준수 (features/curation/ReportCurationModal.tsx). */}
            {reportModalTheme && (
                <ReportCurationModal
                    visible={!!reportModalTheme}
                    onClose={() => setReportModalTheme(null)}
                    themeId={reportModalTheme.id}
                    themeTitle={reportModalTheme.title}
                />
            )}
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 8, gap: 12 },
    headerTextArea: { flex: 1 },
    headerTitle: { fontSize: 26, fontFamily: 'Pretendard_700Bold', letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 14, fontFamily: 'Pretendard_400Regular', marginTop: 2, lineHeight: 20 },
    actionBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    searchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16, borderWidth: 1, gap: 10, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    searchAiBtn: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    searchInput: { flex: 1, fontFamily: 'Pretendard_400Regular', fontSize: 15, fontWeight: '400', padding: 0 },
    tabContainer: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 16, borderBottomWidth: 1 },
    tabButton: { flex: 1, paddingVertical: 12, alignItems: 'center' },
    tabText: { fontSize: 16, fontFamily: 'Pretendard_600SemiBold', textAlign: 'center' },
    themeCard: { borderRadius: 16, borderWidth: 1, marginBottom: 12, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 10, elevation: 4 },
    cardDetailed: { padding: 16 },
    cardCompact: { padding: 12, marginBottom: 0 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    cardTitle: { fontSize: 17, fontFamily: 'Pretendard_700Bold' },
    levelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    levelBadgeText: { fontSize: 11, fontFamily: 'Pretendard_600SemiBold' },
    savedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
    savedBadgeText: { fontSize: 11, fontFamily: 'Pretendard_600SemiBold' },
    aiGeneratedNote: { fontSize: 11, fontFamily: 'Pretendard_400Regular', marginTop: 4, textAlign: 'right', fontStyle: 'italic' },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    tagChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
    tagText: { fontSize: 11, fontFamily: 'Pretendard_500Medium' },
    cardDesc: { fontSize: 13, fontFamily: 'Pretendard_400Regular', marginTop: 6 },
    langPair: { fontSize: 13, fontFamily: 'Pretendard_500Medium', marginTop: 4 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
    wordCountPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    cardCount: { fontSize: 12, fontFamily: 'Pretendard_700Bold', letterSpacing: 0.3 },
    langChipContainer: { paddingHorizontal: 20, paddingVertical: 2, flexDirection: 'row', alignItems: 'center' },
    langChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8 },
    langChipText: { fontSize: 13, fontFamily: 'Pretendard_600SemiBold' },
    detailHero: { minHeight: 160, position: 'relative', padding: 20, justifyContent: 'flex-end' },
    backBtn: { position: 'absolute', top: 52, left: 20, width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
    heroContent: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', opacity: 0.1 },
    heroTextContainer: { zIndex: 1, alignItems: 'flex-end' },
    heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap', justifyContent: 'flex-end' },
    downloadRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    detailTitle: { fontSize: 28, fontFamily: 'Pretendard_700Bold', marginBottom: 4, textAlign: 'right' },
    detailDesc: { fontSize: 14, fontFamily: 'Pretendard_500Medium' },
    detailDescription: { fontSize: 13, fontFamily: 'Pretendard_400Regular', marginTop: 6, textAlign: 'right', lineHeight: 18 },
    wordItem: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
    wordTerm: { fontSize: 17, fontFamily: 'Pretendard_700Bold', marginBottom: 4 },
    wordMeaning: { fontSize: 14, fontFamily: 'Pretendard_500Medium' },
    wordDesc: { fontSize: 13, fontFamily: 'Pretendard_400Regular' },
    checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    checkboxHit: { paddingLeft: 4 },
    selectionBar: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 6 },
    selectionText: { fontSize: 13, fontFamily: 'Pretendard_500Medium' },
    masterBar: { paddingHorizontal: 24, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
    regenerateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, marginBottom: 8, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
    regenerateBtnText: { fontSize: 14, fontFamily: 'Pretendard_600SemiBold', textAlign: 'center' },
    masterBtnRow: { flexDirection: 'row', gap: 10 },
    masterBtnSecondary: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
    masterBtnSecondaryText: { fontSize: 15, fontFamily: 'Pretendard_600SemiBold' },
    masterBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12 },
    masterBtnText: { fontSize: 15, fontFamily: 'Pretendard_700Bold' },
    fab: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },

    /*
     * 목록 끝 두 줄. overflow: 'hidden'은 장식이 아니라 필수다 — 배경색과
     * borderRadius를 함께 준 View는 Android(New Arch)에서 모서리가 각지게 그려지는
     * 경우가 있고, 이 속성이 둥근 클리핑을 강제한다(CLAUDE.md UI 체크리스트).
     *
     * AI 블록에 점선 테두리를 쓰지 않은 이유: RN의 borderStyle 'dashed'는 Android에서
     * borderRadius와 같이 주면 무시된다. 대신 배경을 surfaceSecondary로 한 톤 낮춰
     * 위쪽 덱 카드(surface)와 구분한다.
     */
    meaningLangRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 12, paddingHorizontal: 14,
        borderRadius: 12, borderWidth: 1, overflow: 'hidden',
    },
    meaningLangLabel: { fontSize: 13, fontFamily: 'Pretendard_500Medium' },
    meaningLangValue: { fontSize: 14, fontFamily: 'Pretendard_600SemiBold' },
    tailAiBox: {
        marginTop: 10, alignItems: 'center',
        paddingVertical: 22, paddingHorizontal: 20,
        borderRadius: 12, borderWidth: 1, overflow: 'hidden',
    },
    tailAiTitle: { marginTop: 7, fontSize: 14, fontFamily: 'Pretendard_600SemiBold' },
    tailAiBody: { marginTop: 4, fontSize: 12.5, fontFamily: 'Pretendard_400Regular', textAlign: 'center', lineHeight: 18 },
    tailAiBtn: { marginTop: 13, paddingVertical: 9, paddingHorizontal: 18, borderRadius: 12, overflow: 'hidden' },
    tailAiBtnText: { fontSize: 13, fontFamily: 'Pretendard_600SemiBold' },
});
