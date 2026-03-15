import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, Platform, StyleSheet, Modal, Switch, ScrollView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
  Extrapolation,
  runOnJS,
  type SharedValue
} from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { speak } from '@/lib/tts';
import { Word, StudyResult } from '@/lib/types';

function CardFront({ word, colors, rotation, onToggleStar }: { word: Word; colors: any; rotation: SharedValue<number>, onToggleStar: (id: string) => void }) {
  const frontStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(rotation.value, [0, 1], [0, 180]);
    return {
      transform: [{ rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden' as const,
      opacity: rotation.value < 0.5 ? 1 : 0,
      zIndex: rotation.value < 0.5 ? 2 : 1,
    };
  });

  return (
    <Animated.View style={[styles.card, { backgroundColor: colors.surface, shadowColor: colors.cardShadow }, frontStyle]}>
      <Pressable onPress={() => onToggleStar(word.id)} hitSlop={12} style={styles.starBtn}>
        <Ionicons name={word.isStarred ? 'star' : 'star-outline'} size={28} color={word.isStarred ? '#FFD700' : colors.textTertiary} />
      </Pressable>
      <Text style={[styles.cardWord, { color: colors.text }]}>{word.term}</Text>
      <Pressable onPress={() => speak(word.term)} hitSlop={12} style={styles.speakerBtn}>
        {({ pressed }) => (
          <Ionicons name="volume-medium-outline" size={28} color={pressed ? colors.primary : colors.textTertiary} />
        )}
      </Pressable>
    </Animated.View>
  );
}

