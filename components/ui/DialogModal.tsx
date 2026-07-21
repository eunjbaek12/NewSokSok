import React, { ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/features/theme';
import { PopupTokens } from '@/constants/popup';
import ModalOverlay, { ModalVariant } from './ModalOverlay';

interface DialogModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  showCloseButton?: boolean;
  compact?: boolean;
  scrollable?: boolean;
  maxWidth?: number;
  maxHeight?: string;
  variant?: Extract<ModalVariant, 'dialog' | 'settingsPanel' | 'formDialog'>;
  avoidKeyboard?: boolean;
  /**
   * 본문 좌우 패딩. 헤더·푸터는 항상 이 패딩을 쓰므로 기본값이 true다 — 호출부가
   * 아무것도 하지 않아도 세로 정렬선이 맞는다.
   *
   * 기본값이 없던 시절엔 호출부마다 손으로 넣어야 했고, 그러다 매직넘버 20이
   * 관성으로 굳어 헤더(24)와 4px 어긋난 모달이 여러 개 배포됐다. 빠뜨리면
   * 본문만 가장자리에 붙는 것도 같은 원인이었다.
   *
   * false로 끄는 경우: 본문 항목이 모달 가장자리까지 닿아야 할 때(전체 폭
   * 하이라이트·구분선 등). 그때는 호출부가 안쪽 요소에 직접 패딩을 준다.
   */
  bodyPadding?: boolean;
}

export default function DialogModal({
  visible,
  onClose,
  title,
  children,
  footer,
  showCloseButton = true,
  compact = false,
  scrollable = true,
  maxWidth,
  maxHeight,
  variant = 'dialog',
  avoidKeyboard = false,
  bodyPadding = true,
}: DialogModalProps) {
  const { colors } = useTheme();
  const h = compact ? PopupTokens.header.compact : PopupTokens.header.standard;

  const Body = scrollable ? (compact ? GHScrollView : ScrollView) : View;
  const bodyProps = scrollable
    ? { showsVerticalScrollIndicator: false, keyboardShouldPersistTaps: 'handled' as const }
    : {};

  return (
    <ModalOverlay
      visible={visible}
      onClose={onClose}
      variant={variant}
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      scrollable={scrollable && compact}
      avoidKeyboard={avoidKeyboard}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text
          style={[styles.title, { color: colors.text, fontSize: h.titleSize }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {showCloseButton && (
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={h.closeSize} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {/* Body */}
      <Body style={[styles.body, bodyPadding && styles.bodyPadded]} {...bodyProps}>
        {children}
      </Body>

      {/* Footer */}
      {footer && <View style={styles.footer}>{footer}</View>}
    </ModalOverlay>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: PopupTokens.padding.container,
    paddingTop: PopupTokens.padding.container,
    paddingBottom: 16,
  },
  title: {
    flex: 1,
    fontFamily: 'Pretendard_700Bold',
    marginRight: 12,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flexShrink: 1,
  },
  bodyPadded: {
    paddingHorizontal: PopupTokens.padding.container,
  },
  footer: {
    paddingHorizontal: PopupTokens.padding.container,
    paddingBottom: PopupTokens.padding.container,
    paddingTop: 8,
  },
});
