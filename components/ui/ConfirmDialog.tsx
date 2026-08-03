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
  // 기본값을 두지 않는다 — 예전에는 '확인'/'취소'가 기본값으로 박혀 있어서, 라벨을
  // 넘기지 않는 호출부가 생기는 순간 그 화면만 조용히 한국어가 됐다. 지금은 안 넘기면
  // 컴파일이 깨진다.
  confirmLabel: string;
  cancelLabel: string;
  confirmVariant?: 'primary' | 'destructive';
  onConfirm: () => void;
}

export default function ConfirmDialog({
  visible,
  onClose,
  title,
  message,
  confirmLabel,
  cancelLabel,
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
