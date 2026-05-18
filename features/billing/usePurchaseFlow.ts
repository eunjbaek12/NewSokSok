// Pro 구독 구매 흐름 — plans.tsx 전용 hook.
//
// 흐름:
//   1. mount: useIAP connect → fetchProducts(PRO_SKUS, 'subs')
//   2. 사용자가 월/연 카드 탭 → buy(sku) → Android offerToken 자동 처리
//   3. onPurchaseSuccess: purchaseToken을 Edge `verify-purchase`로 전달
//      → 서버가 Google Play Developer API로 검증 + user_subscriptions 업데이트
//   4. 성공 시 finishTransaction + quotaStore.refresh(true)로 새 tier 반영
//
// 영수증 검증은 반드시 서버 측 (Edge). 클라이언트 finishTransaction은 검증 응답 OK 후에만 호출.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import {
  useIAP,
  type ProductSubscription,
  type Purchase,
} from 'expo-iap';
import { supabase } from '@/lib/supabase/client';
import { useQuotaStore } from '@/features/quota';
import { PRO_SKUS, type ProSku } from '@/lib/billing/skus';

export type PurchaseStage =
  | 'idle'
  | 'loadingProducts'
  | 'purchasing'
  | 'verifying'
  | 'success'
  | 'failed';

export interface PurchaseFlow {
  connected: boolean;
  products: ProductSubscription[];
  stage: PurchaseStage;
  error: string | null;

  /** SKU별 표시 가격 (없으면 null) */
  priceFor: (sku: ProSku) => string | null;
  /** 구매 시도 */
  buy: (sku: ProSku) => Promise<void>;
  /** 기존 구매 복원 (재설치/기기 변경 시) */
  restore: () => Promise<void>;
  /** 에러 / success 상태 해제 */
  resetStage: () => void;
}

export function usePurchaseFlow(): PurchaseFlow {
  const [stage, setStage] = useState<PurchaseStage>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSuccess = useCallback(async (purchase: Purchase) => {
    setStage('verifying');
    try {
      const purchaseToken = purchase.purchaseToken ?? '';
      if (!purchaseToken) throw new Error('no_token');

      const { data, error: edgeErr } = await supabase.functions.invoke('verify-purchase', {
        body: {
          purchaseToken,
          productId: purchase.productId,
          platform: Platform.OS,
        },
      });
      if (edgeErr || !data?.ok) throw edgeErr ?? new Error('verify_failed');

      await finishTransaction({ purchase, isConsumable: false });
      await useQuotaStore.getState().refresh(true);
      setStage('success');
    } catch (e: any) {
      setError(e?.message ?? 'verify_failed');
      setStage('failed');
    }
  }, []);

  const handleError = useCallback((err: any) => {
    setError(err?.message ?? 'purchase_failed');
    setStage('failed');
  }, []);

  const {
    connected,
    subscriptions,
    fetchProducts,
    requestPurchase,
    getAvailablePurchases,
    finishTransaction,
  } = useIAP({
    onPurchaseSuccess: handleSuccess,
    onPurchaseError: handleError,
  });

  // 연결 직후 상품 정보 가져오기
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    (async () => {
      setStage('loadingProducts');
      try {
        await fetchProducts({ skus: [...PRO_SKUS], type: 'subs' });
        if (!cancelled) setStage('idle');
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'load_products_failed');
          setStage('failed');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [connected, fetchProducts]);

  const priceFor = useCallback((sku: ProSku): string | null => {
    const sub = subscriptions.find((s) => s.id === sku);
    if (!sub) return null;
    if (Platform.OS === 'android') {
      const phases = sub.subscriptionOfferDetailsAndroid?.[0]?.pricingPhases?.pricingPhaseList;
      const baseRecurring = phases?.find(
        (p) => p.recurrenceMode === 1 || p.priceAmountMicros !== '0',
      );
      return baseRecurring?.formattedPrice ?? sub.displayPrice ?? null;
    }
    return sub.displayPrice ?? null;
  }, [subscriptions]);

  const buy = useCallback(async (sku: ProSku) => {
    setError(null);
    setStage('purchasing');
    try {
      if (Platform.OS === 'ios') {
        await requestPurchase({
          request: { apple: { sku } },
          type: 'subs',
        });
      } else {
        const sub = subscriptions.find((s) => s.id === sku);
        const offerToken = sub?.subscriptionOfferDetailsAndroid?.[0]?.offerToken;
        if (!offerToken) {
          throw new Error('no_offer_token');
        }
        await requestPurchase({
          request: {
            google: {
              skus: [sku],
              subscriptionOffers: [{ sku, offerToken }],
            },
          },
          type: 'subs',
        });
      }
    } catch (e: any) {
      handleError(e);
    }
    // 성공 콜백은 onPurchaseSuccess에서 처리됨.
  }, [subscriptions, requestPurchase, handleError]);

  const restore = useCallback(async () => {
    setError(null);
    setStage('verifying');
    try {
      const purchases = await getAvailablePurchases();
      let restored = false;
      for (const p of purchases) {
        if (!PRO_SKUS.includes(p.productId as ProSku)) continue;
        const token = p.purchaseToken ?? '';
        if (!token) continue;
        const { data } = await supabase.functions.invoke('verify-purchase', {
          body: { purchaseToken: token, productId: p.productId, platform: Platform.OS },
        });
        if (data?.ok) restored = true;
      }
      if (restored) {
        await useQuotaStore.getState().refresh(true);
        setStage('success');
      } else {
        setStage('idle');
      }
    } catch (e: any) {
      setError(e?.message ?? 'restore_failed');
      setStage('failed');
    }
  }, [getAvailablePurchases]);

  const resetStage = useCallback(() => {
    setError(null);
    setStage('idle');
  }, []);

  return useMemo<PurchaseFlow>(() => ({
    connected,
    products: subscriptions,
    stage,
    error,
    priceFor,
    buy,
    restore,
    resetStage,
  }), [connected, subscriptions, stage, error, priceFor, buy, restore, resetStage]);
}
