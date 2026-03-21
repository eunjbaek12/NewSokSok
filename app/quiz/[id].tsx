import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { View, Text, Pressable, Platform, StyleSheet, Modal, Switch, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { useSettings } from '@/contexts/SettingsContext';
import { Word, StudyResult } from '@/lib/types';
import { speak } from '@/lib/tts';
import BatchResultOverlay from '@/components/BatchResultOverlay';

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function QuizScreen() {
  const { id, filter, isStarred: initialIsStarred, quizType: initialQuizType } = useLocalSearchParams<{
    id: string;
    filter?: string;
    isStarred?: string;
    quizType?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { getWordsForList, setStudyResults, toggleStarred, setWordsMemorized } = useVocab();
  const { studySettings, updateStudySettings } = useSettings();

  // Settings State
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settings, setSettings] = useState({
    filter: (filter || 'all') as 'all' | 'learning' | 'memorized',
    isStarred: initialIsStarred === 'true',
    quizType: (initialQuizType || 'term-to-meaning') as 'meaning-to-term' | 'term-to-meaning',
    showPos: true,
  });

  const [studyWords, setStudyWords] = useState<Word[]>([]);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBatchOverlay, setShowBatchOverlay] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const startTime = useRef(Date.now());
  const results = useRef<StudyResult[]>([]);
  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;
  const lastSettingsRef = useRef({ id, filter: settings.filter, isStarred: settings.isStarred, quizType: settings.quizType, batchSize: studySettings.studyBatchSize });

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
    if (initialQuizType && initialQuizType !== settings.quizType) {
      setSettings(s => ({ ...s, quizType: initialQuizType as any }));
    }
  }, [filter, initialIsStarred, initialQuizType]);

  // Initialize and filter words
  useEffect(() => {
    let all = getWordsForList(id!);

    if (settings.isStarred) {
      all = all.filter(w => w.isStarred);
    }

    if (settings.filter === 'learning') {
      all = all.filter(w => !w.isMemorized);
    } else if (settings.filter === 'memorized') {
      all = all.filter(w => w.isMemorized);
    }

    // Shuffle
    all = shuffleArray(all);

    setStudyWords(all);

    // Only reset index if core filters changed, not on every word content update (like star toggle)
    const coreFilterChanged =
      lastSettingsRef.current.id !== id ||
      lastSettingsRef.current.filter !== settings.filter ||
      lastSettingsRef.current.isStarred !== settings.isStarred ||
      lastSettingsRef.current.quizType !== settings.quizType ||
      lastSettingsRef.current.batchSize !== studySettings.studyBatchSize;

    if (coreFilterChanged) {
      setCurrentIndex(0);
      setCurrentBatchIndex(0);
      results.current = [];
      lastSettingsRef.current = { id, filter: settings.filter, isStarred: settings.isStarred, quizType: settings.quizType, batchSize: studySettings.studyBatchSize };
    }
  }, [id, getWordsForList, settings.filter, settings.isStarred, settings.quizType, studySettings.studyBatchSize]);

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

  const choices = useMemo(() => {
    if (!currentWord) return [];
    // Distractors from ALL available words in this list for better variety
    const distractors = shuffleArray(getWordsForList(id!).filter(w => w.id !== currentWord.id)).slice(0, 3);
    return shuffleArray([currentWord, ...distractors]);
  }, [currentIndex, currentWord?.id, id, getWordsForList]);

  const handleAnswer = useCallback(async (word: Word) => {
    if (selectedAnswer !== null) return;
    const correct = word.id === currentWord.id;
    setSelectedAnswer(word.id);
    setIsCorrect(correct);

    if (correct) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    results.current.push({ word: currentWord, gotIt: correct });
  }, [selectedAnswer, currentWord]);

  useEffect(() => {
    if (selectedAnswer === null) return;
    const timer = setTimeout(async () => {
      if (currentIndex >= currentBatchWords.length - 1) {
        const nextStart = (currentBatchIndex + 1) * batchSizeNum;
        if (nextStart < studyWords.length) {
          setShowBatchOverlay(true);
        } else {
          finishSession();
        }
        return;
      }
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setIsCorrect(null);
    }, 1000);
    return () => clearTimeout(timer);
  }, [selectedAnswer, currentIndex, currentBatchWords.length, currentBatchIndex, batchSizeNum, studyWords.length]);

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
        mode: 'quiz',
        duration: Date.now() - startTime.current,
        isStarred: settings.isStarred ? 'true' : 'false',
        sessionFilter: settings.filter,
        quizType: settings.quizType
      }
    });
  };

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  if (studyWords.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="help-circle-outline" size={64} color={colors.textTertiary} style={{ marginBottom: 16 }} />
        <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'Pretendard_600SemiBold', textAlign: 'center', marginBottom: 8 }}>문항이 없습니다</Text>
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
        {renderSettingsModal()}
      </View>
    );
  }

  function renderSettingsModal() {
    return (
      <Modal visible={settingsVisible} transparent animationType="fade" onRequestClose={() => setSettingsVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSettingsVisible(false)}>
          <Pressable style={[styles.settingsSheet, { backgroundColor: colors.surface }]} onPress={e => e.stopPropagation()}>
            <View style={styles.settingsHeader}>
              <Text style={[styles.settingsTitle, { color: colors.text }]}>퀴즈 설정</Text>
              <Pressable onPress={() => setSettingsVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.settingSection}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>출제 대상</Text>
                <View style={styles.filterGroup}>
                  {(['all', 'learning', 'memorized'] as const).map(f => (
                    <Pressable
                      key={f}
                      onPress={() => setSettings(s => ({ ...s, filter: f }))}
                      style={[
                        styles.filterTab,
                        {
                          backgroundColor: settings.filter === f ? colors.primary : colors.surfaceSecondary,
                          borderColor: settings.filter === f ? colors.primary : colors.borderLight
                        }
                      ]}
                    >
                      <Text style={[styles.filterTabText, { color: settings.filter === f ? '#FFF' : colors.textSecondary }]}>
                        {f === 'all' ? '전체' : f === 'learning' ? '미암기' : '암기'}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>품사 표시</Text>
                  <Switch
                    value={settings.showPos}
                    onValueChange={v => setSettings(s => ({ ...s, showPos: v }))}
                    trackColor={{ true: colors.primary }}
                  />
                </View>

                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>즐겨찾기(⭐)만 보기</Text>
                  <Switch
                    value={settings.isStarred}
                    onValueChange={v => setSettings(s => ({ ...s, isStarred: v }))}
                    trackColor={{ true: colors.primary }}
                  />
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

              <View style={styles.settingSection}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>문제 옵션</Text>

                <View style={[styles.settingRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 12 }]}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>퀴즈 유형</Text>
                  <View style={styles.filterGroup}>
                    <Pressable
                      onPress={() => setSettings(s => ({ ...s, quizType: 'meaning-to-term' }))}
                      style={[
                        styles.filterTab,
                        {
                          backgroundColor: settings.quizType === 'meaning-to-term' ? colors.primary : colors.surfaceSecondary,
                          borderColor: settings.quizType === 'meaning-to-term' ? colors.primary : colors.borderLight
                        }
                      ]}
                    >
                      <Text style={[styles.filterTabText, { color: settings.quizType === 'meaning-to-term' ? '#FFF' : colors.textSecondary }]}>뜻 → 단어</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setSettings(s => ({ ...s, quizType: 'term-to-meaning' }))}
                      style={[
                        styles.filterTab,
                        {
                          backgroundColor: settings.quizType === 'term-to-meaning' ? colors.primary : colors.surfaceSecondary,
                          borderColor: settings.quizType === 'term-to-meaning' ? colors.primary : colors.borderLight
                        }
                      ]}
                    >
                      <Text style={[styles.filterTabText, { color: settings.quizType === 'term-to-meaning' ? '#FFF' : colors.textSecondary }]}>단어 → 뜻</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={[styles.settingRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 12 }]}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>학습 단위</Text>
                  <View style={styles.filterGroup}>
                    {['all', 10, 20, 30].map(size => {
                      const isActive = studySettings.studyBatchSize === size;
                      return (
                        <Pressable
                          key={size}
                          onPress={() => updateStudySettings({ studyBatchSize: size as 'all' | 10 | 20 | 30 })}
                          style={[
                            styles.filterTab,
                            {
                              backgroundColor: isActive ? colors.primary : colors.surfaceSecondary,
                              borderColor: isActive ? colors.primary : colors.borderLight
                            }
                          ]}
                        >
                          <Text style={[styles.filterTabText, { color: isActive ? '#FFF' : colors.textSecondary }]}>
                            {size === 'all' ? '전체' : `${size}개`}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  // Determine question and choice texts based on quizType
  const questionContent = settings.quizType === 'meaning-to-term' ? currentWord.meaningKr : currentWord.term;
  const getChoiceText = (w: Word) => settings.quizType === 'meaning-to-term' ? w.term : w.meaningKr;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: topInset + 12 }]}>
        <View style={styles.progressArea}>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>
            {currentIndex + 1} / {currentBatchWords.length}
          </Text>
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
        </View>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Pressable onPress={() => setSettingsVisible(true)} hitSlop={12}>
            <Ionicons name="settings-outline" size={26} color={colors.textSecondary} />
          </Pressable>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={28} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.questionArea}>
        <View style={styles.questionHeader}>
          <Pressable onPress={() => handleToggleStar(currentWord.id)} hitSlop={12} style={styles.starBtn}>
            <Ionicons name={currentWord.isStarred ? 'star' : 'star-outline'} size={20} color={currentWord.isStarred ? '#FFD700' : colors.textTertiary} />
          </Pressable>
        </View>

        {settings.showPos && currentWord.pos && (
          <View style={[styles.topPosBadge, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.topPosBadgeText, { color: colors.primary }]}>{currentWord.pos}</Text>
          </View>
        )}

        <Text style={[styles.questionText, { color: colors.text }]}>{questionContent}</Text>
        <Pressable
          onPress={() => speak(currentWord.term)}
          hitSlop={12}
          style={styles.speakerBtn}
        >
          {({ pressed }) => (
            <Ionicons name="volume-medium-outline" size={28} color={pressed ? colors.primary : colors.textTertiary} />
          )}
        </Pressable>
      </View>

      <View style={[styles.choicesArea, { paddingBottom: insets.bottom + 24 }]}>
        {choices.map((choice) => {
          const isSelected = selectedAnswer === choice.id;
          const isCorrectAnswer = choice.id === currentWord.id;
          const showCorrect = selectedAnswer !== null && isCorrectAnswer;
          const showWrong = isSelected && !isCorrect;

          let bgColor = colors.surface;
          let borderColor = colors.border;
          let textColor = colors.text;
          let iconName: keyof typeof Ionicons.glyphMap | null = null;

          if (showCorrect) {
            bgColor = colors.successLight;
            borderColor = colors.success;
            textColor = colors.success;
            iconName = 'checkmark-circle';
          } else if (showWrong) {
            bgColor = colors.errorLight;
            borderColor = colors.error;
            textColor = colors.error;
            iconName = 'close-circle';
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
              <Text style={[styles.choiceText, { color: textColor }]}>{getChoiceText(choice)}</Text>
              {iconName && (
                <Ionicons name={iconName} size={24} color={textColor} />
              )}
            </Pressable>
          );
        })}
      </View>

      {renderSettingsModal()}
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
          setShowBatchOverlay(false);
        }}
        onRetryBatch={() => {
          setCurrentIndex(0);
          setSelectedAnswer(null);
          setIsCorrect(null);
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
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  progressArea: {
    flex: 1,
    gap: 6,
  },
  progressText: {
    fontSize: 14,
    fontFamily: 'Pretendard_600SemiBold',
  },
  progressBarBg: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  questionArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  questionLabel: {
    fontSize: 16,
    fontFamily: 'Pretendard_500Medium',
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
  questionText: {
    fontSize: 28,
    fontFamily: 'Pretendard_700Bold',
    textAlign: 'center',
    lineHeight: 38,
  },
  cardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: -4,
    marginBottom: 4,
  },
  posBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posBadgeText: {
    fontSize: 12,
    fontFamily: 'Pretendard_600SemiBold',
  },
  phoneticText: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
  },
  choicesArea: {
    paddingHorizontal: 20,
    gap: 12,
  },
  choiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  choiceText: {
    fontSize: 18,
    fontFamily: 'Pretendard_600SemiBold',
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  settingsSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '80%',
  },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  settingsTitle: {
    fontSize: 20,
    fontFamily: 'Pretendard_700Bold',
  },
  settingSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  filterGroup: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  filterTabText: {
    fontSize: 14,
    fontFamily: 'Pretendard_600SemiBold',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontFamily: 'Pretendard_500Medium',
  },
  divider: {
    height: 1,
    marginVertical: 4,
    marginBottom: 20,
  },
  topPosBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  topPosBadgeText: {
    fontSize: 12,
    fontFamily: 'Pretendard_600SemiBold',
  },
});
