import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { Word, StudyResult } from '@/lib/types';

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function QuizScreen() {
  const { id, filter } = useLocalSearchParams<{ id: string; filter?: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { getWordsForList, setStudyResults, toggleMemorized } = useVocab();

  const [studyWords] = useState(() => {
    const all = getWordsForList(id!);
    if (filter === 'learning') return all.filter(w => !w.isMemorized);
    if (filter === 'memorized') return all.filter(w => w.isMemorized);
    return all;
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const results = useRef<StudyResult[]>([]);
  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

  const currentWord = studyWords[currentIndex];

  const choices = useMemo(() => {
    if (!currentWord) return [];
    const distractors = shuffleArray(studyWords.filter(w => w.id !== currentWord.id)).slice(0, 3);
    return shuffleArray([currentWord, ...distractors]);
  }, [currentIndex]);

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
      if (currentIndex >= studyWords.length - 1) {
        const finalResults = results.current;
        for (const r of finalResults) {
          if (r.gotIt && !r.word.isMemorized) {
            await toggleMemorized(id!, r.word.id);
          }
        }
        setStudyResults(finalResults);
        router.replace('/study-results');
        return;
      }
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setIsCorrect(null);
    }, 1000);
    return () => clearTimeout(timer);
  }, [selectedAnswer, currentIndex, studyWords.length, setStudyResults, toggleMemorized, id]);

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  if (!currentWord) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text, textAlign: 'center', marginTop: 100 }}>No words to study</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: topInset + 12 }]}>
        <View style={styles.progressArea}>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>
            {currentIndex + 1} / {studyWords.length}
          </Text>
          <View style={[styles.progressBarBg, { backgroundColor: colors.surfaceSecondary }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  backgroundColor: colors.primary,
                  width: `${((currentIndex + 1) / studyWords.length) * 100}%`,
                },
              ]}
            />
          </View>
        </View>
        <Pressable onPress={handleClose} hitSlop={12}>
          <Ionicons name="close" size={28} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.questionArea}>
        <Text style={[styles.questionLabel, { color: colors.textSecondary }]}>Which word means:</Text>
        <Text style={[styles.questionText, { color: colors.text }]}>{currentWord.meaningKr}</Text>
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
              <Text style={[styles.choiceText, { color: textColor }]}>{choice.term}</Text>
              {iconName && (
                <Ionicons name={iconName} size={24} color={textColor} />
              )}
            </Pressable>
          );
        })}
      </View>
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
    fontFamily: 'Inter_600SemiBold',
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
    fontFamily: 'Inter_500Medium',
  },
  questionText: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    lineHeight: 38,
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
    borderRadius: 14,
    borderWidth: 1.5,
  },
  choiceText: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
  },
});
