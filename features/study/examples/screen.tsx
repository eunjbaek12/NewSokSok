import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, Pressable, Platform, StyleSheet, Dimensions, ScrollView } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/features/theme';
import { AppBannerAd, useAdsBottomInset } from '@/components/ads/AppBannerAd';
import {
  useLists,
  selectWordsForList,
  toggleStarred,
  updatePlanProgress,
} from '@/features/vocab';
import { useStudyResultsStore, useStudySelection, applyStudySelection } from '@/features/study';
import { useSessionCommit, commitSessionResults } from '../use-session-commit';
import { useSettings } from '@/features/settings';
import SpeakerButton from '@/components/ui/SpeakerButton';
import { getTtsLang, getStudySourceLang, shouldShowExampleTranslation } from '@/constants/languages';
import { segmentExample, canBlankExample, spokenExample, exampleFrame } from '@/lib/example-blank';
import { splitSenseText } from '@/lib/senses';
import { buildChoices, SAME_TOPIC_DISTANCE, type ChoiceContext } from '../choices';
import { Word, StudyResult } from '@/lib/types';
import StudySettingsModal, { StudySettings } from '@/features/study/components/StudySettingsModal';
import BatchResultOverlay from '@/features/study/components/BatchResultOverlay';
import { useTranslation } from 'react-i18next';
import { BareWordsBanner, BareWordsSheet } from '@/features/bare-words';
import { useExampleFill } from './useExampleFill';
import {
  SENTENCE_SIZES,
  nextSentenceStep,
  currentStep,
  withStep,
  enterHint,
  INITIAL_SENTENCE_STEPS,
  type SentenceSize,
  type SentenceSteps,
} from './sentence-size';

