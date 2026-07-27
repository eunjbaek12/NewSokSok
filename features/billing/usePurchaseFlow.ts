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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  useIAP,
  // root(index) API: 훅의 getAvailablePurchases는 Promise<void>라 값을 안 준다(상태로만
  // 노출). restore/자동정산은 즉시 배열이 필요하므로 값-반환하는 root API를 쓴다.
  // expo-iap CLAUDE.md "Hook API Semantics" 참고. (3.1→3.4 API 변경으로 깨졌던 부분)
  getAvailablePurchases,
  type ProductSubscription,
  type ProductSubscriptionAndroid,
  type ProductSubscriptionIOS,
  type Purchase,
} from 'expo-iap';
import { supabase } from '@/lib/supabase/client';
import { useQuotaStore } from '@/features/quota';
import { PRO_SKUS, basePlanIdFor, type ProSku } from '@/lib/billing/skus';
import { mapPurchaseError, readEdgeErrorBody, isDefinitiveVerifyRejection, type MappedPurchaseError } from './error-mapping';
import { isoPeriodToDays, type PriceDetail } from './pricing';
import { pickAndroidOffer } from './offers';

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
  /** Mapped error for UI consumption — null when no error pending. */
  error: MappedPurchaseError | null;

  /** SKU별 표시 가격 문자열 (없으면 null) */
  priceFor: (sku: ProSku) => string | null;
  /** SKU별 가격 상세 (숫자 금액·통화코드 — 월 환산/절약률 계산용. 없으면 null) */
  priceDetailFor: (sku: ProSku) => PriceDetail | null;
  /**
   * 스토어 오퍼에 걸린 무료 체험 일수. 오퍼가 없으면 null.
   *
   * 서버 가입 체험을 폐지한 뒤(20260727000000_signup_boost_replaces_trial.sql) 체험은
   * 스토어 오퍼가 유일한 경로다. 앱이 "7일 무료 체험"을 자체 판단으로 광고하면
   * 오퍼가 없거나 길이가 다를 때 그대로 거짓말이 되므로, 상품 정보에서 읽는다.
   */
  trialDaysFor: (sku: ProSku) => number | null;
  /** 구매 시도 */
  buy: (sku: ProSku) => Promise<void>;
  /** 기존 구매 복원 (재설치/기기 변경 시) */
  restore: () => Promise<void>;
  /** 에러 / success 상태 해제 */
  resetStage: () => void;
}

