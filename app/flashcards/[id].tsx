import React, { useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate, type SharedValue } from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { speak } from '@/lib/tts';
import { Word, StudyResult } from '@/lib/types';

function CardFront({ word, colors, rotation }: { word: Word; colors: any; rotation: SharedValue<number> }) {
  const frontStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(rotation.value, [0, 1], [0, 180]);
    return {
      transform: [{ rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden' as const,
      opacity: rotation.value < 0.5 ? 1 : 0,
    };
  });

  return (
    <Animated.View style={[styles.card, { backgroundColor: colors.surface, shadowColor: colors.cardShadow }, frontStyle]}>
      <Text style={[styles.cardWord, { color: colors.text }]}>{word.term}</Text>
      <Pressable onPress={(e) => { e.stopPropagation(); speak(word.term); }} hitSlop={12} style={styles.speakerBtn}>
        <Ionicons name="volume-medium" size={32} color={colors.primary} />
      </Pressable>
    </Animated.View>
  );
}

function CardBack({ word, colors, rotation }: { word: Word; colors: any; rotation: SharedValue<number> }) {
  const backStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(rotation.value, [0, 1], [180, 360]);
    return {
      transform: [{ rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden' as const,
      opacity: rotation.value >= 0.5 ? 1 : 0,
    };
  });

  return (
    <Animated.View style={[styles.card, styles.cardBack, { backgroundColor: colors.surface, shadowColor: colors.cardShadow }, backStyle]}>
      <Text style={[styles.cardMeaning, { color: colors.text }]}>{word.meaningKr}</Text>
      {word.exampleEn ? (
        <Text style={[styles.cardExample, { color: colors.textSecondary }]}>{word.exampleEn}</Text>
      ) : null}
      <Pressable onPress={(e) => { e.stopPropagation(); speak(word.term); }} hitSlop={12} style={styles.speakerBtn}>
        <Ionicons name="volume-medium" size={32} color={colors.primary} />
      </Pressable>
    </Animated.View>
  );
}

export default function FlashcardsScreen() {
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
  const rotation = useSharedValue(0);
  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

  const currentWord = studyWords[currentIndex];

  const handleFlip = useCallback(() => {
    rotation.value = withTiming(rotation.value >= 0.5 ? 0 : 1, { duration: 300 });
  }, [rotation]);

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

    rotation.value = withTiming(0, { duration: 200 });
    setCurrentIndex(prev => prev + 1);
  }, [currentWord, currentIndex, studyWords.length, rotation, setStudyResults, toggleMemorized, id]);

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

      <Pressable style={styles.cardContainer} onPress={handleFlip}>
        <CardFront word={currentWord} colors={colors} rotation={rotation} />
        <CardBack word={currentWord} colors={colors} rotation={rotation} />
      </Pressable>

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
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    position: 'absolute',
    width: '100%',
    minHeight: 280,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 8,
    gap: 20,
  },
  cardBack: {
    position: 'absolute',
  },
  cardWord: {
    fontSize: 36,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  cardMeaning: {
    fontSize: 32,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  cardExample: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 24,
  },
  speakerBtn: {
    padding: 8,
    marginTop: 20,
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
