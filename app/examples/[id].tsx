import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, Pressable, Platform, StyleSheet, Modal, Switch, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { useSettings } from '@/contexts/SettingsContext';
import { speak } from '@/lib/tts';
import { Word, StudyResult } from '@/lib/types';
import StudySettingsModal, { StudySettings } from '@/components/StudySettingsModal';
import BatchResultOverlay from '@/components/BatchResultOverlay';

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function HighlightedSentence({ sentence, term, meaning, primaryColor, textColor, showTerm = true, showHint = false, onPressBlank, isDark, colors }: { sentence: string; term: string; meaning: string; primaryColor: string; textColor: string; showTerm?: boolean; showHint?: boolean; onPressBlank?: () => void; isDark: boolean; colors: any }) {
  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = sentence.split(regex);

  return (
    <Text style={[styles.exampleText, { color: textColor }]}>
      {parts.map((part, i) =>
        regex.test(part) ? (
          showTerm ? (
            <Text key={i} style={[styles.highlightedWord, { color: primaryColor }]}>{part}</Text>
          ) : (
            (() => {
              const hintBg = isDark ? '#3D3D29' : '#FFF9C4'; // Soft yellow for hint
              const defaultBg = isDark ? colors.surfaceSecondary : '#F3F4F6';
              const child = (
                <View key={i} style={[
                  styles.blankBox,
                  {
                    backgroundColor: showHint ? hintBg : defaultBg,
                    borderColor: showHint ? (isDark ? '#856404' : '#FFEE58') : (isDark ? colors.border : '#E5E7EB'),
                    minWidth: showHint ? 60 : 40,
                  }
                ]}>
                  <Text style={[styles.blankText, { color: showHint ? (isDark ? '#FDE68A' : '#856404') : (isDark ? colors.textTertiary : '#9CA3AF') }]}>
                    {showHint ? meaning : '?'}
                  </Text>
                </View>
              );
              if (onPressBlank) {
                return (
                  <Pressable key={i} onPress={onPressBlank} hitSlop={8}>
                    {child}
                  </Pressable>
                );
              }
              return child;
            })()
          )
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  );
}

export default function ExamplesScreen() {
  const { id, filter, isStarred: initialIsStarred, ids } = useLocalSearchParams<{ id: string; filter?: string; isStarred?: string; ids?: string }>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { lists, getWordsForList, setStudyResults, toggleStarred, setWordsMemorized } = useVocab();
  const { studySettings, updateStudySettings } = useSettings();
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
    shuffle: false,
  });

  const applySettings = useCallback((newSettings: StudySettings, newBatchSize: number | 'all') => {
    setSettings(newSettings);
    if (newBatchSize !== studySettings.studyBatchSize) {
      updateStudySettings({ studyBatchSize: newBatchSize as any });
    }
    setSettingsVisible(false);
  }, [studySettings.studyBatchSize, updateStudySettings]);

  const [studyWords, setStudyWords] = useState<Word[]>([]);
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
  const isInitialLoad = useRef(true);
  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;
  const lastSettingsRef = useRef({ id, filter: settings.filter, isStarred: settings.isStarred, shuffle: settings.shuffle, batchSize: studySettings.studyBatchSize, ids });

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
      if (settings.shuffle && !ids) {
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
      setStudyWords(all);
      isInitialLoad.current = false;
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
    const distractors = shuffleArray(allListWords.filter(w => w.id !== currentWord.id)).slice(0, 3);
    const newChoices = shuffleArray([currentWord, ...distractors]);
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
    }, 1000);
    return () => clearTimeout(timer);
  }, [selectedAnswer, isNewAnswer, currentIndex, currentBatchWords.length, currentBatchIndex, batchSizeNum, studyWords.length, batchAnswers]);

  useEffect(() => {
    setShowHint(false);
  }, [currentIndex, currentBatchIndex]);

  const finishSession = async () => {
    const finalResults = results.current;
    const memorizedWords = finalResults
      .filter(r => r.gotIt && !r.word.isMemorized)
      .map(r => r.word.id);

    const failedWords = finalResults
      .filter(r => !r.gotIt && r.word.isMemorized)
      .map(r => r.word.id);

    if (memorizedWords.length > 0) {
      await setWordsMemorized(id!, memorizedWords, true);
    }
    if (failedWords.length > 0) {
      await setWordsMemorized(id!, failedWords, false);
    }
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

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  const handleSpeak = useCallback(() => {
    if (currentWord?.exampleEn) {
      speak(currentWord.exampleEn);
    }
  }, [currentWord]);

  if (studyWords.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="document-text-outline" size={64} color={colors.textTertiary} style={{ marginBottom: 16 }} />
        <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'Pretendard_600SemiBold', textAlign: 'center', marginBottom: 8 }}>학습할 예문이 없습니다</Text>
        <Text style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: 24, paddingHorizontal: 40 }}>선택한 조건에 맞는 단어가 없습니다. 설정을 확인해 주세요.</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable
            onPress={() => setSettingsVisible(true)}
            style={{ backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 }}
          >
            <Text style={{ color: '#FFF', fontFamily: 'Pretendard_600SemiBold' }}>설정 변경</Text>
          </Pressable>
          <Pressable
            onPress={handleClose}
            style={{ backgroundColor: colors.surfaceSecondary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 }}
          >
            <Text style={{ color: colors.text, fontFamily: 'Pretendard_600SemiBold' }}>뒤로 가기</Text>
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>

          <View style={styles.titleArea}>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
              {list?.title || '문장완성'}
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
                  backgroundColor: colors.primary,
                  width: `${((currentIndex + 1) / currentBatchWords.length) * 100}%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: colors.textTertiary }]}>
            {currentIndex + 1} / {currentBatchWords.length}
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: 0,
          paddingBottom: 0,
          justifyContent: 'space-evenly'
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cardArea}>
          <View style={[styles.card, { backgroundColor: colors.surface, shadowColor: colors.cardShadow, borderColor: colors.borderLight, borderWidth: 1 }]}>
            <View style={styles.questionHeader}>
              <Pressable onPress={() => handleToggleStar(currentWord.id)} hitSlop={12} style={styles.starBtn}>
                <Ionicons name={currentWord.isStarred ? 'star' : 'star-outline'} size={22} color={currentWord.isStarred ? '#FFD700' : colors.textTertiary} />
              </Pressable>
            </View>

            {currentWord.exampleEn ? (
              <View style={{ gap: 12, alignItems: 'center', width: '100%' }}>
                <HighlightedSentence
                  sentence={currentWord.exampleEn}
                  term={currentWord.term}
                  meaning={currentWord.meaningKr || '뜻 정보 없음'}
                  primaryColor={colors.primary}
                  textColor={colors.text}
                  showTerm={settings.showTerm || selectedAnswer !== null}
                  showHint={showHint}
                  onPressBlank={() => setShowHint(prev => !prev)}
                  isDark={isDark}
                  colors={colors}
                />

                {settings.showExampleKr && currentWord.exampleKr && selectedAnswer !== null && (
                  <Text style={[styles.exampleKrText, { color: colors.textTertiary }]}>{currentWord.exampleKr}</Text>
                )}
              </View>
            ) : (
              <Text style={[styles.noExample, { color: colors.textTertiary }]}>No example sentence available</Text>
            )}

            <Pressable onPress={handleSpeak} hitSlop={12} style={styles.speakerBtn}>
              {({ pressed }) => (
                <Ionicons name="volume-medium-outline" size={28} color={pressed ? colors.primary : colors.textTertiary} />
              )}
            </Pressable>
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

        <View style={styles.navFooter}>
          <Pressable
            style={[styles.navBtn, { backgroundColor: colors.surfaceSecondary }, currentIndex === 0 && { opacity: 0.4 }]}
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
            <Text style={[styles.navBtnText, { color: colors.text }]}>이전</Text>
          </Pressable>

          <Pressable
            style={[styles.navBtn, { backgroundColor: colors.surfaceSecondary }, currentIndex >= currentBatchWords.length - 1 && { opacity: 0.4 }]}
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
            <Text style={[styles.navBtnText, { color: colors.text }]}>다음</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </Pressable>
        </View>

        <View style={{ height: Math.max(insets.bottom, 20) }} />
      </ScrollView>

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
    paddingBottom: 12,
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
    minWidth: 60,
    textAlign: 'right',
  },
  cardArea: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 12,
    gap: 12,
    minHeight: 280,
  },
  questionHeader: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
  },
  starBtn: {
    padding: 4,
  },
  speakerBtn: {
    padding: 8,
    marginTop: 8,
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
    paddingHorizontal: 20,
    gap: 8,
  },
  choiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 8,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 4,
  },
  navBtnText: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
  },
});
