import React, { ComponentProps } from 'react';
import { TextInput, View, Text, StyleSheet, ViewStyle, TextStyle, Pressable } from 'react-native';
import { useTheme } from '@/features/theme';
import { Ionicons } from '@expo/vector-icons';
import { Radius } from '@/constants/tokens';

interface InputProps extends ComponentProps<typeof TextInput> {
    label?: string;
    error?: string;
    leftIcon?: keyof typeof Ionicons.glyphMap;
    containerStyle?: ViewStyle | ViewStyle[];
    labelStyle?: TextStyle;
    onClear?: () => void;
    clearAccessibilityLabel?: string;
    ref?: React.Ref<TextInput>;
}

export function Input({
    ref,
    label,
    error,
    leftIcon,
    containerStyle,
    labelStyle,
    onClear,
    clearAccessibilityLabel,
    style,
    multiline,
    ...props
}: InputProps) {
    const { colors } = useTheme();

    return (
        <View style={[styles.container, containerStyle]}>
            {label && (
                <Text style={[styles.label, { color: colors.textSecondary }, labelStyle]}>
                    {label}
                </Text>
            )}
            <View
                style={[
                    styles.inputWrapper,
                    {
                        backgroundColor: colors.surface,
                        borderColor: error ? colors.error : colors.border,
                    },
                ]}
            >
                {leftIcon && (
                    <Ionicons
                        name={leftIcon}
                        size={20}
                        color={colors.textTertiary}
                        style={styles.leftIcon}
                    />
                )}
                <TextInput
                    ref={ref}
                    style={[
                        styles.input,
                        { color: colors.text },
                        leftIcon && { paddingLeft: 8 },
                        multiline && styles.multilineInput,
                        style,
                    ]}
                    placeholderTextColor={colors.textTertiary}
                    multiline={multiline}
                    textAlignVertical={multiline ? 'top' : 'auto'}
                    {...props}
                />
                {onClear && typeof props.value === 'string' && props.value.length > 0 && (
                    <Pressable
                        onPress={onClear}
                        accessibilityRole="button"
                        accessibilityLabel={clearAccessibilityLabel}
                        hitSlop={12}
                        style={styles.clearButton}
                    >
                        <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
                    </Pressable>
                )}
            </View>
            {error && (
                <Text style={[styles.errorText, { color: colors.error }]}>
                    {error}
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: 6,
    },
    label: {
        fontSize: 12,
        fontFamily: 'Pretendard_600SemiBold',
        letterSpacing: 0.8,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: 14,
    },
    leftIcon: {
        marginRight: 4,
    },
    input: {
        flex: 1,
        paddingVertical: 12,
        fontSize: 16,
        fontFamily: 'Pretendard_400Regular',
    },
    multilineInput: {
        minHeight: 80,
        paddingTop: 12,
    },
    clearButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'flex-start',
        marginRight: -10,
        marginTop: 2,
    },
    errorText: {
        fontSize: 12,
        fontFamily: 'Pretendard_400Regular',
        marginTop: 2,
        paddingLeft: 4,
    },
});
