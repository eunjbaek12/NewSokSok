import React, { ReactNode } from 'react';
import { Modal, Pressable, View, StyleSheet, ViewStyle, DimensionValue } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/features/theme';
import { PopupTokens } from '@/constants/popup';

export type ModalVariant =
  | 'dialog'
  | 'settingsPanel'
  | 'formDialog'
  | 'bottomSheet'
  | 'contextMenu'
  | 'blurOverlay';

interface ModalOverlayProps {
  visible: boolean;
  onClose: () => void;
  variant: ModalVariant;
  maxWidth?: number;
  maxHeight?: string;
  animationType?: 'fade' | 'slide';
  scrollable?: boolean;
  children: ReactNode;
  /** For contextMenu: absolute position override */
  style?: ViewStyle;
}

const VARIANT_DEFAULTS: Record<ModalVariant, {
  bg: 'surface' | 'surfaceModal' | 'blur';
  radius: number;
  animation: 'fade' | 'slide';
  maxWidth: number;
  maxHeight: string | undefined;
  align: 'center' | 'bottom' | 'free';
  overlayBg?: string;
}> = {
  dialog:        { bg: 'surface',      radius: PopupTokens.radius.standard,      animation: 'fade',  maxWidth: PopupTokens.maxWidth.standard,   maxHeight: PopupTokens.maxHeight.standard, align: 'center' },
  settingsPanel: { bg: 'surfaceModal', radius: PopupTokens.radius.standard,      animation: 'fade',  maxWidth: PopupTokens.maxWidth.standard,   maxHeight: PopupTokens.maxHeight.standard, align: 'center' },
  formDialog:    { bg: 'surface',      radius: PopupTokens.radius.standard,      animation: 'fade',  maxWidth: PopupTokens.maxWidth.form,       maxHeight: PopupTokens.maxHeight.standard, align: 'center' },
  bottomSheet:   { bg: 'surfaceModal', radius: PopupTokens.radius.standard,      animation: 'slide', maxWidth: PopupTokens.maxWidth.standard,   maxHeight: undefined,                      align: 'bottom' },
  contextMenu:   { bg: 'surface',      radius: PopupTokens.radius.contextMenu,   animation: 'fade',  maxWidth: PopupTokens.maxWidth.contextMenu, maxHeight: undefined,                      align: 'free', overlayBg: PopupTokens.overlay.contextMenu },
  blurOverlay:   { bg: 'blur',         radius: PopupTokens.radius.standard,      animation: 'fade',  maxWidth: PopupTokens.maxWidth.standard,   maxHeight: undefined,                      align: 'center' },
};

export default function ModalOverlay({
  visible,
  onClose,
  variant,
  maxWidth,
  maxHeight,
  animationType,
  scrollable = false,
  children,
  style,
}: ModalOverlayProps) {
  const { colors, isDark } = useTheme();
  const cfg = VARIANT_DEFAULTS[variant];

  const resolvedMaxWidth = maxWidth ?? cfg.maxWidth;
  const resolvedMaxHeight = maxHeight ?? cfg.maxHeight;
  const resolvedAnimation = animationType ?? cfg.animation;

  const bgColor =
    cfg.bg === 'surface'      ? colors.surface :
    cfg.bg === 'surfaceModal' ? colors.surfaceModal :
    colors.surface;

  const containerStyle: ViewStyle[] = [
    styles.container,
    {
      backgroundColor: bgColor,
      borderRadius: cfg.radius,
      maxWidth: resolvedMaxWidth,
      ...(resolvedMaxHeight ? { maxHeight: resolvedMaxHeight as DimensionValue } : {}),
      shadowColor: PopupTokens.shadow.color,
      shadowOffset: PopupTokens.shadow.offset,
      shadowOpacity: PopupTokens.shadow.opacity,
      shadowRadius: PopupTokens.shadow.radius,
      elevation: PopupTokens.shadow.elevation,
    },
  ];

  if (cfg.align === 'bottom') {
    containerStyle.push(styles.bottomSheetContainer);
  }

  if (style) {
    containerStyle.push(style);
  }

  const overlayBg = cfg.overlayBg ?? colors.overlay;

  const overlayStyle: ViewStyle =
    cfg.align === 'bottom'
      ? { ...styles.overlay, justifyContent: 'flex-end', backgroundColor: overlayBg }
      : cfg.align === 'free'
        ? { ...styles.overlay, backgroundColor: overlayBg }
        : { ...styles.overlay, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: overlayBg };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={resolvedAnimation}
      onRequestClose={onClose}
    >
      {scrollable ? (
        <GestureHandlerRootView style={StyleSheet.absoluteFill}>
          {cfg.bg === 'blur' ? (
            <BlurView
              style={styles.overlay}
              intensity={isDark ? 80 : 40}
              tint={isDark ? 'dark' : 'light'}
            >
              <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
              <View style={containerStyle} onStartShouldSetResponder={() => true}>
                {children}
              </View>
            </BlurView>
          ) : (
            <Pressable style={overlayStyle} onPress={onClose}>
              <View style={containerStyle} onStartShouldSetResponder={() => true}>
                {children}
              </View>
            </Pressable>
          )}
        </GestureHandlerRootView>
      ) : cfg.bg === 'blur' ? (
        <BlurView
          style={styles.overlay}
          intensity={isDark ? 80 : 40}
          tint={isDark ? 'dark' : 'light'}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={containerStyle} onStartShouldSetResponder={() => true}>
            {children}
          </View>
        </BlurView>
      ) : (
        <Pressable style={overlayStyle} onPress={onClose}>
          <View style={containerStyle} onStartShouldSetResponder={() => true}>
            {children}
          </View>
        </Pressable>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  container: {
    width: '100%',
    overflow: 'hidden',
  },
  bottomSheetContainer: {
    borderTopLeftRadius: PopupTokens.radius.standard,
    borderTopRightRadius: PopupTokens.radius.standard,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    maxWidth: '100%',
    width: '100%',
  },
});
