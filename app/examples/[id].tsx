import React, { useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { speak } from '@/lib/tts';
import { StudyResult } from '@/lib/types';

function HighlightedSentence({ sentence, term, primaryColor, textColor }: { sentence: string; term: string; primaryColor: string; textColor: string }) {
  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = sentence.split(regex);

  return (
    <Text style={[styles.exampleText, { color: textColor }]}>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <Text key={i} style={[styles.highlightedWord, { color: primaryColor }]}>{part}</Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  );
}

export default function ExamplesScreen() {
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
  const results = useRef<StudyResult[]>([]);
  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

  const currentWord = studyWords[currentIndex];

  const handleNext = useCallback(async (gotIt: boolean) => {
    if (!currentWord) return;
    Haptics.impactAsync(gotIt ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    results.current.push({ word: currentWord, gotIt });

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
  }, [currentWord, currentIndex, studyWords.length, setStudyResults, toggleMemorized, id]);

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  const handleSpeak = useCallback(() => {
    if (currentWord?.exampleEn) {
      speak(currentWord.exampleEn);
    }
  }, [currentWord]);

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

      <View style={styles.contentArea}>
        <View style={[styles.exampleCard, { backgroundColor: colors.surface, shadowColor: colors.cardShadow }]}>
          {currentWord.exampleEn ? (
            <HighlightedSentence
              sentence={currentWord.exampleEn}
              term={currentWord.term}
              primaryColor={colors.primary}
              textColor={colors.text}
            />
          ) : (
            <Text style={[styles.noExample, { color: colors.textTertiary }]}>No example sentence available</Text>
          )}
          <Pressable onPress={handleSpeak} hitSlop={12} style={styles.speakerBtn}>
            <Ionicons name="volume-medium-outline" size={28} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.wordInfo}>
          <Text style={[styles.wordText, { color: colors.text }]}>{currentWord.term}</Text>
          <Text style={[styles.meaningText, { color: colors.textSecondary }]}>{currentWord.meaningKr}</Text>
        </View>
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
        <Pressable
          onPress={() => handleNext(false)}
          style={[styles.actionBtn, styles.reviewBtn, { borderColor: colors.warning }]}
        >
          <Ionicons name="refresh-outline" size={22} color={colors.warning} />
          <Text style={[styles.actionBtnText, { color: colors.warning }]}>Review</Text>
        </Pressable>
        <Pressable
          onPress={() => handleNext(true)}
          style={[styles.actionBtn, styles.gotItBtn, { backgroundColor: colors.primary }]}
        >
          <Ionicons name="checkmark" size={22} color="#FFFFFF" />
          <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>Got it</Text>
        </Pressable>
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
  contentArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 24,
  },
  exampleCard: {
    width: '100%',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 8,
    gap: 20,
  },
  exampleText: {
    fontSize: 22,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
    lineHeight: 34,
  },
  highlightedWord: {
    fontFamily: 'Inter_700Bold',
  },
  noExample: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  speakerBtn: {
    padding: 8,
  },
  wordInfo: {
    alignItems: 'center',
    gap: 6,
  },
  wordText: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
  },
  meaningText: {
    fontSize: 18,
    fontFamily: 'Inter_500Medium',
  },
  bottomBar: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
  },
  reviewBtn: {
    borderWidth: 2,
  },
  gotItBtn: {},
  actionBtnText: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
  },
});
