import React, { useEffect, useRef } from 'react';
import {
    Animated,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    Dimensions,
    Platform,
} from 'react-native';
import { useTheme } from '@/features/theme';
import { Ionicons } from '@expo/vector-icons';
import { PopupTokens } from '@/constants/popup';

interface SnackbarProps {
    visible: boolean;
    message: string;
    actionLabel?: string;
    onAction?: () => void;
    onDismiss: () => void;
    duration?: number;
    topOffset?: number;
    position?: 'top' | 'bottom';
    bottomOffset?: number;
}

const { width } = Dimensions.get('window');

export const Snackbar: React.FC<SnackbarProps> = ({
    visible,
    message,
    actionLabel,
    onAction,
    onDismiss,
    duration = 4000,
    topOffset = 60,
    position = 'top',
    bottomOffset = 120,
}) => {
    const { colors, isDark } = useTheme();
    const isBottom = position === 'bottom';
    const translateY = useRef(new Animated.Value(isBottom ? 200 : -200)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isVisibleRef = useRef(false);

    useEffect(() => {
        if (visible) {
            isVisibleRef.current = true;
            show();
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                hide();
            }, duration);
        } else {
            isVisibleRef.current = false;
            hide();
        }
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [visible]);

    const show = () => {
        Animated.parallel([
            Animated.spring(translateY, {
                toValue: 0,
                useNativeDriver: true,
                bounciness: 8,
            }),
            Animated.timing(opacity, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start();
    };

    const hide = () => {
        Animated.parallel([
            Animated.timing(translateY, {
                toValue: isBottom ? 200 : -200,
                duration: 250,
                useNativeDriver: true,
            }),
            Animated.timing(opacity, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start(() => {
            if (visible) onDismiss();
        });
    };

    if (!visible && !isVisibleRef.current) return null;

    return (
        <Animated.View
            style={[
                styles.container,
                isBottom ? { bottom: bottomOffset } : { top: topOffset },
                {
                    opacity: opacity,
                    transform: [{ translateY }],
                    backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
                    borderColor: isDark ? '#3A3A3C' : '#E5E5E7',
                    borderWidth: isDark ? 0 : 1,
                },
            ]}
        >
            <View style={styles.content}>
                <Text style={[styles.message, { color: isDark ? '#FFFFFF' : '#1C1C1E' }]} numberOfLines={2}>
                    {message}
                </Text>
                {actionLabel && (
                    <TouchableOpacity
                        onPress={() => {
                            onAction?.();
                            hide();
                        }}
                        style={styles.actionButton}
                    >
                        <Text style={[styles.actionLabel, { color: colors.primary }]}>
                            {actionLabel}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 16,
        right: 16,
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        ...Platform.select({
            ios: {
                shadowColor: PopupTokens.shadow.color,
                shadowOffset: PopupTokens.shadow.offset,
                shadowOpacity: PopupTokens.shadow.opacity,
                shadowRadius: PopupTokens.shadow.radius,
            },
            android: {
                elevation: PopupTokens.shadow.elevation - 4,
            },
        }),
        zIndex: 9999,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    message: {
        color: '#FFFFFF',
        fontSize: 14,
        fontFamily: 'Pretendard_500Medium',
        flex: 1,
        marginRight: 8,
    },
    actionButton: {
        paddingVertical: 4,
        paddingHorizontal: 8,
    },
    actionLabel: {
        fontSize: 14,
        fontFamily: 'Pretendard_700Bold',
    },
});
