import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, Pressable, Platform, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
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
  updateWord,
  saveLastResult,
} from '@/features/vocab';
import { useStudyResultsStore } from '@/features/study';
import { useAbandonRecord } from '../use-abandon-record';
import { useSessionCommit, commitSessionResults } from '../use-session-commit';
import { useSettings } from '@/features/settings';
import SpeakerButton from '@/components/ui/SpeakerButton';
import { getTtsLang, getStudySourceLang, shouldShowExampleTranslation } from '@/constants/languages';
import { stripSenseMarkers } from '@/lib/senses';
import { segmentExample, canBlankExample } from '@/lib/example-blank';
import { buildChoices } from '../choices';
import { Word, StudyResult } from '@/lib/types';
import StudySettingsModal, { StudySettings } from '@/features/study/components/StudySettingsModal';
import BatchResultOverlay from '@/features/study/components/BatchResultOverlay';
import { useTranslation } from 'react-i18next';
import { enrichWord } from '@/lib/translation-api';
import type { AutoFillResult } from '@/lib/types';

function HighlightedSentence({ sentence, term, meaning, primaryColor, textColor, showTerm = true, showHint = false, onPressBlank, isDark, colors }: { sentence: string; term: string; meaning: string; primaryColor: string; textColor: string; showTerm?: boolean; showHint?: boolean; onPressBlank?: () => void; isDark: boolean; colors: any }) {
  // 빈칸 위치는 lib/example-blank가 언어군별로 판정한다(라틴은 토큰 경계, 한/일은 활용 폴백).
  const segments = React.useMemo(() => segmentExample(sentence, term), [sentence, term]);

  // 빈칸을 못 만드는 예문은 출제 목록에서 이미 걸러진다(canBlankExample). 그래도 남았다면
  // 문장을 그대로 띄우는 건 곧 정답 공개이므로, 정답 공개 단계에서만 보여준다.
  if (!segments) {
    if (!showTerm) return null;
    return <Text style={[styles.exampleText, { color: textColor }]}>{sentence}</Text>;
  }

  return (
    <Text style={[styles.exampleText, { color: textColor }]}>
      {segments.map((seg, i) => {
        if (!seg.isBlank) return <Text key={i}>{seg.text}</Text>;
        if (showTerm) {
          return <Text key={i} style={[styles.highlightedWord, { color: primaryColor }]}>{seg.text}</Text>;
        }
        // key는 바깥 요소에만 준다 — Text 안의 인라인 View를 한 겹 더 감싸면 정렬이 틀어진다.
        const box = (key?: number) => (
          <View key={key} style={[
            styles.blankBox,
            {
              backgroundColor: showHint ? colors.hintBg : colors.surfaceSecondary,
              borderColor: showHint ? colors.hintBorder : colors.border,
              minWidth: showHint ? 60 : 40,
            }
          ]}>
            <Text style={[styles.blankText, { color: showHint ? colors.hintText : colors.textTertiary }]}>
              {showHint ? meaning : '?'}
            </Text>
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
  const { id, filter, isStarred: initialIsStarred, ids } = useLocalSearchParams<{ id: string; filter?: string; isStarred?: string; ids?: string }>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const lists = useLists();
  const getWordsForList = useCallback((listId: string) => selectWordsForList(lists, listId), [lists]);
  const setStudyResults = useStudyResultsStore(s => s.setResults);
  const { studySettings, updateStudySettings, apiKey } = useSettings();
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
  // 백그라운드 enrich 상태. 모달로 차단하지 않고 진행 배너로 노출.
  // hadAnyReady: 시작 시점에 예문 있는 단어가 하나라도 있었는지(전체 미생성 케이스 UI 분기용).
  const [bgEnrich, setBgEnrich] = useState<{
    running: boolean;
    total: number;
    completed: number;
    hadAnyReady: boolean;
  }>({ running: false, total: 0, completed: 0, hadAnyReady: true });
  const enrichAbortRef = useRef<AbortController | null>(null);

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
  const startTime = useRef(Date.now());
  const results = useRef<StudyResult[]>([]);
  const sessionCompletedRef = useAbandonRecord(results);
  const commitSession = useSessionCommit(id, results, sessionCompletedRef);
  const isInitialLoad = useRef(true);
  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;
  const lastSettingsRef = useRef({ id, filter: settings.filter, isStarred: settings.isStarred, shuffle: settings.shuffle, batchSize: studySettings.studyBatchSize, ids });

  // 누락된 예문을 백그라운드에서 sliding-window 동시성으로 채운다.
  // - 완성될 때마다 studyWords에 append → 진행 중 다음 batch부터 자동 등장
  // - 빈 결과/에러는 지수 backoff로 최대 3회 시도 (429/quota 회복용)
  // - AbortController로 화면 이탈/재초기화 시 즉시 중단
  const startBackgroundEnrich = useCallback(async (missing: Word[]) => {
    if (missing.length === 0) return;
    enrichAbortRef.current?.abort();
    const ctrl = new AbortController();
    enrichAbortRef.current = ctrl;

    const CONCURRENCY = 3;
    const MAX_ATTEMPTS = 3;
    let index = 0;

    const worker = async () => {
      while (!ctrl.signal.aborted) {
        const i = index++;
        if (i >= missing.length) return;
        const word = missing[i];

        let enriched: AutoFillResult | null = null;
        for (let attempt = 0; attempt < MAX_ATTEMPTS && !ctrl.signal.aborted; attempt++) {
          try {
            enriched = await enrichWord(
              word.term,
              word.sourceLang || 'en',
              word.targetLang || 'ko',
              apiKey || undefined,
              ctrl.signal,
            );
          } catch (e: any) {
            if (e?.name === 'AbortError') return;
            enriched = null;
          }
          if (enriched?.exampleEn) break;
          if (attempt < MAX_ATTEMPTS - 1) {
            const backoff = Math.min(1500 * Math.pow(2, attempt), 8000);
            await new Promise(r => setTimeout(r, backoff));
          }
        }

        if (ctrl.signal.aborted) return;

        if (enriched?.exampleEn) {
          const updates: Partial<Omit<Word, 'id'>> = { exampleEn: enriched.exampleEn };
          if (enriched.exampleKr) updates.exampleKr = enriched.exampleKr;
          try {
            await updateWord(id!, word.id, updates);
          } catch { /* DB write 실패는 무시 — 다음 진입 시 재시도 */ }
          // 예문 자체는 저장한다(플래시카드 등 다른 모드에서 쓰인다). 다만 빈칸을
          // 만들 수 없는 예문이면 이 화면의 출제 목록에는 넣지 않는다.
          if (!ctrl.signal.aborted && canBlankExample(enriched.exampleEn, word.term)) {
            const enrichedWord = { ...word, ...updates };
            setStudyWords(prev => prev.some(w => w.id === word.id) ? prev : [...prev, enrichedWord]);
          }
        }

        if (!ctrl.signal.aborted) {
          setBgEnrich(s => ({ ...s, completed: s.completed + 1 }));
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (!ctrl.signal.aborted) {
      setBgEnrich(s => ({ ...s, running: false }));
    }
  }, [id, apiKey]);

  // 화면 이탈 시 in-flight enrich 중단
  useEffect(() => {
    return () => {
      enrichAbortRef.current?.abort();
    };
  }, []);

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

    if (ids) {
      const idList = ids.split(',');
      all = all.filter(w => idList.includes(w.id));
      const idMap = new Map(idList.map((id, index) => [id, index]));
      all.sort((a, b) => (idMap.get(a.id) ?? 0) - (idMap.get(b.id) ?? 0));
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
      lastSettingsRef.current.ids !== ids;

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
      lastSettingsRef.current = { id, filter: settings.filter, isStarred: settings.isStarred, shuffle: settings.shuffle, batchSize: studySettings.studyBatchSize, ids };
      isInitialLoad.current = false;

      const missing = all.filter(w => !w.exampleEn);
      // 예문이 있어도 표제어 자리를 찾지 못하면 빈칸을 만들 수 없다. 그대로 출제하면
      // 문장이 통째로 보여 정답이 공개되므로 출제 목록에서 뺀다.
      const ready = all.filter(w => !!w.exampleEn && canBlankExample(w.exampleEn, w.term));
      setStudyWords(ready);

      if (missing.length > 0) {
        setBgEnrich({ running: true, total: missing.length, completed: 0, hadAnyReady: ready.length > 0 });
        startBackgroundEnrich(missing);
      } else {
        setBgEnrich({ running: false, total: 0, completed: 0, hadAnyReady: true });
      }
    } else {
      setStudyWords(prev => {
        const newMap = new Map(all.map(w => [w.id, w]));
        return prev.map(w => newMap.has(w.id) ? newMap.get(w.id)! : w);
      });
    }
  }, [id, getWordsForList, settings.filter, settings.isStarred, settings.shuffle, studySettings.studyBatchSize]);

  const batchSizeNum = studySettings.studyBatchSize === 'all' ? (studyWords.length || 1) : studySettings.studyBatchSize;
  const currentBatchWords = React.useMemo(() => {
    if (studyWords.length === 0) return [];
    const start = currentBatchIndex * batchSizeNum;
    return studyWords.slice(start, start + batchSizeNum);
  }, [studyWords, currentBatchIndex, batchSizeNum]);

  const currentWord = currentBatchWords[currentIndex];

  const handleToggleStar = useCallback(async (wordId: string) => {
    setStudyWords(prev => prev.map(w => w.id === wordId ? { ...w, isStarred: !w.isStarred } : w));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await toggleStarred(id!, wordId);
  }, [id, toggleStarred]);

  const choicesMapRef = useRef<Record<string, Word[]>>({});

  const choices = useMemo(() => {
    if (!currentWord) return [];
    if (choicesMapRef.current[currentWord.id]) {
      return choicesMapRef.current[currentWord.id].map(c => c.id === currentWord.id ? currentWord : c);
    }
    const allListWords = getWordsForList(id!);
    // 선택지는 화면에 보이는 라벨(여기서는 표제어) 기준으로 중복을 걸러야 한다 — features/study/choices.ts
    const newChoices = buildChoices(allListWords, currentWord, w => w.term);
    choicesMapRef.current[currentWord.id] = newChoices;
    return newChoices;
  }, [currentIndex, currentWord?.id, id, getWordsForList]);

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
    const timer = setTimeout(async () => {
      if (currentIndexRef.current === currentIndex) {
        if (currentIndex >= currentBatchWords.length - 1) {
          const nextStart = (currentBatchIndex + 1) * batchSizeNum;
          if (nextStart < studyWords.length) {
            setShowBatchOverlay(true);
          } else {
            finishSession();
          }
        } else {
          const nextIndex = currentIndex + 1;
          const nextAnswer = batchAnswers[nextIndex];
          setCurrentIndex(nextIndex);
          setSelectedAnswer(nextAnswer ? nextAnswer.selectedId : null);
          setIsCorrect(nextAnswer ? nextAnswer.isCorrect : null);
          setIsNewAnswer(false);
        }
      }
    }, isCorrect ? ADVANCE_DELAY_CORRECT_MS : ADVANCE_DELAY_WRONG_MS);
    return () => clearTimeout(timer);
    // isCorrect가 지연 시간을 정하므로 의존성에 있어야 한다 — 빠지면 이전 카드의 정오답으로 타이머가 잡힌다.
  }, [selectedAnswer, isNewAnswer, isCorrect, currentIndex, currentBatchWords.length, currentBatchIndex, batchSizeNum, studyWords.length, batchAnswers]);

  useEffect(() => {
    setShowHint(false);
  }, [currentIndex, currentBatchIndex]);

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
    await saveLastResult(id!);
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

  // 모두 예문 없음 + 백그라운드 enrich 진행 중 → 풀스크린 진행 상태.
  // 첫 단어가 완성되면 studyWords.length > 0이 되어 자동으로 학습 화면으로 전환됨.
  if (studyWords.length === 0 && bgEnrich.running) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'Pretendard_600SemiBold', marginTop: 24, textAlign: 'center' }}>
          {t('examples.bgGenerateAllMissing')}
        </Text>
        <Text style={{ color: colors.textSecondary, marginTop: 8, fontFamily: 'Pretendard_500Medium' }}>
          {bgEnrich.completed} / {bgEnrich.total}
        </Text>
        <Pressable onPress={handleClose} style={{ marginTop: 24 }}>
          <Text style={{ color: colors.textSecondary, fontFamily: 'Pretendard_500Medium' }}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  if (studyWords.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="document-text-outline" size={64} color={colors.textTertiary} style={{ marginBottom: 16 }} />
        <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'Pretendard_600SemiBold', textAlign: 'center', marginBottom: 8 }}>{t('examples.noExamples')}</Text>
        <Text style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: 24, paddingHorizontal: 40 }}>{t('examples.noExamplesDesc')}</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable
            onPress={() => setSettingsVisible(true)}
            style={{ backgroundColor: colors.primaryButton, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 }}
          >
            <Text style={{ color: colors.onPrimary, fontFamily: 'Pretendard_600SemiBold' }}>{t('common.settingsChange')}</Text>
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

        {bgEnrich.running && (
          <View style={[styles.bgEnrichBanner, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.bgEnrichBannerText, { color: colors.textSecondary }]} numberOfLines={1}>
              {t('examples.bgGenerating', { completed: bgEnrich.completed, total: bgEnrich.total })}
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: 16,
          paddingBottom: 16,
          justifyContent: 'space-evenly'
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cardArea}>
          <View style={[styles.card, { backgroundColor: colors.surface, shadowColor: colors.cardShadow, borderColor: colors.borderLight, borderWidth: 1 }]}>
            <Pressable onPress={() => handleToggleStar(currentWord.id)} hitSlop={12} style={styles.starBtn}>
              <Ionicons name={currentWord.isStarred ? 'star' : 'star-outline'} size={22} color={currentWord.isStarred ? colors.starGold : colors.textTertiary} />
            </Pressable>

            {currentWord.exampleEn ? (
              <View style={{ gap: 12, alignItems: 'center', width: '100%' }}>
                <HighlightedSentence
                  sentence={currentWord.exampleEn}
                  term={currentWord.term}
                  meaning={currentWord.meaningKr || t('examples.noMeaning')}
                  primaryColor={colors.primary}
                  textColor={colors.text}
                  showTerm={settings.showTerm || selectedAnswer !== null}
                  showHint={showHint}
                  onPressBlank={() => setShowHint(prev => !prev)}
                  isDark={isDark}
                  colors={colors}
                />

                {settings.showExampleKr && shouldShowExampleTranslation(currentWord.exampleEn, currentWord.exampleKr) && selectedAnswer !== null && (
                  <Text style={[styles.exampleKrText, { color: colors.textTertiary }]}>{currentWord.exampleKr}</Text>
                )}

                <SpeakerButton
                  text={stripSenseMarkers(currentWord.exampleEn)}
                  language={getTtsLang(getStudySourceLang(currentWord, list))}
                  style={styles.speakerBtn}
                />
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

      </ScrollView>

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
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
  bgEnrichBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
    marginBottom: 8,
  },
  bgEnrichBannerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Pretendard_500Medium',
  },
  cardArea: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 12,
    gap: 12,
    minHeight: 250,
  },
  starBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
    zIndex: 10,
  },
  speakerBtn: {
    padding: 8,
    marginTop: 4,
    alignItems: 'center',
  },
  exampleText: {
    fontSize: 24,
    fontFamily: 'Pretendard_500Medium',
    textAlign: 'center',
    lineHeight: 34,
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
    minHeight: 34,
    justifyContent: 'center',
    alignItems: 'center',
    top: 6,
  },
  blankText: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
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
