import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import ModalOverlay from '@/components/ui/ModalOverlay';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, withTiming, interpolateColor } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';

const CustomToggle = ({ value, onValueChange, activeColor }: { value: boolean, onValueChange: (v: boolean) => void, activeColor?: string }) => {
    const { colors } = useTheme();
    const trackActiveColor = activeColor ?? colors.accentAction;

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: withTiming(value ? 14 : 0, { duration: 200 }) }],
        };
    });

    const trackStyle = useAnimatedStyle(() => {
        return {
            backgroundColor: withTiming(value ? trackActiveColor : colors.surfaceSecondary, { duration: 200 }),
        };
    });

    return (
        <Pressable onPress={() => onValueChange(!value)} style={{ padding: 4 }}>
            <Animated.View style={[{
                width: 30,
                height: 16,
                borderRadius: 8,
                justifyContent: 'center',
                paddingHorizontal: 2,
            }, trackStyle]}>
                <Animated.View style={[{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: colors.onPrimary,
                    shadowColor: colors.shadow,
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 1,
                    elevation: 1,
                }, animatedStyle]} />
            </Animated.View>
        </Pressable>
    );
};

export interface StudySettings {
    filter: 'all' | 'learning' | 'memorized';
    isStarred: boolean;
    // Flashcard specific
    shuffle?: boolean;
    autoPlaySound?: boolean;
    showMeaning?: boolean;
    showPos?: boolean;
    showPhonetic?: boolean;
    showExample?: boolean;
    showExampleKr?: boolean;
    // Quiz specific
    quizType?: 'meaning-to-term' | 'term-to-meaning';
    // Examples specific
    showTerm?: boolean;
    // Autoplay specific
    delay?: '1s' | '2s' | '3s';
    autoPlayExample?: boolean;
}

interface StudySettingsModalProps {
    visible: boolean;
    mode: 'flashcard' | 'quiz' | 'examples' | 'autoplay';
    initialSettings: StudySettings;
    initialBatchSize: number | 'all';
    onClose: () => void;
    onApply: (settings: StudySettings, batchSize: number | 'all') => void;
    hideTargetFilter?: boolean;
}

