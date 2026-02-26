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

export default function ShadowingScreen() {
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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const results = useRef<StudyResult[]>([]);
  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

  const currentWord = studyWords[currentIndex];

  const handleListen = useCallback(async () => {
    if (!currentWord || isSpeaking) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsSpeaking(true);
    try {
      await speak(currentWord.term);
    } finally {
      setIsSpeaking(false);
    }
  }, [currentWord, isSpeaking]);

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
        <View style={[styles.wordCard, { backgroundColor: colors.surface, shadowColor: colors.cardShadow }]}>
          <Text style={[styles.wordTerm, { color: colors.text }]}>{currentWord.term}</Text>

          <Pressable
            onPress={handleListen}
            style={[
              styles.listenBtn,
              {
                backgroundColor: isSpeaking ? colors.primaryLight : colors.primary,
              },
            ]}
          >
            <Ionicons
              name={isSpeaking ? 'volume-high' : 'volume-medium-outline'}
              size={28}
              color={isSpeaking ? colors.primary : '#FFFFFF'}
            />
            <Text
              style={[
                styles.listenBtnText,
                { color: isSpeaking ? colors.primary : '#FFFFFF' },
              ]}
            >
              {isSpeaking ? 'Playing...' : 'Listen'}
            </Text>
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

          <Text style={[styles.definition, { color: colors.textSecondary }]}>{currentWord.definition}</Text>
          <Text style={[styles.meaningKr, { color: colors.primary }]}>{currentWord.meaningKr}</Text>

          {currentWord.exampleEn ? (
            <Text style={[styles.exampleEn, { color: colors.textTertiary }]}>{currentWord.exampleEn}</Text>
          ) : null}
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
  },
  wordCard: {
    width: '100%',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 8,
    gap: 16,
  },
  wordTerm: {
    fontSize: 36,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  listenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    gap: 10,
  },
  listenBtnText: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
  },
  divider: {
    width: '80%',
    height: 1,
    marginVertical: 4,
  },
  definition: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 24,
  },
  meaningKr: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  exampleEn: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 22,
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
