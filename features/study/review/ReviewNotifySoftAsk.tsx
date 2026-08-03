import React, { useCallback } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { Radius } from '@/constants/tokens';
import { PopupTokens } from '@/constants/popup';
import DialogModal from '@/components/ui/DialogModal';
import { requestNotificationPermission } from './notifications';

/**
 * 복습 알림 권한 — 2단계 soft ask의 **1단계**(gentle SRS §8.4).
 *
 * 왜 우리 시트를 먼저 띄우나: iOS는 시스템 권한 창을 **한 번 거절당하면 앱에서 다시
 * 물어볼 수 없다**(설정으로 보내야 함). 시스템 창은 한 발의 총알이라, "알림 받기"를
 * 누른 사람에게만 쏜다.
 *
 * 언제 띄우나: **첫 복습이 생긴 날**(3일차). 설치 직후가 아니라 홈에 "복습 N개 준비됨"이
 * 이미 떠 있는 상태에서 물어야 수락률이 높다 — 가치를 보여준 뒤에 묻는다.
 *
 * "나중에"도 존중한다: 앱은 그대로 전부 작동하고, 다시 조르지 않는다(호출부가
 * `softAsked`를 저장한다). 설정에서 언제든 켤 수 있다.
 *
 * 여기서 **시간까지 묻지 않는다** — 마찰이 커져 수락률이 떨어진다. 저녁 8시로 시작하고,
 * 바꾸고 싶은 사람만 설정에서.
 */
export default function ReviewNotifySoftAsk({
  visible,
  onDecided,
}: {
  visible: boolean;
  /** 시트가 닫힐 때. `granted`는 실제 OS 권한 결과 — "알림 받기"를 눌러도 거절될 수 있다. */
  onDecided: (granted: boolean) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const handleAccept = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // 2단계: 여기서만 시스템 창을 띄운다.
    const granted = await requestNotificationPermission();
    // 거절이어도 아무것도 하지 않는다 — 시트를 닫고 물러난다.
    //
    // 여기서 OS 설정으로 보내지 않는 이유: 방금 "싫다"고 답한 사람을 설정 앱으로 끌고 가는
    // 것은 이 화면이 표방하는 "조르지 않는다"(§8.4)의 정반대다. 거절은 최종 답이지
    // 다시 협상할 신호가 아니다. 설정 화면(app/(tabs)/settings.tsx)의 토글은 다르다 —
    // 거기서는 사용자가 **켜달라고 먼저 요청**한 것이라, 권한이 막혀 있으면 왜 안 켜지는지
    // 설명할 의무가 생기고 그때 비로소 OS 설정 안내가 정당해진다.
    onDecided(granted);
  }, [onDecided]);

  const handleLater = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDecided(false);
  }, [onDecided]);

  return (
    <DialogModal
      visible={visible}
      onClose={handleLater}
      title={t('reviewNotif.softAskTitle')}
      compact
      scrollable={false}
      showCloseButton={false}
      /*
       * 본문 패딩을 기본값에 맡기지 않고 직접 든다.
       *
       * 2e68271이 이 시트의 bodyWrap을 걷어내고 DialogModal의 bodyPadding 기본값에
       * 맡겼는데, vCode18(1.2.1) 실기에서 본문이 카드 가장자리에 붙어 나왔다 —
       * 스크린샷 실측으로 제목 24.3dp · 버튼 24.0dp인데 본문만 1dp였다. 같은 빌드의
       * 다른 모달(닉네임 24dp, 피커 24+8dp)은 정상이었고, 이 시트만 `compact`를
       * 넘기는 유일한 호출부다.
       *
       * 기본값이 왜 이 조합에서만 새는지는 아직 못 밝혔다. 그래서 원인과 무관하게
       * 값이 확정되도록 기본값을 끄고 아래 bodyWrap이 24를 준다 — 기본값이 먹든
       * 안 먹든 결과는 정확히 24dp 하나다. 원인을 찾으면 이 두 줄을 되돌릴 것.
       */
      bodyPadding={false}
      footer={
        <View style={styles.footer}>
          <Pressable
            onPress={handleLater}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.btnText, { color: colors.textSecondary }]}>
              {t('reviewNotif.softAskLater')}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleAccept}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: colors.primaryButton, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.btnText, { color: colors.onPrimary }]}>
              {t('reviewNotif.softAskAccept')}
            </Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.bodyWrap}>
        <Text style={[styles.body, { color: colors.text }]}>{t('reviewNotif.softAskBody')}</Text>
        {/*
          안심 문구는 지킬 수 있는 것만 말한다(§8.2). "밤엔 안 보내요"는 시간을 사용자가
          고를 수 있게 된 순간 거짓말이 되므로 쓰지 않는다 — 대신 구체적 사실(저녁 8시)과
          통제권(끄거나 시간을 바꿀 수 있음)만 약속한다.
        */}
        <Text style={[styles.reassure, { color: colors.textTertiary }]}>
          {t('reviewNotif.softAskReassure')}
        </Text>
      </View>
    </DialogModal>
  );
}

const styles = StyleSheet.create({
  /** 헤더·푸터와 같은 세로 정렬선. bodyPadding={false}와 짝이다 — 위 주석 참조. */
  bodyWrap: {
    paddingHorizontal: PopupTokens.padding.container,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'Pretendard_400Regular',
  },
  reassure: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Pretendard_400Regular',
    marginTop: 10,
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 15,
    fontFamily: 'Pretendard_600SemiBold',
    textAlign: 'center',
  },
});
