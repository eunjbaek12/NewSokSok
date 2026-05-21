// 보상형 광고 모달 — Free 사용자의 일일 단어 한도 초과 시 표시.
//
// 흐름:
//   1. enrich 호출 시 quota_exceeded 응답 → 화면이 RewardedAdModal 열기
//   2. 사용자가 "광고 보고 +50단어" 선택 → RewardedAd.load → show
//   3. EARNED_REWARD 이벤트 → grant_rewarded_bonus RPC (+50, max 200)
//   4. useQuotaStore.refresh로 카운터 갱신
//   5. 모달 닫고 onGranted 콜백 → 호출부에서 enrich 재시도
//
// 어뷰징 방지: RPC 측에서 일 cap 200 강제. SSV 미통합 (v1.2 follow-up).

import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, ActivityIndicator, Platform } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { RewardedAd, RewardedAdEventType, AdEventType } from 'react-native-google-mobile-ads';
import { useTheme } from '@/features/theme';
import { useAuth } from '@/features/auth';
import { useQuotaStore } from '@/features/quota';
import { AD_UNIT_REWARDED } from '@/lib/ads/admob';
import { supabase } from '@/lib/supabase/client';

const REWARD_AMOUNT = 50;
const DAILY_BONUS_CAP = 200;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 보너스 부여 성공 시 호출. 호출부에서 enrich 재시도. */
  onGranted: () => void;
}

export function RewardedAdModal({ visible, onClose, onGranted }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user } = useAuth();
  const status = useQuotaStore((s) => s.status);
  const refreshQuota = useQuotaStore((s) => s.refresh);

  const [loading, setLoading] = useState(false);
  const [grantedAmount, setGrantedAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const earnedRef = useRef(false);
  const adRef = useRef<RewardedAd | null>(null);

  const remainingCap = Math.max(0, DAILY_BONUS_CAP - (status?.bonus ?? 0));
  const exhausted = remainingCap <= 0;

  // 모달 닫힐 때 상태 리셋
  useEffect(() => {
    if (!visible) {
      setLoading(false);
      setGrantedAmount(null);
      setError(null);
      earnedRef.current = false;
      adRef.current = null;
    }
  }, [visible]);

  const handleWatch = async () => {
    if (!user || exhausted || Platform.OS === 'web') return;
    setLoading(true);
    setError(null);
    earnedRef.current = false;

    const ad = RewardedAd.createForAdRequest(AD_UNIT_REWARDED);
    adRef.current = ad;

    const unsubLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      ad.show().catch(() => {
        setError(t('ads.rewardedShowFailed'));
        setLoading(false);
      });
    });
    const unsubEarned = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      earnedRef.current = true;
    });
    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, async () => {
      unsubLoaded();
      unsubEarned();
      unsubClosed();
      unsubError();
      if (!earnedRef.current) {
        setLoading(false);
        return;
      }
      // reward earned → grant
      try {
        const { data, error: rpcErr } = await supabase.rpc('grant_rewarded_bonus', {
          p_user_id: user.id,
          p_amount: REWARD_AMOUNT,
          p_max_bonus: DAILY_BONUS_CAP,
        });
        if (rpcErr || !data) throw rpcErr ?? new Error('grant_failed');
        const granted = (data as any).granted as number;
        setGrantedAmount(granted);
        await refreshQuota(true);
        if (granted > 0) onGranted();
      } catch {
        setError(t('ads.rewardGrantFailed'));
      } finally {
        setLoading(false);
      }
    });
    const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
      unsubLoaded();
      unsubEarned();
      unsubClosed();
      unsubError();
      setError(t('ads.rewardedLoadFailed'));
      setLoading(false);
    });

    ad.load();
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
              : t('ads.rewardedTitle')}
          </Text>

          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {grantedAmount !== null
              ? t('ads.rewardedGrantedBody')
              : exhausted
                ? t('ads.rewardedExhausted')
                : t('ads.rewardedBody', { amount: REWARD_AMOUNT, used: status?.used ?? 0, limit: (status?.limit ?? 100) + (status?.bonus ?? 0) })}
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
                    {t('ads.rewardedCta')}
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
  },
});
