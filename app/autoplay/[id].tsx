import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Dimensions, Modal, Switch } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS,
    withTiming,
    interpolate,
    Extrapolation
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { useSettings } from '@/contexts/SettingsContext';
import { speak } from '@/lib/tts';
import StudySettingsModal, { StudySettings } from '@/components/StudySettingsModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.2;

export default function AutoPlayScreen() {
    const { id, filter, isStarred } = useLocalSearchParams<{ id: string; filter?: string; isStarred?: string }>();
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useTheme();
    const { lists, getWordsForList, toggleStarred } = useVocab();
    const { studySettings, updateStudySettings, autoPlaySettings, updateAutoPlaySettings } = useSettings();
    const list = lists.find(l => l.id === id);

    const [words, setWords] = useState(() => {
        let all = getWordsForList(id!);
        if (isStarred === 'true') {
            all = all.filter(w => w.isStarred);
        }
        if (filter === 'learning') return all.filter(w => !w.isMemorized);
        if (filter === 'memorized') return all.filter(w => w.isMemorized);
        return all;
    });

    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);
    const [isRevealed, setIsRevealed] = useState(false);

    const [settingsVisible, setSettingsVisible] = useState(false);
    const [settings, setSettings] = useState<StudySettings>({
        ...autoPlaySettings,
        filter: (filter || autoPlaySettings.filter) as 'all' | 'learning' | 'memorized',
        isStarred: isStarred === 'true' || autoPlaySettings.isStarred,
    });

    const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);

    const translateX = useSharedValue(0);
    const opacity = useSharedValue(1);
    const revealProgress = useSharedValue(0);

    useEffect(() => {
        revealProgress.value = withTiming(isRevealed ? 1 : 0, { duration: 400 });
    }, [isRevealed]);

    const isInitialLoad = useRef(true);
    const lastSettingsRef = useRef({ id, filter: settings.filter, isStarred: settings.isStarred, shuffle: settings.shuffle });

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

        const coreFilterChanged =
            lastSettingsRef.current.id !== id ||
            lastSettingsRef.current.filter !== settings.filter ||
            lastSettingsRef.current.isStarred !== settings.isStarred ||
            lastSettingsRef.current.shuffle !== settings.shuffle;

        if (coreFilterChanged || isInitialLoad.current) {
            if (settings.shuffle) {
                all = [...all].sort(() => Math.random() - 0.5);
            }
            setCurrentIndex(0);
            translateX.value = 0;
            lastSettingsRef.current = { id, filter: settings.filter, isStarred: settings.isStarred, shuffle: settings.shuffle };
            setWords(all);
            isInitialLoad.current = false;
        } else {
            setWords(prev => {
                const newMap = new Map(all.map(w => [w.id, w]));
                return prev.map(w => newMap.has(w.id) ? newMap.get(w.id)! : w);
            });
        }
    }, [id, getWordsForList, settings.filter, settings.isStarred, settings.shuffle]);

    const applySettings = useCallback((newSettings: StudySettings, newBatchSize: number | 'all') => {
        setSettings(newSettings);
        updateAutoPlaySettings(newSettings as any); // Persist settings
        if (newBatchSize !== studySettings.studyBatchSize) {
            updateStudySettings({ studyBatchSize: newBatchSize as any });
        }
        setSettingsVisible(false);
    }, [studySettings.studyBatchSize, updateStudySettings, updateAutoPlaySettings]);

    const currentWord = words[currentIndex] || null;

    // Animation styles
    const cardStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
        opacity: opacity.value,
    }));

    const wordAnimatedStyle = useAnimatedStyle(() => {
        const translateY = interpolate(revealProgress.value, [0, 1], [0, -80], Extrapolation.CLAMP);
        const scale = interpolate(revealProgress.value, [0, 1], [1, 0.6], Extrapolation.CLAMP);
        return {
            transform: [{ translateY }, { scale }],
        };
    });

    const contentAnimatedStyle = useAnimatedStyle(() => {
        const opacity = interpolate(revealProgress.value, [0, 0.4, 1], [0, 0, 1], Extrapolation.CLAMP);
        const translateY = interpolate(revealProgress.value, [0, 1], [20, 0], Extrapolation.CLAMP);
        return {
            opacity,
            transform: [{ translateY }],
        };
    });

    const goToNext = useCallback(() => {
        if (currentIndex < words.length - 1) {
            if (timerRef.current) clearTimeout(timerRef.current);

            translateX.value = withTiming(-SCREEN_WIDTH, { duration: 200 }, () => {
                translateX.value = SCREEN_WIDTH;
                runOnJS(setCurrentIndex)(currentIndex + 1);
                translateX.value = withSpring(0);
            });
        } else {
            // End of list
            setIsPlaying(false);
        }
    }, [currentIndex, words.length, translateX]);

    const playCurrentWord = useCallback(async () => {
        if (!currentWord) return;
        setIsRevealed(false);

        if (settings.autoPlaySound) {
            await speak(currentWord.term);
        }

        const delayMs = settings.delay === '1s' ? 1000 : settings.delay === '3s' ? 3000 : 2000;

        timerRef.current = setTimeout(() => {
            setIsRevealed(true);

            timerRef.current = setTimeout(() => {
                goToNext();
            }, delayMs) as unknown as NodeJS.Timeout;
        }, 1500) as unknown as NodeJS.Timeout;
    }, [currentWord, goToNext, settings.autoPlaySound, settings.delay]);

    const handleCardClick = () => {
        if (!isRevealed) {
            setIsRevealed(true);
            if (timerRef.current) clearTimeout(timerRef.current);
            if (isPlaying) {
                const delayMs = settings.delay === '1s' ? 1000 : settings.delay === '3s' ? 3000 : 2000;
                timerRef.current = setTimeout(() => {
                    goToNext();
                }, delayMs) as unknown as NodeJS.Timeout;
            }
        }
    };

    const handleToggleStar = useCallback(async (wordId: string) => {
        setWords(prev => prev.map(w => w.id === wordId ? { ...w, isStarred: !w.isStarred } : w));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await toggleStarred(id!, wordId);
    }, [id, toggleStarred]);

    const goToPrev = useCallback(() => {
        if (currentIndex > 0) {
            if (timerRef.current) clearTimeout(timerRef.current);

            translateX.value = withTiming(SCREEN_WIDTH, { duration: 200 }, () => {
                translateX.value = -SCREEN_WIDTH;
                runOnJS(setCurrentIndex)(currentIndex - 1);
                translateX.value = withSpring(0);
            });
        }
    }, [currentIndex, translateX]);

    useEffect(() => {
        if (isPlaying && currentWord) {
            playCurrentWord();
        }

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [currentIndex, isPlaying, playCurrentWord, currentWord]);

    const togglePlayPause = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setIsPlaying(!isPlaying);
    };

    const handleClose = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        router.back();
    };

    // Swipe Gesture
    const panGesture = Gesture.Pan()
        .onUpdate((event) => {
            translateX.value = event.translationX;
        })
        .onEnd((event) => {
            if (event.translationX < -SWIPE_THRESHOLD) {
                runOnJS(goToNext)();
            } else if (event.translationX > SWIPE_THRESHOLD) {
                runOnJS(goToPrev)();
            } else {
                translateX.value = withSpring(0);
            }
        });

    if (!currentWord) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: colors.textSecondary, fontFamily: 'Pretendard_500Medium' }}>재생할 단어가 없습니다.</Text>
                <Pressable onPress={handleClose} style={{ marginTop: 20 }}>
                    <Text style={{ color: colors.primary, fontFamily: 'Pretendard_600SemiBold' }}>뒤로 가기</Text>
                </Pressable>
            </View>
        );
    }

    const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
                <View style={styles.headerRow}>
                    <Pressable onPress={handleClose} hitSlop={12}>
                        <Ionicons name="chevron-back" size={24} color={colors.text} />
                    </Pressable>

                    <View style={styles.titleArea}>
                        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                            {list?.title || '자동재생'}
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
                                    width: `${Math.max(0, Math.min(100, ((currentIndex + 1) / words.length) * 100))}%`,
                                },
                            ]}
                        />
                    </View>
                    <Text style={[styles.progressText, { color: colors.textTertiary }]}>
                        {currentIndex + 1} / {words.length}
                    </Text>
                </View>
            </View>

            {/* Card Area */}
            <GestureDetector gesture={panGesture}>
                <Animated.View style={[styles.cardContainer, cardStyle]}>
                    <Pressable onPress={handleCardClick} style={[styles.card, { backgroundColor: colors.surface, shadowColor: colors.cardShadow, borderColor: colors.borderLight, borderWidth: 1 }]}>
                        <Pressable
                            onPress={(e) => { e.stopPropagation(); handleToggleStar(currentWord.id); }}
                            hitSlop={12}
                            style={styles.starBtn}
                        >
                            <Ionicons name={currentWord.isStarred ? 'star' : 'star-outline'} size={22} color={currentWord.isStarred ? '#FFD700' : colors.textTertiary} />
                        </Pressable>

                        {/* Word Area */}
                        <Animated.View style={[styles.wordArea, wordAnimatedStyle]}>
                            {settings.showPos && currentWord.pos && (
                                <View style={[styles.topPosBadge, { backgroundColor: colors.primaryLight }]}>
                                    <Text style={[styles.topPosBadgeText, { color: colors.primary }]}>{currentWord.pos}</Text>
                                </View>
                            )}
                            <Text style={[styles.wordText, { color: colors.text }]} numberOfLines={2}>
                                {currentWord.term}
                            </Text>
                            {settings.showPhonetic && currentWord.phonetic && (
                                <Text style={[styles.phoneticText, { color: colors.textTertiary }]}>
                                    /{currentWord.phonetic}/
                                </Text>
                            )}

                            <Pressable
                                onPress={(e) => { e.stopPropagation(); speak(currentWord.term); }}
                                hitSlop={12}
                                style={styles.speakerBtn}
                            >
                                {({ pressed }) => (
                                    <Ionicons name="volume-medium-outline" size={28} color={pressed ? colors.primary : colors.textTertiary} />
                                )}
                            </Pressable>
                        </Animated.View>

                        {/* Content Area */}
                        <Animated.View style={[styles.contentArea, contentAnimatedStyle]}>
                            <LinearGradient
                                colors={['transparent', colors.border, 'transparent']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.gradientDivider}
                            />

                            {settings.showMeaning && (
                                <Text style={[styles.meaningText, { color: colors.text }]} numberOfLines={3}>
                                    {currentWord.meaningKr}
                                </Text>
                            )}

                            {(settings.showExample && !!currentWord.exampleEn) && (
                                <View style={[styles.exampleBox, { backgroundColor: colors.surfaceSecondary }]}>
                                    <Text style={[styles.exampleText, { color: colors.textSecondary }]}>
                                        {currentWord.exampleEn}
                                    </Text>
                                    {settings.showExampleKr && !!currentWord.exampleKr && (
                                        <Text style={[styles.exampleKrText, { color: colors.textTertiary }]}>
                                            {currentWord.exampleKr}
                                        </Text>
                                    )}
                                </View>
                            )}
                        </Animated.View>
                    </Pressable>
                </Animated.View>
            </GestureDetector>

            {/* Controls */}
            <View style={[styles.controlsArea, { paddingBottom: insets.bottom + 40, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <Pressable onPress={goToPrev} disabled={currentIndex === 0} hitSlop={20} style={[styles.navBtn, { backgroundColor: colors.surfaceSecondary }]}>
                    <Ionicons
                        name="play-skip-back"
                        size={24}
                        color={currentIndex === 0 ? colors.textTertiary : colors.text}
                    />
                </Pressable>

                <Pressable
                    onPress={togglePlayPause}
                    style={[styles.playPauseBtn, { backgroundColor: colors.primary }]}
                    hitSlop={12}
                >
                    <Ionicons
                        name={isPlaying ? "pause" : "play"}
                        size={32}
                        color="#FFF"
                        style={{ marginLeft: isPlaying ? 0 : 2 }}
                    />
                </Pressable>

                <Pressable onPress={goToNext} disabled={currentIndex === words.length - 1} hitSlop={20} style={[styles.navBtn, { backgroundColor: colors.surfaceSecondary }]}>
                    <Ionicons
                        name="play-skip-forward"
                        size={24}
                        color={currentIndex === words.length - 1 ? colors.textTertiary : colors.text}
                    />
                </Pressable>
            </View>

            <StudySettingsModal
                visible={settingsVisible}
                mode="autoplay"
                initialSettings={settings}
                initialBatchSize={studySettings.studyBatchSize}
                onClose={() => setSettingsVisible(false)}
                onApply={applySettings}
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
    cardContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24, // 플래시카드와 동일하게 (24px)
    },
    card: {
        width: '100%',
        minHeight: 450, // 플래시카드와 비슷하게 최소 높이 상향
        borderRadius: 16,
        padding: 32,
        alignItems: 'center',
        justifyContent: 'center',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 1,
        shadowRadius: 20,
        elevation: 12,
        overflow: 'hidden',
    },
    wordArea: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    contentArea: {
        position: 'absolute',
        bottom: 32,
        width: '100%',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    wordText: {
        fontSize: 36, // 플래시카드(36)와 일치
        fontFamily: 'Pretendard_700Bold',
        textAlign: 'center',
        marginBottom: 8,
    },
    meaningText: {
        fontSize: 32, // 플래시카드(32)와 일치
        fontFamily: 'Pretendard_700Bold',
        textAlign: 'center',
        marginBottom: 20,
    },
    speakerBtn: {
        padding: 8,
        marginTop: 8,
    },
    controlsArea: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        paddingHorizontal: 24,
        paddingTop: 24,
    },
    playPauseBtn: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    navBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    exampleBox: {
        width: '100%',
        padding: 16,
        borderRadius: 12,
        marginTop: 8,
    },
    exampleText: {
        fontSize: 16,
        fontFamily: 'Pretendard_400Regular',
        lineHeight: 24,
        textAlign: 'center',
        fontStyle: 'italic',
    },
    exampleKrText: {
        fontSize: 14,
        fontFamily: 'Pretendard_400Regular',
        lineHeight: 20,
        marginTop: 8,
        textAlign: 'center',
    },
    gradientDivider: {
        width: '100%',
        height: 1,
        marginBottom: 24,
    },
    topPosBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    topPosBadgeText: {
        fontSize: 12,
        fontFamily: 'Pretendard_600SemiBold',
    },
    phoneticText: {
        fontSize: 18,
        fontFamily: 'Pretendard_400Regular',
        marginTop: -4,
        marginBottom: 4,
    },
    starBtn: {
        position: 'absolute',
        right: 16,
        top: 16,
        padding: 4,
        zIndex: 10,
    },
});
