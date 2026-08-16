// 보상형 광고 모달 — Free 사용자의 일일 단어 한도 초과 시 표시.
//
// ⚠️ 이 모달은 앱 루트에 있어 **다른 RN Modal 위에는 띄울 수 없다**(iOS 형제 Modal 제약 —
// features/quota/store.ts의 inlineQuotaHandler 주석). 모달 안에서 도는 화면(AI 단어 생성,
// 사진 스캔)은 같은 useRewardedAd 훅으로 자기 화면에 인라인 CTA를 그린다.
//
// 흐름:
//   1. enrich 호출 시 quota_exceeded 응답 → 화면이 RewardedAdModal 열기
//   2. 사용자가 "광고 보고 +50단어" 선택 → RewardedAd.load → show
//   3. EARNED_REWARD 이벤트 → grant_rewarded_bonus RPC (+50, max 200)
//   4. useQuotaStore.refresh로 카운터 갱신
//   5. 모달 닫고 onGranted 콜백 → 호출부에서 enrich 재시도
//
// 어뷰징 방지: RPC 측에서 일 cap 200 강제. SSV 미통합 (v1.2 follow-up).

import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/features/theme';
import { hasRewardViewsRemaining, isAiQuotaExhausted, useQuotaStore, useRewardedAd } from '@/features/quota';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 보너스 부여 성공 시 호출. 호출부에서 enrich 재시도. */
  onGranted: () => void;
}

export function RewardedAdModal({ visible, onClose, onGranted }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const status = useQuotaStore((s) => s.status);

  // 광고 재생·보상 지급은 useRewardedAd가 맡는다. 이 모달을 띄울 수 없는 자리(모달 안)에서
  // 화면이 같은 훅으로 인라인 CTA를 그리므로, 로직은 한 곳에만 둔다.
  const { watch, reset, loading, grantedAmount, error, rewardAmount } = useRewardedAd({
    onGranted: () => onGranted(),
  });

  const exhausted = !!status && !hasRewardViewsRemaining(status);
  const quotaExhausted = isAiQuotaExhausted(status);

  // 모달 닫힐 때 상태 리셋
  useEffect(() => {
    if (!visible) reset();
  }, [visible, reset]);

  const handleWatch = () => {
    if (exhausted) return;
    watch();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.iconRow}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="play-circle" size={28} color={colors.primary} />
            </View>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            {grantedAmount !== null
              ? t('ads.rewardedGrantedTitle', { amount: grantedAmount })
              : quotaExhausted
                ? t('ads.rewardedTitle')
                : t('ads.rewardedBenefitTitle')}
          </Text>

          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {grantedAmount !== null
              ? t('ads.rewardedGrantedBody')
              : exhausted
                ? t('ads.rewardedExhausted')
                : quotaExhausted
                  ? t('ads.rewardedBody', { amount: rewardAmount, used: status?.used ?? 0, limit: (status?.limit ?? 0) + (status?.bonus ?? 0) })
                  : t('ads.rewardedBenefitBody', { amount: rewardAmount })}
          </Text>

          {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}

          <View style={styles.actionRow}>
            <Pressable
              onPress={onClose}
              style={[styles.btn, styles.btnSecondary, { backgroundColor: colors.surfaceSecondary }]}
              disabled={loading}
            >
              <Text style={[styles.btnText, { color: colors.textSecondary }]}>
                {grantedAmount !== null ? t('common.done') : t('common.cancel')}
              </Text>
            </Pressable>

            {grantedAmount === null && !exhausted && (
              <Pressable
                onPress={handleWatch}
                style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.primaryButton, opacity: loading ? 0.6 : 1 }]}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Text style={[styles.btnText, { color: colors.onPrimary }]}>
                    {t('ads.rewardedCta', { amount: rewardAmount })}
                  </Text>
                )}
              </Pressable>
            )}

            {grantedAmount === null && exhausted && (
              <Pressable
                onPress={() => {
                  onClose();
                  router.push('/plans' as any);
                }}
                style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.primaryButton }]}
              >
                <Text style={[styles.btnText, { color: colors.onPrimary }]}>
                  {t('ads.rewardedExhaustedProCta')}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  iconRow: { alignItems: 'center', marginBottom: 4 },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Pretendard_700Bold',
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  error: {
    fontSize: 13,
    fontFamily: 'Pretendard_500Medium',
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {},
  btnSecondary: {},
  btnText: {
    fontSize: 14,
    fontFamily: 'Pretendard_600SemiBold',
    textAlign: 'center',
  },
});
