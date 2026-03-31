import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    withDelay,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import * as Haptics from 'expo-haptics';

interface BatchResultOverlayProps {
    visible: boolean;
    completedCount: number;
    totalCount: number;
    isLastBatch: boolean;
    onNextBatch: () => void;
    onRetryBatch: () => void;
    onFinish: () => void;
}

export default function BatchResultOverlay({
    visible,
    completedCount,
    totalCount,
    isLastBatch,
    onNextBatch,
    onRetryBatch,
    onFinish,
}: BatchResultOverlayProps) {
    const { colors, isDark } = useTheme();
    const { t } = useTranslation();

    const scale = useSharedValue(0.8);
    const opacity = useSharedValue(0);
    const pbWidth = useSharedValue(0);

    useEffect(() => {
        if (visible) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            scale.value = withSpring(1, { damping: 15, stiffness: 150 });
            opacity.value = withTiming(1, { duration: 300 });
            pbWidth.value = withDelay(
                200,
                withTiming(completedCount / totalCount, { duration: 800 })
            );
        } else {
            scale.value = 0.8;
            opacity.value = 0;
            pbWidth.value = 0;
        }
    }, [visible, completedCount, totalCount]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value }],
    }));

    const progressBarStyle = useAnimatedStyle(() => ({
        width: `${pbWidth.value * 100}%`,
    }));

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="fade">
            <BlurView
                intensity={isDark ? 80 : 40}
                tint={isDark ? 'dark' : 'light'}
                style={styles.container}
            >
                <Animated.View
                    style={[
                        styles.card,
                        {
                            backgroundColor: colors.surface + 'F2',
                            borderColor: colors.borderLight,
                            shadowColor: colors.cardShadow,
                        },
                        animatedStyle,
                    ]}
                >
                    <View style={[styles.iconContainer, { backgroundColor: colors.success + '20' }]}>
                        <Ionicons name="checkmark-circle" size={48} color={colors.success} />
                    </View>

                    <Text style={[styles.title, { color: colors.text }]}>
                        {t('batchResult.greatJob')}
                    </Text>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        {t('batchResult.wordsStudied', { count: completedCount })}
                    </Text>

                    {/* Progress Bar */}
                    <View style={styles.progressSection}>
                        <View style={styles.progressLabels}>
                            <Text style={[styles.progressText, { color: colors.textTertiary }]}>{t('batchResult.progress')}</Text>
                            <Text style={[styles.progressText, { color: colors.primary, fontFamily: 'Pretendard_600SemiBold' }]}>
                                {t('batchResult.progressCount', { completed: completedCount, total: totalCount })}
                            </Text>
                        </View>
                        <View style={[styles.progressBarBg, { backgroundColor: colors.surfaceSecondary }]}>
                            <Animated.View style={[styles.progressBarFill, { backgroundColor: colors.primary }, progressBarStyle]} />
                        </View>
                    </View>

                    {/* Actions */}
                    <View style={styles.actions}>
                        {!isLastBatch ? (
                            <Pressable
                                onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    onNextBatch();
                                }}
                                style={({ pressed }) => [
                                    styles.primaryButton,
                                    { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
                                ]}
                            >
                                <Text style={styles.primaryButtonText}>{t('batchResult.nextSet')}</Text>
                                <Ionicons name="arrow-forward" size={20} color="#FFF" style={{ marginLeft: 4 }} />
                            </Pressable>
                        ) : null}

                        <Pressable
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                onRetryBatch();
                            }}
                            style={({ pressed }) => [
                                styles.secondaryButton,
                                { backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.8 : 1 },
                            ]}
                        >
                            <Ionicons name="refresh" size={20} color={colors.textSecondary} style={{ marginRight: 6 }} />
                            <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>
                                {t('batchResult.retrySet')}
                            </Text>
                        </Pressable>

                        <Pressable
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                onFinish();
                            }}
                            style={({ pressed }) => [
                                styles.tertiaryButton,
                                { opacity: pressed ? 0.6 : 1 },
                            ]}
                        >
                            <Text style={[styles.tertiaryButtonText, { color: colors.textTertiary }]}>
                                {t('batchResult.endStudy')}
                            </Text>
                        </Pressable>
                    </View>
                </Animated.View>
            </BlurView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    card: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 20,
        padding: 32,
        alignItems: 'center',
        borderWidth: 1,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 10,
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 24,
        fontFamily: 'Pretendard_700Bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        fontFamily: 'Pretendard_400Regular',
        textAlign: 'center',
        marginBottom: 32,
    },
    progressSection: {
        width: '100%',
        marginBottom: 32,
    },
    progressLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    progressText: {
        fontSize: 14,
        fontFamily: 'Pretendard_500Medium',
    },
    progressBarBg: {
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
        width: '100%',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 4,
    },
    actions: {
        width: '100%',
        gap: 12,
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 16,
    },
    primaryButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'Pretendard_600SemiBold',
    },
    secondaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 16,
    },
    secondaryButtonText: {
        fontSize: 16,
        fontFamily: 'Pretendard_600SemiBold',
    },
    tertiaryButton: {
        paddingVertical: 12,
        alignItems: 'center',
    },
    tertiaryButtonText: {
        fontSize: 15,
        fontFamily: 'Pretendard_500Medium',
        textDecorationLine: 'underline',
    },
});