function HighlightedSentence({ sentence, term, primaryColor, textColor, showTerm = true, onPressBlank, colors, size }: { sentence: string; term: string; primaryColor: string; textColor: string; showTerm?: boolean; onPressBlank?: () => void; colors: any; size: SentenceSize }) {
  // 빈칸 위치는 lib/example-blank가 언어군별로 판정한다(라틴은 토큰 경계, 한/일은 활용 폴백).
  const segments = React.useMemo(() => segmentExample(sentence, term), [sentence, term]);
  // 글자 크기는 화면이 재서 내려 준다(SENTENCE_SIZES 주석 참조). 빈칸 박스도 같은 단계를
  // 따라야 글자만 작아지고 `?`만 커 보이는 일이 없다.
  const textSize = { fontSize: size.fontSize, lineHeight: size.lineHeight };

  // 빈칸을 못 만드는 예문은 출제 목록에서 이미 걸러진다(canBlankExample). 그래도 남았다면
  // 문장을 그대로 띄우는 건 곧 정답 공개이므로, 정답 공개 단계에서만 보여준다.
  if (!segments) {
    if (!showTerm) return null;
    return <Text style={[styles.exampleText, textSize, { color: textColor }]}>{sentence}</Text>;
  }

  return (
    <Text style={[styles.exampleText, textSize, { color: textColor }]}>
      {segments.map((seg, i) => {
        if (!seg.isBlank) return <Text key={i}>{seg.text}</Text>;
        if (showTerm) {
          return <Text key={i} style={[styles.highlightedWord, textSize, { color: primaryColor }]}>{seg.text}</Text>;
        }
        // 빈칸은 언제나 `?`다. 예전에는 힌트(뜻)를 이 박스 **안에** 렌더했는데, 박스가
        // <Text> 안의 인라인 View라 줄바꿈되지 않아 뜻이 길면 폭을 넘겨 잘렸다
        // (동음이의어는 "①… ②…" 조립본이라 특히 길다). 힌트는 문장 아래 별도 줄로 뺐다 —
        // 그래야 빈칸이 순수하게 "가려진 자리"로 남아 스피커 낭독 규칙과도 맞물린다.
        // key는 바깥 요소에만 준다 — Text 안의 인라인 View를 한 겹 더 감싸면 정렬이 틀어진다.
        const box = (key?: number) => (
          <View key={key} style={[
            styles.blankBox,
            { minWidth: size.blankW, minHeight: size.blankH, top: size.blankTop },
            { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
          ]}>
            <Text style={[styles.blankText, { fontSize: size.blankFont, color: colors.textTertiary }]}>?</Text>
          </View>
        );
        return onPressBlank ? (
          <Pressable key={i} onPress={onPressBlank} hitSlop={8}>{box()}</Pressable>
        ) : (
          box(i)
        );
      })}
    </Text>
  );
}

// 답을 고른 뒤 다음 카드로 자동 전진하기까지의 시간.
// 오답이 더 긴 이유: 답을 고른 직후에야 예문 번역이 나타나는데(이 모드에만 있는 동작),
// 틀렸을 때 그걸 읽을 시간이 없으면 왜 틀렸는지 확인할 방법이 없다.
// 기다리기 싫으면 하단 "다음"을 누르면 즉시 넘어간다(타이머는 인덱스 변화를 감지해 스스로 무효화된다).
const ADVANCE_DELAY_CORRECT_MS = 1000;
const ADVANCE_DELAY_WRONG_MS = 3000;

export default function ExamplesScreen() {
  const { id, filter, isStarred: initialIsStarred, sel, planDay } = useLocalSearchParams<{ id: string; filter?: string; isStarred?: string; sel?: string; planDay?: string }>();
  // 세션에 넘겨받은 단어 목록. `sel`은 목록 자체가 아니라 토큰이다 — 이유는 store.ts 참고.
  const selectedIds = useStudySelection(sel);
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const lists = useLists();
  const getWordsForList = useCallback((listId: string) => selectWordsForList(lists, listId), [lists]);
  const setStudyResults = useStudyResultsStore(s => s.setResults);
  const { studySettings, updateStudySettings } = useSettings();
  const adsBottomInset = useAdsBottomInset();
  const list = lists.find(l => l.id === id);

  // Settings State
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settings, setSettings] = useState<StudySettings>({
    filter: (filter || 'all') as 'all' | 'learning' | 'memorized',
    isStarred: initialIsStarred === 'true',
    showTerm: false,
    showMeaning: true,
    showExampleKr: true,
    autoPlaySound: true,
    shuffle: studySettings.shuffle,
  });

  const applySettings = useCallback((newSettings: StudySettings, newBatchSize: number | 'all') => {
    setSettings(newSettings);
    if (newBatchSize !== studySettings.studyBatchSize) {
      updateStudySettings({ studyBatchSize: newBatchSize as any });
    }
    if (newSettings.shuffle !== studySettings.shuffle) {
      updateStudySettings({ shuffle: newSettings.shuffle });
    }
    setSettingsVisible(false);
  }, [studySettings.studyBatchSize, studySettings.shuffle, updateStudySettings]);

  const [studyWords, setStudyWords] = useState<Word[]>([]);
  /**
   * 이번 세션이 다루는 단어의 id — 필터에 걸린 것 전부(예문 유무는 안 본다).
   * 채우기 대상도, 채운 뒤 학습에 합류하는 단어도 이 울타리 안이다. 화면에 안 걸린 단어를
   * 몰래 학습에 넣지 않는다.
   */
  const [poolIds, setPoolIds] = useState<ReadonlySet<string>>(() => new Set());
  /** 「전체」 묶음의 크기 — 세션을 열 때 굳힌다(아래 batchSizeNum 주석). */
  const [allBatchSize, setAllBatchSize] = useState(0);

  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const [showBatchOverlay, setShowBatchOverlay] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [batchAnswers, setBatchAnswers] = useState<Record<number, { selectedId: string; isCorrect: boolean }>>({});
  const [isNewAnswer, setIsNewAnswer] = useState(false);
  const [showHint, setShowHint] = useState(false);
  // 문장 글자 크기 단계(SENTENCE_SIZES의 인덱스). 카드에 안 들어가면 한 단계씩 내린다.
  // 힌트를 켜면 한 줄이 더 들어와 더 작아지므로 상태별로 따로 기억한다(sentence-size.ts 주석).
  const [sentenceSteps, setSentenceSteps] = useState<SentenceSteps>(INITIAL_SENTENCE_STEPS);
  // 밀어서 읽는 중이면 자동 넘김을 멈춘다(holdAdvance 주석 참조).
  const [advanceHeld, setAdvanceHeld] = useState(false);
  // 판정은 이 ref 로 한다(위 reconcileSentenceSize 주석 참조). state 와 항상 같은 값이다.
  const sentenceStepsRef = useRef<SentenceSteps>(INITIAL_SENTENCE_STEPS);
  // 판정 콜백은 의존성이 비어 있어야 하므로(같은 주석) 힌트 상태도 ref 로 읽는다.
  const showHintRef = useRef(false);
  // 축소 판정의 재료 둘. 스크롤 영역이 직접 알려 준다 — 보이는 높이와 실제 내용 높이다.
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);
  const startTime = useRef(Date.now());
  const results = useRef<StudyResult[]>([]);
  // 완주 플래그 — finishSession 이 세우면 이탈 경로(헤더 백·하드웨어 백)가 이중
  // 커밋하지 않는다. useSessionCommit 의 주석 참조.
  const sessionCompletedRef = useRef(false);
  const commitSession = useSessionCommit(id, results, sessionCompletedRef);
  const isInitialLoad = useRef(true);
  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;
  const lastSettingsRef = useRef({ id, filter: settings.filter, isStarred: settings.isStarred, shuffle: settings.shuffle, batchSize: studySettings.studyBatchSize, sel });

  // Sync initial search params with settings
  useEffect(() => {
    if (filter && filter !== settings.filter) {
      setSettings(s => ({ ...s, filter: filter as any }));
    }
    if (initialIsStarred !== undefined) {
      const isStarredBool = initialIsStarred === 'true';
      if (isStarredBool !== settings.isStarred) {
        setSettings(s => ({ ...s, isStarred: isStarredBool }));
      }
    }
  }, [filter, initialIsStarred]);

  // Initialize and filter words
  useEffect(() => {
    let all = getWordsForList(id!);

    if (selectedIds) {
      all = applyStudySelection(all, selectedIds);
    } else {
      if (settings.isStarred) {
        all = all.filter(w => w.isStarred);
      }

      if (settings.filter === 'learning') {
        all = all.filter(w => !w.isMemorized);
      } else if (settings.filter === 'memorized') {
        all = all.filter(w => w.isMemorized);
      }
    }

    // Only reset index if core filters changed, not on every word content update (like star toggle)
    const coreFilterChanged =
      lastSettingsRef.current.id !== id ||
      lastSettingsRef.current.filter !== settings.filter ||
      lastSettingsRef.current.isStarred !== settings.isStarred ||
      lastSettingsRef.current.shuffle !== settings.shuffle ||
      lastSettingsRef.current.batchSize !== studySettings.studyBatchSize ||
      lastSettingsRef.current.sel !== sel;

    if (coreFilterChanged || isInitialLoad.current) {
      if (settings.shuffle) {
        all = [...all].sort(() => Math.random() - 0.5);
      }
      setCurrentIndex(0);
      setCurrentBatchIndex(0);
      setSelectedAnswer(null);
      setIsCorrect(null);
      setBatchAnswers({});
      setIsNewAnswer(false);
      results.current = [];
      lastSettingsRef.current = { id, filter: settings.filter, isStarred: settings.isStarred, shuffle: settings.shuffle, batchSize: studySettings.studyBatchSize, sel };
      isInitialLoad.current = false;

      // 예문이 있어도 표제어 자리를 찾지 못하면 빈칸을 만들 수 없다. 그대로 출제하면
      // 문장이 통째로 보여 정답이 공개되므로 출제 목록에서 뺀다.
      const ready = all.filter(w => !!w.exampleEn && canBlankExample(w.exampleEn, w.term));
      setStudyWords(ready);
      // 🔴 예문 없는 단어를 여기서 **자동으로 채우지 않는다.** 예전에는 이 자리에서 전부
      // AI 로 돌렸고, 그 한 번의 탭이 하루치 한도를 넘겼다(Free 50단어/일). 이제는 배너로
      // 알리고 사용자가 누른 뒤에만 채운다(useExampleFill).
      setPoolIds(new Set(all.map(w => w.id)));
      // 「전체」 묶음은 시작 시점의 크기로 굳힌다 — 채우기로 단어가 늘어도 지금 묶음이
      // 커지면 안 된다(스펙 §6).
      setAllBatchSize(ready.length);
    } else {
      setStudyWords(prev => {
        const newMap = new Map(all.map(w => [w.id, w]));
        return prev.map(w => newMap.has(w.id) ? newMap.get(w.id)! : w);
      });
    }
  }, [id, getWordsForList, settings.filter, settings.isStarred, settings.shuffle, studySettings.studyBatchSize]);

  /**
   * 🔴 「전체」를 `studyWords.length` 로 그때그때 재면 안 된다. 채우기로 단어가 늘 때마다
   * 묶음 크기가 따라 늘어 **지금 묶음 한가운데서 남은 문항 수가 바뀐다**(3/8 이 3/20 이 된다).
   * 세션을 열 때 굳혀 두면 늘어난 단어는 다음 묶음이 된다.
   */
  const batchSizeNum = studySettings.studyBatchSize === 'all'
    ? (allBatchSize || studyWords.length || 1)
    : studySettings.studyBatchSize;
  const currentBatchWords = React.useMemo(() => {
    if (studyWords.length === 0) return [];
    const start = currentBatchIndex * batchSizeNum;
    return studyWords.slice(start, start + batchSizeNum);
  }, [studyWords, currentBatchIndex, batchSizeNum]);

  const currentWord = currentBatchWords[currentIndex];

  /**
   * 이 카드가 쓸 예문·뜻·번역 한 세트(docs/example-sense-split-spec.md).
   *
   * 동음이의어 병기(①②③)로 저장된 단어는 예문도 "① … ② …" 라서, 그대로 두면
   * segmentExample 이 표제어가 나오는 자리마다 빈칸을 뚫어 **한 카드에 문장 2~3개와
   * 빈칸 2~3개**가 나온다. 길이도 문제지만(예문 p90 159자·뜻 p90 70자) 본질은
   * **어느 뜻을 묻는지 알 수 없다**는 것이다. 그래서 번호 하나로 좁힌다.
   *
   * 🔴 번호는 **예문 기준으로만** 센다. 뜻·번역에 같은 인덱스가 없으면 그 필드만 통짜로
   *    둔다 — definition 에 번호가 중복으로 박힌 행이 실측 2건 있다(伸ばす·抜ける).
   * 🔴 빈칸을 만들 수 있는 문장만 후보다. 후보가 없으면 통짜로 돌아간다 — 출제 목록
   *    필터(아래 ready)가 통짜 기준이라, 그래야 목록과 카드의 판정이 어긋나지 않는다.
   */
  const senseViewRef = useRef<Record<string, { exampleEn: string; exampleKr: string; meaningKr: string }>>({});
  const senseView = useMemo(() => {
    const fallback = {
      exampleEn: currentWord?.exampleEn ?? '',
      exampleKr: currentWord?.exampleKr ?? '',
      meaningKr: currentWord?.meaningKr ?? '',
    };
    if (!currentWord) return fallback;
    // 카드가 떠 있는 동안 뜻이 바뀌면 안 된다. 세션이 끝나면 ref 가 사라지므로 다음에
    // 같은 단어를 만나면 다른 뜻이 나온다 — 병기의 ②③ 도 언젠가 화면에 도달하게 하려는 것.
    const cached = senseViewRef.current[currentWord.id];
    if (cached) return cached;

    const sentences = splitSenseText(currentWord.exampleEn);
    if (!sentences) return fallback;
    const usable = sentences
      .map((text, index) => ({ text, index }))
      .filter(s => canBlankExample(s.text, currentWord.term));
    if (usable.length === 0) return fallback;

    const picked = usable[Math.floor(Math.random() * usable.length)];
    const meanings = splitSenseText(currentWord.meaningKr);
    const translations = splitSenseText(currentWord.exampleKr);
    const view = {
      exampleEn: picked.text,
      exampleKr: translations?.[picked.index] ?? fallback.exampleKr,
      meaningKr: meanings?.[picked.index] ?? fallback.meaningKr,
    };
    senseViewRef.current[currentWord.id] = view;
    return view;
    // currentWord 전체를 본다 — 필드를 하나씩 나열하면 eslint 가 잡지 못하는 누락이 생긴다.
    // 참조가 바뀌어도(별 토글 등) 위의 ref 캐시가 재추첨을 막으므로 뜻은 그대로다.
  }, [currentWord]);

  /**
   * 정답이 이미 보이는 상태인가. 답을 골랐거나, 애초에 "표제어 보기" 설정을 켜 둔 경우다.
   * 화면(빈칸)·힌트 줄·스피커 낭독이 모두 이 하나를 기준으로 갈려야 어긋나지 않는다 —
   * 예전에는 화면만 이 조건을 보고 스피커는 아무 조건도 안 봐서 소리로 답이 새어 나갔다.
   */
  const isRevealed = settings.showTerm || selectedAnswer !== null;

  const spokenText = useMemo(
    () => spokenExample(senseView.exampleEn, currentWord?.term, isRevealed),
    [senseView.exampleEn, currentWord?.term, isRevealed],
  );

  const handleToggleStar = useCallback(async (wordId: string) => {
    setStudyWords(prev => prev.map(w => w.id === wordId ? { ...w, isStarred: !w.isStarred } : w));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await toggleStarred(id!, wordId);
  }, [id, toggleStarred]);

  const choicesMapRef = useRef<Record<string, Word[]>>({});

  // 선택지 풀은 학습 대상(배치)이 아니라 **단어장 전체**다. 배치 안에서만 뽑으면 같은
  // 주제가 몰려 있어 오답이 정답과 구별되지 않는다.
  const allListWords = useMemo(() => getWordsForList(id!), [getWordsForList, id]);

  /**
   * 이번 세션의 울타리 안 단어들 — **살아 있는 값**이다. 채우기가 예문을 저장하면 여기가
   * 먼저 바뀌고, 아래 둘(채울 대상·합류 후보)이 저절로 따라 움직인다.
   */
  const poolWords = useMemo(() => allListWords.filter(w => poolIds.has(w.id)), [allListWords, poolIds]);

  // 채우기 배선(대상·시트·광고·실행)은 훅 하나에 모여 있다. 🔴 컴포넌트가 아니라 훅인 이유는
  // 아래 이른 return 때문이다 — useExampleFill 머리말 참조.
  const fillUi = useExampleFill({
    listId: id!,
    list,
    words: poolWords,
    idleBanner: studyWords.length > 0,
  });

  /**
   * 채워져서 이제 출제할 수 있게 된 단어들.
   *
   * 🔑 상태로 쌓아 두지 않고 **매번 다시 센다.** 저장이 끝나는 시점과 배치가 끝나는 시점이
   * 달라서(마지막 단어의 쓰기가 결과 배너보다 늦게 도착한다) 한 번 찍어 두면 그 한 개를
   * 놓친다. 여기 있는 것은 언제나 "지금 학습에 없고, 예문이 있고, 빈칸을 뚫을 수 있는 것"이다.
   */
  const joinable = useMemo(() => {
    const have = new Set(studyWords.map(w => w.id));
    return poolWords.filter(w => !have.has(w.id) && !!w.exampleEn && canBlankExample(w.exampleEn, w.term));
  }, [poolWords, studyWords]);
  // 묶음 경계 판정은 타이머 콜백 안에서 일어난다 — 의존성에 넣으면 문항마다 타이머가 다시
  // 걸리므로 최신 값은 ref 로 읽는다.
  const joinableRef = useRef(joinable);
  joinableRef.current = joinable;

  /**
   * 지킬 묶음이 없으면(= 아직 출제할 것이 하나도 없으면) 기다리지 않고 바로 연다.
   * 「N개 채우기」를 누른 사람의 의도는 *지금* 학습하는 것이다.
   *
   * 🔴 다만 **채우는 중에는 열지 않는다.** 첫 단어가 들어오자마자 열면 그 한 개로 묶음
   * 크기가 굳어(「전체」 설정) 이후 단어가 한 개짜리 묶음으로 줄줄이 쏟아진다. 배치가
   * 끝난 뒤 한 번에 여는 것이 §6 의 "한 번에 합류"와도 같은 규칙이다.
   */
  useEffect(() => {
    if (studyWords.length > 0 || joinable.length === 0 || fillUi.running) return;
    setStudyWords(joinable);
    if (studySettings.studyBatchSize === 'all') setAllBatchSize(joinable.length);
  }, [studyWords.length, joinable, fillUi.running, studySettings.studyBatchSize]);

  /**
   * 채운 단어를 학습에 합류시킨다 — **묶음이 끝나는 순간에만**(스펙 §6).
   *
   * 진행 중 하나씩 붙이면 총 문항이 슬금슬금 늘어 진도 표시가 흔들리고, 다음 진입으로
   * 미루면 "지금 하고 싶다"는 의도를 배신한다. 실제로 늘어난 수를 돌려준다.
   */
  const flushJoin = useCallback((): number => {
    const add = joinableRef.current;
    if (add.length === 0) return 0;
    setStudyWords(prev => {
      const have = new Set(prev.map(w => w.id));
      return [...prev, ...add.filter(w => !have.has(w.id))];
    });
    return add.length;
  }, []);

  /**
   * 다중정답 판정 재료(docs/example-choices-multi-answer-spec.md).
   * 단어장이 바뀔 때만 다시 만든다 — 500단어면 segmentExample을 500번 도는 일이라
   * 카드마다 계산하면 안 된다.
   */
  const choiceContext = useMemo<ChoiceContext>(() => {
    const frames = new Map<string, string[]>();
    const indexes = new Map<string, number>();
    allListWords.forEach((w, i) => {
      // 아래 senseView와 같은 규칙으로 "뜰 수 있는 문장"을 뽑는다 — 병기(①②③)면 번호별로
      // 쪼갠 뒤 빈칸을 만들 수 있는 것만 남긴다. 통짜 예문 하나로 문형을 만들면 병기 단어의
      // 문형이 "① … ② …" 모양이 되어 단문 후보와 절대 같아지지 않고, 필터 A가 그 단어에서
      // 조용히 죽는다(실측: NGSL에서 그렇게 새던 쌍이 4개).
      const parts = splitSenseText(w.exampleEn) ?? [w.exampleEn ?? ''];
      const usable = parts.filter(p => canBlankExample(p, w.term));
      const list = usable
        .map(p => exampleFrame(p, w.term))
        .filter((f): f is string => !!f);
      frames.set(w.id, Array.from(new Set(list)));
      indexes.set(w.id, i);
    });
    return {
      framesOf: w => frames.get(w.id) ?? [],
      // 🔴 words.position 컬럼이 아니라 **이 배열의 인덱스**다. createCuratedList가
      //    words INSERT에 position을 넣지 않아(features/vocab/db.ts:219) 큐레이션 덱은
      //    전부 NULL이고, createdAt도 같은 값이라 정렬에 타이 브레이커가 없다.
      indexOf: w => indexes.get(w.id) ?? -1,
      minDistance: SAME_TOPIC_DISTANCE,
    };
  }, [allListWords]);

  const choices = useMemo(() => {
    if (!currentWord) return [];
    if (choicesMapRef.current[currentWord.id]) {
      return choicesMapRef.current[currentWord.id].map(c => c.id === currentWord.id ? currentWord : c);
    }
    // 선택지는 화면에 보이는 라벨(여기서는 표제어) 기준으로 중복을 걸러야 하고,
    // ctx로 "빈칸에 넣어도 말이 되는" 후보까지 걸러낸다 — features/study/choices.ts
    const newChoices = buildChoices(allListWords, currentWord, w => w.term, 4, choiceContext);
    choicesMapRef.current[currentWord.id] = newChoices;
    return newChoices;
  }, [currentIndex, currentWord?.id, allListWords, choiceContext]);

  const handleAnswer = useCallback(async (word: Word) => {
    if (selectedAnswer !== null) return;
    const correct = word.id === currentWord.id;
    setSelectedAnswer(word.id);
    setIsCorrect(correct);
    setBatchAnswers(prev => ({ ...prev, [currentIndex]: { selectedId: word.id, isCorrect: correct } }));
    setIsNewAnswer(true);

    if (correct) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    results.current.push({ word: currentWord, gotIt: correct });
  }, [selectedAnswer, currentWord, currentIndex]);

  useEffect(() => {
    if (selectedAnswer === null || !isNewAnswer) return;
    // 밀어서 읽는 중이면 넘기지 않는다. 이미 걸려 있던 타이머는 이 effect 가 다시 돌며
    // cleanup 으로 취소된다.
    if (advanceHeld) return;
    const goNext = () => {
      const nextIndex = currentIndex + 1;
      const nextAnswer = batchAnswers[nextIndex];
      setCurrentIndex(nextIndex);
      setSelectedAnswer(nextAnswer ? nextAnswer.selectedId : null);
      setIsCorrect(nextAnswer ? nextAnswer.isCorrect : null);
      setIsNewAnswer(false);
    };
    const timer = setTimeout(async () => {
      if (currentIndexRef.current === currentIndex) {
        if (currentIndex >= currentBatchWords.length - 1) {
          // 채운 단어는 **묶음이 끝나는 이 순간에만** 합류한다(스펙 §6).
          const joined = flushJoin();
          const total = studyWords.length + joined;
          const nextStart = (currentBatchIndex + 1) * batchSizeNum;
          // 🔴 합류로 **지금 묶음이 늘어났으면 끝이 아니다.** 예문 있는 단어 8개로 시작한
          // 세션(묶음 크기 20)에 12개가 붙으면 그것은 다음 묶음이 아니라 이 묶음의 9번째
          // 문항이다 — 여기서 세션을 끝내면 방금 채운 12개가 이번 세션에서 통째로 빠지고,
          // 「지금 하고 싶다」로 누른 버튼이 「다음에 오세요」가 된다.
          const batchEnd = Math.min(nextStart, total);
          if (currentIndex < batchEnd - 1) {
            goNext();
          } else if (nextStart < total) {
            setShowBatchOverlay(true);
          } else {
            finishSession();
          }
        } else {
          goNext();
        }
      }
    }, isCorrect ? ADVANCE_DELAY_CORRECT_MS : ADVANCE_DELAY_WRONG_MS);
    return () => clearTimeout(timer);
    // isCorrect가 지연 시간을 정하므로 의존성에 있어야 한다 — 빠지면 이전 카드의 정오답으로 타이머가 잡힌다.
  }, [selectedAnswer, isNewAnswer, isCorrect, currentIndex, currentBatchWords.length, currentBatchIndex, batchSizeNum, studyWords.length, batchAnswers, advanceHeld, flushJoin]);

  useEffect(() => {
    setShowHint(false);
    // 다음 문장은 짧을 수 있으므로 크기도 원래대로 되돌린다. 안 되돌리면 한 번 긴 문장을
    // 만난 뒤 세션 내내 작은 글자로 남는다.
    setSentenceSteps(INITIAL_SENTENCE_STEPS);
    sentenceStepsRef.current = INITIAL_SENTENCE_STEPS;
    showHintRef.current = false;
    // 내용 높이는 새 문장이 그려지면 곧 다시 온다. 앞 문장 값으로 판정하지 않도록 비운다
    // (뷰포트는 문항이 바뀌어도 같으므로 그대로 둔다).
    contentHeight.current = 0;
    // 앞 문항에서 밀어 두었다고 이번 문항까지 자동 넘김을 멈출 이유는 없다.
    setAdvanceHeld(false);
  }, [currentIndex, currentBatchIndex]);

  const sentenceSize = SENTENCE_SIZES[currentStep(sentenceSteps, showHint)];

  /*
   * 힌트 토글. 단계를 상태별로 갈라 둔 값이 여기서 갈아 끼워진다 — 껐을 때는 껐을 때의 단계로
   * 그대로 돌아오므로 E4(껐는데 작은 글자가 남던 것)가 생기지 않는다.
   *
   * 🔴 내용 높이를 비우는 것을 빼면 안 된다. 힌트 줄이 붙고 떨어지는 사이에 옛 높이로 판정하면
   *    필요 없이 한 단계 더 내려간다 — 문항 전환 리셋이 같은 이유로 비우는 그 값이다.
   */
  const setHint = useCallback((next: boolean) => {
    showHintRef.current = next;
    if (next) {
      const seeded = enterHint(sentenceStepsRef.current);
      sentenceStepsRef.current = seeded;
      setSentenceSteps(seeded);
    }
    contentHeight.current = 0;
    setShowHint(next);
  }, []);

  /*
   * 내용이 보이는 영역을 넘치면 글자를 한 단계 줄인다. 마지막 단계에서도 넘치면 그대로 두고
   * 스크롤이 받는다(sentence-size.ts 주석 참조).
   *
   * 🔑 재료를 스크롤 영역에서 직접 받는 것이 핵심이다. 예전에는 `onTextLayout`의 줄 수와
   *    카드·문장 높이 셋을 맞춰 계산했는데, 값들이 서로 다른 시점의 것이라 앞 문항 높이로
   *    엉뚱하게 판정하거나(짧은 문장이 이유 없이 작아짐) 콜백이 다시 오지 않아 한 단계에서
   *    멈춰 잘렸다. 뷰포트와 내용 높이는 같은 컴포넌트가 같은 사이클에 알려 주고, 크기가
   *    바뀌면 반드시 다시 온다.
   */
  const reconcileSentenceSize = useCallback(() => {
    if (!contentHeight.current || !viewportHeight.current) return;
    /*
     * 🔴 `setSentenceSteps(prev => …)` 로 쓰면 안 된다. 한 번의 변화에도 콜백이 둘 오므로
     *    (onLayout·onContentSizeChange) updater 형태면 큐에 쌓인 만큼 연달아 적용돼 한 번에
     *    두 단계가 내려간다 — 둘 다 같은(옛) 내용 높이를 본다. 현재 단계를 ref 로 읽어 한
     *    단계만 계산하면 같은 사이클의 중복 호출이 모두 같은 답을 낸다.
     */
    const showingHint = showHintRef.current;
    const step = currentStep(sentenceStepsRef.current, showingHint);
    const next = nextSentenceStep(step, contentHeight.current, viewportHeight.current);
    if (next === step) return;
    sentenceStepsRef.current = withStep(sentenceStepsRef.current, showingHint, next);
    // 새 크기로 다시 잰 내용 높이가 올 때까지 판정을 멈춘다. 글자가 작아지면 내용도 줄어드는데,
    // 그 값이 도착하기 전에 옛 높이로 또 판정하면 필요 이상으로 내려간다.
    contentHeight.current = 0;
    setSentenceSteps(sentenceStepsRef.current);
  }, []);

  const handleScrollLayout = useCallback((e: LayoutChangeEvent) => {
    viewportHeight.current = e.nativeEvent.layout.height;
    reconcileSentenceSize();
  }, [reconcileSentenceSize]);

  const handleScrollContentSize = useCallback((_w: number, h: number) => {
    contentHeight.current = h;
    reconcileSentenceSize();
  }, [reconcileSentenceSize]);

  /*
   * 밀기 시작하면 자동 넘김을 멈춘다. 읽으려고 미는 중인데 1~3초 뒤 화면이 넘어가 버리면
   * 그 스크롤이 아무 소용이 없다. 멈춘 뒤에는 하단 "다음"으로 넘어간다.
   */
  const holdAdvance = useCallback(() => setAdvanceHeld(true), []);

  // 학습 중 목록이 줄면(필터 변경·동기화 삭제) 현재 인덱스가 범위를 벗어날 수 있다.
  // 아래 렌더 가드만 두면 빈 화면에 갇히므로 여기서 첫 카드로 되돌린다.
  useEffect(() => {
    if (studyWords.length === 0) return;
    if (currentBatchWords.length === 0) {
      setCurrentBatchIndex(0);
      setCurrentIndex(0);
    } else if (currentIndex >= currentBatchWords.length) {
      setCurrentIndex(0);
    }
  }, [studyWords.length, currentBatchWords.length, currentIndex]);

  const finishSession = async () => {
    // 완주 — 복습 기록은 결과 화면 몫. replace 언마운트 전에 반드시 먼저 세운다.
    sessionCompletedRef.current = true;
    const finalResults = results.current;
    await commitSessionResults(id!, finalResults);
    // 계획 학습으로 들어왔으면 진행도를 올린다 — 플래시카드·퀴즈와 같은 규칙.
    // 잠금 자체는 단어 상태에서 유도하므로(deriveUnlockedDay) 이 줄이 없어도 갇히진
    // 않지만, planUpdatedAt이 안 움직이면 홈 카드가 "오늘 달성"으로 안 가고
    // computePlanStatus의 유휴 판정에 걸려 매일 공부한 사람에게 "7일 이상 학습하지
    // 않았습니다" 배너가 뜬다.
    const gotItRatio = finalResults.length > 0 ? finalResults.filter(r => r.gotIt).length / finalResults.length : 0;
    if (planDay && gotItRatio >= 0.5) await updatePlanProgress(id!, parseInt(planDay as string) + 1);
    setStudyResults(finalResults);
    router.replace({
      pathname: '/study-results',
      params: {
        id,
        mode: 'examples',
        duration: Date.now() - startTime.current,
        isStarred: settings.isStarred ? 'true' : 'false',
        sessionFilter: settings.filter
      }
    });
  };

  // 중도 이탈 — 그때까지의 암기 전환·오답 카운트를 커밋(useSessionCommit).
  // 하드웨어 백 등 이 핸들러를 안 거치는 pop은 훅의 언마운트 fallback이 커버.
  const handleClose = useCallback(async () => {
    await commitSession();
    router.back();
  }, [commitSession]);

  /*
   * 출제할 것이 하나도 없다 — 갈래 셋을 **가르지 않으면 거짓말이 된다.**
   *
   *   ① 채울 수 있는 단어가 있다 → 「예문이 있는 단어가 없어요 / N개를 채우면 시작할 수 있어요」
   *   ② 예문은 있는데 표제어가 안 나와 빈칸을 못 뚫는다 → 그 사실을 말한다(스펙 §8)
   *   ③ 조건에 맞는 단어 자체가 없다 → 설정을 확인하라는 기존 문구
   *
   * 🔴 ②를 ③으로 뭉치면 "설정을 확인해 주세요"가 거짓이 된다 — 설정에는 문제가 없고 예문
   * 쪽 결함이다(근본은 AI 생성 프롬프트, backlog-examples-enrich.md P6). 반대로 ②에서
   * 「채우면 시작할 수 있어요」를 내면 채울 것이 없는데 채우라고 하는 셈이다.
   */
  if (studyWords.length === 0) {
    const canFill = fillUi.targets.length > 0;
    const unblankable = !canFill && poolWords.length > 0 && poolWords.every(w => !!w.exampleEn);
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        {/* 채우는 중·채운 뒤의 배너는 여기서도 나온다 — 눌렀는데 화면이 아무 말도 안 하면 안 된다. */}
        {fillUi.showBanner && (
          <View style={styles.emptyBanner}>
            <BareWordsBanner {...fillUi.bannerProps} />
          </View>
        )}
        <Ionicons name="document-text-outline" size={64} color={colors.textTertiary} style={{ marginBottom: 16 }} />
        <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'Pretendard_600SemiBold', textAlign: 'center', marginBottom: 8 }}>
          {canFill ? t('examples.noReadyTitle') : unblankable ? t('examples.noBlankableTitle') : t('examples.noExamples')}
        </Text>
        <Text style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: 24, paddingHorizontal: 16 }}>
          {canFill
            ? t('examples.noReadyDesc', { count: fillUi.targets.length })
            : unblankable ? t('examples.noBlankableDesc') : t('examples.noExamplesDesc')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable
            onPress={canFill ? fillUi.openSheet : () => setSettingsVisible(true)}
            style={{ backgroundColor: colors.primaryButton, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 }}
          >
            <Text style={{ color: colors.onPrimary, fontFamily: 'Pretendard_600SemiBold' }}>
              {canFill ? t('bareWords.fillCount', { count: fillUi.targets.length }) : t('common.settingsChange')}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleClose}
            style={{ backgroundColor: colors.surfaceSecondary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 }}
          >
            <Text style={{ color: colors.text, fontFamily: 'Pretendard_600SemiBold' }}>{t('common.back')}</Text>
          </Pressable>
        </View>
        <StudySettingsModal
          visible={settingsVisible}
          mode="examples"
          initialSettings={settings}
          initialBatchSize={studySettings.studyBatchSize}
          onClose={() => setSettingsVisible(false)}
          onApply={applySettings}
        />
        <BareWordsSheet {...fillUi.sheetProps} />
      </View>
    );
  }

  // 인덱스 복구 effect가 도는 한 프레임 동안 카드가 비어 있을 수 있다 —
  // 가드가 없으면 아래 currentWord.exampleEn 접근에서 화면이 죽는다.
  if (!currentWord) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>

          <View style={styles.titleArea}>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
              {list?.title || t('examples.title')}
            </Text>
          </View>

          <Pressable onPress={() => setSettingsVisible(true)} hitSlop={12}>
            <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.progressContainer}>
          <View style={[styles.progressBarBg, { backgroundColor: colors.surfaceSecondary }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  backgroundColor: colors.primaryButton,
                  width: `${((currentIndex + 1) / currentBatchWords.length) * 100}%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: colors.textTertiary }]}>
            {currentIndex + 1} / {currentBatchWords.length}
          </Text>
        </View>

        {/* 예문 없는 단어 안내·진행·결과. 얼굴은 face.ts 가 고르고 여기서는 자리만 준다. */}
        {fillUi.showBanner && <BareWordsBanner {...fillUi.bannerProps} />}
      </View>

      <View style={styles.body}>
        <View style={styles.cardArea}>
          <View style={[styles.card, { backgroundColor: colors.surface, shadowColor: colors.cardShadow, borderColor: colors.borderLight, borderWidth: 1 }]}>
            <Pressable onPress={() => handleToggleStar(currentWord.id)} hitSlop={12} style={styles.starBtn}>
              <Ionicons name={currentWord.isStarred ? 'star' : 'star-outline'} size={22} color={currentWord.isStarred ? colors.starGold : colors.textTertiary} />
            </Pressable>

            {senseView.exampleEn ? (
              /*
               * 문장·힌트·번역은 스크롤 영역 안에, 스피커는 밖에 둔다. 카드가 감당할 수 있는
               * 양을 넘으면 잘라 내는 대신 밀어서 보게 한다 — 글자를 한없이 줄이는 쪽은
               * 표준이 아니고(sentence-size.ts 주석), 실측 15% 에서는 어느 크기로도 안 들어간다.
               * 스피커를 밖에 두는 이유는 밀 때 같이 밀려 올라가면 안 되기 때문이다.
               */
              <View style={styles.cardBody}>
                <ScrollView
                  style={styles.sentenceScroll}
                  contentContainerStyle={styles.sentenceScrollContent}
                  onLayout={handleScrollLayout}
                  onContentSizeChange={handleScrollContentSize}
                  onScrollBeginDrag={holdAdvance}
                  alwaysBounceVertical={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <HighlightedSentence
                    sentence={senseView.exampleEn}
                    term={currentWord.term}
                    primaryColor={colors.primary}
                    textColor={colors.text}
                    showTerm={isRevealed}
                    onPressBlank={() => setHint(!showHint)}
                    colors={colors}
                    size={sentenceSize}
                  />

                  {/*
                    힌트는 빈칸 안이 아니라 문장 아래 한 줄로 나온다(P8). 정답이 이미 보이는
                    상태에서는 뜻만 따로 띄울 이유가 없으므로 공개 전에만 렌더한다.
                  */}
                  {!isRevealed && showHint && (
                    <Pressable onPress={() => setHint(false)} hitSlop={6}>
                      <View style={[styles.hintLine, { backgroundColor: colors.hintBg, borderColor: colors.hintBorder }]}>
                        <Text style={[styles.hintLineText, { color: colors.hintText }]} numberOfLines={2}>
                          {t('examples.hintLabel', { meaning: senseView.meaningKr || t('examples.noMeaning') })}
                        </Text>
                      </View>
                    </Pressable>
                  )}

                  {settings.showExampleKr && shouldShowExampleTranslation(senseView.exampleEn, senseView.exampleKr) && selectedAnswer !== null && (
                    <Text style={[styles.exampleKrText, { color: colors.textTertiary }]}>{senseView.exampleKr}</Text>
                  )}
                </ScrollView>

                {/*
                  공개 전에는 빈칸을 뺀 문장을 읽는다(P7) — 자세한 근거는 spokenExample 주석.
                  읽을 문자열은 여기서 만들어 넘긴다: SpeakerButton은 7곳 공용이라
                  이 화면의 사정을 컴포넌트가 알면 안 된다.
                  빈칸을 못 만드는 예문은 빈 문자열이 오고, 그때는 문장 자체가 화면에도
                  안 뜨므로 버튼도 감춘다.
                */}
                {spokenText ? (
                  <SpeakerButton
                    text={spokenText}
                    language={getTtsLang(getStudySourceLang(currentWord, list))}
                    style={styles.speakerBtn}
                  />
                ) : null}
              </View>
            ) : (
              <Text style={[styles.noExample, { color: colors.textTertiary }]}>{t('examples.noExample')}</Text>
            )}

          </View>
        </View>

        <View style={styles.choicesArea}>
          {choices.map((choice: Word, index) => {
            const isSelected = selectedAnswer === choice.id;
            const isCorrectAnswer = choice.id === currentWord.id;
            const showCorrect = selectedAnswer !== null && isCorrectAnswer;
            const showWrong = isSelected && !isCorrect;

            let bgColor = colors.surface;
            let borderColor = colors.borderLight;
            let textColor = colors.text;
            let iconName: keyof typeof Ionicons.glyphMap | null = null;
            let badgeTextColor = colors.textSecondary;

            if (showCorrect) {
              bgColor = colors.primaryLight;
              borderColor = colors.primary;
              textColor = colors.primary;
              iconName = 'checkmark-circle';
              badgeTextColor = colors.primary;
            } else if (showWrong) {
              bgColor = colors.warningLight;
              borderColor = colors.warning;
              textColor = colors.warning;
              iconName = 'close-circle';
              badgeTextColor = colors.warning;
            } else if (selectedAnswer && !isCorrectAnswer) {
              textColor = colors.textSecondary;
              badgeTextColor = colors.textTertiary;
            }

            return (
              <Pressable
                key={choice.id}
                onPress={() => handleAnswer(choice)}
                disabled={selectedAnswer !== null}
                style={[
                  styles.choiceBtn,
                  {
                    backgroundColor: bgColor,
                    borderColor: borderColor,
                  },
                ]}
              >
                <View style={styles.choiceIndexBadge}>
                  <Text style={[styles.choiceIndexText, { color: badgeTextColor }]}>{['A', 'B', 'C', 'D'][index]}.</Text>
                </View>
                <Text style={[styles.choiceText, { color: textColor }]}>{choice.term}</Text>
                {iconName && (
                  <Ionicons name={iconName} size={24} color={textColor} />
                )}
              </Pressable>
            );
          })}
        </View>

      </View>

      <View style={[styles.navFooter, { paddingBottom: insets.bottom + (adsBottomInset || 36) }]}>
          <Pressable
            style={[styles.navBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }, currentIndex === 0 && { opacity: 0.4 }]}
            disabled={currentIndex === 0}
            onPress={() => {
              const prevIndex = currentIndex - 1;
              const prevAnswer = batchAnswers[prevIndex];
              setCurrentIndex(prevIndex);
              setSelectedAnswer(prevAnswer ? prevAnswer.selectedId : null);
              setIsCorrect(prevAnswer ? prevAnswer.isCorrect : null);
              setIsNewAnswer(false);
            }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
            <Text style={[styles.navBtnText, { color: colors.text }]}>{t('common.previous')}</Text>
          </Pressable>

          <Pressable
            style={[styles.navBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }, currentIndex >= currentBatchWords.length - 1 && { opacity: 0.4 }]}
            disabled={currentIndex >= currentBatchWords.length - 1}
            onPress={() => {
              const nextIndex = currentIndex + 1;
              const nextAnswer = batchAnswers[nextIndex];
              setCurrentIndex(nextIndex);
              setSelectedAnswer(nextAnswer ? nextAnswer.selectedId : null);
              setIsCorrect(nextAnswer ? nextAnswer.isCorrect : null);
              setIsNewAnswer(false);
            }}
          >
            <Text style={[styles.navBtnText, { color: colors.text }]}>{t('common.next')}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </Pressable>
        </View>

      <StudySettingsModal
        visible={settingsVisible}
        mode="examples"
        initialSettings={settings}
        initialBatchSize={studySettings.studyBatchSize}
        onClose={() => setSettingsVisible(false)}
        onApply={applySettings}
      />

      <BareWordsSheet {...fillUi.sheetProps} />

      <BatchResultOverlay
        visible={showBatchOverlay}
        completedCount={results.current.length}
        totalCount={studyWords.length}
        isLastBatch={(currentBatchIndex + 1) * batchSizeNum >= studyWords.length}
        onNextBatch={() => {
          setCurrentBatchIndex(prev => prev + 1);
          setCurrentIndex(0);
          setSelectedAnswer(null);
          setIsCorrect(null);
          setBatchAnswers({});
          setIsNewAnswer(false);
          setShowBatchOverlay(false);
        }}
        onRetryBatch={() => {
          setCurrentIndex(0);
          setSelectedAnswer(null);
          setIsCorrect(null);
          setBatchAnswers({});
          setIsNewAnswer(false);
          setShowBatchOverlay(false);
          results.current = results.current.slice(0, results.current.length - currentBatchWords.length);
        }}
        onFinish={() => {
          setShowBatchOverlay(false);
          finishSession();
        }}
      />

      <AppBannerAd mode="bottom-anchor" />
    </View>
  );
}

// 카드 최소 높이 — 근거는 퀴즈 화면(features/study/quiz/screen.tsx)의 같은 상수 주석 참조.
// 두 화면은 카드 + 선택지 4개 + 하단 이전/다음이라는 세로 구성이 같아 값을 함께 쓴다.
const CARD_MIN_HEIGHT = Math.min(140, Math.round(Dimensions.get('window').height * 0.18));

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  body: {
    flex: 1,
    paddingTop: 16,
    paddingBottom: 16,
    justifyContent: 'space-evenly',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleArea: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Pretendard_700Bold',
  },
  progressContainer: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 8,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontFamily: 'Pretendard_500Medium',
    minWidth: 70,
    textAlign: 'right',
  },
  // 배너는 자기 여백을 갖고 있다(marginVertical). 가운데 정렬된 빈 화면에서는 폭만 펴 준다.
  emptyBanner: { alignSelf: 'stretch' },
  cardArea: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  // 카드 안의 세로 묶음. 카드가 줄면 이 묶음도 함께 줄어야(minHeight 0) 아래의
  // sentenceBox가 양보할 기회를 갖는다 — Yoga는 minHeight 기본값이 auto라 이걸 안 주면
  // 자식이 요구한 만큼 버티고 그대로 넘친다.
  cardBody: {
    width: '100%',
    flex: 1,
    alignItems: 'center',
    // 문장+스피커를 한 덩어리로 카드 가운데에 둔다. 문장이 짧을 때 스피커만 바닥에 남아
    // 카드 가운데가 비는 것을 막는다(문장이 길면 어차피 문장이 자리를 다 쓴다).
    justifyContent: 'center',
    gap: 8,
    minHeight: 0,
  },
  // 문장·힌트·번역이 사는 스크롤 영역. 여기 높이가 곧 "보여 줄 수 있는 최대"다(축소 판정이 쓴다).
  sentenceScroll: {
    width: '100%',
    /*
     * 🔴 `flexGrow: 0` 을 **명시해야 한다.** RN 의 ScrollView 는 자기 스타일(`baseVertical`)에
     *    `flexGrow: 1` 을 이미 갖고 있어서, 그냥 두면 문장이 한 줄이어도 칸을 끝까지 차지하고
     *    스피커가 카드 바닥에 홀로 남아 가운데가 빈다. 0 으로 덮으면 평소에는 문장 높이
     *    그대로(스피커가 문장 바로 아래) 있다가, 모자랄 때만 `flexShrink` 로 줄며 스크롤이 된다.
     *    실측(2026-08-22 · Galaxy S22): 짧은 문항 130dp / 넘치는 문항 143dp 로 갈렸다.
     * 🔑 축소 판정은 이 값에 영향받지 않는다 — 들어갈 때는 뷰포트=내용이라 조건이 거짓이고,
     *    넘칠 때는 뷰포트가 143 에서 멈추므로 내용 > 뷰포트가 그대로 성립한다.
     *
     * marginTop 은 별표를 피하는 몫이다 — 별표는 카드 우상단에 절대 위치로 떠 있고 이 영역
     * **밖**이라, 문장이 여기서 시작하면 밀어 올려도 겹칠 수 없다. 문장 폭을 좁히는 방법도
     * 있지만 그쪽은 모든 줄이 짧아져 줄 수가 늘어 손해가 더 크다(실측 15.1% → 20.7%).
     */
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
    marginTop: 20,
  },
  // 내용이 적으면 가운데, 넘치면 위에서부터. 넘칠 때 위아래를 같이 깎으면 첫머리가 사라진다.
  sentenceScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    /*
     * 🔴 빈칸이 **첫 줄**에 오면 박스 위쪽이 잘리던 것(2026-08-23 iOS 실기, 9dp).
     *
     * 빈칸은 <Text> 안의 인라인 View 라 baseline 정렬된다 — 박스 높이(blankH 34)가
     * baseline 위로 올라가는데 24dp 글자의 ascent 는 그보다 작아 줄 상단 위로 삐져나온다.
     * `top: blankTop` 으로 내려도 모자라고, 첫 줄에서는 그 초과분이 **ScrollView 경계에서
     * 잘린다**(둘째 줄부터는 위에 다른 줄이 있어 잘릴 것이 없다). b314e38 이 이 영역을
     * ScrollView 로 바꾸면서 생긴 것이라 1.6.0 이전에는 없던 증상이다.
     *
     * 🔴 `sentenceScroll.marginTop` 을 줄여 해결하면 안 된다 — 그 20dp 는 별표를 피하는
     *    몫이라(그 스타일 주석) 줄이면 밀어 올렸을 때 문장이 별표와 겹친다. 클리핑 경계는
     *    그대로 두고 **안쪽에** 여유를 만든다.
     * 🔑 12dp 는 가장 큰 단계(fontSize 24 · blankH 34)의 실측 초과분 9dp 에 여유를 둔 값이다.
     *    작은 단계는 초과분이 더 적으므로 함께 덮인다.
     */
    paddingTop: 12,
  },
  card: {
    width: '100%',
    borderRadius: 12,
    // 패딩·간격을 조여 문장 몫을 넓힌다(24→16 · 12→8). 카드 안쪽 폭도 함께 넓어져
    // 같은 문장이 더 적은 줄에 들어간다. 아래 패딩과 스피커까지 조여 문장 영역은
    // 123 → 143dp 가 됐다(실측). 그만큼 밀어야 보는 카드가 줄었다: 같은 25문항에서 5장 → 0장.
    paddingTop: 16,
    paddingHorizontal: 16,
    // 아래는 스피커라 여백이 덜 필요하다. 위는 별표가 앉아 있어 그대로 둔다.
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 12,
    gap: 8,
    minHeight: CARD_MIN_HEIGHT,
    /*
     * 🔴 `flexGrow: 1` 이 **반드시 있어야 한다.** 안의 문장 영역이 ScrollView 라 카드에게
     *    자기 높이를 알려 주지 않는다 — 없으면 카드는 콘텐츠(스피커뿐)만큼만 자라 minHeight
     *    140dp 로 주저앉고, 그 안의 ScrollView 는 기준 높이를 못 잡아 31dp, 곧 한 줄로
     *    수축한다(2026-08-22 실기에서 실제로 그렇게 났고, 은정님이 "칸이 너무 짧다"고 반려했다).
     *    카드가 cardArea 를 채우면 문장 영역도 그만큼 확정된다.
     */
    flexGrow: 1,
    flexShrink: 1,
  },
  starBtn: {
    position: 'absolute',
    // 모서리 쪽으로 당겨 문장이 내주는 위 여백(sentenceScroll.marginTop)을 줄인다.
    // 터치 영역은 padding 4 + hitSlop 12 로 그대로다.
    top: 6,
    right: 8,
    padding: 4,
    zIndex: 10,
  },
  speakerBtn: {
    // 문장 몫을 늘리려고 조인 값이다(8→4 · marginTop 4→0 = 12dp). 아이콘 26 + 패딩 8 = 34dp
    // 이고 SpeakerButton 기본 hitSlop 12 가 더 붙어 터치 영역은 58dp — 44dp 권고를 넘는다.
    padding: 4,
    alignItems: 'center',
  },
  exampleText: {
    // 여기 두 값은 기본값일 뿐이다 — 실제로는 SENTENCE_SIZES의 단계가 덮어쓴다
    // (문장이 카드보다 길면 한 단계씩 줄인다). 고칠 일이 있으면 표의 0번을 함께 고칠 것.
    fontSize: 24,
    lineHeight: 34,
    fontFamily: 'Pretendard_500Medium',
    textAlign: 'center',
  },
  exampleKrText: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  highlightedWord: {
    fontFamily: 'Pretendard_700Bold',
    textDecorationLine: 'underline',
  },
  blankBox: {
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    // 힌트가 안으로 들어오지 않으므로 폭은 `?` 하나에 맞추면 된다. 치수(minWidth·minHeight·
    // top)와 글자 크기는 SENTENCE_SIZES가 단계별로 내려 준다 — 문장이 작아질 때 박스만
    // 그대로면 `?`만 커 보인다.
  },
  blankText: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
  },
  // 힌트 줄 — 문장 아래에 놓이는 별도 블록이라 인라인 View와 달리 정상적으로 줄바꿈된다.
  // 카드 세로를 한 줄 더 먹으므로 조밀하게 잡는다(a252ed2가 확보한 여유를 갉아먹지 않도록).
  hintLine: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    maxWidth: '100%',
  },
  hintLineText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Pretendard_600SemiBold',
    textAlign: 'center',
  },
  noExample: {
    fontSize: 16,
    fontFamily: 'Pretendard_400Regular',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  choicesArea: {
    paddingHorizontal: 24,
    gap: 8,
    marginTop: 12,
    // 선택지가 자리를 먼저 확보한다 — 밀려서 잘리던 것이 이 화면의 회귀였다.
    flexShrink: 0,
  },
  choiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  choiceText: {
    fontSize: 18,
    fontFamily: 'Pretendard_500Medium',
    flex: 1,
  },
  choiceIndexBadge: {
    width: 24,
    justifyContent: 'center',
    marginRight: 4,
  },
  choiceIndexText: {
    fontSize: 18,
    fontFamily: 'Pretendard_500Medium',
  },
  navFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  navBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  navBtnText: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
  },
});