function CardBack({ word, colors, rotation, onToggleStar, showMeaning, showExample }: { word: Word; colors: any; rotation: SharedValue<number>, onToggleStar: (id: string) => void, showMeaning: boolean, showExample: boolean }) {
  const backStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(rotation.value, [0, 1], [180, 360]);
    return {
      transform: [{ rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden' as const,
      opacity: rotation.value >= 0.5 ? 1 : 0,
      zIndex: rotation.value >= 0.5 ? 2 : 1,
    };
  });

  return (
    <Animated.View style={[styles.card, styles.cardBack, { backgroundColor: colors.surface, shadowColor: colors.cardShadow }, backStyle]}>
      <Pressable onPress={() => onToggleStar(word.id)} hitSlop={12} style={styles.starBtn}>
        <Ionicons name={word.isStarred ? 'star' : 'star-outline'} size={28} color={word.isStarred ? '#FFD700' : colors.textTertiary} />
      </Pressable>

      {showMeaning ? (
        <Text style={[styles.cardMeaning, { color: colors.text }]}>{word.meaningKr}</Text>
      ) : (
        <Text style={[styles.cardMeaning, { color: colors.textSecondary, opacity: 0.3 }]}>[뜻 숨김]</Text>
      )}

      {showExample && word.exampleEn ? (
        <Text style={[styles.cardExample, { color: colors.textSecondary }]}>{word.exampleEn}</Text>
      ) : null}

      <Pressable onPress={() => speak(word.term)} hitSlop={12} style={styles.speakerBtn}>
        {({ pressed }) => (
          <Ionicons name="volume-medium-outline" size={28} color={pressed ? colors.primary : colors.textTertiary} />
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function FlashcardsScreen() {
  const { id, filter, isStarred: initialIsStarred } = useLocalSearchParams<{ id: string; filter?: string; isStarred?: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { getWordsForList, setStudyResults, toggleStarred, setWordsMemorized } = useVocab();

  // Settings State
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settings, setSettings] = useState({
    filter: (filter || 'all') as 'all' | 'learning' | 'memorized',
    isStarred: initialIsStarred === 'true',
    showMeaning: true,
    showExample: true,
    autoPlaySound: true,
    shuffle: false,
  });

  const [studyWords, setStudyWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const startTime = useRef(Date.now());
  const results = useRef<StudyResult[]>([]);

  const rotation = useSharedValue(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;
  const SWIPE_THRESHOLD = 100;

  const lastSettingsRef = useRef({ id, filter: settings.filter, isStarred: settings.isStarred, shuffle: settings.shuffle });

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

  // Initialize and re-filter words when settings change
  useEffect(() => {
    let all = getWordsForList(id!);

    // Apply Star filter
    if (settings.isStarred) {
      all = all.filter(w => w.isStarred);
    }

    // Apply Status filter
    if (settings.filter === 'learning') {
      all = all.filter(w => !w.isMemorized);
    } else if (settings.filter === 'memorized') {
      all = all.filter(w => w.isMemorized);
    }

    // Apply Shuffle
    if (settings.shuffle) {
      all = [...all].sort(() => Math.random() - 0.5);
    }

    setStudyWords(all);

    // Only reset index if core filters changed, not on Every word content update
    const coreFilterChanged =
      lastSettingsRef.current.id !== id ||
      lastSettingsRef.current.filter !== settings.filter ||
      lastSettingsRef.current.isStarred !== settings.isStarred ||
      lastSettingsRef.current.shuffle !== settings.shuffle;

    if (coreFilterChanged) {
      setCurrentIndex(0);
      results.current = [];
      rotation.value = 0;
      lastSettingsRef.current = { id, filter: settings.filter, isStarred: settings.isStarred, shuffle: settings.shuffle };
    }
  }, [id, getWordsForList, settings.filter, settings.isStarred, settings.shuffle, id]);

  const currentWord = studyWords[currentIndex];

  const handleToggleStar = useCallback(async (wordId: string) => {
    setStudyWords(prev => prev.map(w => w.id === wordId ? { ...w, isStarred: !w.isStarred } : w));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await toggleStarred(id!, wordId);
  }, [id, toggleStarred]);

  const handleFlip = useCallback(() => {
    rotation.value = withTiming(rotation.value >= 0.5 ? 0 : 1, { duration: 300 });
  }, [rotation]);

  const handleNext = useCallback(async (gotIt: boolean) => {
    if (!currentWord) return;
    Haptics.impactAsync(gotIt ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    results.current.push({ word: currentWord, gotIt });

    if (currentIndex >= studyWords.length - 1) {
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
          mode: 'flashcards',
          duration: Date.now() - startTime.current,
          isStarred: settings.isStarred ? 'true' : 'false',
          sessionFilter: settings.filter
        }
      });
      return;
    }

    rotation.value = 0;
    setCurrentIndex(prev => prev + 1);

    // Auto play sound for next word if enabled
    if (settings.autoPlaySound) {
      const nextWord = studyWords[currentIndex + 1];
      if (nextWord) {
        speak(nextWord.term);
      }
    }
  }, [currentWord, currentIndex, studyWords, rotation, setStudyResults, setWordsMemorized, id, settings.autoPlaySound]);

  const onSwipeComplete = useCallback((direction: 'left' | 'right') => {
    handleNext(direction === 'right');
    translateX.value = 0;
    translateY.value = 0;
  }, [handleNext, translateX, translateY]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      const isSwipe = Math.abs(event.translationX) > SWIPE_THRESHOLD || Math.abs(event.velocityX) > 800;

      if (isSwipe) {
        // Ensure we handle direction correctly based on translation if it's a velocity-based swipe
        const direction = event.translationX > 0 ? 'right' : 'left';

        translateX.value = withTiming(
          (direction === 'right' ? 1 : -1) * 500,
          { duration: 200 },
          () => {
            runOnJS(onSwipeComplete)(direction);
          }
        );
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const animatedCardStyle = useAnimatedStyle(() => {
    const rotateZ = interpolate(
      translateX.value,
      [-200, 200],
      [-15, 15],
      Extrapolation.CLAMP
    );

    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotateZ: `${rotateZ}deg` },
      ],
    };
  });

  const reviewIndicatorStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, -SWIPE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const gotItIndicatorStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const bgOverlayStyle = useAnimatedStyle(() => {
    const leftOpacity = interpolate(
      translateX.value,
      [0, -SWIPE_THRESHOLD],
      [0, 0.15],
      Extrapolation.CLAMP
    );
    const rightOpacity = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0, 0.15],
      Extrapolation.CLAMP
    );

    return {
      backgroundColor: translateX.value < 0 ? colors.warning : colors.primary,
      opacity: translateX.value < 0 ? leftOpacity : rightOpacity,
    };
  });

  const leftBtnScale = useAnimatedStyle(() => {
    const scale = interpolate(
      translateX.value,
      [0, -SWIPE_THRESHOLD],
      [1, 1.2],
      Extrapolation.CLAMP
    );
    return { transform: [{ scale }] };
  });

  const rightBtnScale = useAnimatedStyle(() => {
    const scale = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [1, 1.2],
      Extrapolation.CLAMP
    );
    return { transform: [{ scale }] };
  });

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  if (studyWords.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="albums-outline" size={64} color={colors.textTertiary} style={{ marginBottom: 16 }} />
        <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'Pretendard_600SemiBold', textAlign: 'center', marginBottom: 8 }}>학습할 단어가 없습니다</Text>
        <Text style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: 24, paddingHorizontal: 40 }}>선택한 필터나 중요 표시(⭐)에 맞는 단어가 없습니다. 설정을 확인해 주세요.</Text>
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

        {/* 설정 모달 (단어 없을 때도 필요) */}
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
              <Text style={[styles.settingsTitle, { color: colors.text }]}>플래시카드 설정</Text>
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
                  <View style={styles.settingLabelArea}>
                    <Text style={[styles.settingLabel, { color: colors.text }]}>즐겨찾기(⭐)만 보기</Text>
                  </View>
                  <Switch
                    value={settings.isStarred}
                    onValueChange={v => setSettings(s => ({ ...s, isStarred: v }))}
                    trackColor={{ true: colors.primary }}
                  />
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

              <View style={styles.settingSection}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>학습 옵션</Text>

                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>단어 섞기 (Shuffle)</Text>
                  <Switch
                    value={settings.shuffle}
                    onValueChange={v => setSettings(s => ({ ...s, shuffle: v }))}
                    trackColor={{ true: colors.primary }}
                  />
                </View>

                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>자동 음성 재생</Text>
                  <Switch
                    value={settings.autoPlaySound}
                    onValueChange={v => setSettings(s => ({ ...s, autoPlaySound: v }))}
                    trackColor={{ true: colors.primary }}
                  />
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

              <View style={styles.settingSection}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>카드 뒷면 표시</Text>

                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>뜻 표시</Text>
                  <Switch
                    value={settings.showMeaning}
                    onValueChange={v => setSettings(s => ({ ...s, showMeaning: v }))}
                    trackColor={{ true: colors.primary }}
                  />
                </View>

                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>예문 표시</Text>
                  <Switch
                    value={settings.showExample}
                    onValueChange={v => setSettings(s => ({ ...s, showExample: v }))}
                    trackColor={{ true: colors.primary }}
                  />
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Pressable onPress={() => setSettingsVisible(true)} hitSlop={12}>
            <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
          </Pressable>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.cardArea}>
        <Animated.View style={[styles.indicator, styles.leftIndicator, reviewIndicatorStyle]}>
          <View style={[styles.indicatorBox, { borderColor: colors.warning }]}>
            <Ionicons name="arrow-back" size={32} color={colors.warning} />
            <Text style={[styles.indicatorText, { color: colors.warning }]}>REVIEW</Text>
          </View>
        </Animated.View>

        <Animated.View style={[styles.indicator, styles.rightIndicator, gotItIndicatorStyle]}>
          <View style={[styles.indicatorBox, { borderColor: colors.primary }]}>
            <Ionicons name="arrow-forward" size={32} color={colors.primary} />
            <Text style={[styles.indicatorText, { color: colors.primary }]}>GOT IT</Text>
          </View>
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.cardContainer, animatedCardStyle]}>
            <Pressable style={{ flex: 1, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }} onPress={handleFlip}>
              <CardFront word={currentWord} colors={colors} rotation={rotation} onToggleStar={handleToggleStar} />
              <CardBack
                word={currentWord}
                colors={colors}
                rotation={rotation}
                onToggleStar={handleToggleStar}
                showMeaning={settings.showMeaning}
                showExample={settings.showExample}
              />
            </Pressable>
          </Animated.View>
        </GestureDetector>
      </View>

      <Animated.View style={[StyleSheet.absoluteFill, { zIndex: -2, pointerEvents: 'none' }, bgOverlayStyle]} />

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
        <Animated.View style={[{ flex: 1 }, leftBtnScale]}>
          <Pressable
            onPress={() => handleNext(false)}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: pressed ? colors.warningLight : colors.warningLight,
                opacity: pressed ? 0.7 : 1
              }
            ]}
          >
            <Ionicons name="chevron-back" size={24} color={colors.warning} />
            <View>
              <Text style={[styles.actionBtnText, { color: colors.warning }]}>Review</Text>
              <Text style={[styles.actionBtnSubtext, { color: colors.warning, opacity: 0.4 }]}>Swipe Left</Text>
            </View>
          </Pressable>
        </Animated.View>

        <Animated.View style={[{ flex: 1 }, rightBtnScale]}>
          <Pressable
            onPress={() => handleNext(true)}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: pressed ? colors.primaryLight : colors.primaryLight,
                opacity: pressed ? 0.7 : 1
              }
            ]}
          >
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.actionBtnText, { color: colors.primary }]}>Got it</Text>
              <Text style={[styles.actionBtnSubtext, { color: colors.primary, opacity: 0.4 }]}>Swipe Right</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={colors.primary} />
          </Pressable>
        </Animated.View>
      </View>

      {renderSettingsModal()}
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
  cardArea: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContainer: {
    width: '100%',
    height: '100%',
    position: 'absolute',
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
    fontFamily: 'Pretendard_700Bold',
    textAlign: 'center',
  },
  cardMeaning: {
    fontSize: 32,
    fontFamily: 'Pretendard_700Bold',
    textAlign: 'center',
  },
  cardExample: {
    fontSize: 16,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 24,
  },
  speakerBtn: {
    padding: 8,
    marginTop: 20,
  },
  starBtn: {
    position: 'absolute',
    top: 20,
    right: 20,
    padding: 8,
    zIndex: 10,
  },
  indicator: {
    position: 'absolute',
    top: '25%',
    zIndex: -1,
  },
  leftIndicator: {
    right: 40,
    transform: [{ rotate: '15deg' }],
  },
  rightIndicator: {
    left: 40,
    transform: [{ rotate: '-15deg' }],
  },
  indicatorBox: {
    borderWidth: 4,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  indicatorText: {
    fontSize: 24,
    fontFamily: 'Pretendard_700Bold',
    textTransform: 'uppercase',
  },
  bottomBar: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  reviewBtn: {},
  gotItBtn: {},
  actionBtnText: {
    fontSize: 18,
    fontFamily: 'Pretendard_700Bold',
  },
  actionBtnSubtext: {
    fontSize: 10,
    fontFamily: 'Pretendard_600SemiBold',
    textTransform: 'uppercase',
    marginTop: -2,
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
    marginBottom: 16,
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
  settingLabelArea: {
    flex: 1,
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
});

