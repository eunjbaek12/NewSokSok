import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Platform, StyleSheet, Modal, Switch, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';

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
}

interface StudySettingsModalProps {
    visible: boolean;
    mode: 'flashcard' | 'quiz' | 'examples';
    initialSettings: StudySettings;
    initialBatchSize: number | 'all';
    onClose: () => void;
    onApply: (settings: StudySettings, batchSize: number | 'all') => void;
}

export default function StudySettingsModal({
    visible,
    mode,
    initialSettings,
    initialBatchSize,
    onClose,
    onApply,
}: StudySettingsModalProps) {
    const { colors, isDark } = useTheme();
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
    };

    const updateSetting = <K extends keyof StudySettings>(key: K, value: StudySettings[K]) => {
        setTempSettings((s) => ({ ...s, [key]: value }));
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.modalOverlay} onPress={onClose}>
                <Pressable style={[styles.settingsSheet, { backgroundColor: isDark ? colors.background : '#F3F4F6' }]} onPress={e => e.stopPropagation()}>
                    <View style={styles.settingsHeader}>
                        <Text style={[styles.settingsTitle, { color: colors.text }]}>
                            {mode === 'flashcard' ? '플래시카드 설정' : mode === 'quiz' ? '퀴즈 설정' : '문장완성 설정'}
                        </Text>
                        <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
                            <Ionicons name="close" size={20} color={colors.textSecondary} />
                        </Pressable>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                        {/* 공통: 출제 대상 */}
                        <View style={[styles.settingsCard, { backgroundColor: isDark ? colors.surface : '#FFF' }]}>
                            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>출제 대상</Text>

                            <View style={[styles.segmentedControl, { backgroundColor: isDark ? colors.surfaceSecondary : '#F3F4F6' }]}>
                                {(['all', 'learning', 'memorized'] as const).map(f => {
                                    const isActive = tempSettings.filter === f;
                                    return (
                                        <Pressable
                                            key={f}
                                            onPress={() => updateSetting('filter', f)}
                                            style={[
                                                styles.segmentedTab,
                                                isActive && [styles.segmentedTabActive, { backgroundColor: isDark ? colors.surface : '#FFF' }]
                                            ]}
                                        >
                                            <Text style={[
                                                isActive ? styles.segmentedTabTextActive : styles.segmentedTabText,
                                                { color: isActive ? '#4A7DFF' : colors.textSecondary }
                                            ]}>
                                                {f === 'all' ? '전체' : f === 'learning' ? '미암기' : '암기'}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            <View style={[styles.divider, { backgroundColor: isDark ? colors.border : '#F3F4F6' }]} />

                            <View style={styles.settingRow}>
                                <View style={styles.settingRowContent}>
                                    <View style={[styles.iconContainer, { backgroundColor: isDark ? '#1E2A4F' : '#EAF0FF' }]}>
                                        <Ionicons name="star-outline" size={16} color="#4A7DFF" />
                                    </View>
                                    <Text style={[styles.settingLabel, { color: colors.text }]}>즐겨찾기만 보기</Text>
                                </View>
                                <Switch
                                    value={tempSettings.isStarred}
                                    onValueChange={v => updateSetting('isStarred', v)}
                                    trackColor={{ true: '#4A7DFF', false: isDark ? colors.border : '#E5E7EB' }}
                                    thumbColor="#FFF"
                                />
                            </View>

                            {/* 품사 표시는 플래시카드는 카드 뒷면에, 퀴즈는 여기에? 플래시카드/퀴즈 구조상 퀴즈는 공통 출제 대상 쪽에 있었음. 플래시카드처럼 퀴즈도 여기서 처리. */}
                            {mode === 'quiz' && (
                                <>
                                    <View style={[styles.divider, { backgroundColor: isDark ? colors.border : '#F3F4F6' }]} />
                                    <View style={styles.settingRow}>
                                        <View style={styles.settingRowContent}>
                                            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#1C3325' : '#E8F8E8' }]}>
                                                <Ionicons name="text-outline" size={16} color="#10B981" />
                                            </View>
                                            <Text style={[styles.settingLabel, { color: colors.text }]}>품사 표시</Text>
                                        </View>
                                        <Switch
                                            value={!!tempSettings.showPos}
                                            onValueChange={v => updateSetting('showPos', v)}
                                            trackColor={{ true: '#4A7DFF', false: isDark ? colors.border : '#E5E7EB' }}
                                            thumbColor="#FFF"
                                        />
                                    </View>
                                </>
                            )}
                        </View>

                        {/* 공통: 학습 단위 */}
                        <View style={[styles.settingsCard, { backgroundColor: isDark ? colors.surface : '#FFF' }]}>
                            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>학습 단위</Text>
                            <View style={[styles.segmentedControl, { backgroundColor: isDark ? colors.surfaceSecondary : '#F3F4F6' }]}>
                                {['all', 10, 20, 30].map(size => {
                                    const isActive = tempBatchSize === size;
                                    return (
                                        <Pressable
                                            key={size}
                                            onPress={() => setTempBatchSize(size as 'all' | 10 | 20 | 30)}
                                            style={[
                                                styles.segmentedTab,
                                                isActive && [styles.segmentedTabActive, { backgroundColor: isDark ? colors.surface : '#FFF' }]
                                            ]}
                                        >
                                            <Text style={[
                                                isActive ? styles.segmentedTabTextActive : styles.segmentedTabText,
                                                { color: isActive ? '#4A7DFF' : colors.textSecondary }
                                            ]}>
                                                {size === 'all' ? '전체' : `${size}개`}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </View>

                        {/* 플래시카드 및 문장완성 공통: 학습 옵션 */}
                        {(mode === 'flashcard' || mode === 'examples') && (
                            <View style={[styles.settingsCard, { backgroundColor: isDark ? colors.surface : '#FFF' }]}>
                                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>학습 옵션</Text>

                                <View style={styles.settingRow}>
                                    <View style={styles.settingRowContent}>
                                        <View style={[styles.iconContainer, { backgroundColor: isDark ? '#2D1E40' : '#F3E8FF' }]}>
                                            <Ionicons name="shuffle-outline" size={16} color="#9333EA" />
                                        </View>
                                        <Text style={[styles.settingLabel, { color: colors.text }]}>
                                            {mode === 'examples' ? '문장 섞기 (Shuffle)' : '단어 섞기 (Shuffle)'}
                                        </Text>
                                    </View>
                                    <Switch
                                        value={!!tempSettings.shuffle}
                                        onValueChange={v => updateSetting('shuffle', v)}
                                        trackColor={{ true: '#4A7DFF', false: isDark ? colors.border : '#E5E7EB' }}
                                        thumbColor="#FFF"
                                    />
                                </View>

                                <View style={[styles.divider, { backgroundColor: isDark ? colors.border : '#F3F4F6' }]} />

                                <View style={styles.settingRow}>
                                    <View style={styles.settingRowContent}>
                                        <View style={[styles.iconContainer, { backgroundColor: isDark ? '#402422' : '#FFEBE5' }]}>
                                            <Ionicons name="volume-high-outline" size={16} color="#FF5722" />
                                        </View>
                                        <Text style={[styles.settingLabel, { color: colors.text }]}>자동 음성 재생</Text>
                                    </View>
                                    <Switch
                                        value={!!tempSettings.autoPlaySound}
                                        onValueChange={v => updateSetting('autoPlaySound', v)}
                                        trackColor={{ true: '#4A7DFF', false: isDark ? colors.border : '#E5E7EB' }}
                                        thumbColor="#FFF"
                                    />
                                </View>
                            </View>
                        )}

                        {/* 플래시카드 전용: 카드 뒷면 표시 */}
                        {mode === 'flashcard' && (
                            <View style={[styles.settingsCard, { backgroundColor: isDark ? colors.surface : '#FFF' }]}>
                                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>카드 뒷면 표시</Text>

                                <View style={styles.settingRow}>
                                    <View style={styles.settingRowContent}>
                                        <View style={[styles.iconContainer, { backgroundColor: isDark ? '#1E2A4F' : '#EAF0FF' }]}>
                                            <Ionicons name="eye-outline" size={16} color="#4A7DFF" />
                                        </View>
                                        <Text style={[styles.settingLabel, { color: colors.text }]}>뜻 표시</Text>
                                    </View>
                                    <Switch
                                        value={!!tempSettings.showMeaning}
                                        onValueChange={v => updateSetting('showMeaning', v)}
                                        trackColor={{ true: '#4A7DFF', false: isDark ? colors.border : '#E5E7EB' }}
                                        thumbColor="#FFF"
                                    />
                                </View>

                                <View style={[styles.divider, { backgroundColor: isDark ? colors.border : '#F3F4F6' }]} />

                                <View style={styles.settingRow}>
                                    <View style={styles.settingRowContent}>
                                        <View style={[styles.iconContainer, { backgroundColor: isDark ? '#1C3325' : '#E8F8E8' }]}>
                                            <Ionicons name="text-outline" size={16} color="#10B981" />
                                        </View>
                                        <Text style={[styles.settingLabel, { color: colors.text }]}>품사 표시</Text>
                                    </View>
                                    <Switch
                                        value={!!tempSettings.showPos}
                                        onValueChange={v => updateSetting('showPos', v)}
                                        trackColor={{ true: '#4A7DFF', false: isDark ? colors.border : '#E5E7EB' }}
                                        thumbColor="#FFF"
                                    />
                                </View>

                                <View style={[styles.divider, { backgroundColor: isDark ? colors.border : '#F3F4F6' }]} />

                                <View style={styles.settingRow}>
                                    <View style={styles.settingRowContent}>
                                        <View style={[styles.iconContainer, { backgroundColor: isDark ? '#3D2817' : '#FFF3E0' }]}>
                                            <Ionicons name="headset-outline" size={16} color="#F59E0B" />
                                        </View>
                                        <Text style={[styles.settingLabel, { color: colors.text }]}>발음기호 표시</Text>
                                    </View>
                                    <Switch
                                        value={!!tempSettings.showPhonetic}
                                        onValueChange={v => updateSetting('showPhonetic', v)}
                                        trackColor={{ true: '#4A7DFF', false: isDark ? colors.border : '#E5E7EB' }}
                                        thumbColor="#FFF"
                                    />
                                </View>

                                <View style={[styles.divider, { backgroundColor: isDark ? colors.border : '#F3F4F6' }]} />

                                <View style={styles.settingRow}>
                                    <View style={styles.settingRowContent}>
                                        <View style={[styles.iconContainer, { backgroundColor: isDark ? '#3D1C2A' : '#FFE8F3' }]}>
                                            <Ionicons name="chatbubble-outline" size={16} color="#EC4899" />
                                        </View>
                                        <Text style={[styles.settingLabel, { color: colors.text }]}>예문 표시</Text>
                                    </View>
                                    <Switch
                                        value={!!tempSettings.showExample}
                                        onValueChange={v => updateSetting('showExample', v)}
                                        trackColor={{ true: '#4A7DFF', false: isDark ? colors.border : '#E5E7EB' }}
                                        thumbColor="#FFF"
                                    />
                                </View>

                                <View style={[styles.divider, { backgroundColor: isDark ? colors.border : '#F3F4F6' }]} />

                                <View style={styles.settingRow}>
                                    <View style={styles.settingRowContent}>
                                        <View style={[styles.iconContainer, { backgroundColor: isDark ? '#173130' : '#E0F7F6' }]}>
                                            <Ionicons name="language-outline" size={16} color="#14B8A6" />
                                        </View>
                                        <Text style={[styles.settingLabel, { color: colors.text }]}>예문 해석 표시</Text>
                                    </View>
                                    <Switch
                                        value={!!tempSettings.showExampleKr}
                                        onValueChange={v => updateSetting('showExampleKr', v)}
                                        trackColor={{ true: '#4A7DFF', false: isDark ? colors.border : '#E5E7EB' }}
                                        thumbColor="#FFF"
                                    />
                                </View>
                            </View>
                        )}

                        {/* 문장완성 전용: 표시 설정 */}
                        {mode === 'examples' && (
                            <View style={[styles.settingsCard, { backgroundColor: isDark ? colors.surface : '#FFF' }]}>
                                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>힌트 표시</Text>

                                <View style={styles.settingRow}>
                                    <View style={styles.settingRowContent}>
                                        <View style={[styles.iconContainer, { backgroundColor: isDark ? '#1E2A4F' : '#EAF0FF' }]}>
                                            <Ionicons name="text-outline" size={16} color="#4A7DFF" />
                                        </View>
                                        <Text style={[styles.settingLabel, { color: colors.text }]}>영단어 표시</Text>
                                    </View>
                                    <Switch
                                        value={!!tempSettings.showTerm}
                                        onValueChange={v => updateSetting('showTerm', v)}
                                        trackColor={{ true: '#4A7DFF', false: isDark ? colors.border : '#E5E7EB' }}
                                        thumbColor="#FFF"
                                    />
                                </View>

                                <View style={[styles.divider, { backgroundColor: isDark ? colors.border : '#F3F4F6' }]} />

                                <View style={styles.settingRow}>
                                    <View style={styles.settingRowContent}>
                                        <View style={[styles.iconContainer, { backgroundColor: isDark ? '#1C3325' : '#E8F8E8' }]}>
                                            <Ionicons name="eye-outline" size={16} color="#10B981" />
                                        </View>
                                        <Text style={[styles.settingLabel, { color: colors.text }]}>한글 뜻 표시</Text>
                                    </View>
                                    <Switch
                                        value={!!tempSettings.showMeaning}
                                        onValueChange={v => updateSetting('showMeaning', v)}
                                        trackColor={{ true: '#4A7DFF', false: isDark ? colors.border : '#E5E7EB' }}
                                        thumbColor="#FFF"
                                    />
                                </View>

                                <View style={[styles.divider, { backgroundColor: isDark ? colors.border : '#F3F4F6' }]} />

                                <View style={styles.settingRow}>
                                    <View style={styles.settingRowContent}>
                                        <View style={[styles.iconContainer, { backgroundColor: isDark ? '#3D2817' : '#FFF3E0' }]}>
                                            <Ionicons name="language-outline" size={16} color="#F59E0B" />
                                        </View>
                                        <Text style={[styles.settingLabel, { color: colors.text }]}>예문 해석 표시</Text>
                                    </View>
                                    <Switch
                                        value={!!tempSettings.showExampleKr}
                                        onValueChange={v => updateSetting('showExampleKr', v)}
                                        trackColor={{ true: '#4A7DFF', false: isDark ? colors.border : '#E5E7EB' }}
                                        thumbColor="#FFF"
                                    />
                                </View>
                            </View>
                        )}

                        {/* 퀴즈 전용: 문제 옵션 */}
                        {mode === 'quiz' && (
                            <View style={[styles.settingsCard, { backgroundColor: isDark ? colors.surface : '#FFF' }]}>
                                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>문제 옵션</Text>

                                <View style={styles.settingRow}>
                                    <View style={styles.settingRowContent}>
                                        <View style={[styles.iconContainer, { backgroundColor: isDark ? '#2D1E40' : '#F3E8FF' }]}>
                                            <Ionicons name="swap-horizontal-outline" size={16} color="#9333EA" />
                                        </View>
                                        <Text style={[styles.settingLabel, { color: colors.text }]}>퀴즈 유형</Text>
                                    </View>
                                    <View style={[styles.segmentedControl, { backgroundColor: isDark ? colors.surfaceSecondary : '#F3F4F6', flex: 1, marginLeft: 16 }]}>
                                        <Pressable
                                            onPress={() => updateSetting('quizType', 'meaning-to-term')}
                                            style={[
                                                styles.segmentedTab,
                                                tempSettings.quizType === 'meaning-to-term' && [styles.segmentedTabActive, { backgroundColor: isDark ? colors.surface : '#FFF' }]
                                            ]}
                                        >
                                            <Text style={[
                                                tempSettings.quizType === 'meaning-to-term' ? styles.segmentedTabTextActive : styles.segmentedTabText,
                                                { color: tempSettings.quizType === 'meaning-to-term' ? '#4A7DFF' : colors.textSecondary }
                                            ]}>뜻 → 단어</Text>
                                        </Pressable>
                                        <Pressable
                                            onPress={() => updateSetting('quizType', 'term-to-meaning')}
                                            style={[
                                                styles.segmentedTab,
                                                tempSettings.quizType === 'term-to-meaning' && [styles.segmentedTabActive, { backgroundColor: isDark ? colors.surface : '#FFF' }]
                                            ]}
                                        >
                                            <Text style={[
                                                tempSettings.quizType === 'term-to-meaning' ? styles.segmentedTabTextActive : styles.segmentedTabText,
                                                { color: tempSettings.quizType === 'term-to-meaning' ? '#4A7DFF' : colors.textSecondary }
                                            ]}>단어 → 뜻</Text>
                                        </Pressable>
                                    </View>
                                </View>
                            </View>
                        )}

                    </ScrollView>

                    <View style={styles.bottomButtons}>
                        <Pressable
                            style={[styles.btnCancel, { backgroundColor: isDark ? colors.surfaceSecondary : '#E5E7EB' }]}
                            onPress={onClose}
                        >
                            <Text style={[styles.btnCancelText, { color: isDark ? colors.textSecondary : '#4B5563' }]}>취소</Text>
                        </Pressable>

                        <Pressable
                            style={styles.btnApply}
                            onPress={handleApply}
                        >
                            <Text style={styles.btnApplyText}>적용</Text>
                        </Pressable>
                    </View>

                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    settingsSheet: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 24,
        maxHeight: '93%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
        overflow: 'hidden',
        paddingTop: 8,
    },
    settingsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
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
        marginHorizontal: 10,
        marginBottom: 6,
        borderRadius: 12,
        padding: 8,
    },
    sectionTitle: {
        fontSize: 11,
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
        paddingVertical: 4,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
    },
    segmentedTabActive: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    segmentedTabText: {
        fontSize: 13,
        fontFamily: 'Pretendard_500Medium',
    },
    segmentedTabTextActive: {
        fontSize: 13,
        fontFamily: 'Pretendard_600SemiBold',
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 0,
    },
    settingRowContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    iconContainer: {
        width: 20,
        height: 20,
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    settingLabel: {
        fontSize: 13,
        fontFamily: 'Pretendard_500Medium',
    },
    divider: {
        height: 1,
        marginVertical: 4,
    },
    bottomButtons: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 6,
        borderTopWidth: 1,
        borderTopColor: 'rgba(150,150,150,0.1)',
    },
    btnCancel: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 8,
        alignItems: 'center',
    },
    btnCancelText: {
        fontSize: 14,
        fontFamily: 'Pretendard_600SemiBold',
    },
    btnApply: {
        flex: 1,
        backgroundColor: '#4A7DFF',
        paddingVertical: 8,
        borderRadius: 8,
        alignItems: 'center',
    },
    btnApplyText: {
        color: '#FFF',
        fontSize: 14,
        fontFamily: 'Pretendard_600SemiBold',
    },
});
