import React, { ComponentProps } from 'react';
import { TextInput, View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

interface InputProps extends ComponentProps<typeof TextInput> {
    label?: string;
    error?: string;
    leftIcon?: keyof typeof Ionicons.glyphMap;
    containerStyle?: ViewStyle | ViewStyle[];
    labelStyle?: TextStyle;
    ref?: React.Ref<TextInput>;
}

export function Input({
    ref,
    label,
    error,
    leftIcon,
    containerStyle,
    labelStyle,
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
        fontFamily: 'Inter_600SemiBold',
        letterSpacing: 0.8,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 14,
    },
    leftIcon: {
        marginRight: 4,
    },
    input: {
        flex: 1,
        paddingVertical: 12,
        fontSize: 16,
        fontFamily: 'Inter_400Regular',
    },
    multilineInput: {
        minHeight: 80,
        paddingTop: 12,
    },
    errorText: {
        fontSize: 12,
        fontFamily: 'Inter_400Regular',
        marginTop: 2,
        paddingLeft: 4,
    },
});
