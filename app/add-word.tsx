import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
    View,
    Text,
    Pressable,
    Platform,
    KeyboardAvoidingView,
    ScrollView,
    StyleSheet,
    Alert,
    Linking,
    TextInput,
    ActivityIndicator,
    Modal,
} from 'react-native';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { senseChipLabel, CIRCLED_NUMBERS } from '@/lib/senses';
// expo-speech-recognition requires a custom dev build (not supported in standard Expo Go)
let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: any = (_event: string, _cb: any) => {};
try {
    const mod = require('expo-speech-recognition');
    ExpoSpeechRecognitionModule = mod.ExpoSpeechRecognitionModule;
    useSpeechRecognitionEvent = mod.useSpeechRecognitionEvent;
} catch {
    // Native module not available
}
import { useTranslation } from 'react-i18next';
import { displayTag } from '@/lib/tag-display';
import { useTheme } from '@/features/theme';
import { useLists, selectWordsForList, createList, addWord } from '@/features/vocab';
import { useAddWord } from '@/hooks/useAddWord';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { ModalPicker, PickerOption } from '@/components/ui/ModalPicker';
import { Snackbar } from '@/components/ui/Snackbar';
import BatchImportWorkflow from '@/components/BatchImportWorkflow';
import PhotoImportWorkflow from '@/components/PhotoImportWorkflow';
import { AutoFillResult } from '@/lib/types';
import { autoFillWord } from '@/lib/translation-api';
import { fetchDatamuseAutocomplete } from '@/lib/datamuse-api';
import { useSettings } from '@/features/settings';
import { useQuota } from '@/features/quota';
import { useAuth, isCloudAuthMode } from '@/features/auth';
import SpeakerButton from '@/components/ui/SpeakerButton';
import { LIST_TITLE_MAX } from '@shared/contracts';
import { SUPPORTED_LANGUAGES, getNaverDictUrl, getPlaceholderText, getWordLabel, getMeaningLabel, getDefinitionLabel, getExampleLabel, getExampleTranslationLabel, getLanguageLabel, getLanguageFlag, getTtsLang, getSpeakableText, deriveDisplayLanguages, LanguageCode } from '@/constants/languages';
import Animated, {
    FadeIn,
    FadeOut,
    Layout,
    useAnimatedKeyboard,
    useAnimatedStyle,
    withSpring,
    useSharedValue,
    withTiming,
    runOnJS,
} from 'react-native-reanimated';
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView
} from 'react-native-gesture-handler';

// 키 없는 로그인 사용자는 운영자 키(Edge)로 사진 스캔 가능.
const EDGE_ENABLED = process.env.EXPO_PUBLIC_ENRICH_VIA_EDGE === '1';


// 드래그 가능한 필드 항목 컴포넌트
const DraggableFieldItem = ({
    id,
    label,
    requiredLabel,
    index,
    totalCount,
    isVisible,
    colors,
    onToggle,
    onSwap,
    isFixed = false
}: {
    id: string;
    label: string;
    requiredLabel: string;
    index: number;
    totalCount: number;
    isVisible: boolean;
    colors: any;
    onToggle: () => void;
    onSwap: (from: number, to: number) => void;
    isFixed?: boolean;
}) => {
    const translateY = useSharedValue(0);
    const isDragging = useSharedValue(false);
    const startY = useSharedValue(0);
    const scale = useSharedValue(1);

    const currentIndex = useSharedValue(index);
    useEffect(() => {
        currentIndex.value = index;
    }, [index]);

    const lastSwapY = useSharedValue(0);

    const gesture = Gesture.Pan()
        .enabled(!isFixed)
        .activateAfterLongPress(100)
        .onStart((e) => {
            isDragging.value = true;
            startY.value = translateY.value;
            lastSwapY.value = 0;
            scale.value = 1.02; // 약간 떠오르는 효과
            runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
        })
        .onUpdate((e) => {
            translateY.value = startY.value + e.translationY - lastSwapY.value;

            const threshold = 40; // 항목 높이가 줄어들었으므로 조정
            const dy = e.translationY - lastSwapY.value;

            if (dy > threshold && currentIndex.value < totalCount - 1) {
                runOnJS(onSwap)(currentIndex.value, currentIndex.value + 1);
                lastSwapY.value += threshold;
            }
            else if (dy < -threshold && currentIndex.value > 0) {
                runOnJS(onSwap)(currentIndex.value, currentIndex.value - 1);
                lastSwapY.value -= threshold;
            }
        })
        .onEnd(() => {
            isDragging.value = false;
            scale.value = withTiming(1);
            translateY.value = withSpring(0);
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: translateY.value },
            { scale: scale.value }
        ],
        zIndex: isDragging.value ? 1000 : 1,
        backgroundColor: isDragging.value ? colors.surface : (isVisible ? colors.primary + '08' : 'transparent'),
        borderColor: isDragging.value ? colors.primary : (isVisible ? colors.primary + '40' : colors.borderLight),
        borderStyle: isDragging.value ? 'dashed' : 'solid',
        borderWidth: isVisible || isDragging.value ? 1.5 : 1,
        shadowOpacity: isDragging.value ? 0.1 : 0,
        shadowRadius: 10,
        elevation: isDragging.value ? 5 : 0,
        opacity: isFixed ? 0.6 : 1,
    }));

    return (
        <Animated.View
            layout={Layout.duration(200)}
            style={[styles.settingsRowCompact, animatedStyle, { borderRadius: 12, marginBottom: 2, paddingHorizontal: 4 }]}
        >
            <GestureDetector gesture={gesture}>
                <View style={{ paddingLeft: 10, paddingRight: 10, paddingVertical: 6 }}>
                    <Ionicons
                        name="reorder-four-outline"
                        size={20}
                        color={isFixed ? colors.textTertiary : (isDragging.value ? colors.primary : colors.textSecondary)}
                    />
                </View>
            </GestureDetector>

            <Pressable
                onPress={isFixed ? undefined : onToggle}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', height: '100%' }}
                disabled={isFixed}
            >
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[styles.settingsRowText, { color: isFixed ? colors.textTertiary : colors.text, fontSize: 14, fontFamily: isVisible ? 'Pretendard_600SemiBold' : 'Pretendard_500Medium' }]}>
                        {label}
                    </Text>
                    {isFixed && (
                        <View style={{ backgroundColor: colors.surfaceSecondary, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, marginLeft: 6 }}>
                            <Text style={{ fontSize: 9, color: colors.textTertiary, fontFamily: 'Pretendard_600SemiBold' }}>{requiredLabel}</Text>
                        </View>
                    )}
                </View>

                <View style={{ width: 40, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 8 }}>
                    <Ionicons
                        name={isVisible ? "checkbox" : "square-outline"}
                        size={22}
                        color={isVisible ? colors.primary : colors.border}
                    />
                </View>
            </Pressable>
        </Animated.View>
    );
};