export default function StudySettingsModal({
    visible,
    mode,
    initialSettings,
    initialBatchSize,
    onClose,
    onApply,
    hideTargetFilter = false,
}: StudySettingsModalProps) {
    const { colors, isDark } = useTheme();
    const { t } = useTranslation();
    const [tempSettings, setTempSettings] = useState<StudySettings>(initialSettings);
    const [tempBatchSize, setTempBatchSize] = useState<number | 'all'>(initialBatchSize);

    useEffect(() => {
        if (visible) {
            setTempSettings(initialSettings);
            setTempBatchSize(initialBatchSize);
        }
    }, [visible, initialSettings, initialBatchSize]);

    const handleApply = () => {
        onApply(tempSettings, tempBatchSize);
        onClose();
    };

    const updateSetting = <K extends keyof StudySettings>(key: K, value: StudySettings[K]) => {
        setTempSettings((s) => ({ ...s, [key]: value }));
    };

    return (
        <ModalOverlay
            visible={visible}
            onClose={onClose}
            variant="settingsPanel"
            maxHeight="93%"
            scrollable
        >
                        <View style={styles.settingsHeader}>
                            <Text style={[styles.settingsTitle, { color: colors.text }]}>
                                {mode === 'flashcard' ? t('studySettings.flashcardsSettings') : mode === 'quiz' ? t('studySettings.quizSettings') : mode === 'examples' ? t('studySettings.examplesSettings') : t('studySettings.autoplaySettings')}
                            </Text>
                            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} hitSlop={8} style={styles.closeBtn}>
                                <Ionicons name="close" size={20} color={colors.textSecondary} />
                            </Pressable>
                        </View>

                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            style={styles.settingsScrollView}
                            contentContainerStyle={{ paddingBottom: 8 }}
                            scrollEventThrottle={16}
                            keyboardShouldPersistTaps="handled"
                        >
                            {/* 공통: 출제 대상 */}
                            {!hideTargetFilter && <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('studySettings.targetWords')}</Text>

                                <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceSecondary }]}>
                                    {(['all', 'learning', 'memorized'] as const).map(f => {
                                        const isActive = tempSettings.filter === f;
                                        return (
                                            <Pressable
                                                key={f}
                                                onPress={() => updateSetting('filter', f)}
                                                style={[
                                                    styles.segmentedTab,
                                                    isActive && [styles.segmentedTabActive, { backgroundColor: colors.surface, shadowColor: colors.shadow }]
                                                ]}
                                            >
                                                <Text style={[
                                                    isActive ? styles.segmentedTabTextActive : styles.segmentedTabText,
                                                    { color: isActive ? colors.accentAction : colors.textSecondary }
                                                ]}>
                                                    {f === 'all' ? t('studySettings.all') : f === 'learning' ? t('studySettings.unmemorized') : t('studySettings.memorized')}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>

                                <View style={styles.settingRow}>
                                    <View style={styles.settingRowContent}>
                                        <View style={styles.iconContainer}>
                                            <Ionicons name="star-outline" size={16} color={colors.accentAction} />
                                        </View>
                                        <Text style={[styles.settingLabel, { color: colors.text }]}>{t('studySettings.starredOnly')}</Text>
                                    </View>
                                    <CustomToggle
                                        value={tempSettings.isStarred}
                                        onValueChange={v => updateSetting('isStarred', v)}
                                    />
                                </View>

                                {/* 품사 표시는 플래시카드는 카드 뒷면에, 퀴즈는 여기에? 플래시카드/퀴즈 구조상 퀴즈는 공통 출제 대상 쪽에 있었음. 플래시카드처럼 퀴즈도 여기서 처리. */}
                                {mode === 'quiz' && (
                                    <>
                                        <View style={[styles.divider, { backgroundColor: colors.border }]} />
                                        <View style={styles.settingRow}>
                                            <View style={styles.settingRowContent}>
                                                <View style={styles.iconContainer}>
                                                    <Ionicons name="text-outline" size={16} color={colors.icons.memorization} />
                                                </View>
                                                <Text style={[styles.settingLabel, { color: colors.text }]}>{t('studySettings.showPos')}</Text>
                                            </View>
                                            <CustomToggle
                                                value={!!tempSettings.showPos}
                                                onValueChange={v => updateSetting('showPos', v)}
                                            />
                                        </View>
                                    </>
                                )}
                            </View>}

                            {/* 공통: 학습 단위 */}
                            <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('studySettings.studyUnit')}</Text>
                                <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceSecondary }]}>
                                    {['all', 10, 20, 30].map(size => {
                                        const isActive = tempBatchSize === size;
                                        return (
                                            <Pressable
                                                key={size}
                                                onPress={() => setTempBatchSize(size as 'all' | 10 | 20 | 30)}
                                                style={[
                                                    styles.segmentedTab,
                                                    isActive && [styles.segmentedTabActive, { backgroundColor: colors.surface, shadowColor: colors.shadow }]
                                                ]}
                                            >
                                                <Text style={[
                                                    isActive ? styles.segmentedTabTextActive : styles.segmentedTabText,
                                                    { color: isActive ? colors.accentAction : colors.textSecondary }
                                                ]}>
                                                    {size === 'all' ? t('studySettings.all') : t('studySettings.nPerSet', { size })}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </View>

                            {/* 플래시카드, 문장완성, 자동재생 공통: 학습 옵션 */}
                            {(mode === 'flashcard' || mode === 'examples' || mode === 'autoplay') && (
                                <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('studySettings.studyOptions')}</Text>
                                    <View style={styles.settingRow}>
                                        <View style={styles.settingRowContent}>
                                            <View style={styles.iconContainer}>
                                                <Ionicons name="shuffle-outline" size={16} color={colors.icons.shuffle} />
                                            </View>
                                            <Text style={[styles.settingLabel, { color: colors.text }]}>
                                                {mode === 'examples' ? t('studySettings.shuffleSentences') : t('studySettings.shuffleWords')}
                                            </Text>
                                        </View>
                                        <CustomToggle
                                            value={!!tempSettings.shuffle}
                                            onValueChange={v => updateSetting('shuffle', v)}
                                        />
                                    </View>

                                    <View style={[styles.divider, { backgroundColor: colors.border }]} />

                                    <View style={styles.settingRow}>
                                        <View style={styles.settingRowContent}>
                                            <View style={styles.iconContainer}>
                                                <Ionicons name="volume-high-outline" size={16} color={colors.icons.sound} />
                                            </View>
                                            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('studySettings.autoSound')}</Text>
                                        </View>
                                        <CustomToggle
                                            value={!!tempSettings.autoPlaySound}
                                            onValueChange={v => updateSetting('autoPlaySound', v)}
                                        />
                                    </View>

                                    {mode === 'autoplay' && tempSettings.autoPlaySound && (
                                        <>
                                            <View style={[styles.divider, { backgroundColor: colors.border }]} />
                                            <View style={styles.settingRow}>
                                                <View style={styles.settingRowContent}>
                                                    <View style={styles.iconContainer}>
                                                        <Ionicons name="volume-low-outline" size={16} color={colors.icons.sound} />
                                                    </View>
                                                    <Text style={[styles.settingLabel, { color: colors.text }]}>{t('studySettings.autoSoundExample')}</Text>
                                                </View>
                                                <CustomToggle
                                                    value={!!tempSettings.autoPlayExample}
                                                    onValueChange={v => updateSetting('autoPlayExample', v)}
                                                />
                                            </View>
                                        </>
                                    )}

                                    {mode === 'autoplay' && (
                                        <>
                                            <View style={[styles.divider, { backgroundColor: colors.border }]} />
                                            <View style={styles.settingRow}>
                                                <View style={styles.settingRowContent}>
                                                    <View style={styles.iconContainer}>
                                                        <Ionicons name="time-outline" size={16} color={colors.icons.timing} />
                                                    </View>
                                                    <Text style={[styles.settingLabel, { color: colors.text }]}>{t('studySettings.nextDelay')}</Text>
                                                </View>
                                                <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceSecondary, flex: 1, marginLeft: 16 }]}>
                                                    {(['1s', '2s', '3s'] as const).map(d => {
                                                        const isActive = tempSettings.delay === d;
                                                        return (
                                                            <Pressable
                                                                key={d}
                                                                onPress={() => updateSetting('delay', d)}
                                                                style={[
                                                                    styles.segmentedTab,
                                                                    isActive && [styles.segmentedTabActive, { backgroundColor: colors.surface, shadowColor: colors.shadow }]
                                                                ]}
                                                            >
                                                                <Text style={[
                                                                    isActive ? styles.segmentedTabTextActive : styles.segmentedTabText,
                                                                    { color: isActive ? colors.accentAction : colors.textSecondary }
                                                                ]}>
                                                                    {d}
                                                                </Text>
                                                            </Pressable>
                                                        );
                                                    })}
                                                </View>
                                            </View>
                                        </>
                                    )}
                                </View>
                            )}

                            {/* 플래시카드 및 자동재생 공통: 카드 뒷면 표시 */}
                            {(mode === 'flashcard' || mode === 'autoplay') && (
                                <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('studySettings.displaySettings')}</Text>



                                    <View style={styles.settingRow}>
                                        <View style={styles.settingRowContent}>
                                            <View style={styles.iconContainer}>
                                                <Ionicons name="text-outline" size={16} color={colors.icons.memorization} />
                                            </View>
                                            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('studySettings.pos')}</Text>
                                        </View>
                                        <CustomToggle
                                            value={!!tempSettings.showPos}
                                            onValueChange={v => updateSetting('showPos', v)}
                                        />
                                    </View>

                                    {(mode === 'flashcard' || mode === 'autoplay') && (
                                        <>
                                            <View style={[styles.divider, { backgroundColor: colors.border }]} />
                                            <View style={styles.settingRow}>
                                                <View style={styles.settingRowContent}>
                                                    <View style={styles.iconContainer}>
                                                        <Ionicons name="headset-outline" size={16} color={colors.icons.timing} />
                                                    </View>
                                                    <Text style={[styles.settingLabel, { color: colors.text }]}>{t('studySettings.phonetic')}</Text>
                                                </View>
                                                <CustomToggle
                                                    value={!!tempSettings.showPhonetic}
                                                    onValueChange={v => updateSetting('showPhonetic', v)}
                                                />
                                            </View>
                                        </>
                                    )}

                                    <View style={[styles.divider, { backgroundColor: colors.border }]} />

                                    <View style={styles.settingRow}>
                                        <View style={styles.settingRowContent}>
                                            <View style={styles.iconContainer}>
                                                <Ionicons name="chatbubble-outline" size={16} color={colors.icons.chat} />
                                            </View>
                                            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('studySettings.example')}</Text>
                                        </View>
                                        <CustomToggle
                                            value={!!tempSettings.showExample}
                                            onValueChange={v => updateSetting('showExample', v)}
                                        />
                                    </View>

                                    <View style={[styles.divider, { backgroundColor: colors.border }]} />

                                    <View style={styles.settingRow}>
                                        <View style={styles.settingRowContent}>
                                            <View style={styles.iconContainer}>
                                                <Ionicons name="language-outline" size={16} color={colors.icons.language} />
                                            </View>
                                            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('studySettings.exampleTranslation')}</Text>
                                        </View>
                                        <CustomToggle
                                            value={!!tempSettings.showExampleKr}
                                            onValueChange={v => updateSetting('showExampleKr', v)}
                                        />
                                    </View>
                                </View>
                            )}

                            {/* 문장완성 전용: 표시 설정 */}
                            {mode === 'examples' && (
                                <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('studySettings.displaySettings')}</Text>

                                    <View style={styles.settingRow}>
                                        <View style={styles.settingRowContent}>
                                            <View style={styles.iconContainer}>
                                                <Ionicons name="language-outline" size={16} color={colors.icons.timing} />
                                            </View>
                                            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('studySettings.exampleTranslation')}</Text>
                                        </View>
                                        <CustomToggle
                                            value={!!tempSettings.showExampleKr}
                                            onValueChange={v => updateSetting('showExampleKr', v)}
                                        />
                                    </View>
                                </View>
                            )}

                            {/* 퀴즈 전용: 문제 옵션 */}
                            {mode === 'quiz' && (
                                <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('studySettings.questionOptions')}</Text>

                                    <View style={styles.settingRow}>
                                        <View style={styles.settingRowContent}>
                                            <View style={styles.iconContainer}>
                                                <Ionicons name="swap-horizontal-outline" size={16} color={colors.icons.shuffle} />
                                            </View>
                                            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('studySettings.quizType')}</Text>
                                        </View>
                                        <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceSecondary, flex: 1, marginLeft: 16 }]}>
                                            <Pressable
                                                onPress={() => updateSetting('quizType', 'meaning-to-term')}
                                                style={[
                                                    styles.segmentedTab,
                                                    tempSettings.quizType === 'meaning-to-term' && [styles.segmentedTabActive, { backgroundColor: colors.surface }]
                                                ]}
                                            >
                                                <Text style={[
                                                    tempSettings.quizType === 'meaning-to-term' ? styles.segmentedTabTextActive : styles.segmentedTabText,
                                                    { color: tempSettings.quizType === 'meaning-to-term' ? colors.accentAction : colors.textSecondary }
                                                ]}>{t('studySettings.meaningToWord')}</Text>
                                            </Pressable>
                                            <Pressable
                                                onPress={() => updateSetting('quizType', 'term-to-meaning')}
                                                style={[
                                                    styles.segmentedTab,
                                                    tempSettings.quizType === 'term-to-meaning' && [styles.segmentedTabActive, { backgroundColor: colors.surface }]
                                                ]}
                                            >
                                                <Text style={[
                                                    tempSettings.quizType === 'term-to-meaning' ? styles.segmentedTabTextActive : styles.segmentedTabText,
                                                    { color: tempSettings.quizType === 'term-to-meaning' ? colors.accentAction : colors.textSecondary }
                                                ]}>{t('studySettings.wordToMeaning')}</Text>
                                            </Pressable>
                                        </View>
                                    </View>
                                </View>
                            )}

                        </ScrollView>

                        <View style={styles.bottomButtons}>
                            {/* 🔴 [닫기]에는 **면을 칠하지 않는다.** 이 버튼만 섹션 카드 밖(모달 배경
                                위)에 놓이는데, 모달 배경과 대비되는 면 토큰이 다섯 테마 전부를 만족시키지
                                못한다 — surfaceSecondary 는 라이트 네 테마에서 surfaceModal 과 같고
                                (lab·y2k 는 1.00), surface 는 다크에서 surfaceModal 과 **같은 값**이다.
                                어느 쪽을 칠해도 한 테마가 배신한다. 반면 테두리는 1.22~1.76 으로 전부
                                넘기므로, 형태는 테두리에 맡기고 면은 비운다(시트의 부차 버튼과 같은 방향). */}
                            <Pressable
                                style={[styles.btnCancel, { backgroundColor: 'transparent', borderColor: colors.border }]}
                                onPress={onClose}
                            >
                                <Text style={[styles.btnCancelText, { color: colors.textSecondary }]}>{t('common.close')}</Text>
                            </Pressable>

                            <Pressable
                                style={[styles.btnApply, { backgroundColor: colors.primaryButton }]}
                                onPress={handleApply}
                            >
                                <Text style={[styles.btnApplyText, { color: colors.onPrimary }]}>{t('common.apply')}</Text>
                            </Pressable>
                        </View>
        </ModalOverlay>
    );
}

