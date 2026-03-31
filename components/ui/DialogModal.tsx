import React, { ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
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
      <Body style={styles.body} {...bodyProps}>
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
  footer: {
    paddingHorizontal: PopupTokens.padding.container,
    paddingBottom: PopupTokens.padding.container,
    paddingTop: 8,
  },
});
