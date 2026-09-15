import React, { ReactNode } from 'react';
import { Modal, Pressable, View, StyleSheet, ViewStyle, DimensionValue } from 'react-native';
// 🔴 RN 기본판이 아니다. iOS 는 **Modal 안에서** 기본판이 키보드를 따라오지 못한다 —
//    단어장 신고의 「추가 설명」을 누르면 키보드가 입력칸을 덮어 쓰는 글이 안 보였다
//    (은정님 iPhone 1.7.1 build 46). app/contact.tsx·app/deck-error.tsx 는 ab0c510 에서
//    이미 이 판으로 옮겨 고쳤는데, 모달만 남아 있었다.
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  /** Wrap modal content in KeyboardAvoidingView — for modals containing TextInput */
  avoidKeyboard?: boolean;
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
  bottomSheet:   { bg: 'surface',      radius: PopupTokens.radius.bottomSheet,   animation: 'slide', maxWidth: PopupTokens.maxWidth.standard,   maxHeight: undefined,                      align: 'bottom' },
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
  avoidKeyboard = false,
}: ModalOverlayProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
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
    // 바텀시트는 화면 맨 아래에 붙으므로 시스템 바와 겹친다 — Android는 edge-to-edge라
    // Modal이 내비게이션 바 아래까지 그려지고, iOS는 홈 인디케이터가 올라온다.
    // 호출부가 34 같은 숫자를 직접 쓰면 iOS 한 기종에만 맞고 Android 3버튼 바(48dp)엔
    // 모자라므로, 인셋은 여기서 한 번만 흡수한다(본문 여백은 호출부 몫).
    containerStyle.push({ paddingBottom: insets.bottom });
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

  const overlayContent = cfg.bg === 'blur' ? (
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
  );

  // behavior 가 한 값인 이유: keyboard-controller 판은 두 플랫폼이 같은 계산을 쓴다.
  // 기본판 시절의 ios='padding' / android='height' 갈림은 기본판이 Android 에서 창 높이
  // 변화에 기대던 흔적이라, 여기서는 오히려 틀린다(ab0c510 과 같은 판단).
  const wrappedContent = avoidKeyboard ? (
    <KeyboardAvoidingView style={StyleSheet.absoluteFill} behavior="padding">
      {overlayContent}
    </KeyboardAvoidingView>
  ) : overlayContent;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={resolvedAnimation}
      onRequestClose={onClose}
    >
      {scrollable ? (
        <GestureHandlerRootView style={StyleSheet.absoluteFill}>
          {wrappedContent}
        </GestureHandlerRootView>
      ) : wrappedContent}
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
