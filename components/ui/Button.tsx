import React, { ComponentProps } from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle, View } from 'react-native';
import { useTheme } from '@/features/theme';
import { Ionicons } from '@expo/vector-icons';

interface ButtonProps extends ComponentProps<typeof Pressable> {
    title?: string;
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
    size?: 'small' | 'medium' | 'large';
    icon?: keyof typeof Ionicons.glyphMap;
    iconColor?: string;
    loading?: boolean;
    style?: ViewStyle | ViewStyle[];
    textStyle?: TextStyle | TextStyle[];
    ref?: React.Ref<View>;
}

export function Button({
    ref,
    title,
    variant = 'primary',
    size = 'medium',
    icon,
    iconColor,
    loading = false,
    disabled,
    style,
    textStyle,
    children,
    ...props
}: ButtonProps) {
    const { colors } = useTheme();

    const getBackgroundColor = () => {
        switch (variant) {
            case 'primary': return colors.primary;
            case 'secondary': return colors.surfaceSecondary;
            case 'outline': return 'transparent';
            case 'ghost': return 'transparent';
            default: return colors.primary;
        }
    };

    const getTextColor = () => {
        switch (variant) {
            case 'primary': return '#FFFFFF';
            case 'secondary': return colors.text;
            case 'outline': return colors.primary;
            case 'ghost': return colors.textSecondary;
            default: return '#FFFFFF';
        }
    };

    const getBorderColor = () => {
        switch (variant) {
            case 'outline': return colors.border;
            case 'secondary': return colors.border;
            default: return 'transparent';
        }
    };

    const getPadding = () => {
        switch (size) {
            case 'small': return { paddingVertical: 10, paddingHorizontal: 16 };
            case 'medium': return { paddingVertical: 14, paddingHorizontal: 20 };
            case 'large': return { paddingVertical: 16, paddingHorizontal: 24 };
            default: return { paddingVertical: 14, paddingHorizontal: 20 };
        }
    };

    const defaultIconColor = iconColor || getTextColor();
    const isDisabled = disabled || loading;

    return (
        <Pressable
            ref={ref}
            disabled={isDisabled}
            style={[
                styles.button,
                getPadding(),
                {
                    backgroundColor: getBackgroundColor(),
                    borderColor: getBorderColor(),
                    borderWidth: variant === 'outline' || variant === 'secondary' ? 1 : 0,
                    opacity: isDisabled ? 0.6 : 1,
                },
                style,
            ]}
            {...props}
        >
            {loading ? (
                <ActivityIndicator size="small" color={getTextColor()} />
            ) : (
                <>
                    {icon && <Ionicons name={icon} size={size === 'small' ? 16 : 20} color={defaultIconColor} />}
                    {title && (
                        <Text
                            style={[
                                styles.text,
                                { color: getTextColor(), fontSize: size === 'small' ? 14 : size === 'large' ? 17 : 16 },
                                textStyle,
                            ]}
                        >
                            {title}
                        </Text>
                    )}
                    {children}
                </>
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        gap: 8,
    },
    text: {
        fontFamily: 'Pretendard_600SemiBold',
    },
});