const DraggableFieldList = ({ settings, onUpdate, colors, t, sourceLang, targetLang }: { settings: any, onUpdate: (s: any) => void, colors: any, t: (key: string, opts?: any) => string, sourceLang: LanguageCode, targetLang: LanguageCode }) => {
    // 모든 필드를 포함하되, term과 meaningKr은 isFixed 처리.
    // 레이블 언어는 전역 설정이 아니라 화면의 유효 언어(편집 대상 단어/선택 단어장)를 따른다.
    const labels: Record<string, string> = {
        term: getWordLabel(sourceLang, t),
        meaningKr: getMeaningLabel(targetLang, t),
        pos: t('addWord.pos'),
        phonetic: t('addWord.phonetic'),
        definition: getDefinitionLabel(sourceLang, t),
        example: t('addWord.exampleAndTranslation'),
        tags: t('addWord.tags'),
    };

    const handleSwap = (from: number, to: number) => {
        // 고정 항목(0, 1)은 교체 금지
        if (from < 2 || to < 2) return;

        const newOrder = [...settings.fieldOrder];
        [newOrder[from], newOrder[to]] = [newOrder[to], newOrder[from]];
        onUpdate({ ...settings, fieldOrder: newOrder });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    return (
        <View>
            {settings.fieldOrder.map((id: string, index: number) => {
                const isFixed = id === 'term' || id === 'meaningKr';
                return (
                    <DraggableFieldItem
                        key={id}
                        id={id}
                        label={labels[id]}
                        requiredLabel={t('addWord.required')}
                        index={index}
                        totalCount={settings.fieldOrder.length}
                        isVisible={
                            id === 'term' || id === 'meaningKr' ? true :
                                id === 'pos' ? settings.showPos :
                                    id === 'phonetic' ? settings.showPhonetic :
                                        id === 'definition' ? settings.showDefinition :
                                            id === 'example' ? settings.showExample :
                                                id === 'tags' ? settings.showTags : true
                        }
                        colors={colors}
                        onToggle={() => {
                            if (isFixed) return;
                            if (id === 'pos') onUpdate({ ...settings, showPos: !settings.showPos });
                            if (id === 'phonetic') onUpdate({ ...settings, showPhonetic: !settings.showPhonetic });
                            if (id === 'definition') onUpdate({ ...settings, showDefinition: !settings.showDefinition });
                            if (id === 'example') onUpdate({ ...settings, showExample: !settings.showExample });
                            if (id === 'tags') onUpdate({ ...settings, showTags: !settings.showTags });
                        }}
                        onSwap={handleSwap}
                        isFixed={isFixed}
                    />
                );
            })}
        </View>
    );
};

export default function AddWordScreen() {
    const termInputRef = React.useRef<TextInput>(null);
    const { listId, wordId } = useLocalSearchParams<{ listId: string; wordId?: string }>();
    const { t } = useTranslation();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const lists = useLists();
    const getWordsForList = (id: string) => selectWordsForList(lists, id);
    const params = useLocalSearchParams<any>();

    const initialMode = useMemo(() => params.initialMode, [params.initialMode]);
    const draftState = useMemo(() => {
        if (!params.draft) return undefined;
        try {
            return JSON.parse(params.draft as string);
        } catch {
            return undefined;
        }
    }, [params.draft]);

    const isEditing = !!wordId;
    const existingWord = isEditing && listId ? getWordsForList(listId).find(w => w.id === wordId) : null;

    const { inputSettings, updateInputSettings, apiKey } = useSettings();
    const { authMode } = useAuth();
    const { status: quotaStatus, refresh: refreshQuota } = useQuota();
    // 화면 진입 시 1회 한도 갱신 (보상형 광고 + Edge 차감으로 carrier 갱신될 수 있음)
    useEffect(() => { if (isCloudAuthMode(authMode)) refreshQuota(); }, [authMode, refreshQuota]);

    const showQuotaChip = isCloudAuthMode(authMode) && !apiKey && quotaStatus && quotaStatus.tier === 'free';

    // 이 화면의 "유효 언어" — 전역 입력 설정이 아니라 편집 대상 단어(편집)/선택한
    // 단어장(신규)의 실제 언어를 따른다. 편집 레이블 정확화 + 저장 시 언어 보존의 핵심.
    // 편집 시 lists가 늦게 로드되면 existingWord가 잠깐 null일 수 있어, 아래 effect가
    // 값이 채워지는 시점에 한 번 더 보정한다.
    const resolveInitialLang = (kind: 'source' | 'target'): LanguageCode => {
        const draftV = kind === 'source' ? draftState?.sourceLang : draftState?.targetLang;
        if (draftV) return draftV as LanguageCode;
        if (isEditing && existingWord) {
            const v = kind === 'source' ? existingWord.sourceLang : existingWord.targetLang;
            if (v) return v as LanguageCode;
        }
        if (listId) {
            const l = lists.find(x => x.id === listId);
            if (l) {
                const d = deriveDisplayLanguages(getWordsForList(listId), l);
                return (kind === 'source' ? d.source : d.target) as LanguageCode;
            }
        }
        return inputSettings[kind === 'source' ? 'sourceLang' : 'targetLang'];
    };
    const [sourceLang, setSourceLang] = useState<LanguageCode>(() => resolveInitialLang('source'));
    const [targetLang, setTargetLang] = useState<LanguageCode>(() => resolveInitialLang('target'));

    const {
        term, setTerm,
        definition, setDefinition,
        meaningKr, setMeaningKr,
        phonetic, setPhonetic,
        pos, setPos,
        exampleEn, setExampleEn,
        exampleKr, setExampleKr,
        tags, setTags,
        errors, setErrors,
        resetForLanguageChange,
        hasFillContent,
        handleAutoFill,
        handleAutoFillWithTerm,
        handleSaveWord,
        isPendingFill,
        isPendingSave,
        aiQuotaHitAt,
        autoFillFailedAt,
        autoFillNotFoundAt,
        sensePicker,
        toggleSense,
        dismissSensePicker,
    } = useAddWord(listId, wordId, existingWord, draftState, sourceLang, targetLang, apiKey || undefined);

    useEffect(() => {
        if (aiQuotaHitAt) {
            Alert.alert(t('addWord.aiQuotaTitle'), t('addWord.aiQuotaMessage'));
        }
    }, [aiQuotaHitAt]);

    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [inputWrapperHeight, setInputWrapperHeight] = useState(50);
    const autocompleteTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const suppressBlurRef = React.useRef(false);
    // 검색/선택 후 진행 중이던 자동완성 응답이 늦게 도착해 드롭다운을 다시 펼치는 경합 방지
    const suggestionsDismissedRef = React.useRef(false);

    const [fieldSettingsOpen, setFieldSettingsOpen] = useState(false);
    const [tempSettings, setTempSettings] = useState(inputSettings);

    // 필드 순서 보정 (단어, 뜻 항상 먼저 나오도록)
    const sortedFieldOrder = useMemo(() => {
        // 모달이 열려있을 때는 임시 설정(tempSettings)의 순서를 따름 (즉각적인 시각 피드백을 위해)
        const order = fieldSettingsOpen ? [...tempSettings.fieldOrder] : [...inputSettings.fieldOrder];
        const rest = order.filter(id => id !== 'term' && id !== 'meaningKr');
        return ['term', 'meaningKr', ...rest];
    }, [inputSettings.fieldOrder, tempSettings.fieldOrder, fieldSettingsOpen]);

    useEffect(() => {
        if (!initialMode) {
            router.setParams({ initialMode: inputSettings.addWordMode });
        }
    }, []);

    const keyboard = useAnimatedKeyboard();

    const animatedFabStyle = useAnimatedStyle(() => {
        return {
            transform: [{
                translateY: -Math.max(keyboard.height.value, 100),
            }],
            opacity: 1,
        };
    });

    const [photoSource, setPhotoSource] = useState<'camera' | 'gallery' | null>(null);
    const [showExcel, setShowExcel] = useState(false);
    const [selectedListId, setSelectedListId] = useState(() => {
        if (listId) return listId;
        const last = inputSettings.lastUsedListId;
        if (last && lists.some(l => l.id === last)) return last;
        return lists.length > 0 ? lists[0].id : '';
    });
    const [listPickerOpen, setListPickerOpen] = useState(false);
    const [newListName, setNewListName] = useState('');
    const [showNewListInput, setShowNewListInput] = useState(false);
    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    // 사전에서 찾지 못한 단어. 인라인 배너로 표시되며, 사용자가 term을 한 글자라도
    // 수정하면 자동으로 사라진다. 토스트보다 명시적이고 흐름을 끊지 않는 안내.
    const [notFoundTerm, setNotFoundTerm] = useState('');
    // 뜻 칩 토글 거부 안내('min'=마지막 1개 못 끔 · 'overflow'=저장 한도 초과). 잠시 후 자동 소멸.
    const [senseHint, setSenseHint] = useState<'min' | 'overflow' | null>(null);
    useEffect(() => {
        if (!senseHint) return;
        const id = setTimeout(() => setSenseHint(null), 1800);
        return () => clearTimeout(id);
    }, [senseHint]);

    useEffect(() => {
        if (autoFillFailedAt) {
            setToastMessage(t('addWord.autoFillFailed'));
            setToastVisible(true);
            const id = setTimeout(() => setToastVisible(false), 2500);
            return () => clearTimeout(id);
        }
    }, [autoFillFailedAt, t]);
    useEffect(() => {
        if (autoFillNotFoundAt) {
            // 현재 term을 캡처해 인라인 배너 표시 — term이 바뀌면 별도 effect가 clear.
            setNotFoundTerm(term.trim());
        }
    }, [autoFillNotFoundAt]);
    useEffect(() => {
        if (notFoundTerm && term.trim() !== notFoundTerm) {
            setNotFoundTerm('');
        }
    }, [term, notFoundTerm]);
    const [tagInput, setTagInput] = useState('');
    const [isApplying, setIsApplying] = useState(false);
    const [sourceLangPickerOpen, setSourceLangPickerOpen] = useState(false);
    const [targetLangPickerOpen, setTargetLangPickerOpen] = useState(false);

    // 언어쌍 변경. 신규 모드에서 채워진 검색 결과가 있으면 확인 후 초기화 —
    // 안 지우면 이전 언어쌍의 내용 위에 레이블만 바뀌어 모순된다(2026-07-11 신고).
    // 편집 모드는 잘못 저장된 언어를 교정하는 용도라 내용을 보존한다.
    const changeLanguage = (kind: 'source' | 'target', c: LanguageCode) => {
        const apply = () => {
            if (kind === 'source') setSourceLang(c); else setTargetLang(c);
            // 신규 입력이면 다음 단어에도 이어지도록 전역 기본값도 갱신(현행 동작).
            // 편집이면 이 단어에만 적용 — 전역 기본을 오염시키지 않는다.
            if (!isEditing) void updateInputSettings(kind === 'source' ? { sourceLang: c } : { targetLang: c });
        };
        const current = kind === 'source' ? sourceLang : targetLang;
        if (c === current) return;
        if (isEditing || !hasFillContent) { apply(); return; }
        Alert.alert(
            t('addWord.langChangeResetTitle'),
            t('addWord.langChangeResetMessage'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('common.confirm'), onPress: () => { resetForLanguageChange(); apply(); } },
            ],
        );
    };
    const [isListening, setIsListening] = useState(false);
    const [isTermFocused, setIsTermFocused] = useState(false);

    // selectedListId는 useState 초기값으로 한 번만 잡히므로, lists가 이후 갱신되면
    // (로그인 후 cloud 교체 등) 더 이상 존재하지 않는 유령 id를 가리킬 수 있다.
    // 그 상태로 저장하면 words.listId FK 위반("FOREIGN KEY constraint failed").
    // lists 변화에 맞춰 무효한 선택을 유효한 리스트로 보정한다.
    useEffect(() => {
        if (lists.length === 0) return;
        const valid = selectedListId && lists.some(l => l.id === selectedListId);
        if (!valid) {
            const fromParam = listId && lists.some(l => l.id === listId) ? listId : undefined;
            const last = inputSettings.lastUsedListId;
            const fromLast = last && lists.some(l => l.id === last) ? last : undefined;
            const fallback = fromParam ?? fromLast ?? lists[0].id;
            setSelectedListId(fallback);
        }
    }, [lists, listId, selectedListId, inputSettings.lastUsedListId]);

    useSpeechRecognitionEvent('start', () => setIsListening(true));
    useSpeechRecognitionEvent('end', () => setIsListening(false));
    useSpeechRecognitionEvent('result', (event: any) => {
        if (event.results[0]?.transcript) {
            setTerm(event.results[0].transcript);
        }
    });
    // event.error는 BCP-47 STT 표준 코드: language-not-supported, no-speech, network,
    // audio-capture, not-allowed, service-not-allowed 등. 무음 처리하면 "왜 안 되는지"
    // 알 수 없으니, 사용자가 행동할 수 있는 코드에 한해 안내를 띄운다.
    useSpeechRecognitionEvent('error', (event: any) => {
        setIsListening(false);
        const code: string | undefined = event?.error;
        if (!code || code === 'no-speech' || code === 'aborted') return; // 자연 종료
        const langLabel = getLanguageLabel(sourceLang, t);
        if (code === 'language-not-supported' || code === 'language-not-allowed') {
            Alert.alert(t('common.error'), t('addWord.voiceLangNotSupported', { lang: langLabel }));
        } else if (code === 'network') {
            Alert.alert(t('common.error'), t('addWord.voiceNetworkError'));
        } else if (code === 'not-allowed' || code === 'service-not-allowed') {
            Alert.alert(t('common.permissionDenied'), t('addWord.micPermissionMessage'));
        } else {
            Alert.alert(t('common.error'), t('addWord.voiceGenericError', { code }));
        }
    });

    const handleVoiceInput = async () => {
        try {
            if (!ExpoSpeechRecognitionModule) {
                Alert.alert(t('common.error'), t('addWord.voiceNotSupported', { defaultValue: '음성 입력이 이 기기에서 지원되지 않습니다.' }));
                return;
            }
            if (isListening) {
                ExpoSpeechRecognitionModule.stop();
                return;
            }
            const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
            if (!granted) {
                Alert.alert(t('common.permissionDenied'), t('addWord.micPermissionMessage'));
                return;
            }
            Haptics.selectionAsync();
            // STT는 TTS와 동일한 BCP-47 태그를 받는다 — ja-JP/zh-CN 등 4개 언어 공용.
            const lang = getTtsLang(sourceLang);

            // 미지원/미설치 로케일은 start 시 'error' 이벤트로 빠지지만, 시도 전에 잡으면
            // 사용자가 "음성 안 되네"가 아닌 "데이터 받으세요" 같은 행동 가능한 안내를 받는다.
            // 일부 디바이스/안드로이드 인식기는 이 API를 지원하지 않거나 빈 배열을 돌려주므로
            // 그땐 건너뛰고 그대로 시도 → 실패하면 error 핸들러가 잡는다.
            let supportInfo: { locales?: string[]; installedLocales?: string[] } | null = null;
            try {
                supportInfo = await ExpoSpeechRecognitionModule.getSupportedLocales?.();
            } catch { /* API 미지원 디바이스 — fall through. */ }
            const langLabel = getLanguageLabel(sourceLang, t);
            const supported = supportInfo?.locales ?? [];
            const installed = supportInfo?.installedLocales ?? [];
            if (supported.length > 0 && !supported.includes(lang)) {
                Alert.alert(t('common.error'), t('addWord.voiceLangNotSupported', { lang: langLabel }));
                return;
            }
            if (installed.length > 0 && !installed.includes(lang)) {
                Alert.alert(t('common.error'), t('addWord.voiceLangNotInstalled', { lang: langLabel }));
                return;
            }

            ExpoSpeechRecognitionModule.start({ lang, interimResults: true });
        } catch {
            Alert.alert(t('common.error'), t('addWord.voiceNotSupported', { defaultValue: '음성 입력이 이 기기에서 지원되지 않습니다.' }));
        }
    };

    const selectedFieldsCount = useMemo(() => {
        let count = 2; // term, meaningKr
        if (tempSettings.showPos) count++;
        if (tempSettings.showPhonetic) count++;
        if (tempSettings.showDefinition) count++;
        if (tempSettings.showExample) count++;
        if (tempSettings.showTags) count++;
        return count;
    }, [tempSettings]);

    const modalTranslateY = useSharedValue(0);
    const modalGesture = Gesture.Pan()
        .onUpdate((e) => {
            if (e.translationY > 0) {
                modalTranslateY.value = e.translationY;
            }
        })
        .onEnd((e) => {
            if (e.translationY > 100 || e.velocityY > 500) {
                runOnJS(setFieldSettingsOpen)(false);
            }
            modalTranslateY.value = withSpring(0, { damping: 20, stiffness: 200 });
        });

    const modalAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: modalTranslateY.value }]
    }));

    useEffect(() => {
        if (fieldSettingsOpen) {
            modalTranslateY.value = 0;
        }
    }, [fieldSettingsOpen]);

    useEffect(() => {
        if (!isEditing && !fieldSettingsOpen) {
            const timer = setTimeout(() => {
                termInputRef.current?.focus();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [fieldSettingsOpen, isEditing]);

    const handleOpenSettings = () => {
        setTempSettings(inputSettings);
        setFieldSettingsOpen(true);
    };

    const handleApplySettings = async () => {
        setIsApplying(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // 시각적 피드백을 위해 약간의 지연
        setTimeout(async () => {
            // 언어는 피커에서 로컬 상태로 즉시 반영되며 tempSettings와 분리돼 있다.
            // 신규 모드: 현재 유효 언어를 전역 기본값으로 저장. 편집 모드: 이 단어의
            // 언어가 전역 기본을 오염시키지 않도록 기존 전역값을 그대로 유지.
            const langOverride = isEditing
                ? { sourceLang: inputSettings.sourceLang, targetLang: inputSettings.targetLang }
                : { sourceLang, targetLang };
            await updateInputSettings({ ...tempSettings, ...langOverride });
            setFieldSettingsOpen(false);
            setIsApplying(false);

            // wordId가 없을 경우 파라미터에서 제외하여 문자열 "null" 전달 방지
            const params: any = {
                listId: selectedListId,
                initialMode: tempSettings.addWordMode,
                // 언어도 draft에 실어 재마운트 후 유효 언어를 보존(편집/신규 공통).
                draft: JSON.stringify({ term, meaningKr, definition, exampleEn, exampleKr, tags, pos, phonetic, sourceLang, targetLang })
            };
            if (wordId) params.wordId = wordId;

            // iOS: Field Settings RN <Modal>이 닫히는 도중 router.replace로 라우트를
            // 교체하면 모달의 네이티브 host가 고아로 남아 새 화면 전체 터치를 막는다
            // ("설정 적용 후 화면 멈춤"). 모달 dismiss 애니메이션(iOS fade ~300ms)이
            // 끝난 뒤 navigate. 경계 레이스 방지로 마진을 둬 350ms.
            setTimeout(() => {
                router.replace({
                    pathname: '/add-word',
                    params
                });
            }, 350);
        }, 500);
    };

    const handleCancelSettings = () => {
        setFieldSettingsOpen(false);
    };

    useEffect(() => {
        if (existingWord) {
            setTerm(existingWord.term);
            setDefinition(existingWord.definition);
            setMeaningKr(existingWord.meaningKr);
            setExampleEn(existingWord.exampleEn);
            setExampleKr(existingWord.exampleKr || '');
            setTags(existingWord.tags || []);
            setPos(existingWord.pos || '');
            setPhonetic(existingWord.phonetic || '');
            // 편집 진입 시 lists가 늦게 로드되면 초기값이 폴백으로 잡혔을 수 있다.
            // draft로 사용자가 명시 변경한 경우가 아니면 이 단어의 실제 언어로 보정.
            if (!draftState?.sourceLang && existingWord.sourceLang) setSourceLang(existingWord.sourceLang as LanguageCode);
            if (!draftState?.targetLang && existingWord.targetLang) setTargetLang(existingWord.targetLang as LanguageCode);
        }
    }, [existingWord, setTerm, setDefinition, setMeaningKr, setExampleEn, setExampleKr, setTags, setPos, setPhonetic]);

    const navigation = useNavigation();

    useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', (e) => {
            if (!isEditing && showExcel) {
                e.preventDefault();
                setShowExcel(false);
            }
        });
        return unsubscribe;
    }, [navigation, showExcel, isEditing]);

    const handlePhotoSaveWords = async (words: Array<{
        term: string;
        definition: string;
        phonetic: string;
        pos: string;
        meaningKr: string;
        exampleEn: string;
        exampleKr: string;
    }>) => {
        const existing = new Set(getWordsForList(selectedListId).map(w => w.term.trim().toLowerCase()));
        let addedCount = 0;
        let skippedCount = 0;
        for (const w of words) {
            const normalized = w.term.trim();
            if (!normalized) continue;
            const key = normalized.toLowerCase();
            if (existing.has(key)) { skippedCount++; continue; }
            existing.add(key);
            await addWord(selectedListId, {
                term: normalized,
                definition: w.definition || '',
                phonetic: w.phonetic || '',
                pos: w.pos || '',
                meaningKr: w.meaningKr || '',
                exampleEn: w.exampleEn || '',
                exampleKr: w.exampleKr || '',
                isStarred: false,
                tags: [],
                sourceLang,
                targetLang,
            });
            addedCount++;
        }
        if (addedCount > 0 || skippedCount > 0) {
            if (selectedListId && inputSettings.lastUsedListId !== selectedListId) {
                void updateInputSettings({ lastUsedListId: selectedListId });
            }
            const msg = skippedCount > 0
                ? t('photoImport.savedWithSkip', { added: addedCount, skipped: skippedCount })
                : t('addWord.batchSaveComplete', { count: addedCount });
            setToastMessage(msg);
            setToastVisible(true);
            setTimeout(() => setToastVisible(false), 2500);
        }
    };

    const handleOpenListPicker = () => {
        setShowNewListInput(false);
        setNewListName('');
        setListPickerOpen(true);
    };

    const handleSelectList = (id: string) => {
        setSelectedListId(id);
        setListPickerOpen(false);
    };


    // Use handleAutoFill from useAddWord hook instead of re-implementing it localy
    const handleSearch = () => {
        if (autocompleteTimerRef.current) clearTimeout(autocompleteTimerRef.current);
        suggestionsDismissedRef.current = true;
        setSuggestions([]);
        setShowSuggestions(false);
        handleAutoFill();
    };

    // 사진 스캔 진입: BYOK 키 또는 로그인+Edge면 허용. 그 외(게스트·키없음)는 안내.
    const canScanPhoto = !!apiKey || (isCloudAuthMode(authMode) && EDGE_ENABLED);
    const openPhotoScan = (src: 'camera' | 'gallery') => {
        if (!canScanPhoto) {
            Alert.alert(
                t('common.aiApiKeyRequired'),
                t('common.aiApiKeyRequiredDesc'),
                [
                    { text: t('common.later'), style: 'cancel' },
                    { text: t('common.setupNow'), onPress: () => router.push('/advanced-settings?openApiKey=1' as any) },
                ],
            );
            return;
        }
        setPhotoSource(src);
    };

    const handleAddTag = () => {
        const newTags = tagInput
            .split(/[\s,]+/)
            .map(t => t.trim().toLowerCase())
            .filter(t => t.length > 0 && !tags.includes(t));

        if (newTags.length > 0) {
            setTags([...tags, ...newTags].slice(0, 10));
        }
        setTagInput('');
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setTags(tags.filter(t => t !== tagToRemove));
    };


    const onSave = () => {
        handleSaveWord(
            selectedListId,
            (savedTerm) => {
                if (isEditing) {
                    router.back();
                } else {
                    if (selectedListId && inputSettings.lastUsedListId !== selectedListId) {
                        void updateInputSettings({ lastUsedListId: selectedListId });
                    }
                    setToastMessage(t('addWord.addedComplete', { term: savedTerm }));
                    setToastVisible(true);
                    setTimeout(() => setToastVisible(false), 1200);

                    // 저장 후 단어 입력창에 다시 포커스 (필드 리셋 완료 후)
                    setTimeout(() => {
                        termInputRef.current?.focus();
                    }, 300);
                }
            },
            (reason) => {
                if (reason === 'duplicate') {
                    Alert.alert(
                        t('addWord.duplicateWord'),
                        t('addWord.duplicateWordMessage', {
                            term: term.trim(),
                            lang: getLanguageLabel(targetLang, t),
                        }),
                    );
                } else {
                    handleOpenListPicker();
                }
            }
        );
    };

    const handleCreateNewList = async () => {
        const trimmed = newListName.trim();
        if (!trimmed) return;
        try {
            const newList = await createList(trimmed);
            setSelectedListId(newList.id);
            setNewListName('');
            setShowNewListInput(false);
            setListPickerOpen(false);
        } catch (e: any) {
            if (e?.message === 'DUPLICATE_LIST') {
                Alert.alert(t('addWord.duplicateName'), t('addWord.duplicateNameMessage', { name: trimmed }));
            }
        }
    };

    const selectedListTitle = lists.find(l => l.id === selectedListId)?.title || t('addWord.selectList');

    // ── 중복 단어 인라인 안내 ────────────────────────────────────────────────
    // 타이핑이 멈춘 뒤에 판정한다. blur를 쓸 수 없어서다 — 돋보기 버튼은 suppressBlurRef로
    // blur를 막고 입력창은 blurOnSubmit={false}라, blur 기준이면 AI 자동완성이 이미 quota를
    // 쓴 뒤에야 뜬다. 자동완성 후보용 300ms 타이머에 얹지 않는 이유는 그쪽이 "영어 + 2글자
    // 이상 + 자동완성 켬"일 때만 돌아 한국어 단어장에서는 아예 동작하지 않기 때문.
    const [debouncedTerm, setDebouncedTerm] = useState('');
    useEffect(() => {
        // 비우는 건 즉시. 저장 후 필드가 초기화되면 다음 단어를 입력하기 전까지 이전 안내가
        // 남아 있으면 안 된다.
        if (!term.trim()) { setDebouncedTerm(''); return; }
        const id = setTimeout(() => setDebouncedTerm(term), 300);
        return () => clearTimeout(id);
    }, [term]);

    // 판정 기준은 유니크 인덱스와 같다: (listId, LOWER(TRIM(term)), sourceLang, targetLang).
    // 스토어는 삭제되지 않은 단어만 싣고 인덱스도 deletedAt IS NULL 조건이라 양쪽이 어긋나지 않는다.
    // 같은 단어장이라도 언어쌍이 다르면 별개 단어로 저장되므로(migration 015의 의도) 알리지 않는다.
    const duplicateInfo = useMemo<{ kind: 'here' } | { kind: 'other'; first: string; more: number } | null>(() => {
        if (isEditing) return null;
        const normalized = debouncedTerm.trim().toLowerCase();
        if (!normalized) return null;

        let blocked = false;
        const otherTitles: string[] = [];
        for (const list of lists) {
            for (const w of list.words) {
                if (w.term.trim().toLowerCase() !== normalized) continue;
                if (list.id === selectedListId) {
                    if (w.sourceLang === sourceLang && w.targetLang === targetLang) blocked = true;
                } else if (!otherTitles.includes(list.title)) {
                    otherTitles.push(list.title);
                }
            }
        }
        if (blocked) return { kind: 'here' };
        if (otherTitles.length === 0) return null;
        return { kind: 'other', first: otherTitles[0], more: otherTitles.length - 1 };
    }, [isEditing, debouncedTerm, lists, selectedListId, sourceLang, targetLang]);

    const saveBlocked = duplicateInfo?.kind === 'here';

    const pickerOptions: PickerOption[] = lists.map(l => ({
        id: l.id,
        title: l.title,
        rightElement: !l.isVisible ? (
            <View style={[styles.pickerHiddenBadge, { backgroundColor: colors.surfaceSecondary }]}>
                <Ionicons name="eye-off-outline" size={12} color={colors.textTertiary} />
            </View>
        ) : undefined,
    }));

    const pickerFooter = showNewListInput ? (
        <View style={[styles.pickerNewRow, { borderColor: colors.border }]}>
            <TextInput
                style={[styles.pickerNewInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                placeholder={t('addWord.newListName')}
                placeholderTextColor={colors.textTertiary}
                value={newListName}
                onChangeText={setNewListName}
                onSubmitEditing={handleCreateNewList}
                autoFocus
                maxLength={LIST_TITLE_MAX}
                returnKeyType="done"
            />
            <Pressable
                onPress={handleCreateNewList}
                disabled={!newListName.trim()}
                style={[styles.pickerNewBtn, { backgroundColor: newListName.trim() ? colors.primaryButton : colors.surfaceSecondary }]}
            >
                <Text style={{ color: newListName.trim() ? colors.onPrimary : colors.textTertiary, fontSize: 14, fontFamily: 'Pretendard_600SemiBold' }}>
                    {t('common.create')}
                </Text>
            </Pressable>
        </View>
    ) : (
        <Pressable
            onPress={() => setShowNewListInput(true)}
            style={[styles.pickerOption, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary, borderBottomWidth: 0 }]}
        >
            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
            <Text style={[styles.pickerOptionText, { color: colors.primary }]}>
                {t('addWord.createNewList')}
            </Text>
        </Pressable>
    );


    const currentMode = fieldSettingsOpen ? tempSettings.addWordMode : inputSettings.addWordMode;

    return (
        <View style={[
            styles.container,
            currentMode === 'popup' ? {
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: colors.overlay
            } : { backgroundColor: colors.background }
        ]}>
            <Animated.View
                layout={Layout.duration(300)}
                style={[
                    currentMode === 'popup' ? {
                        width: '92%',
                        height: '84%',
                        maxHeight: 700,
                        backgroundColor: colors.background,
                        borderRadius: 24,
                        overflow: 'hidden',
                        shadowColor: colors.shadow,
                        shadowOffset: { width: 0, height: 10 },
                        shadowOpacity: 0.25,
                        shadowRadius: 20,
                        elevation: 10,
                    } : { flex: 1, backgroundColor: colors.background }
                ]}
            >
                <View style={[
                    styles.topBar,
                    {
                        backgroundColor: colors.background,
                        borderBottomColor: colors.borderLight,
                        paddingTop: currentMode === 'full' ? Math.max(insets.top, 4) : 10,
                        paddingBottom: currentMode === 'full' ? 6 : 8
                    }
                ]}>
                    <Pressable onPress={() => router.back()} hitSlop={8}>
                        <Text style={[styles.topBarCancel, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
                    </Pressable>
                    <Text style={[styles.topBarTitle, { color: colors.text }]}>
                        {isEditing ? t('addWord.editWord') : t('addWord.addWordTitle')}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {showQuotaChip && (
                            <Pressable
                                onPress={() => router.push('/plans')}
                                hitSlop={8}
                                style={{
                                    paddingHorizontal: 8,
                                    paddingVertical: 3,
                                    borderRadius: 10,
                                    backgroundColor: colors.surfaceSecondary,
                                }}
                            >
                                <Text style={{
                                    fontSize: 11,
                                    fontFamily: 'Pretendard_600SemiBold',
                                    color: colors.textSecondary,
                                }}>
                                    {quotaStatus!.used} / {quotaStatus!.limit + quotaStatus!.bonus}
                                </Text>
                            </Pressable>
                        )}
                        <Pressable onPress={() => setFieldSettingsOpen(true)} hitSlop={12} style={{ padding: 6 }}>
                            <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
                        </Pressable>
                    </View>
                </View>

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* 단어장 고르기는 저장 버튼 왼쪽 칩으로 내려갔다(하단 fabContainer 참조).
                        맨 위에 있으면 스크롤과 함께 사라져 어디에 저장되는지 모른 채 저장하게 된다. */}

                    {(true) && (
                        <>
                            <View style={styles.fieldsContainer}>
                                {sortedFieldOrder.map((fieldId) => {
                                    if (fieldId === 'term') {
                                        return (
                                            <View key="term" style={styles.wordSection}>
                                                {/* 유효 출발어를 다른 필드 제목과 같은 스타일로 표시 — 도착어는
                                                    "OO 뜻" 레이블이 전달한다. 언어 변경은 우상단 설정 모달로 일원화. */}
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                                    <Text style={[styles.wordLabel, { color: colors.textSecondary }]}>{getWordLabel(sourceLang, t)}</Text>
                                                    {!isEditing && (
                                                        <>
                                                            {/* Expo Go / 모듈 로드 실패 시 죽은 버튼 노출 방지 — 음성 인식은 dev build 이상에서만 동작. */}
                                                            {ExpoSpeechRecognitionModule && (
                                                                <Pressable onPress={handleVoiceInput} hitSlop={10} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: isListening ? colors.primaryButton : colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }}>
                                                                    <Ionicons name={isListening ? 'mic' : 'mic-outline'} size={16} color={isListening ? colors.onPrimary : colors.textSecondary} />
                                                                </Pressable>
                                                            )}
                                                            <Pressable onPress={() => openPhotoScan('camera')} hitSlop={10} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }}>
                                                                <Ionicons name="camera-outline" size={16} color={colors.textSecondary} />
                                                            </Pressable>
                                                            <Pressable onPress={() => openPhotoScan('gallery')} hitSlop={10} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }}>
                                                                <Ionicons name="images-outline" size={16} color={colors.textSecondary} />
                                                            </Pressable>
                                                            <Pressable onPress={() => setShowExcel(true)} hitSlop={10} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }}>
                                                                <MaterialCommunityIcons name="auto-fix" size={16} color={colors.textSecondary} />
                                                            </Pressable>
                                                        </>
                                                    )}
                                                </View>
                                                <View style={{ zIndex: showSuggestions ? 1000 : 1 }}>
                                                <View
                                                    style={styles.wordInputWrapper}
                                                    onLayout={(e) => setInputWrapperHeight(e.nativeEvent.layout.height)}
                                                >
                                                    <TextInput
                                                        ref={termInputRef}
                                                        style={[styles.wordInput, { color: colors.text, backgroundColor: colors.surface, borderColor: errors.term ? colors.error : isTermFocused ? colors.primary : colors.border }]}
                                                        onFocus={() => setIsTermFocused(true)}
                                                        onBlur={() => {
                                                            if (!suppressBlurRef.current) setIsTermFocused(false);
                                                        }}
                                                        placeholder={getPlaceholderText(sourceLang, t)}
                                                        placeholderTextColor={colors.textTertiary}
                                                        value={term}
                                                        maxLength={50}
                                                        onChangeText={(text) => {
                                                            setTerm(text);
                                                            if (errors.term) setErrors(e => ({ ...e, term: false }));
                                                            if (autocompleteTimerRef.current) clearTimeout(autocompleteTimerRef.current);
                                                            // 새 입력이 시작되면 자동완성 다시 허용
                                                            suggestionsDismissedRef.current = false;
                                                            if (!inputSettings.enableAutocomplete || text.trim().length < 2) {
                                                                setSuggestions([]);
                                                                setShowSuggestions(false);
                                                                return;
                                                            }
                                                            autocompleteTimerRef.current = setTimeout(async () => {
                                                                const results = sourceLang === 'en'
                                                                    ? await fetchDatamuseAutocomplete(text.trim())
                                                                    : [];
                                                                // 검색/선택으로 닫힌 뒤 늦게 도착한 응답이면 무시
                                                                if (suggestionsDismissedRef.current) return;
                                                                setSuggestions(results);
                                                                setShowSuggestions(results.length > 0);
                                                            }, 300);
                                                        }}
                                                        autoFocus={!isEditing}
                                                        autoCapitalize="none"
                                                        autoCorrect={false}
                                                        returnKeyType="search"
                                                        onSubmitEditing={handleSearch}
                                                        blurOnSubmit={false}
                                                    />
                                                    <View style={styles.searchActions}>
                                                        <SpeakerButton
                                                            text={getSpeakableText(term, phonetic, sourceLang)}
                                                            language={getTtsLang(sourceLang)}
                                                            size={22}
                                                            color={colors.textSecondary}
                                                            disabled={!term.trim()}
                                                            style={styles.searchIconButton}
                                                        />
                                                        <Pressable
                                                            onPressIn={() => { suppressBlurRef.current = true; }}
                                                            onPress={handleSearch}
                                                            onPressOut={() => { suppressBlurRef.current = false; }}
                                                            disabled={!term.trim() || isPendingFill}
                                                            style={styles.searchIconButton}
                                                        >
                                                            <Ionicons
                                                                name="search-outline"
                                                                size={22}
                                                                color={!term.trim() ? colors.textTertiary : isPendingFill ? colors.primary + '60' : colors.primary}
                                                            />
                                                        </Pressable>
                                                        <Pressable
                                                            onPress={() => {
                                                                if (!term.trim()) return;
                                                                Haptics.selectionAsync();
                                                                WebBrowser.openBrowserAsync(getNaverDictUrl(sourceLang, targetLang, term));
                                                            }}
                                                            disabled={!term.trim()}
                                                            style={styles.searchIconButton}
                                                        >
                                                            <Text style={[styles.naverIconText, { color: term.trim() ? colors.brand.naverGreen : colors.textTertiary }]}>N</Text>
                                                        </Pressable>
                                                    </View>
                                                </View>
                                                {showSuggestions && suggestions.length > 0 && (
                                                    <View style={[styles.suggestionDropdown, {
                                                        top: inputWrapperHeight + 2,
                                                        backgroundColor: colors.surface,
                                                        borderColor: colors.border,
                                                        shadowColor: colors.shadow,
                                                    }]}>
                                                        {suggestions.map((s) => (
                                                            <Pressable
                                                                key={s}
                                                                onPress={() => {
                                                                    if (autocompleteTimerRef.current) clearTimeout(autocompleteTimerRef.current);
                                                                    suggestionsDismissedRef.current = true;
                                                                    setTerm(s);
                                                                    setSuggestions([]);
                                                                    setShowSuggestions(false);
                                                                    Haptics.selectionAsync();
                                                                    handleAutoFillWithTerm(s);
                                                                }}
                                                                style={({ pressed }) => [styles.suggestionItem, { backgroundColor: pressed ? colors.surfaceSecondary : 'transparent' }]}
                                                            >
                                                                <Ionicons name="search-outline" size={14} color={colors.textTertiary} />
                                                                <Text style={[styles.suggestionText, { color: colors.text }]}>{s}</Text>
                                                            </Pressable>
                                                        ))}
                                                        <Pressable
                                                            onPress={() => {
                                                                updateInputSettings({ enableAutocomplete: false });
                                                                setSuggestions([]);
                                                                setShowSuggestions(false);
                                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                            }}
                                                            style={[styles.suggestionDisableBtn, { borderTopColor: colors.borderLight }]}
                                                        >
                                                            <Ionicons name="close-outline" size={14} color={colors.textTertiary} />
                                                            <Text style={[styles.suggestionDisableText, { color: colors.textTertiary }]}>{t('addWord.disableAutocomplete')}</Text>
                                                        </Pressable>
                                                    </View>
                                                )}
                                                </View>
                                                {errors.term && <Text style={[styles.errorText, { color: colors.error }]}>{t('addWord.enterWordError')}</Text>}
                                                {/* 이미 있는 단어 안내. 자동완성 후보 목록이 입력창 바로 아래에 겹쳐 뜨므로
                                                    (suggestionDropdown, 절대 위치) 후보가 열려 있는 동안에는 숨긴다. */}
                                                {!!duplicateInfo && !(showSuggestions && suggestions.length > 0) && (
                                                    <View style={styles.dupHintRow}>
                                                        <Ionicons
                                                            name={duplicateInfo.kind === 'here' ? 'alert-circle' : 'information-circle'}
                                                            size={14}
                                                            color={duplicateInfo.kind === 'here' ? colors.error : colors.warning}
                                                        />
                                                        <Text
                                                            style={[styles.dupHintText, { color: duplicateInfo.kind === 'here' ? colors.error : colors.warning }]}
                                                            numberOfLines={2}
                                                        >
                                                            {duplicateInfo.kind === 'here'
                                                                ? t('addWord.dupInThisList')
                                                                : duplicateInfo.more > 0
                                                                    ? t('addWord.dupInOtherMore', { list: duplicateInfo.first, count: duplicateInfo.more })
                                                                    : t('addWord.dupInOther', { list: duplicateInfo.first })}
                                                        </Text>
                                                    </View>
                                                )}
                                                {!!notFoundTerm && (
                                                    <View style={[styles.notFoundBanner, { backgroundColor: colors.warningLight, borderColor: colors.warning + '40' }]}>
                                                        <Ionicons name="alert-circle-outline" size={18} color={colors.warning} style={{ marginTop: 1 }} />
                                                        <Text style={[styles.notFoundBannerText, { color: colors.warning }]}>
                                                            {t('addWord.autoFillNotFound', { term: notFoundTerm })}
                                                        </Text>
                                                    </View>
                                                )}
                                                {/* 동음이의어 토글 칩 — 검색 결과에 뜻이 2개 이상일 때만. 뜻마다 칩 하나,
                                                    탭해서 담거나 뺀다(최소 1개). 수동 편집 시작 시 사라짐(dismissSensePicker). */}
                                                {sensePicker && (
                                                    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.senseChipsWrap}>
                                                        <Text style={[styles.senseChipsLabel, { color: colors.textTertiary }]}>{t('addWord.sensePicker')}</Text>
                                                        <View style={styles.senseChipsRow}>
                                                            {sensePicker.senses.map((s, i) => {
                                                                const on = sensePicker.selected.includes(i);
                                                                return (
                                                                    <Pressable
                                                                        key={i}
                                                                        onPress={() => {
                                                                            const res = toggleSense(i);
                                                                            if (res === 'ok') {
                                                                                Haptics.selectionAsync();
                                                                                setSenseHint(null);
                                                                            } else {
                                                                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                                                                                setSenseHint(res);
                                                                            }
                                                                        }}
                                                                        style={({ pressed }) => [
                                                                            styles.senseChip,
                                                                            on
                                                                                ? { backgroundColor: colors.accentLight, borderColor: colors.accent }
                                                                                : { backgroundColor: colors.surfaceSecondary, borderColor: colors.borderLight },
                                                                            { opacity: pressed ? 0.8 : 1 },
                                                                        ]}
                                                                    >
                                                                        {on && <Ionicons name="checkmark" size={13} color={colors.accent} />}
                                                                        <Text style={[styles.senseChipText, { color: on ? colors.text : colors.textSecondary }]} numberOfLines={1}>
                                                                            {`${CIRCLED_NUMBERS[i]} ${senseChipLabel(s)}`}
                                                                        </Text>
                                                                    </Pressable>
                                                                );
                                                            })}
                                                        </View>
                                                        {senseHint && (
                                                            <Text style={[styles.senseHintText, { color: colors.accent }]}>
                                                                {t(senseHint === 'min' ? 'addWord.senseMinOne' : 'addWord.senseOverflow')}
                                                            </Text>
                                                        )}
                                                    </Animated.View>
                                                )}
                                            </View>
                                        );
                                    }

                                    if (fieldId === 'meaningKr') {
                                        return (
                                            <Input
                                                key="meaningKr"
                                                label={getMeaningLabel(targetLang, t)}
                                                placeholder={getMeaningLabel(targetLang, t)}
                                                value={meaningKr}
                                                maxLength={200}
                                                onChangeText={(v: string) => { setMeaningKr(v); dismissSensePicker(); if (errors.meaningKr) setErrors(e => ({ ...e, meaningKr: false })); }}
                                                error={errors.meaningKr ? t('addWord.enterMeaningError') : undefined}
                                            />
                                        );
                                    }

                                    if (fieldId === 'pos' && inputSettings.showPos) {
                                        return (
                                            <Animated.View key="pos" entering={FadeIn} exiting={FadeOut} layout={Layout}>
                                                <Input
                                                    label={t('addWord.pos')}
                                                    placeholder={t('addWord.pos')}
                                                    value={pos}
                                                    onChangeText={(v: string) => { setPos(v); dismissSensePicker(); }}
                                                    maxLength={60}
                                                />
                                            </Animated.View>
                                        );
                                    }

                                    if (fieldId === 'phonetic' && inputSettings.showPhonetic) {
                                        return (
                                            <Animated.View key="phonetic" entering={FadeIn} exiting={FadeOut} layout={Layout}>
                                                <Input
                                                    label={t('addWord.phonetic')}
                                                    placeholder={t('addWord.phonetic')}
                                                    value={phonetic}
                                                    onChangeText={(v: string) => { setPhonetic(v); dismissSensePicker(); }}
                                                    maxLength={80}
                                                />
                                            </Animated.View>
                                        );
                                    }

                                    if (fieldId === 'example' && inputSettings.showExample) {
                                        return (
                                            <Animated.View key="example" entering={FadeIn} exiting={FadeOut} layout={Layout} style={{ gap: 10 }}>
                                                <Input
                                                    label={getExampleLabel(sourceLang, t)}
                                                    placeholder={getExampleLabel(sourceLang, t)}
                                                    value={exampleEn}
                                                    onChangeText={(v: string) => { setExampleEn(v); dismissSensePicker(); }}
                                                    maxLength={300}
                                                    multiline
                                                    style={{ fontStyle: 'italic' }}
                                                />
                                                {sourceLang !== targetLang && (
                                                    // 같은 언어쌍은 예문 번역이 예문과 같은 문장일 수밖에 없어 필드 자체를 숨긴다.
                                                    <Input
                                                        label={getExampleTranslationLabel(targetLang, t)}
                                                        placeholder={getExampleTranslationLabel(targetLang, t)}
                                                        value={exampleKr}
                                                        onChangeText={(v: string) => { setExampleKr(v); dismissSensePicker(); }}
                                                        maxLength={300}
                                                        multiline
                                                    />
                                                )}
                                            </Animated.View>
                                        );
                                    }

                                    if (fieldId === 'definition' && inputSettings.showDefinition) {
                                        return (
                                            <Animated.View key="definition" entering={FadeIn} exiting={FadeOut} layout={Layout}>
                                                <Input
                                                    label={getDefinitionLabel(sourceLang, t)}
                                                    placeholder={getDefinitionLabel(sourceLang, t)}
                                                    value={definition}
                                                    onChangeText={(v: string) => { setDefinition(v); dismissSensePicker(); }}
                                                    maxLength={500}
                                                    multiline
                                                />
                                            </Animated.View>
                                        );
                                    }

                                    if (fieldId === 'tags' && inputSettings.showTags) {
                                        return (
                                            <Animated.View key="tags" entering={FadeIn} exiting={FadeOut} layout={Layout} style={styles.tagsContainer}>
                                                <Text style={[styles.tagsLabel, { color: colors.textSecondary }]}>{t('addWord.tags')}</Text>
                                                <View style={styles.tagInputRow}>
                                                    <TextInput
                                                        style={[styles.tagInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                                                        placeholder={t('addWord.tags')}
                                                        placeholderTextColor={colors.textTertiary}
                                                        value={tagInput}
                                                        onChangeText={setTagInput}
                                                        onSubmitEditing={handleAddTag}
                                                        returnKeyType="done"
                                                        autoCapitalize="none"
                                                    />
                                                    <Pressable
                                                        onPress={handleAddTag}
                                                        disabled={!tagInput.trim()}
                                                        style={[styles.addTagBtn, { backgroundColor: tagInput.trim() ? colors.primaryButton : colors.surfaceSecondary }]}
                                                    >
                                                        <Ionicons name="add" size={20} color={tagInput.trim() ? colors.onPrimary : colors.textTertiary} />
                                                    </Pressable>
                                                </View>

                                                {tags.length > 0 && (
                                                    <View style={styles.tagsFlexBox}>
                                                        {tags.map((tag, idx) => (
                                                            <View key={`${tag}-${idx}`} style={[styles.tagChip, { backgroundColor: colors.surfaceSecondary }]}>
                                                                <Text style={[styles.tagChipText, { color: colors.text }]}>#{displayTag(tag, t)}</Text>
                                                                <Pressable onPress={() => handleRemoveTag(tag)} hitSlop={6} style={styles.tagChipClose}>
                                                                    <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
                                                                </Pressable>
                                                            </View>
                                                        ))}
                                                    </View>
                                                )}
                                            </Animated.View>
                                        );
                                    }

                                    return null;
                                })}
                            </View>
                        </>
                    )}

                </ScrollView>

                {
                    (true) && (
                        <Animated.View style={[
                            styles.fabContainer,
                            animatedFabStyle,
                            { bottom: currentMode === 'popup' ? 20 : Math.max(insets.bottom, 20) + 20 }
                        ]}>
                            {/* 단어장 칩 — 폭을 고정한다. 이름 길이에 따라 늘었다 줄었다 하면
                                단어장을 바꿀 때마다 저장 버튼이 좌우로 움직인다. 편집 모드에는
                                단어장을 고르는 개념이 없어(이미 그 단어장의 단어다) 띄우지 않는다. */}
                            {!isEditing && (
                                <Pressable
                                    onPress={handleOpenListPicker}
                                    style={({ pressed }) => [
                                        styles.listChip,
                                        {
                                            width: currentMode === 'popup' ? 104 : 118,
                                            backgroundColor: saveBlocked ? colors.errorLight : colors.surface,
                                            borderColor: saveBlocked ? colors.error : (selectedListId ? colors.border : colors.error),
                                            shadowColor: colors.shadow,
                                            opacity: pressed ? 0.7 : 1,
                                        },
                                    ]}
                                >
                                    <Ionicons
                                        name="folder-outline"
                                        size={13}
                                        color={saveBlocked ? colors.error : colors.textSecondary}
                                    />
                                    <Text
                                        style={[styles.listChipText, { color: saveBlocked ? colors.error : colors.textSecondary }]}
                                        numberOfLines={1}
                                    >
                                        {selectedListTitle}
                                    </Text>
                                    <Ionicons
                                        name="chevron-down"
                                        size={12}
                                        color={saveBlocked ? colors.error : colors.textTertiary}
                                    />
                                </Pressable>
                            )}

                            {/* 중복이면 흐리게만 하고 누를 수는 있게 둔다 — 완전히 막으면 기존 팝업의
                                "도착어를 다르게 설정하면 추가할 수 있습니다" 안내가 사라진다. */}
                            <Pressable
                                onPress={onSave}
                                disabled={isPendingSave}
                                style={({ pressed }) => [
                                    styles.fabButton,
                                    {
                                        backgroundColor: saveBlocked ? colors.borderLight : colors.primaryButton,
                                        opacity: isPendingSave || pressed ? 0.8 : 1,
                                        shadowColor: saveBlocked ? 'transparent' : colors.primaryButton,
                                    }
                                ]}
                            >
                                {isPendingSave ? (
                                    <ActivityIndicator color={colors.onPrimary} size="small" />
                                ) : (
                                    <>
                                        <Ionicons name="checkmark" size={20} color={saveBlocked ? colors.textTertiary : colors.onPrimary} />
                                        <Text style={[styles.fabText, { color: saveBlocked ? colors.textTertiary : colors.onPrimary }]}>{t('common.save')}</Text>
                                    </>
                                )}
                            </Pressable>
                        </Animated.View>
                    )
                }
            </Animated.View>

            <Snackbar
                visible={toastVisible}
                message={toastMessage}
                onDismiss={() => setToastVisible(false)}
                position="bottom"
                bottomOffset={120}
                duration={2000}
            />


            <Modal
                visible={fieldSettingsOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setFieldSettingsOpen(false)}
            >
                <GestureHandlerRootView style={{ flex: 1 }}>
                    <Pressable style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} onPress={() => setFieldSettingsOpen(false)}>
                        <GestureDetector gesture={modalGesture}>
                            <Animated.View
                                style={[styles.modalContainer, { backgroundColor: colors.surface, shadowColor: colors.shadow }, modalAnimatedStyle]}
                            >
                                <View style={{ alignItems: 'center', marginBottom: 8, marginTop: -12, paddingVertical: 6 }}>
                                    <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, opacity: 0.5 }} />
                                </View>

                                <View style={styles.modalHeader}>
                                    <Text style={[styles.modalTitle, { color: colors.text }]}>{t('addWord.fieldSettings')}</Text>
                                    <Pressable onPress={() => setFieldSettingsOpen(false)} hitSlop={12} style={{ backgroundColor: colors.surfaceSecondary, padding: 6, borderRadius: 20 }}>
                                        <Ionicons name="close" size={20} color={colors.textSecondary} />
                                    </Pressable>
                                </View>

                                <Pressable
                                    onPress={() => setTempSettings(s => ({ ...s, addWordMode: s.addWordMode === 'full' ? 'popup' : 'full' }))}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginBottom: 8,
                                        padding: 10,
                                        borderRadius: 12,
                                        backgroundColor: colors.primary + '08',
                                        borderWidth: 1,
                                        borderColor: colors.primary + '20'
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Ionicons name="expand-outline" size={18} color={colors.primary} />
                                        <Text style={[styles.settingsSectionTitle, { marginBottom: 0, color: colors.primary, fontSize: 13 }]}>{t('addWord.fullscreenMode')}</Text>
                                    </View>
                                    <View
                                        style={{
                                            width: 40,
                                            height: 22,
                                            borderRadius: 11,
                                            backgroundColor: tempSettings.addWordMode === 'full' ? colors.primaryButton : colors.border,
                                            padding: 2,
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <View style={{
                                            width: 18,
                                            height: 18,
                                            borderRadius: 9,
                                            backgroundColor: colors.onPrimary,
                                            transform: [{ translateX: tempSettings.addWordMode === 'full' ? 18 : 0 }]
                                        }} />
                                    </View>
                                </Pressable>

                                {/* 자동 완성 토글 */}
                                <Pressable
                                    onPress={() => setTempSettings(s => ({ ...s, enableAutocomplete: !s.enableAutocomplete }))}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginBottom: 8,
                                        padding: 10,
                                        borderRadius: 12,
                                        backgroundColor: colors.primary + '08',
                                        borderWidth: 1,
                                        borderColor: colors.primary + '20'
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
                                        <Text style={[styles.settingsSectionTitle, { marginBottom: 0, color: colors.primary, fontSize: 13 }]}>{t('addWord.autocomplete')}</Text>
                                    </View>
                                    <View
                                        style={{
                                            width: 40,
                                            height: 22,
                                            borderRadius: 11,
                                            backgroundColor: tempSettings.enableAutocomplete ? colors.primaryButton : colors.border,
                                            padding: 2,
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <View style={{
                                            width: 18,
                                            height: 18,
                                            borderRadius: 9,
                                            backgroundColor: colors.onPrimary,
                                            transform: [{ translateX: tempSettings.enableAutocomplete ? 18 : 0 }]
                                        }} />
                                    </View>
                                </Pressable>

                                {/* 입력 언어 (출발어) */}
                                <Pressable
                                    onPress={() => setSourceLangPickerOpen(true)}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginBottom: 8,
                                        padding: 10,
                                        borderRadius: 12,
                                        backgroundColor: colors.primary + '08',
                                        borderWidth: 1,
                                        borderColor: colors.primary + '20'
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Text style={{ fontSize: 16 }}>🔤</Text>
                                        <Text style={{ fontFamily: 'Pretendard_600SemiBold', color: colors.primary, fontSize: 13 }}>{t('addWord.inputLanguage')}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <Text style={{ fontSize: 14 }}>{getLanguageFlag(sourceLang)}</Text>
                                        <Text style={{ fontFamily: 'Pretendard_500Medium', color: colors.text, fontSize: 13 }}>{getLanguageLabel(sourceLang, t)}</Text>
                                        <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                                    </View>
                                </Pressable>

                                {/* 뜻 언어 (도착어) */}
                                <Pressable
                                    onPress={() => setTargetLangPickerOpen(true)}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginBottom: 12,
                                        padding: 10,
                                        borderRadius: 12,
                                        backgroundColor: colors.primary + '08',
                                        borderWidth: 1,
                                        borderColor: colors.primary + '20'
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Text style={{ fontSize: 16 }}>🎯</Text>
                                        <Text style={{ fontFamily: 'Pretendard_600SemiBold', color: colors.primary, fontSize: 13 }}>{t('addWord.meaningLanguage')}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <Text style={{ fontSize: 14 }}>{getLanguageFlag(targetLang)}</Text>
                                        <Text style={{ fontFamily: 'Pretendard_500Medium', color: colors.text, fontSize: 13 }}>{getLanguageLabel(targetLang, t)}</Text>
                                        <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                                    </View>
                                </Pressable>

                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, paddingHorizontal: 4 }}>
                                    <Text style={{ fontSize: 12, fontFamily: 'Pretendard_600SemiBold', color: colors.textTertiary, letterSpacing: 0.5 }}>{t('addWord.fieldName')}</Text>
                                    <Text style={{ fontSize: 12, fontFamily: 'Pretendard_600SemiBold', color: colors.textTertiary, letterSpacing: 0.5 }}>{t('addWord.display')}</Text>
                                </View>

                                <View style={{ maxHeight: 380, paddingBottom: 12 }}>
                                    <DraggableFieldList
                                        settings={tempSettings}
                                        onUpdate={setTempSettings}
                                        colors={colors}
                                        t={t}
                                        sourceLang={sourceLang}
                                        targetLang={targetLang}
                                    />
                                </View>

                                <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                                    <Pressable
                                        onPress={handleCancelSettings}
                                        style={[styles.modalActionBtn, { backgroundColor: colors.surfaceSecondary, flex: 1, height: 48 }]}
                                    >
                                        <Text style={[styles.modalActionBtnText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
                                    </Pressable>
                                    <Pressable
                                        onPress={handleApplySettings}
                                        disabled={isApplying}
                                        style={[
                                            styles.modalActionBtn,
                                            {
                                                backgroundColor: isApplying ? colors.successButton : colors.primaryButton,
                                                flex: 1,
                                                height: 48,
                                                flexDirection: 'row',
                                                gap: 8
                                            }
                                        ]}
                                    >
                                        {isApplying ? (
                                            <>
                                                <Ionicons name="checkmark" size={20} color={colors.onPrimary} />
                                                <Text style={[styles.modalActionBtnText, { color: colors.onPrimary }]}>{t('addWord.applied')}</Text>
                                            </>
                                        ) : (
                                            <>
                                                <Text style={[styles.modalActionBtnText, { color: colors.onPrimary }]}>{t('common.apply')}</Text>
                                                <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                                                    <Text style={{ color: colors.onPrimary, fontSize: 12, fontFamily: 'Pretendard_700Bold' }}>{selectedFieldsCount}</Text>
                                                </View>
                                            </>
                                        )}
                                    </Pressable>
                                </View>
                            </Animated.View>
                        </GestureDetector>
                    </Pressable>
                </GestureHandlerRootView>

                {/* 입력/뜻 언어 picker — iOS에서 형제 Modal은 부모 Modal 위에 표시되지 않으므로
                    Field Settings 모달의 자식으로 렌더해야 함 (커밋 969f7e5 큐레이션과 동일 수정) */}
                <ModalPicker
                    visible={sourceLangPickerOpen}
                    onClose={() => setSourceLangPickerOpen(false)}
                    title={t('addWord.inputLanguageSelect')}
                    options={SUPPORTED_LANGUAGES.map(l => ({
                        id: l.code,
                        title: `${l.flag} ${getLanguageLabel(l.code, t)}`,
                    }))}
                    selectedValue={sourceLang}
                    onSelect={(code: string) => {
                        setSourceLangPickerOpen(false);
                        changeLanguage('source', code as LanguageCode);
                    }}
                />

                <ModalPicker
                    visible={targetLangPickerOpen}
                    onClose={() => setTargetLangPickerOpen(false)}
                    title={t('addWord.meaningLanguageSelect')}
                    options={SUPPORTED_LANGUAGES.map(l => ({
                        id: l.code,
                        title: `${l.flag} ${getLanguageLabel(l.code, t)}`,
                    }))}
                    selectedValue={targetLang}
                    onSelect={(code: string) => {
                        setTargetLangPickerOpen(false);
                        changeLanguage('target', code as LanguageCode);
                    }}
                />
            </Modal>

            <ModalPicker
                visible={listPickerOpen}
                onClose={() => setListPickerOpen(false)}
                title={t('addWord.selectList')}
                options={pickerOptions}
                selectedValue={selectedListId}
                onSelect={handleSelectList}
                footer={pickerFooter}
            />

            {/* 입력/뜻 언어 picker는 Field Settings <Modal>의 자식으로 이동됨 (iOS 형제 Modal 버그) */}

            {/* 사진 스캔 모달 */}
            <Modal
                visible={photoSource !== null}
                animationType="slide"
                onRequestClose={() => setPhotoSource(null)}
                statusBarTranslucent
                navigationBarTranslucent
            >
                {photoSource !== null && (
                    <SafeAreaProvider>
                        <PhotoImportWorkflow
                            listId={selectedListId}
                            source={photoSource}
                            sourceLang={sourceLang}
                            targetLang={targetLang}
                            existingTerms={getWordsForList(selectedListId).map(w => w.term)}
                            onClose={() => setPhotoSource(null)}
                            onSaveWords={handlePhotoSaveWords}
                        />
                    </SafeAreaProvider>
                )}
            </Modal>

            {/* 일괄 단어 추가 모달 */}
            <Modal
                visible={showExcel}
                animationType="slide"
                onRequestClose={() => setShowExcel(false)}
                statusBarTranslucent
                navigationBarTranslucent
            >
                <SafeAreaProvider>
                    <BatchImportWorkflow
                        listId={selectedListId}
                        sourceLang={sourceLang}
                        targetLang={targetLang}
                        existingTerms={getWordsForList(selectedListId).map(w => w.term)}
                        onClose={() => setShowExcel(false)}
                        onSaveWords={handlePhotoSaveWords}
                    />
                </SafeAreaProvider>
            </Modal>
        </View >
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth },
    topBarCancel: { fontSize: 16, fontFamily: 'Pretendard_400Regular' },
    topBarTitle: { fontSize: 17, fontFamily: 'Pretendard_600SemiBold' },
    topBarSave: { fontSize: 16, fontFamily: 'Pretendard_700Bold' },
    inputModeTabBar: { flexDirection: 'row', padding: 4, borderRadius: 12, marginBottom: 20 },
    inputModeTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12, gap: 6 },
    inputModeTabActive: { shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
    inputModeTabText: { fontSize: 14, fontFamily: 'Pretendard_600SemiBold' },
    placeholderContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 10, gap: 16 },
    placeholderIconContainer: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    placeholderTitle: { fontSize: 18, fontFamily: 'Pretendard_700Bold', textAlign: 'center' },
    placeholderDesc: { fontSize: 14, fontFamily: 'Pretendard_400Regular', textAlign: 'center', lineHeight: 22, marginBottom: 10 },
    scrollContent: { padding: 20, paddingBottom: 40 },
    wordSection: { marginBottom: 8 },
    wordLabel: { flex: 1, fontSize: 12, fontFamily: 'Pretendard_600SemiBold', letterSpacing: 0.8 },
    wordInputWrapper: { position: 'relative', flexDirection: 'row', alignItems: 'center' },
    wordInput: { flex: 1, fontSize: 16, fontFamily: 'Pretendard_600SemiBold', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, paddingRight: 124 },
    searchActions: { position: 'absolute', right: 4, flexDirection: 'row', alignItems: 'center' },
    searchIconButton: { padding: 8 },
    naverIconText: { fontSize: 15, fontFamily: 'Pretendard_700Bold', lineHeight: 22 },
    fieldsContainer: { gap: 10, marginTop: 4 },
    errorText: { fontSize: 12, fontFamily: 'Pretendard_400Regular', marginTop: 2 },
    notFoundBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
    notFoundBannerText: { flex: 1, fontSize: 13, fontFamily: 'Pretendard_500Medium', lineHeight: 18 },
    senseChipsWrap: { marginTop: 8, gap: 5 },
    senseChipsLabel: { fontSize: 11, fontFamily: 'Pretendard_600SemiBold', letterSpacing: 0.3 },
    senseChipsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
    senseChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1.5, paddingVertical: 7, paddingHorizontal: 12, maxWidth: '100%' },
    senseChipText: { fontSize: 13, fontFamily: 'Pretendard_600SemiBold', flexShrink: 1 },
    senseHintText: { fontSize: 11.5, fontFamily: 'Pretendard_500Medium' },
    loadingContainer: { alignItems: 'center', paddingVertical: 20, gap: 8 },
    loadingText: { fontSize: 14, fontFamily: 'Pretendard_500Medium' },
    tagsContainer: { marginTop: 0, gap: 6 },
    tagsLabel: { fontSize: 12, fontFamily: 'Pretendard_600SemiBold', letterSpacing: 0.8 },
    tagInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    tagInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: 'Pretendard_400Regular' },
    addTagBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    tagsFlexBox: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tagChip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingLeft: 10, paddingRight: 6, borderRadius: 12, gap: 4 },
    tagChipText: { fontSize: 13, fontFamily: 'Pretendard_500Medium' },
    tagChipClose: { marginLeft: 2 },
    suggestionDropdown: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 1000,
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 8,
    },
    suggestionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 11,
        gap: 10,
    },
    suggestionText: {
        fontSize: 15,
        fontFamily: 'Pretendard_500Medium',
        flex: 1,
    },
    suggestionDisableBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        gap: 4,
    },
    suggestionDisableText: {
        fontSize: 12,
        fontFamily: 'Pretendard_400Regular',
    },
    toastContainer: { position: 'absolute', bottom: 120, left: 0, right: 0, alignItems: 'center', zIndex: 999 },
    toastText: { fontSize: 15, fontFamily: 'Pretendard_600SemiBold' },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContainer: {
        width: '94%',
        maxWidth: 400,
        borderRadius: 20,
        padding: 16,
        paddingTop: 10,
        paddingBottom: 16,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 10,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    modalTitle: {
        fontSize: 19,
        fontFamily: 'Pretendard_700Bold',
        letterSpacing: -0.5,
    },
    settingsSectionTitle: {
        fontSize: 13,
        fontFamily: 'Pretendard_600SemiBold',
        marginBottom: 12,
        letterSpacing: 0.5,
    },
    segmentedControlContainer: {
        flexDirection: 'row',
        padding: 4,
        borderRadius: 12,
        height: 48,
        position: 'relative',
    },
    segmentedTab: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
    segmentedTabText: {
        fontSize: 14,
        fontFamily: 'Pretendard_600SemiBold',
    },
    settingsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    settingsRowCompact: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 2,
    },
    settingsRowText: {
        fontSize: 14,
        fontFamily: 'Pretendard_500Medium',
    },
    modalCloseBtn: {
        marginTop: 16,
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
    },
    modalCloseBtnText: {
        fontSize: 16,
        fontFamily: 'Pretendard_600SemiBold',
    },
    modalActionBtn: {
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalActionBtnText: {
        fontSize: 15,
        fontFamily: 'Pretendard_700Bold',
    },
    pickerHiddenBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
    pickerNewRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, gap: 8 },
    pickerNewInput: { flex: 1, height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15, fontFamily: 'Pretendard_400Regular' },
    pickerNewBtn: { height: 44, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    pickerOptionText: { fontSize: 15, fontFamily: 'Pretendard_500Medium' },
    pickerOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, borderRadius: 12 },
    fabContainer: {
        position: 'absolute',
        right: 20,
        zIndex: 100,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    // 단어장 칩 — 글자는 저장(16px/Bold)보다 작고 연하게 두되(중요도 조절), 높이는 44를
    // 유지한다. 글자 크기를 줄인다고 여백까지 줄이면 터치 영역이 최소 기준(iOS 44) 아래로
    // 떨어진다. 폭은 호출부에서 고정값으로 준다(전체 118 / 팝업 104).
    listChip: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 44,
        paddingHorizontal: 11,
        borderRadius: 22,
        borderWidth: 1,
        gap: 5,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
        elevation: 3,
    },
    listChipText: {
        flex: 1,
        fontSize: 11,
        fontFamily: 'Pretendard_500Medium',
    },
    // 중복 안내 줄 — 입력창 바로 아래.
    dupHintRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 5,
        marginTop: 6,
        paddingHorizontal: 2,
    },
    dupHintText: {
        flex: 1,
        fontSize: 12,
        fontFamily: 'Pretendard_500Medium',
        lineHeight: 17,
    },
    fabButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 24,
        gap: 6,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    fabText: {
        fontSize: 16,
        fontFamily: 'Pretendard_700Bold',
    },
});
