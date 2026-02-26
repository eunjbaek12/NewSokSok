import React from 'react';
import { Modal, Pressable, View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';

export interface PickerOption {
    id: string;
    title: string;
    subtitle?: string;
    icon?: keyof typeof Ionicons.glyphMap;
    rightElement?: React.ReactNode;
}

interface ModalPickerProps {
    visible: boolean;
    onClose: () => void;
    title: string;
    options: PickerOption[];
    selectedValue?: string;
    onSelect: (id: string) => void;
    footer?: React.ReactNode;
}

export function ModalPicker({
    visible,
    onClose,
    title,
    options,
    selectedValue,
    onSelect,
    footer,
}: ModalPickerProps) {
    const { colors } = useTheme();

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.overlay} onPress={onClose}>
                <View style={[styles.container, { backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
                        <Pressable onPress={onClose} hitSlop={12}>
                            <Ionicons name="close" size={24} color={colors.textSecondary} />
                        </Pressable>
                    </View>

                    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                        {options.map((opt) => (
                            <Pressable
                                key={opt.id}
                                onPress={() => onSelect(opt.id)}
                                style={[
                                    styles.option,
                                    {
                                        borderBottomColor: colors.border,
                                        backgroundColor: selectedValue === opt.id ? colors.primaryLight : 'transparent'
                                    },
                                ]}
                            >
                                <Ionicons
                                    name={selectedValue === opt.id ? 'radio-button-on' : (opt.icon || 'radio-button-off')}
                                    size={20}
                                    color={selectedValue === opt.id ? colors.primary : colors.textTertiary}
                                />
                                <View style={styles.optionContent}>
                                    <Text style={[styles.optionTitle, { color: colors.text }]}>{opt.title}</Text>
                                    {opt.subtitle && (
                                        <Text style={[styles.optionSub, { color: colors.textSecondary }]}>{opt.subtitle}</Text>
                                    )}
                                </View>
                                {opt.rightElement}
                            </Pressable>
                        ))}
                        {footer}
                    </ScrollView>

                    <Pressable
                        onPress={onClose}
                        style={[styles.closeBtn, { backgroundColor: colors.surfaceSecondary }]}
                    >
                        <Text style={[styles.closeBtnText, { color: colors.text }]}>닫기</Text>
                    </Pressable>
                </View>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    container: {
        width: '100%',
        maxWidth: 400,
        maxHeight: '80%',
        borderRadius: 16,
        padding: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 17,
        fontFamily: 'Inter_700Bold',
    },
    scroll: {
        maxHeight: 350,
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 8,
        borderRadius: 8,
    },
    optionContent: {
        flex: 1,
        gap: 2,
    },
    optionTitle: {
        fontSize: 15,
        fontFamily: 'Inter_500Medium',
    },
    optionSub: {
        fontSize: 12,
        fontFamily: 'Inter_400Regular',
    },
    closeBtn: {
        marginTop: 16,
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
    },
    closeBtnText: {
        fontSize: 15,
        fontFamily: 'Inter_600SemiBold',
    },
});
