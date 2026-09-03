import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
    withRepeat,
    interpolate,
    Extrapolation
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { AppBannerAd, useAdsBottomInset } from '@/components/ads/AppBannerAd';
import { useLists, selectWordsForList, toggleStarred } from '@/features/vocab';
import { useSettings } from '@/features/settings';
import { speak, stopSpeaking } from '@/lib/tts';
import { getTtsLang, getSpeakableText, getStudySourceLang, shouldShowExampleTranslation } from '@/constants/languages';
import { stripSenseMarkers } from '@/lib/senses';
import SpeakerButton from '@/components/ui/SpeakerButton';
import StudySettingsModal, { StudySettings } from '@/features/study/components/StudySettingsModal';
import TimerRing from '@/components/ui/TimerRing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.2;

export default function AutoPlayScreen() {
    const { id, filter, isStarred } = useLocalSearchParams<{ id: string; filter?: string; isStarred?: string }>();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useTheme();
    const lists = useLists();
    const getWordsForList = useCallback((listId: string) => selectWordsForList(lists, listId), [lists]);
    const { studySettings, updateStudySettings, autoPlaySettings, updateAutoPlaySettings } = useSettings();
    const adsBottomInset = useAdsBottomInset();
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

    const [isComplete, setIsComplete] = useState(false);
    const [ringResetKey, setRingResetKey] = useState(0);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [settings, setSettings] = useState<StudySettings>({
        ...autoPlaySettings,
        filter: (filter || autoPlaySettings.filter) as 'all' | 'learning' | 'memorized',
        isStarred: isStarred === 'true' || autoPlaySettings.isStarred,
    });

    const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);
    // 재생 시퀀스 취소 토큰. 일시정지/스킵/이전/이탈 시 증가시켜 진행 중인
    // async 시퀀스(await speak · 대기 타이머)를 무효화하고 발화를 끊는다.
    const playTokenRef = useRef(0);

    const stopPlayback = useCallback(() => {
        playTokenRef.current++;
        if (timerRef.current) clearTimeout(timerRef.current);
        stopSpeaking();
    }, []);

    const delayMs = useMemo(() =>
        settings.delay === '1s' ? 1000 : settings.delay === '3s' ? 3000 : 2000,
        [settings.delay]
    );

    const translateX = useSharedValue(0);
    const opacity = useSharedValue(1);
    const revealProgress = useSharedValue(0);
    const tapHintOpacity = useSharedValue(1);

    useEffect(() => {
        revealProgress.value = withTiming(isRevealed ? 1 : 0, { duration: 400 });
        if (!isRevealed) {
            tapHintOpacity.value = withRepeat(withTiming(0.2, { duration: 900 }), -1, true);
        } else {
            tapHintOpacity.value = withTiming(0, { duration: 150 });
        }
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
    const sourceLang = currentWord ? getStudySourceLang(currentWord, list) : list?.sourceLanguage;
    const ttsLang = getTtsLang(sourceLang);

    // Animation styles
    const cardStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
        opacity: opacity.value,
    }));

    const wordAnimatedStyle = useAnimatedStyle(() => {
        const wordOpacity = interpolate(revealProgress.value, [0, 0.5], [1, 0], Extrapolation.CLAMP);
        const scale = interpolate(revealProgress.value, [0, 1], [1, 0.92], Extrapolation.CLAMP);
        return {
            opacity: wordOpacity,
            transform: [{ scale }],
        };
    });

    const tapHintAnimatedStyle = useAnimatedStyle(() => ({
        opacity: tapHintOpacity.value,
    }));

    const contentAnimatedStyle = useAnimatedStyle(() => {
        const contentOpacity = interpolate(revealProgress.value, [0.4, 1], [0, 1], Extrapolation.CLAMP);
        return {
            opacity: contentOpacity,
        };
    });

    const goToNext = useCallback(() => {
        stopPlayback();
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
            setIsComplete(true);
        }
    }, [currentIndex, words.length, translateX, stopPlayback]);

    const playCurrentWord = useCallback(async () => {
        if (!currentWord) return;
        const token = ++playTokenRef.current;
        setIsRevealed(false);

        if (settings.autoPlaySound) {
            await speak(getSpeakableText(currentWord.term, currentWord.phonetic, sourceLang), ttsLang);
            if (token !== playTokenRef.current) return; // 도중 일시정지/스킵됨
        }

        setRingResetKey(k => k + 1);

        timerRef.current = setTimeout(async () => {
            setIsRevealed(true);

            // 정답 공개 시점에 예문을 낭독한다. 예문 길이가 가변이라 발화가 끝날
            // 때까지 기다린 뒤 다음 단어로 넘어가야 잘리지 않는다.
            if (settings.autoPlaySound && settings.autoPlayExample && settings.showExample && currentWord.exampleEn) {
                await speak(stripSenseMarkers(currentWord.exampleEn), ttsLang);
                if (token !== playTokenRef.current) return;
            }

            timerRef.current = setTimeout(() => {
                goToNext();
            }, delayMs) as unknown as NodeJS.Timeout;
        }, 1500) as unknown as NodeJS.Timeout;
    }, [currentWord, goToNext, settings.autoPlaySound, settings.autoPlayExample, settings.showExample, delayMs, ttsLang, sourceLang]);

    const handleCardClick = () => {
        if (!isRevealed) {
            tapHintOpacity.value = 0;
            // 진행 중인 자동 시퀀스(공개 전 대기 등)를 무효화하고 즉시 정답 공개.
            if (timerRef.current) clearTimeout(timerRef.current);
            const token = ++playTokenRef.current;
            setIsRevealed(true);
            (async () => {
                // 수동으로 미리 공개해도 예문 낭독은 자동 재생과 동일하게 동작.
                if (settings.autoPlaySound && settings.autoPlayExample && settings.showExample && currentWord.exampleEn) {
                    await speak(stripSenseMarkers(currentWord.exampleEn), ttsLang);
                    if (token !== playTokenRef.current) return;
                }
                if (isPlaying) {
                    timerRef.current = setTimeout(() => {
                        goToNext();
                    }, delayMs) as unknown as NodeJS.Timeout;
                }
            })();
        }
    };

    const handleToggleStar = useCallback(async (wordId: string) => {
        setWords(prev => prev.map(w => w.id === wordId ? { ...w, isStarred: !w.isStarred } : w));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await toggleStarred(id!, wordId);
    }, [id, toggleStarred]);

    const goToPrev = useCallback(() => {
        stopPlayback();
        if (currentIndex > 0) {
            if (timerRef.current) clearTimeout(timerRef.current);

            translateX.value = withTiming(SCREEN_WIDTH, { duration: 200 }, () => {
                translateX.value = -SCREEN_WIDTH;
                runOnJS(setCurrentIndex)(currentIndex - 1);
                translateX.value = withSpring(0);
            });
        }
    }, [currentIndex, translateX, stopPlayback]);

    useEffect(() => {
        if (isPlaying && currentWord) {
            playCurrentWord();
        }

        // 일시정지·단어 이동·언마운트 시 진행 중인 발화와 대기 타이머를 정리한다.
        return () => {
            stopPlayback();
        };
    }, [currentIndex, isPlaying, playCurrentWord, currentWord, stopPlayback]);

    const togglePlayPause = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setIsPlaying(!isPlaying);
    };

    const handleRestart = useCallback(() => {
        stopPlayback();
        setIsComplete(false);
        setCurrentIndex(0);
        setIsRevealed(false);
        setIsPlaying(true);
        setRingResetKey(k => k + 1);
        translateX.value = 0;
    }, [translateX, stopPlayback]);

    const handleClose = () => {
        stopPlayback();
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
                <Text style={{ color: colors.textSecondary, fontFamily: 'Pretendard_500Medium' }}>{t('autoplay.noWords')}</Text>
                <Pressable onPress={handleClose} style={{ marginTop: 20 }}>
                    <Text style={{ color: colors.primary, fontFamily: 'Pretendard_600SemiBold' }}>{t('common.back')}</Text>
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
                    <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={handleClose} hitSlop={12}>
                        <Ionicons name="chevron-back" size={24} color={colors.text} />
                    </Pressable>

                    <View style={styles.titleArea}>
                        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                            {list?.title || t('autoplay.title')}
                        </Text>
                    </View>

                    <Pressable accessibilityRole="button" accessibilityLabel={t('studySettings.autoplaySettings')} onPress={() => setSettingsVisible(true)} hitSlop={12}>
                        <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
                    </Pressable>
                </View>

                <View style={styles.progressContainer}>
                    <View style={[styles.progressBarBg, { backgroundColor: colors.surfaceSecondary }]}>
                        <View
                            style={[
                                styles.progressBarFill,
                                {
                                    backgroundColor: colors.primaryButton,
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
            {isComplete ? (
                <View style={styles.completionContainer}>
                    <View style={[styles.completionCard, { backgroundColor: colors.surface, shadowColor: colors.cardShadow }]}>
                        <View style={[styles.completionIconCircle, { backgroundColor: colors.successLight }]}>
                            <Ionicons name="checkmark" size={48} color={colors.success} />
                        </View>
                        <Text style={[styles.completionTitle, { color: colors.text }]}>{t('autoplay.complete')}</Text>
                        <Text style={[styles.completionStat, { color: colors.textSecondary }]}>
                            {t('autoplay.wordsComplete', { count: words.length })}
                        </Text>
                        <View style={styles.completionButtons}>
                            <Pressable
                                style={[styles.completionBtn, { backgroundColor: colors.surfaceSecondary }]}
                                onPress={handleRestart}
                            >
                                <Text style={[styles.completionBtnText, { color: colors.text }]}>{t('autoplay.restart')}</Text>
                            </Pressable>
                            <Pressable
                                style={[styles.completionBtn, { backgroundColor: colors.primaryButton }]}
                                onPress={handleClose}
                            >
                                <Text style={[styles.completionBtnText, { color: colors.onPrimary }]}>{t('autoplay.exit')}</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            ) : (
            <GestureDetector gesture={panGesture}>
                <Animated.View style={[styles.cardContainer, cardStyle]}>
                    <Pressable onPress={handleCardClick} style={[styles.card, { backgroundColor: colors.surface, shadowColor: colors.cardShadow, borderColor: colors.borderLight, borderWidth: 1 }]}>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t(currentWord.isStarred ? 'list.starOff' : 'list.starOn')}
                            onPress={(e) => { e.stopPropagation(); handleToggleStar(currentWord.id); }}
                            hitSlop={12}
                            style={styles.starBtn}
                        >
                            <Ionicons name={currentWord.isStarred ? 'star' : 'star-outline'} size={22} color={currentWord.isStarred ? colors.starGold : colors.textTertiary} />
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

                            <SpeakerButton
                                text={getSpeakableText(currentWord.term, currentWord.phonetic, sourceLang)}
                                language={ttsLang}
                                size={28}
                                stopPropagation
                                style={styles.speakerBtn}
                            />
                            <Animated.View style={tapHintAnimatedStyle}>
                                <Text style={[styles.tapHintText, { color: colors.textSecondary }]}>{t('autoplay.tapToCheck')}</Text>
                            </Animated.View>
                        </Animated.View>

                        {/* Content Area */}
                        <Animated.View style={[styles.contentArea, contentAnimatedStyle]}>
                            <Text style={[styles.backWordText, { color: colors.text }]} numberOfLines={2}>
                                {currentWord.term}
                            </Text>
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
                                    {settings.showExampleKr && shouldShowExampleTranslation(currentWord.exampleEn, currentWord.exampleKr) && (
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
            )}

            {/* Controls */}
            <View style={[styles.controlsArea, { paddingBottom: insets.bottom + (adsBottomInset || 40) }]}>
                <Pressable accessibilityRole="button" accessibilityLabel={t('common.previous')} onPress={goToPrev} disabled={currentIndex === 0} hitSlop={20} style={[styles.navBtn, { borderColor: colors.border }]}>
                    <Ionicons
                        name="play-skip-back"
                        size={24}
                        color={currentIndex === 0 ? colors.textTertiary : colors.textSecondary}
                    />
                </Pressable>

                <View style={styles.playBtnWrapper}>
                    <TimerRing
                        isPlaying={isPlaying}
                        totalDuration={1500 + delayMs}
                        resetKey={ringResetKey}
                        size={72}
                        strokeWidth={4}
                        color={colors.primary}
                        bgColor={colors.surfaceSecondary}
                    >
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t(isPlaying ? 'autoplay.pause' : 'autoplay.play')}
                            onPress={togglePlayPause}
                            style={[styles.playPauseBtn, { backgroundColor: colors.primaryButton, shadowColor: colors.shadow }]}
                            hitSlop={12}
                        >
                            <Ionicons
                                name={isPlaying ? "pause" : "play"}
                                size={32}
                                color={colors.onPrimary}
                                style={{ marginLeft: isPlaying ? 0 : 2 }}
                            />
                        </Pressable>
                    </TimerRing>
                    <Text style={[styles.delayLabel, { color: colors.textTertiary }]}>
                        {t('autoplay.nextAfterDelay', { delay: settings.delay || '2s' })}
                    </Text>
                </View>

                <Pressable accessibilityRole="button" accessibilityLabel={t('common.next')} onPress={goToNext} disabled={currentIndex === words.length - 1} hitSlop={20} style={[styles.navBtn, { borderColor: colors.border }]}>
                    <Ionicons
                        name="play-skip-forward"
                        size={24}
                        color={currentIndex === words.length - 1 ? colors.textTertiary : colors.textSecondary}
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

            <AppBannerAd mode="bottom-anchor" />
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
        paddingBottom: 8,
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
        minWidth: 70,
        textAlign: 'right',
    },
    cardContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24, // 플래시카드와 동일하게 (24px)
        paddingTop: 16,
    },
    card: {
        width: '100%',
        minHeight: 400, // 자동재생 모드 카드
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
        width: '100%',
        alignItems: 'center',
        paddingHorizontal: 12,
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
        position: 'relative',
    },
    playBtnWrapper: {
        alignItems: 'center',
        gap: 6,
    },
    playPauseBtn: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 6,
    },
    delayLabel: {
        fontSize: 11,
        fontFamily: 'Pretendard_500Medium',
    },
    navBtn: {
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
    },
    exampleBox: {
        width: '100%',
        padding: 20,
        borderRadius: 12,
        marginTop: 12,
    },
    exampleText: {
        fontSize: 17,
        fontFamily: 'Pretendard_400Regular',
        lineHeight: 27,
        textAlign: 'center',
        fontStyle: 'italic',
    },
    exampleKrText: {
        fontSize: 15,
        fontFamily: 'Pretendard_400Regular',
        lineHeight: 23,
        marginTop: 10,
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
        top: 20,
        padding: 8,
        zIndex: 10,
    },
    tapHintText: {
        fontSize: 13,
        fontFamily: 'Pretendard_500Medium',
        marginTop: 16,
        letterSpacing: 0.3,
        textAlign: 'center',
    },
    backWordText: {
        fontSize: 22,
        fontFamily: 'Pretendard_600SemiBold',
        textAlign: 'center',
        marginBottom: 16,
        opacity: 0.6,
    },
    completionContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    completionCard: {
        width: '100%',
        borderRadius: 16,
        padding: 40,
        alignItems: 'center',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 1,
        shadowRadius: 20,
        elevation: 12,
    },
    completionIconCircle: {
        width: 88,
        height: 88,
        borderRadius: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    completionTitle: {
        fontSize: 32,
        fontFamily: 'Pretendard_700Bold',
        marginBottom: 8,
    },
    completionStat: {
        fontSize: 16,
        fontFamily: 'Pretendard_500Medium',
        marginBottom: 32,
    },
    completionButtons: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    completionBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    completionBtnText: {
        fontSize: 15,
        fontFamily: 'Pretendard_600SemiBold',
    },
});
