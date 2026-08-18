// 보상형 광고 1회 재생 → 보상 지급 → quota 갱신. UI는 호출부가 그린다.
//
// 이 로직은 원래 RewardedAdModal 안에만 있었다. 그런데 그 모달은 앱 루트의 RN Modal이라
// **모달 안에서는 띄울 수 없다**(iOS 형제 Modal 제약 — store.ts의 inlineQuotaHandler 주석).
// AI 단어 생성·사진 스캔은 모달 안에서 도는 화면이라 광고를 자기 화면에 인라인으로
// 붙여야 하고, 그러려면 광고 재생이 모달과 분리돼 있어야 한다.
//
// 광고 재생 자체는 모달 위에서도 안전하다 — AdMob은 최상위 present VC를 찾아 띄운다
// (RNGoogleMobileAdsCommon.mm의 currentViewController). 막히는 건 우리가 만든 모달뿐이다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RewardedAd, RewardedAdEventType, AdEventType } from 'react-native-google-mobile-ads';
import { AD_UNIT_REWARDED } from '@/lib/ads/admob';
import { supabase } from '@/lib/supabase/client';
import { useQuotaStore } from './store';
import { hasRewardViewsRemaining, rewardAmountOf } from './reward-eligibility';

interface Options {
  /** 보상이 실제로 지급된 뒤(quota 갱신 완료 후) 호출. 막혔던 작업을 여기서 이어간다. */
  onGranted?: (granted: number) => void;
}

export function useRewardedAd(options?: Options) {
  const { t } = useTranslation();
  const status = useQuotaStore((s) => s.status);
  const refreshQuota = useQuotaStore((s) => s.refresh);

  const [loading, setLoading] = useState(false);
  const [grantedAmount, setGrantedAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const earnedRef = useRef(false);
  // 리스너 해제 묶음. 언마운트 때도 부른다 — 루트 상주였던 모달과 달리 훅은 화면과 함께
  // 사라지므로, 정리하지 않으면 사라진 화면의 setState를 광고 콜백이 나중에 건드린다.
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const aliveRef = useRef(true);
  // 콜백은 매 렌더 새로 만들어지므로 ref로 최신 것을 가리킨다(오래된 클로저 방지).
  const onGrantedRef = useRef(options?.onGranted);
  onGrantedRef.current = options?.onGranted;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, []);

  const rewardAmount = rewardAmountOf(status);
  const canWatch = hasRewardViewsRemaining(status) && Platform.OS !== 'web';

  const reset = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    earnedRef.current = false;
    setLoading(false);
    setGrantedAmount(null);
    setError(null);
  }, []);

  const watch = useCallback(() => {
    if (!canWatch || loading) return;
    setLoading(true);
    setError(null);
    earnedRef.current = false;

    const ad = RewardedAd.createForAdRequest(AD_UNIT_REWARDED);

    const unsubLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      ad.show().catch(() => {
        if (!aliveRef.current) return;
        setError(t('ads.rewardedShowFailed'));
        setLoading(false);
      });
    });
    const unsubEarned = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      earnedRef.current = true;
    });
    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, async () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      if (!earnedRef.current) {
        if (aliveRef.current) setLoading(false);
        return;
      }
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error('missing_user');
        const { data, error: rpcErr } = await supabase.rpc('grant_rewarded_bonus', {
          p_user_id: userData.user.id,
        });
        if (rpcErr || !data) throw rpcErr ?? new Error('grant_failed');
        const granted = (data as any).granted as number;
        // quota 갱신은 화면이 사라졌어도 끝까지 한다 — 지급은 이미 서버에서 일어났고,
        // 카운터가 옛 값으로 남으면 다음 화면이 "한도 없음"으로 잘못 판단한다.
        await refreshQuota(true);
        if (!aliveRef.current) return;
        setGrantedAmount(granted);
        if (granted > 0) onGrantedRef.current?.(granted);
      } catch {
        if (aliveRef.current) setError(t('ads.rewardGrantFailed'));
      } finally {
        if (aliveRef.current) setLoading(false);
      }
    });
    const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      if (!aliveRef.current) return;
      setError(t('ads.rewardedLoadFailed'));
      setLoading(false);
    });

    unsubscribeRef.current = () => {
      unsubLoaded();
      unsubEarned();
      unsubClosed();
      unsubError();
    };

    ad.load();
  }, [canWatch, loading, refreshQuota, t]);

  return { watch, reset, loading, grantedAmount, error, canWatch, rewardAmount };
}