const styles = StyleSheet.create({
    settingsSheet: {
        paddingTop: 6,
        display: 'flex',
        flexDirection: 'column',
    },
    settingsScrollView: {
        flexShrink: 1,
        flexGrow: 0,
    },
    settingsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        height: 48,
    },
    settingsTitle: {
        fontSize: 15,
        fontFamily: 'Pretendard_700Bold',
    },
    closeBtn: {
        padding: 6,
        marginRight: -6,
        backgroundColor: 'rgba(150,150,150,0.1)',
        borderRadius: 20,
    },
    settingsCard: {
        marginHorizontal: 12,
        marginBottom: 8,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 5,
        // 🔴 면만으로는 다크에서 카드가 사라진다 — surface 와 surfaceModal(모달 배경)이
        //    다크에서 **같은 값**(#281E18)이라 대비가 정확히 1.00 이다. 라이트 넷은
        //    1.10~1.25 로 면이 제 역할을 하지만 다크만 배신한다.
        //    같은 모달의 [닫기] 가 이미 같은 뿌리로 두 번 고쳐졌다(443558f → 1fbf2cd):
        //    **어느 면을 칠해도 한 테마가 배신하므로 테두리로 세운다.**
        //    테두리/모달배경 대비는 다섯 테마에서 1.22~1.76 으로 하나도 빠지지 않는다.
        borderWidth: StyleSheet.hairlineWidth,
    },
    sectionTitle: {
        fontSize: 10,
        fontFamily: 'Pretendard_600SemiBold',
        marginBottom: 4,
        marginLeft: 2,
    },
    segmentedControl: {
        flexDirection: 'row',
        borderRadius: 8,
        padding: 2,
    },
    segmentedTab: {
        flex: 1,
        paddingVertical: 6,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
    },
    segmentedTabActive: {
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    // 탭이 flex:1로 폭이 갈리므로 라벨이 긴 언어에서는 두 줄로 감긴다.
    // 컨테이너의 alignItems만으로는 감긴 줄이 왼쪽에 붙는다 — textAlign이 있어야 가운데로 모인다.
    segmentedTabText: {
        fontSize: 13,
        fontFamily: 'Pretendard_500Medium',
        textAlign: 'center',
    },
    segmentedTabTextActive: {
        fontSize: 13,
        fontFamily: 'Pretendard_600SemiBold',
        textAlign: 'center',
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        minHeight: 34,
    },
    settingRowContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    iconContainer: {
        width: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    settingLabel: {
        fontSize: 13,
        fontFamily: 'Pretendard_500Medium',
    },
    divider: {
        height: 1,
        marginVertical: 0,
    },
    bottomButtons: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 14,
        gap: 8,
    },
    btnCancel: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
    },
    btnCancelText: {
        fontSize: 14,
        fontFamily: 'Pretendard_600SemiBold',
    },
    btnApply: {
        flex: 1,
        backgroundColor: undefined,
        paddingVertical: 8,
        borderRadius: 8,
        alignItems: 'center',
    },
    btnApplyText: {
        fontSize: 14,
        fontFamily: 'Pretendard_600SemiBold',
    },
});
