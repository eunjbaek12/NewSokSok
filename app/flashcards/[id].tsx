import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, Platform, StyleSheet, Modal, Switch, ScrollView } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
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
import { useSettings } from '@/contexts/SettingsContext';
import { speak } from '@/lib/tts';
import { Word, StudyResult } from '@/lib/types';
import BatchResultOverlay from '@/components/BatchResultOverlay';

function CardFront({ word, colors, isDark, rotation, onToggleStar, showPos }: { word: Word; colors: any; isDark: boolean; rotation: SharedValue<number>, onToggleStar: (id: string) => void, showPos: boolean }) {
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
    <Animated.View style={[
      styles.card,
      {
        backgroundColor: colors.surface + 'F2',
        shadowColor: colors.cardShadow,
        borderColor: colors.borderLight,
        borderWidth: 1,
      },
      frontStyle
    ]}>
      <Pressable onPress={() => onToggleStar(word.id)} hitSlop={12} style={styles.starBtn}>
        <Ionicons name={word.isStarred ? 'star' : 'star-outline'} size={28} color={word.isStarred ? '#FFD700' : colors.textTertiary} />
      </Pressable>

      {showPos && word.pos && (
        <View style={[styles.topPosBadge, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.topPosBadgeText, { color: colors.primary }]}>{word.pos}</Text>
        </View>
      )}

      <Text style={[styles.cardWord, { color: colors.text }]}>{word.term}</Text>

      {word.phonetic && (
        <View style={styles.cardInfoRow}>
          <Text style={[styles.phoneticText, { color: colors.textSecondary }]}>/{word.phonetic}/</Text>
        </View>
      )}

      <Pressable onPress={() => speak(word.term)} hitSlop={12} style={styles.speakerBtn}>
        {({ pressed }) => (
          <Ionicons name="volume-medium-outline" size={28} color={pressed ? colors.primary : colors.textTertiary} />
        )}
      </Pressable>

      <Text style={[styles.hintText, { color: colors.textTertiary }]}>탭하여 뜻 보기</Text>
    </Animated.View>
  );
}

