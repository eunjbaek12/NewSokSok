import React, { ReactNode, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable, ScrollView, StyleSheet, Keyboard, Platform } from 'react-native';
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
  /**
   * 키보드가 올라오면 본문을 맨 아래로 굴린다. 기본은 꺼짐 — 켠 모달만 영향을 받는다.
   *
   * 🍎 iOS 에서만 돈다. Android 의 ReactScrollView 는 requestChildFocus 에서
   *    scrollToChild(focused) 를 그대로 부르므로(ReactScrollView.java:427) 포커스가 간
   *    입력칸을 이미 스스로 데려온다. iOS 의 RCTScrollView 엔 그에 해당하는 것이 없어서
   *    같은 코드가 한쪽에서만 결함으로 보였다. Android 에서 또 굴리면 잘 되던 쪽을
   *    더 거친 동작으로 덮어쓰게 된다.
   *
   * ⚠️ 켜도 되는 조건: 입력칸 **아래**에 남은 내용이 한 화면보다 짧을 것. 그래야 "맨
   *    아래로"가 곧 "그 입력칸이 보이게"가 된다. 입력칸이 본문 맨 끝일 필요는 없다 —
   *    공유 창의 닉네임 칸은 중간에 있지만 뒤가 짧아 같이 들어온다. 조건이 깨지면
   *    조금 더 내려갈 뿐, 입력칸이 화면 밖으로 나가진 않는다.
   */
  scrollBodyToEndOnKeyboard?: boolean;
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
  scrollBodyToEndOnKeyboard = false,
}: DialogModalProps) {
  const { colors } = useTheme();
  // 닫기 버튼에 스크린리더가 읽을 이름을 주려고 들여왔다. 이 컴포넌트가 화면에
  // 직접 그리는 글자는 그것 하나뿐이다 — 나머지 문구는 전부 호출자가 넘긴다.
  const { t } = useTranslation();
  const h = compact ? PopupTokens.header.compact : PopupTokens.header.standard;

  const Body = scrollable ? (compact ? GHScrollView : ScrollView) : View;
  const bodyRef = useRef<ScrollView>(null);
  const bodyProps = scrollable
    ? { showsVerticalScrollIndicator: false, keyboardShouldPersistTaps: 'handled' as const, ref: bodyRef }
    : {};

  // 키보드가 올라온 뒤 본문을 맨 아래로 굴린다(scrollBodyToEndOnKeyboard 를 켠 모달만).
  //
  // avoidKeyboard 는 키보드가 뜨면 창을 줄인다. 줄어드는 건 이 본문 스크롤 영역인데
  // 스크롤 위치는 맨 위 그대로라, 아래쪽 입력칸이 보이는 범위 밖으로 밀려난다. 사용자가
  // 손으로 내리면 되지만, 방금 누른 칸이 안 보이는 상태로 타이핑이 시작된다.
  //
  // 🔴 시점은 keyboardDidShow 여야 한다. 입력칸의 onFocus 시점엔 창이 아직 안 줄어서
  //    본문이 넘치지 않고, 그때 부른 scrollToEnd 는 굴릴 데가 없어 아무 일도 안 한다.
  //    한 프레임 더 미루는 것은 줄어든 크기가 네이티브에 반영된 뒤에 재도록 하기 위함이다
  //    (scrollToEnd 는 호출 시점의 contentSize - frame 으로 계산한다).
  //
  // iOS 한정인 이유는 위 프로퍼티 주석 참고.
  useEffect(() => {
    if (!visible || !scrollable || !scrollBodyToEndOnKeyboard || Platform.OS !== 'ios') return;
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      requestAnimationFrame(() => bodyRef.current?.scrollToEnd({ animated: true }));
    });
    return () => sub.remove();
  }, [visible, scrollable, scrollBodyToEndOnKeyboard]);

  // 본문 스타일은 배열이 아니라 flatten한 단일 객체로 넘긴다.
  //
  // scrollable={false}면 Body가 View가 되는데, 그때 `[styles.body, cond && styles.bodyPadded]`
  // 형태의 배열 조건부 스타일이 Android 릴리스 빌드에서만 조건부 항목을 잃어 좌우 패딩이
  // 0으로 새는 회귀가 있었다(복습 시트 6e98e3d에서 처음, ListContextMenu의 Merge 시트에서
  // 재발). Body가 ScrollView인 경우(대다수 모달)는 멀쩡했다 — 차이는 배열을 View에 직접
  // 넘기는 것뿐이었다. 근본 원인(minify/Hermes 조합 추정)은 미확정이지만, flatten으로
  // 네이티브에 단일 객체만 전달하면 원인과 무관하게 배열 처리 경로를 타지 않는다. header가
  // 단일 스타일 참조(styles.header)로 늘 정상이던 것과 같은 경로다.
  // ⚠️ 이 우회의 실제 효과는 preview(릴리스) 빌드 실측으로 확정해야 한다.
  const bodyStyle = StyleSheet.flatten([styles.body, bodyPadding && styles.bodyPadded]);

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
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={h.closeSize} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {/* Body */}
      <Body style={bodyStyle} {...bodyProps}>
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
