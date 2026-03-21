import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Dimensions, Modal, Switch } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS,
    withTiming
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { speak } from '@/lib/tts';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.2;

export default function AutoPlayScreen() {
    const { id, filter, isStarred } = useLocalSearchParams<{ id: string; filter?: string; isStarred?: string }>();
    const insets = useSafeAreaInsets();
    const { colors } = useTheme();
    const { getWordsForList, toggleStarred } = useVocab();

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
    const [settings, setSettings] = useState({
        showTerm: true,
        showMeaning: true,
        showPos: true,
        showExample: true,
        showExampleKr: true,
        autoPlaySound: true,
        delay: '2s' as '1s' | '2s' | '3s'
    });

    const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);

    const translateX = useSharedValue(0);
    const opacity = useSharedValue(1);

    const currentWord = words[currentIndex] || null;

    // Animation styles
    const cardStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
        opacity: opacity.value,
    }));

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
                <Text style={{ color: colors.textSecondary, fontFamily: 'Pretendard_500Medium' }}>No words available for playback.</Text>
                <Pressable onPress={handleClose} style={{ marginTop: 20 }}>
                    <Text style={{ color: colors.primary, fontFamily: 'Pretendard_600SemiBold' }}>Go Back</Text>
                </Pressable>
            </View>
        );
    }

    const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: topInset + 12 }]}>
                <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                    {currentIndex + 1} / {words.length}
                </Text>
                <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                    <Pressable onPress={() => setSettingsVisible(true)} hitSlop={12}>
                        <Ionicons name="settings-outline" size={26} color={colors.textSecondary} />
                    </Pressable>
                    <Pressable onPress={handleClose} hitSlop={12}>
                        <Ionicons name="close" size={28} color={colors.textSecondary} />
                    </Pressable>
                </View>
            </View>

            {/* Progress Bar */}
            <View style={[styles.progressBarBg, { backgroundColor: colors.surfaceSecondary, marginHorizontal: 16 }]}>
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

            {/* Card Area */}
            <GestureDetector gesture={panGesture}>
                <Animated.View style={[styles.cardContainer, cardStyle]}>
                    <Pressable onPress={handleCardClick} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, shadowColor: colors.cardShadow, opacity: pressed ? 0.95 : 1 }]}>
                        <Pressable
                            onPress={(e) => { e.stopPropagation(); handleToggleStar(currentWord.id); }}
                            hitSlop={12}
                            style={styles.starBtn}
                        >
                            <Ionicons name={currentWord.isStarred ? 'star' : 'star-outline'} size={20} color={currentWord.isStarred ? '#FFD700' : colors.textTertiary} />
                        </Pressable>
                        {settings.showTerm && (
                            <>
                                {settings.showPos && currentWord.pos && (
                                    <View style={[styles.topPosBadge, { backgroundColor: colors.primaryLight }]}>
                                        <Text style={[styles.topPosBadgeText, { color: colors.primary }]}>{currentWord.pos}</Text>
                                    </View>
                                )}
                                <Text style={[styles.wordText, { color: colors.text }]} numberOfLines={2}>
                                    {currentWord.term}
                                </Text>
                            </>
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

                        <View style={{ flex: 1, minHeight: 120, alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                            {isRevealed && (
                                <>
                                    {settings.showMeaning && (
                                        <Text style={[styles.meaningText, { color: colors.primary, marginBottom: 12, textAlign: 'center' }]} numberOfLines={3}>
                                            {currentWord.meaningKr}
                                        </Text>
                                    )}
                                    {settings.showExample && !!currentWord.exampleEn && (
                                        <Text style={[styles.exampleText, { color: colors.textSecondary, textAlign: 'center' }]}>
                                            {currentWord.exampleEn}
                                        </Text>
                                    )}
                                    {settings.showExampleKr && !!currentWord.exampleKr && (
                                        <Text style={[styles.exampleKrText, { color: colors.textTertiary, marginTop: 4, textAlign: 'center' }]}>
                                            {currentWord.exampleKr}
                                        </Text>
                                    )}
                                </>
                            )}
                        </View>
                    </Pressable>
                </Animated.View>
            </GestureDetector>

            {/* Controls */}
            <View style={[styles.controlsArea, { paddingBottom: insets.bottom + 40 }]}>
                <Pressable onPress={goToPrev} disabled={currentIndex === 0} hitSlop={20}>
                    <Ionicons
                        name="play-skip-back"
                        size={40}
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
                        size={40}
                        color="#FFF"
                        style={{ marginLeft: isPlaying ? 0 : 4 }}
                    />
                </Pressable>

                <Pressable onPress={goToNext} disabled={currentIndex === words.length - 1} hitSlop={20}>
                    <Ionicons
                        name="play-skip-forward"
                        size={40}
                        color={currentIndex === words.length - 1 ? colors.textTertiary : colors.text}
                    />
                </Pressable>
            </View>

            {/* Settings Modal */}
            <Modal visible={settingsVisible} transparent animationType="fade" onRequestClose={() => setSettingsVisible(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setSettingsVisible(false)}>
                    <Pressable style={[styles.settingsSheet, { backgroundColor: colors.surface }]} onPress={e => e.stopPropagation()}>
                        <View style={styles.settingsHeader}>
                            <Text style={[styles.settingsTitle, { color: colors.text }]}>자동재생 설정</Text>
                            <Pressable onPress={() => setSettingsVisible(false)} hitSlop={8}>
                                <Ionicons name="close" size={24} color={colors.textSecondary} />
                            </Pressable>
                        </View>

                        <View style={[styles.settingRow, { borderBottomColor: colors.borderLight }]}>
                            <Text style={{ color: colors.text, fontSize: 16 }}>단어 표시</Text>
                            <Switch value={settings.showTerm} onValueChange={v => setSettings(s => ({ ...s, showTerm: v }))} trackColor={{ true: colors.primary }} />
                        </View>
                        <View style={[styles.settingRow, { borderBottomColor: colors.borderLight }]}>
                            <Text style={{ color: colors.text, fontSize: 16 }}>뜻 표시</Text>
                            <Switch value={settings.showMeaning} onValueChange={v => setSettings(s => ({ ...s, showMeaning: v }))} trackColor={{ true: colors.primary }} />
                        </View>
                        <View style={[styles.settingRow, { borderBottomColor: colors.borderLight }]}>
                            <Text style={{ color: colors.text, fontSize: 16 }}>품사 표시</Text>
                            <Switch value={settings.showPos} onValueChange={v => setSettings(s => ({ ...s, showPos: v }))} trackColor={{ true: colors.primary }} />
                        </View>
                        <View style={[styles.settingRow, { borderBottomColor: colors.borderLight }]}>
                            <Text style={{ color: colors.text, fontSize: 16 }}>예문 표시</Text>
                            <Switch value={settings.showExample} onValueChange={v => setSettings(s => ({ ...s, showExample: v }))} trackColor={{ true: colors.primary }} />
                        </View>
                        <View style={[styles.settingRow, { borderBottomColor: colors.borderLight }]}>
                            <Text style={{ color: colors.text, fontSize: 16 }}>예문 해석 표시</Text>
                            <Switch value={settings.showExampleKr} onValueChange={v => setSettings(s => ({ ...s, showExampleKr: v }))} trackColor={{ true: colors.primary }} />
                        </View>
                        <View style={[styles.settingRow, { borderBottomColor: colors.borderLight }]}>
                            <Text style={{ color: colors.text, fontSize: 16 }}>자동 음성 재생</Text>
                            <Switch value={settings.autoPlaySound} onValueChange={v => setSettings(s => ({ ...s, autoPlaySound: v }))} trackColor={{ true: colors.primary }} />
                        </View>

                        <View style={[styles.settingRow, { borderBottomWidth: 0, flexDirection: 'column', alignItems: 'flex-start', gap: 12, marginTop: 4 }]}>
                            <Text style={{ color: colors.text, fontSize: 16 }}>다음 단어 딜레이</Text>
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                {(['1s', '2s', '3s'] as const).map(time => (
                                    <Pressable
                                        key={time}
                                        onPress={() => setSettings(s => ({ ...s, delay: time }))}
                                        style={[
                                            styles.delayBtn,
                                            { backgroundColor: settings.delay === time ? colors.primary : colors.surfaceSecondary }
                                        ]}
                                    >
                                        <Text style={{ color: settings.delay === time ? '#FFF' : colors.text, fontFamily: 'Pretendard_600SemiBold' }}>
                                            {time}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    progressText: {
        fontSize: 16,
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
    cardContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    card: {
        width: '100%',
        minHeight: 350,
        borderRadius: 20,
        padding: 32,
        alignItems: 'center',
        justifyContent: 'center',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 1,
        shadowRadius: 24,
        elevation: 12,
    },
    wordText: {
        fontSize: 40,
        fontFamily: 'Pretendard_700Bold',
        textAlign: 'center',
        marginBottom: 8,
    },
    meaningText: {
        fontSize: 28,
        fontFamily: 'Pretendard_600SemiBold',
        textAlign: 'center',
    },
    speakerBtn: {
        padding: 8,
        marginBottom: 16,
    },
    controlsArea: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
        paddingHorizontal: 24,
    },
    playPauseBtn: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 8,
    },
    exampleText: {
        fontSize: 16,
        fontFamily: 'Pretendard_500Medium',
        lineHeight: 22,
        paddingHorizontal: 12,
    },
    exampleKrText: {
        fontSize: 14,
        fontFamily: 'Pretendard_400Regular',
        lineHeight: 20,
        paddingHorizontal: 12,
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
    },
    settingsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    settingsTitle: {
        fontSize: 20,
        fontFamily: 'Pretendard_700Bold',
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    delayBtn: {
        paddingVertical: 8,
        paddingHorizontal: 20,
        borderRadius: 12,
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
    starBtn: {
        position: 'absolute',
        right: 16,
        top: 16,
        padding: 8,
        zIndex: 10,
    },
});