export function usePurchaseFlow(): PurchaseFlow {
  const [stage, setStage] = useState<PurchaseStage>('idle');
  const [error, setError] = useState<MappedPurchaseError | null>(null);

  // buy()가 진행 중일 때만 true. iOS는 IAP 연결 시 큐의 미완료 거래를
  // onPurchaseSuccess/onPurchaseError로 자동 재생(replay)하는데, 이 플래그가
  // false면 사용자가 시작한 결제가 아니므로 UI 상태·알림 없이 조용히 처리한다
  // (auto-reconcile과 같은 철학). 없으면 화면에 들어오기만 해도 "결제 실패"
  // 알림이 뜬다 — 게스트 + 만료 샌드박스 거래 조합에서 실측된 증상.
  const userInitiatedRef = useRef(false);

  // 재생된 미완료 거래의 침묵 정산: 로그인 상태에서만 verify를 시도하고,
  // 성공하면 finish+quota 갱신, 확정 거절이면 finish로 영구 재생을 끊는다.
  // 일시 오류는 큐에 남긴다(다음 연결·auto-reconcile이 재시도).
  const reconcileReplayed = useCallback(async (purchase: Purchase) => {
    const purchaseToken = purchase.purchaseToken ?? '';
    if (!purchaseToken) return;
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) return; // 게스트 — verify는 401 확정이라 호출 자체를 생략
      const { data, error: edgeErr } = await supabase.functions.invoke('verify-purchase', {
        body: { purchaseToken, productId: purchase.productId, platform: Platform.OS },
      });
      if (!edgeErr && data?.ok) {
        await finishTransaction({ purchase, isConsumable: false });
        try { await useQuotaStore.getState().refresh(true); } catch {}
        console.warn('[billing] replayed purchase reconciled:', purchase.productId);
        return;
      }
      if (isDefinitiveVerifyRejection(await readEdgeErrorBody(edgeErr))) {
        await finishTransaction({ purchase, isConsumable: false });
        console.warn('[billing] replayed purchase definitively rejected — finished:', purchase.productId);
      } else {
        console.warn('[billing] replayed purchase verify failed (transient), left in queue:', edgeErr?.message ?? 'not ok');
      }
    } catch (e: any) {
      console.warn('[billing] replay reconcile failed:', e?.message ?? String(e));
    }
  }, []);

  const handleSuccess = useCallback(async (purchase: Purchase) => {
    if (!userInitiatedRef.current) {
      await reconcileReplayed(purchase);
      return;
    }
    userInitiatedRef.current = false;
    // [billing-diag] checkpoint logs use console.warn so they survive
    // babel-plugin-transform-remove-console in production AABs (which only
    // strips console.log). They never print the token value itself — only
    // whether it exists. Remove these logs after the listener-loss root
    // cause is confirmed via real-world repro.
    const purchaseToken = purchase.purchaseToken ?? '';
    console.warn(
      '[billing-diag] onPurchaseSuccess fired',
      'productId=', purchase.productId,
      'hasToken=', !!purchaseToken,
    );
    setStage('verifying');
    try {
      if (!purchaseToken) throw new Error('no_token');

      console.warn('[billing-diag] invoking verify-purchase', 'productId=', purchase.productId);
      const { data, error: edgeErr } = await supabase.functions.invoke('verify-purchase', {
        body: {
          purchaseToken,
          productId: purchase.productId,
          platform: Platform.OS,
        },
      });
      console.warn(
        '[billing-diag] verify response',
        'ok=', data?.ok,
        'edgeErrMsg=', edgeErr?.message ?? null,
      );
      if (edgeErr || !data?.ok) throw edgeErr ?? new Error('verify_failed');

      await finishTransaction({ purchase, isConsumable: false });
      console.warn('[billing-diag] acknowledged', 'productId=', purchase.productId);
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
      console.warn('[billing-diag] handleSuccess threw', 'msg=', e?.message ?? String(e));
      setError(mapPurchaseError(e));
      setStage('failed');
    }
  }, []);

  const handleError = useCallback((err: any) => {
    // [billing-diag] capture the failure path too — useful to tell apart
    // "callback never fired" (no log at all) from "fired but Play returned
    // error" (this log present).
    console.warn(
      '[billing-diag] onPurchaseError fired',
      'code=', err?.code ?? null,
      'msg=', err?.message ?? String(err),
    );
    // 연결 시 재생된 과거 실패 거래 — 사용자가 시작한 결제가 아니므로 알림 없음.
    if (!userInitiatedRef.current) return;
    userInitiatedRef.current = false;
    const mapped = mapPurchaseError(err);
    setError(mapped);
    // User-cancelled isn't a "failure" worth showing an alert for — drop
    // straight back to idle so the buttons aren't disabled and no error
    // dialog pops up. plans.tsx still checks `error?.silent` defensively.
    setStage(mapped.silent ? 'idle' : 'failed');
  }, []);

  const {
    connected,
    subscriptions,
    fetchProducts,
    requestPurchase,
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
          // Prefer the underlying expo-iap code (NetworkError, ServiceError…)
          // when present so the user sees a specific reason; fall back to a
          // generic load-products marker only when there's no code at all.
          setError(mapPurchaseError(e?.code ? e : new Error('load_products_failed')));
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

  // Android 오퍼 선택 — 반드시 basePlanId로 명시한다(선택 규칙은 ./offers.ts).
  // 일치하는 요금제가 없으면 null이고, 그때는 결제도 가격 표시도 하지 않는다.
  const androidOffer = useCallback((sub: ProductSubscription, sku: ProSku) => {
    const offers = (sub as ProductSubscriptionAndroid).subscriptionOfferDetailsAndroid;
    const wanted = basePlanIdFor(sku);
    const picked = pickAndroidOffer(offers, wanted);
    if (!picked && offers?.length) {
      // 스토어 설정과 앱 상수가 어긋난 상태. 조용히 폴백하면 잘못된 요금제로
      // 결제되므로, 진단할 수 있도록 실제 내려온 요금제 목록을 남긴다.
      console.warn(
        `[billing] no offer for basePlanId="${wanted}" (sku=${sku}). ` +
        `available: ${offers.map((o) => o.basePlanId).join(', ')}`,
      );
    }
    return picked;
  }, []);

  // 선택된 오퍼의 pricing phase 목록. 무료체험/할인 phase가 앞에, 실제 정기결제
  // phase가 뒤에 온다. 가격과 체험 기간이 모두 여기서 나온다.
  const androidPhases = useCallback((sub: ProductSubscription, sku: ProSku) =>
    androidOffer(sub, sku)?.pricingPhases?.pricingPhaseList ?? null,
  [androidOffer]);

  // base(반복결제) phase를 찾는다. recurrenceMode===1(무한 반복)
  // 또는 가격이 0이 아닌 첫 phase = 무료체험/할인 phase를 건너뛴 실제 정기결제가.
  const androidBasePhase = useCallback((sub: ProductSubscription, sku: ProSku) =>
    androidPhases(sub, sku)?.find((p) => p.recurrenceMode === 1 || p.priceAmountMicros !== '0') ?? null,
  [androidPhases]);

  const priceFor = useCallback((sku: ProSku): string | null => {
    const sub = subscriptions.find((s) => s.id === sku);
    if (!sub) return null;
    if (Platform.OS === 'android') {
      // displayPrice 폴백을 두지 않는다 — 요금제를 못 고른 상황에서 상품 대표
      // 가격을 보여주면 실제 결제와 다른 금액이 화면에 남는다.
      return androidBasePhase(sub, sku)?.formattedPrice ?? null;
    }
    return sub.displayPrice ?? null;
  }, [subscriptions, androidBasePhase]);

  const priceDetailFor = useCallback((sku: ProSku): PriceDetail | null => {
    const sub = subscriptions.find((s) => s.id === sku);
    if (!sub) return null;
    if (Platform.OS === 'android') {
      const base = androidBasePhase(sub, sku);
      if (!base) return null;
      return {
        display: base.formattedPrice ?? '',
        amount: Number(base.priceAmountMicros) / 1_000_000,
        currency: base.priceCurrencyCode ?? sub.currency ?? '',
      };
    }
    const ios = sub as ProductSubscriptionIOS;
    if (ios.price == null) return null;
    return {
      display: sub.displayPrice ?? '',
      amount: ios.price,
      currency: sub.currency ?? '',
    };
  }, [subscriptions, androidBasePhase]);

  // 무료 체험 오퍼 감지 — Android는 가격 0인 pricing phase, iOS는 도입가 결제 모드가
  // 'free-trial'인 경우. 기간 표기가 서로 달라(ISO 8601 vs unit+count) 각각 일수로 환산한다.
  const trialDaysFor = useCallback((sku: ProSku): number | null => {
    const sub = subscriptions.find((s) => s.id === sku);
    if (!sub) return null;

    if (Platform.OS === 'android') {
      const free = androidPhases(sub, sku)?.find((p) => p.priceAmountMicros === '0');
      if (!free) return null;
      const days = isoPeriodToDays(free.billingPeriod);
      return days == null ? null : days * Math.max(1, free.billingCycleCount || 1);
    }

    const ios = sub as ProductSubscriptionIOS;
    if (ios.introductoryPricePaymentModeIOS !== 'free-trial') return null;
    const unitDays: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
    const unit = ios.introductoryPriceSubscriptionPeriodIOS;
    const perUnit = unit ? unitDays[unit] : undefined;
    if (!perUnit) return null;
    const periods = Number(ios.introductoryPriceNumberOfPeriodsIOS ?? '1');
    return perUnit * (Number.isFinite(periods) && periods > 0 ? periods : 1);
  }, [subscriptions, androidPhases]);

  const buy = useCallback(async (sku: ProSku) => {
    setError(null);
    setStage('purchasing');
    userInitiatedRef.current = true;
    try {
      if (Platform.OS === 'ios') {
        await requestPurchase({
          request: { apple: { sku } },
          type: 'subs',
        });
      } else {
        // basePlanId로 고른 오퍼만 쓴다. 못 고르면 결제를 진행하지 않는다 —
        // 상품에 다른 기본 요금제가 남아 있을 때 [0]을 집으면 화면과 다른
        // 주기·금액으로 결제될 수 있다(pro_yearly 월 청구 요금제 사례).
        const sub = subscriptions.find((s) => s.id === sku);
        const offerToken = sub ? androidOffer(sub, sku)?.offerToken : undefined;
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
  }, [subscriptions, requestPurchase, handleError, androidOffer]);

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
      setError(mapPurchaseError(e?.message ? e : new Error('restore_failed')));
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
    priceDetailFor,
    trialDaysFor,
    buy,
    restore,
    resetStage,
  }), [connected, subscriptions, stage, error, priceFor, priceDetailFor, trialDaysFor, buy, restore, resetStage]);
}
