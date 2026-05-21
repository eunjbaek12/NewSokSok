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

// Module-level flag: auto-reconcile runs at most once per app session, not
// once per plans-screen mount. Re-runs on app restart (which is when we'd
// pick up new orphaned purchases anyway).
let autoReconcileAttempted = false;

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
      // Past this point the purchase is verified (server already set tier=pro)
      // and acknowledged, so it's a success regardless of whether the local
      // quota refresh happens to fail — the screen re-fetches on focus anyway.
      // Guarding this prevents a "payment OK but failure Alert" mismatch.
      try {
        await useQuotaStore.getState().refresh(true);
      } catch (refreshErr) {
        console.warn('[billing] post-purchase quota refresh failed:', refreshErr);
      }
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

  // Auto-reconcile orphaned purchases.
  //
  // Why: useIAP's onPurchaseSuccess listener only lives while the plans screen
  // is mounted. If a purchase completes on Play while the listener is gone
  // (user backgrounded the app, navigated away mid-purchase, network blip
  // during the callback round-trip), the event is lost. The purchase is left
  // un-acknowledged on Play's side and Play then blocks any re-purchase /
  // plan change with "developer has not acknowledged the purchase". Our
  // backend also never hears about it via verify-purchase.
  //
  // Recovery: on every fresh connect (once per session), sweep
  // getAvailablePurchases and silently verify+acknowledge anything pending.
  // No UI stage change, no alerts — this is invisible recovery, not the
  // user-facing buy flow. If a sweep entry fails we just log and move on;
  // Google auto-refunds un-acknowledged purchases after 3 days as a safety
  // net.
  useEffect(() => {
    if (!connected) return;
    if (autoReconcileAttempted) return;
    autoReconcileAttempted = true;
    let cancelled = false;
    (async () => {
      try {
        const purchases = await getAvailablePurchases();
        if (cancelled) return;
        let reconciled = false;
        for (const p of purchases) {
          if (cancelled) return;
          if (!PRO_SKUS.includes(p.productId as ProSku)) continue;
          const token = p.purchaseToken ?? '';
          if (!token) continue;
          try {
            const { data } = await supabase.functions.invoke('verify-purchase', {
              body: { purchaseToken: token, productId: p.productId, platform: Platform.OS },
            });
            if (data?.ok) {
              await finishTransaction({ purchase: p, isConsumable: false });
              reconciled = true;
            }
          } catch (e) {
            console.warn('[billing] auto-reconcile entry failed:', e);
          }
        }
        if (reconciled && !cancelled) {
          try { await useQuotaStore.getState().refresh(true); } catch {}
        }
      } catch (e) {
        console.warn('[billing] auto-reconcile sweep failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [connected, getAvailablePurchases, finishTransaction]);

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
        if (data?.ok) {
          // Acknowledge the purchase. Without this, an un-acknowledged purchase
          // lingers and Play blocks any re-purchase / plan change with
          // "developer has not acknowledged the purchase". The success path
          // (handleSuccess) finishes the transaction; restore must too.
          await finishTransaction({ purchase: p, isConsumable: false });
          restored = true;
        }
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
  }, [getAvailablePurchases, finishTransaction]);

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
