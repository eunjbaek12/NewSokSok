import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { PopupTokens } from '@/constants/popup';
import DialogModal from './DialogModal';

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
    const { t } = useTranslation();

    return (
        <DialogModal
            visible={visible}
            onClose={onClose}
            title={title}
            scrollable={false}
            footer={
                <Pressable
                    onPress={onClose}
                    style={[styles.closeBtn, { backgroundColor: colors.surfaceSecondary, paddingVertical: 14, borderRadius: 12 }]}
                >
                    <Text style={[styles.closeBtnText, { color: colors.text }]}>{t('common.close')}</Text>
                </Pressable>
            }
        >
            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                {options.map((opt) => (
                    <Pressable
                        key={opt.id}
                        onPress={() => onSelect(opt.id)}
                        style={[
                            styles.option,
                            {
                                borderBottomColor: colors.border,
                                backgroundColor: selectedValue === opt.id ? colors.primaryLight : 'transparent',
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
        </DialogModal>
    );
}

const styles = StyleSheet.create({
    scroll: {
        maxHeight: 350,
        paddingHorizontal: PopupTokens.padding.container,
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
        fontFamily: 'Pretendard_500Medium',
    },
    optionSub: {
        fontSize: 12,
        fontFamily: 'Pretendard_400Regular',
    },
    closeBtn: {
        alignItems: 'center',
    },
    closeBtnText: {
        fontSize: 15,
        fontFamily: 'Pretendard_600SemiBold',
    },
});