function CardBack({ word, colors, isDark, rotation, onToggleStar, showMeaning, showExample, showExampleKr, showPhonetic, showPos }: { word: Word; colors: any; isDark: boolean; rotation: SharedValue<number>, onToggleStar: (id: string) => void, showMeaning: boolean, showExample: boolean, showExampleKr: boolean, showPhonetic: boolean, showPos: boolean }) {
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
    <Animated.View style={[
      styles.card,
      styles.cardBack,
      {
        backgroundColor: colors.surface + 'F2',
        shadowColor: colors.cardShadow,
        borderColor: colors.borderLight,
        borderWidth: 1,
      },
      backStyle
    ]}>
      <Pressable onPress={() => onToggleStar(word.id)} hitSlop={12} style={styles.starBtn}>
        <Ionicons name={word.isStarred ? 'star' : 'star-outline'} size={28} color={word.isStarred ? '#FFD700' : colors.textTertiary} />
      </Pressable>

      <View style={styles.termWrapper}>
        {showPos && word.pos && (
          <View style={[styles.topPosBadge, { backgroundColor: colors.primaryLight, marginBottom: 6, paddingVertical: 1, paddingHorizontal: 6 }]}>
            <Text style={[styles.topPosBadgeText, { color: colors.primary, fontSize: 10 }]}>{word.pos}</Text>
          </View>
        )}
        <Text style={[styles.cardBackTerm, { color: colors.textSecondary }]}>{word.term}</Text>
      </View>

      <LinearGradient
        colors={['transparent', colors.border, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientDivider}
      />

      {showMeaning ? (
        <Text style={[styles.cardMeaning, { color: colors.text }]}>{word.meaningKr}</Text>
      ) : (
        <Text style={[styles.cardMeaning, { color: colors.textSecondary, opacity: 0.3 }]}>[뜻 숨김]</Text>
      )}

      {showPhonetic && word.phonetic && (
        <View style={styles.cardInfoRow}>
          <Text style={[styles.phoneticText, { color: colors.textSecondary }]}>/{word.phonetic}/</Text>
        </View>
      )}

      {showExample && word.exampleEn ? (
        <View style={[styles.cardExampleBox, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.cardExample, { color: colors.textSecondary }]}>{word.exampleEn}</Text>
          {showExampleKr && word.exampleKr ? (
            <Text style={[styles.cardExampleKr, { color: colors.textTertiary }]}>{word.exampleKr}</Text>
          ) : null}
        </View>
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
  const { colors, isDark } = useTheme();
  const { lists, getWordsForList, setStudyResults, toggleStarred, setWordsMemorized } = useVocab();
  const { studySettings, updateStudySettings } = useSettings();
  const list = lists.find(l => l.id === id);

  // Settings State
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settings, setSettings] = useState({
    filter: (filter || 'all') as 'all' | 'learning' | 'memorized',
    isStarred: initialIsStarred === 'true',
    showMeaning: true,
    showExample: true,
    showExampleKr: true,
    showPhonetic: true,
    showPos: true,
    autoPlaySound: true,
    shuffle: false,
  });

  const [studyWords, setStudyWords] = useState<Word[]>([]);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBatchOverlay, setShowBatchOverlay] = useState(false);
  const startTime = useRef(Date.now());
  const results = useRef<StudyResult[]>([]);

  const rotation = useSharedValue(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;
  const SWIPE_THRESHOLD = 100;

  const lastSettingsRef = useRef({ id, filter: settings.filter, isStarred: settings.isStarred, shuffle: settings.shuffle, batchSize: studySettings.studyBatchSize });

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
      lastSettingsRef.current.shuffle !== settings.shuffle ||
      lastSettingsRef.current.batchSize !== studySettings.studyBatchSize;

    if (coreFilterChanged) {
      setCurrentIndex(0);
      setCurrentBatchIndex(0);
      results.current = [];
      rotation.value = 0;
      lastSettingsRef.current = { id, filter: settings.filter, isStarred: settings.isStarred, shuffle: settings.shuffle, batchSize: studySettings.studyBatchSize };
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

  const handleFlip = useCallback(() => {
    rotation.value = withTiming(rotation.value >= 0.5 ? 0 : 1, { duration: 300 });
  }, [rotation]);

  const handleNext = useCallback(async (gotIt: boolean) => {
    if (!currentWord) return;
    Haptics.impactAsync(gotIt ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    results.current.push({ word: currentWord, gotIt });

    if (currentIndex >= currentBatchWords.length - 1) {
      const nextStart = (currentBatchIndex + 1) * batchSizeNum;

      if (nextStart < studyWords.length) {
        setShowBatchOverlay(true);
      } else {
        finishSession();
      }
      return;
    }

    rotation.value = 0;
    setCurrentIndex(prev => prev + 1);

    // Auto play sound for next word if enabled
    if (settings.autoPlaySound) {
      const nextWord = currentBatchWords[currentIndex + 1];
      if (nextWord) {
        speak(nextWord.term);
      }
    }
  }, [currentWord, currentIndex, currentBatchWords, rotation, setStudyResults, setWordsMemorized, id, settings.autoPlaySound, currentBatchIndex, batchSizeNum, studyWords.length]);

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
        mode: 'flashcards',
        duration: Date.now() - startTime.current,
        isStarred: settings.isStarred ? 'true' : 'false',
        sessionFilter: settings.filter
      }
    });
  };

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
                  <Text style={[styles.settingLabel, { color: colors.text }]}>품사 표시</Text>
                  <Switch
                    value={settings.showPos}
                    onValueChange={v => setSettings(s => ({ ...s, showPos: v }))}
                    trackColor={{ true: colors.primary }}
                  />
                </View>

                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>발음기호 표시</Text>
                  <Switch
                    value={settings.showPhonetic}
                    onValueChange={v => setSettings(s => ({ ...s, showPhonetic: v }))}
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

                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>예문 해석 표시</Text>
                  <Switch
                    value={settings.showExampleKr}
                    onValueChange={v => setSettings(s => ({ ...s, showExampleKr: v }))}
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
      <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>

          <View style={styles.titleArea}>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
              {list?.title || '플래시카드'}
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
              <CardFront word={currentWord} colors={colors} isDark={isDark} rotation={rotation} onToggleStar={handleToggleStar} showPos={settings.showPos} />
              <CardBack
                word={currentWord}
                colors={colors}
                isDark={isDark}
                rotation={rotation}
                onToggleStar={handleToggleStar}
                showMeaning={settings.showMeaning}
                showExample={settings.showExample}
                showExampleKr={settings.showExampleKr}
                showPhonetic={settings.showPhonetic}
                showPos={settings.showPos}
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
                backgroundColor: pressed ? colors.warning + '33' : colors.warning + '1A', // 20% or 10% opacity
                borderColor: colors.warning + '33',
                borderWidth: 1,
              }
            ]}
          >
            <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
            <Ionicons name="chevron-back" size={22} color={colors.warning} />
            <View>
              <Text style={[styles.actionBtnText, { color: colors.warning }]}>Review</Text>
              <Text style={[styles.actionBtnSubtext, { color: colors.warning, opacity: 0.5 }]}>Swipe Left</Text>
            </View>
          </Pressable>
        </Animated.View>

        <Animated.View style={[{ flex: 1 }, rightBtnScale]}>
          <Pressable
            onPress={() => handleNext(true)}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: pressed ? colors.primary + '33' : colors.primary + '1A',
                borderColor: colors.primary + '33',
                borderWidth: 1,
              }
            ]}
          >
            <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.actionBtnText, { color: colors.primary }]}>Got it</Text>
              <Text style={[styles.actionBtnSubtext, { color: colors.primary, opacity: 0.5 }]}>Swipe Right</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.primary} />
          </Pressable>
        </Animated.View>
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
          rotation.value = 0;
          setShowBatchOverlay(false);
          // Auto play sound for first word of new batch
          if (settings.autoPlaySound) {
            const nextStart = (currentBatchIndex + 1) * batchSizeNum;
            const nextWord = studyWords[nextStart];
            if (nextWord) speak(nextWord.term);
          }
        }}
        onRetryBatch={() => {
          setCurrentIndex(0);
          rotation.value = 0;
          setShowBatchOverlay(false);
          // Remove results for this batch so they aren't duplicated
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
    minHeight: 400,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 12,
    gap: 12,
  },
  cardBack: {
    position: 'absolute',
    paddingTop: 100,
  },
  cardWord: {
    fontSize: 36,
    fontFamily: 'Pretendard_700Bold',
    textAlign: 'center',
  },
  cardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: -8,
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
  phoneticText: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
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
  cardExampleKr: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  cardExampleBox: {
    borderRadius: 12,
    padding: 16,
    width: '100%',
  },
  cardBackTerm: {
    fontSize: 18,
    fontFamily: 'Pretendard_600SemiBold',
  },
  termWrapper: {
    alignItems: 'center',
  },
  gradientDivider: {
    width: 200,
    height: 1.5,
    opacity: 0.8,
  },
  hintText: {
    position: 'absolute',
    bottom: 24,
    fontSize: 12,
    fontFamily: 'Pretendard_600SemiBold',
    opacity: 0.7,
  },
  speakerBtn: {
    padding: 8,
    marginTop: 10,
  },
  starBtn: {
    position: 'absolute',
    top: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
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
    gap: 10,
    overflow: 'hidden',
  },
  actionBtnText: {
    fontSize: 17,
    fontFamily: 'Pretendard_600SemiBold',
  },
  actionBtnSubtext: {
    fontSize: 9,
    fontFamily: 'Pretendard_600SemiBold',
    textTransform: 'uppercase',
    marginTop: -1,
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

