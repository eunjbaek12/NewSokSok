import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/features/theme';
import { PopupTokens } from '@/constants/popup';
import ModalOverlay from './ModalOverlay';

interface ConfirmDialogProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'destructive';
  onConfirm: () => void;
}

export default function ConfirmDialog({
  visible,
  onClose,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  confirmVariant = 'primary',
  onConfirm,
}: ConfirmDialogProps) {
  const { colors } = useTheme();
  const btn = PopupTokens.button.standard;
  const confirmBg = confirmVariant === 'destructive' ? colors.error : colors.primary;

  return (
    <ModalOverlay visible={visible} onClose={onClose} variant="dialog">
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={onClose}
          style={[styles.btn, { backgroundColor: colors.surfaceSecondary, paddingVertical: btn.paddingVertical, borderRadius: btn.borderRadius }]}
        >
          <Text style={[styles.btnText, { color: colors.text, fontSize: btn.fontSize }]}>{cancelLabel}</Text>
        </Pressable>
        <Pressable
          onPress={() => { onConfirm(); onClose(); }}
          style={[styles.btn, { backgroundColor: confirmBg, paddingVertical: btn.paddingVertical, borderRadius: btn.borderRadius }]}
        >
          <Text style={[styles.btnText, { color: colors.onPrimary, fontSize: btn.fontSize }]}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </ModalOverlay>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: PopupTokens.padding.container,
    paddingTop: PopupTokens.padding.container,
    paddingBottom: 8,
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontFamily: 'Pretendard_700Bold',
  },
  message: {
    fontSize: 15,
    fontFamily: 'Pretendard_400Regular',
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: PopupTokens.padding.container,
    paddingBottom: PopupTokens.padding.container,
    paddingTop: 16,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
  },
  btnText: {
    fontFamily: 'Pretendard_600SemiBold',
  },
});
