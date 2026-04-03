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
import StudySettingsModal, { StudySettings } from '@/components/StudySettingsModal';
import { useTranslation } from 'react-i18next';

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function QuizScreen() {
  const { id, filter, isStarred: initialIsStarred, quizType: initialQuizType, ids, planDay } = useLocalSearchParams<{
    id: string;
    filter?: string;
    isStarred?: string;
    quizType?: string;
    ids?: string;
    planDay?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { lists, getWordsForList, setStudyResults, toggleStarred, setWordsMemorized, incrementWrongCount, resetWrongCount, saveLastResult, updatePlanProgress } = useVocab();
  const { studySettings, updateStudySettings } = useSettings();
  const list = lists.find(l => l.id === id);

  // Settings State
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settings, setSettings] = useState<StudySettings>({
    filter: (filter || 'all') as 'all' | 'learning' | 'memorized',
    isStarred: initialIsStarred === 'true',
    quizType: (initialQuizType || 'term-to-meaning') as 'meaning-to-term' | 'term-to-meaning',
    showPos: true,
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
  const [answers, setAnswers] = useState<Record<number, { selected: string; isCorrect: boolean }>>({});
  const startTime = useRef(Date.now());
  const results = useRef<StudyResult[]>([]);
  const isInitialLoad = useRef(true);
  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;
  const lastSettingsRef = useRef({ id, filter: settings.filter, isStarred: settings.isStarred, quizType: settings.quizType, batchSize: studySettings.studyBatchSize, ids });

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

    if (ids) {
      const idList = ids.split(',');
      all = all.filter(w => idList.includes(w.id));
      // Re-sort according to the ids string if it's there
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
      lastSettingsRef.current.quizType !== settings.quizType ||
      lastSettingsRef.current.batchSize !== studySettings.studyBatchSize ||
      lastSettingsRef.current.ids !== ids;

    if (coreFilterChanged || isInitialLoad.current) {
      // Shuffle only when core settings change or initial load, AND NOT when repeating a specific snapshot ids
      if (!ids) {
        all = shuffleArray(all);
      }
      setCurrentIndex(0);
      setCurrentBatchIndex(0);
      setAnswers({});
      choicesMapRef.current = {};
      results.current = [];
      lastSettingsRef.current = { id, filter: settings.filter, isStarred: settings.isStarred, quizType: settings.quizType, batchSize: studySettings.studyBatchSize, ids };
      setStudyWords(all);
      isInitialLoad.current = false;
    } else {
      // Just update existing words to reflect content changes (like star toggle)
      // without changing the current order and interrupting the quiz.
      setStudyWords(prev => {
        const newMap = new Map(all.map(w => [w.id, w]));
        return prev.map(w => newMap.has(w.id) ? newMap.get(w.id)! : w);
      });
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

  const choicesMapRef = useRef<Record<string, Word[]>>({});

  const choices = useMemo(() => {
    if (!currentWord) return [];

    // Check if we already generated stable distractors for this exact question ID
    if (choicesMapRef.current[currentWord.id]) {
      // Return cached choices, but substitute the currentWord to reflect any recent changes (like isStarred)
      return choicesMapRef.current[currentWord.id].map(c => c.id === currentWord.id ? currentWord : c);
    }

    // Generate new distractors
    const allListWords = getWordsForList(id!);
    const distractors = shuffleArray(allListWords.filter(w => w.id !== currentWord.id)).slice(0, 3);
    const newChoices = shuffleArray([currentWord, ...distractors]);

    choicesMapRef.current[currentWord.id] = newChoices;
    return newChoices;
  }, [currentIndex, currentWord, id, getWordsForList]);

  const handleAnswer = useCallback(async (word: Word) => {
    if (answers[currentIndex]) return;
    const correct = word.id === currentWord.id;

    setAnswers(prev => ({ ...prev, [currentIndex]: { selected: word.id, isCorrect: correct } }));

    if (correct) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    const globalIndex = currentBatchIndex * batchSizeNum + currentIndex;
    results.current[globalIndex] = { word: currentWord, gotIt: correct };

    setTimeout(() => {
      if (currentIndexRef.current === currentIndex) {
        if (currentIndex >= currentBatchWords.length - 1) {
          const nextStart = (currentBatchIndex + 1) * batchSizeNum;
          if (nextStart < studyWords.length) {
            setShowBatchOverlay(true);
          } else {
            finishSession();
          }
        } else {
          setCurrentIndex(prev => prev + 1);
        }
      }
    }, 1000);
  }, [answers, currentIndex, currentWord, currentBatchWords.length, currentBatchIndex, batchSizeNum, studyWords.length]);

  const finishSession = async () => {
    const finalResults = results.current;
    const memorizedWords = finalResults
      .filter(r => r.gotIt && !r.word.isMemorized)
      .map(r => r.word.id);

    const failedWords = finalResults
      .filter(r => !r.gotIt && r.word.isMemorized)
      .map(r => r.word.id);

    const wrongWordIds = finalResults.filter(r => !r.gotIt).map(r => r.word.id);
    const correctWordIds = finalResults
      .filter(r => r.gotIt && (r.word.wrongCount ?? 0) > 0)
      .map(r => r.word.id);

    if (memorizedWords.length > 0) {
      await setWordsMemorized(id!, memorizedWords, true);
    }
    if (failedWords.length > 0) {
      await setWordsMemorized(id!, failedWords, false);
    }
    if (wrongWordIds.length > 0) {
      await incrementWrongCount(wrongWordIds);
    }
    if (correctWordIds.length > 0) {
      await resetWrongCount(correctWordIds);
    }
    await saveLastResult(id!);
    if (planDay) await updatePlanProgress(id!, parseInt(planDay as string) + 1);
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
        <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'Pretendard_600SemiBold', textAlign: 'center', marginBottom: 8 }}>{t('quiz.noQuestions')}</Text>
        <Text style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: 24, paddingHorizontal: 40 }}>{t('quiz.noQuestionsDesc')}</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable
            onPress={() => setSettingsVisible(true)}
            style={{ backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 }}
          >
            <Text style={{ color: '#FFF', fontFamily: 'Pretendard_600SemiBold' }}>{t('common.settingsChange')}</Text>
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
          mode="quiz"
          initialSettings={settings}
          initialBatchSize={studySettings.studyBatchSize}
          onClose={() => setSettingsVisible(false)}
          onApply={applySettings}
        />
      </View>
    );
  }

  // Determine question and choice texts based on quizType
  const questionContent = settings.quizType === 'meaning-to-term' ? currentWord.meaningKr : currentWord.term;
  const getChoiceText = (w: Word) => settings.quizType === 'meaning-to-term' ? w.term : w.meaningKr;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>

          <View style={styles.titleArea}>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
              {list?.title || t('quiz.title')}
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
        </View>

        <View style={styles.choicesArea}>
          {choices.map((choice, index) => {
            const currentAnswer = answers[currentIndex];
            const isSelected = currentAnswer?.selected === choice.id;
            const isCorrectAnswer = choice.id === currentWord.id;
            const showCorrect = currentAnswer && isCorrectAnswer;
            const showWrong = isSelected && !currentAnswer?.isCorrect;

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
            } else if (currentAnswer && !isCorrectAnswer) {
              textColor = colors.textSecondary;
              badgeTextColor = colors.textTertiary;
            }

            return (
              <Pressable
                key={choice.id}
                onPress={() => handleAnswer(choice)}
                disabled={!!currentAnswer}
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
                <Text style={[styles.choiceText, { color: textColor }]}>{getChoiceText(choice)}</Text>
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
            onPress={() => setCurrentIndex(prev => prev - 1)}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
            <Text style={[styles.navBtnText, { color: colors.text }]}>{t('common.previous')}</Text>
          </Pressable>

          <Pressable
            style={[styles.navBtn, { backgroundColor: colors.surfaceSecondary }, currentIndex >= currentBatchWords.length - 1 && { opacity: 0.4 }]}
            disabled={currentIndex >= currentBatchWords.length - 1}
            onPress={() => setCurrentIndex(prev => prev + 1)}
          >
            <Text style={[styles.navBtnText, { color: colors.text }]}>{t('common.next')}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </Pressable>
        </View>

        <View style={{ height: Math.max(insets.bottom, 20) }} />
      </ScrollView>

      <StudySettingsModal
        visible={settingsVisible}
        mode="quiz"
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
          setAnswers({});
          setShowBatchOverlay(false);
        }}
        onRetryBatch={() => {
          setCurrentIndex(0);
          setAnswers({});
          setShowBatchOverlay(false);
          results.current = results.current.slice(0, results.current.length - currentBatchWords.length);
        }}
        onFinish={() => {
          setShowBatchOverlay(false);
          finishSession();
        }}
      />
    </View >
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
