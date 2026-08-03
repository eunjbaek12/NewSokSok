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
import { mapPurchaseError, readEdgeErrorBody, isDefinitiveVerifyRejection, isOwnershipRejection, type MappedPurchaseError } from './error-mapping';
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
      if (edgeErr || !data?.ok) {
        // 409는 "이 구독이 다른 앱 계정 것"이라는 확정 거절이다. generic
        // verify_failed로 뭉뚱그리면 "복원해보세요"를 권하게 되는데, 복원해도
        // 같은 409를 받으므로 사용자를 무한히 돌린다.
        const body = edgeErr ? await readEdgeErrorBody(edgeErr) : data;
        if (isOwnershipRejection(body)) throw new Error('owned_by_other');
        throw edgeErr ?? new Error('verify_failed');
      }

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
        // restore와 같은 이유로 세션을 먼저 확인·리프레시한다. 게스트면 verify가
        // 401 확정이라 sweep 자체가 낭비고, 만료 토큰이면 게이트웨이에서 잘려
        // 함수 로그에도 안 남는다.
        const { data: sess } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!sess.session) {
          console.warn('[billing-diag] auto-reconcile skipped: no session');
          return;
        }

        const purchases = await getAvailablePurchases();
        if (cancelled) return;
        // [billing-diag] restore와 같은 이유로 개수를 남긴다. 이 경로는 UI가 전혀
        // 없어서, 로그가 없으면 "sweep이 아무것도 못 찾았다"와 "sweep이 아예 안
        // 돌았다"를 구분할 방법이 없다.
        console.warn(
          '[billing-diag] auto-reconcile sweep',
          'count=', purchases.length,
          'ids=', purchases.map((p) => p.productId).join(',') || '(none)',
        );
        let reconciled = false;
        for (const p of purchases) {
          if (cancelled) return;
          if (!PRO_SKUS.includes(p.productId as ProSku)) continue;
          const token = p.purchaseToken ?? '';
          if (!token) continue;
          try {
            const { data, error: edgeErr } = await supabase.functions.invoke('verify-purchase', {
              body: { purchaseToken: token, productId: p.productId, platform: Platform.OS },
            });
            console.warn(
              '[billing-diag] auto-reconcile verify',
              'productId=', p.productId,
              'ok=', data?.ok,
              'edgeErrMsg=', edgeErr?.message ?? null,
            );
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
      // 구매에 앱 계정 id를 각인한다. Play/Apple이 이 값을 그대로(서명해서) 돌려주므로,
      // 서버는 "이 구독이 누구 것인가"를 우리 DB 기록으로 추측하는 대신 스토어가
      // 확인해 준 사실로 알 수 있다. 구매가 스토어 계정에, 권한이 앱 계정에 귀속되는
      // 두 네임스페이스를 잇는 유일한 지점이다.
      //
      // 게스트(세션 없음)면 각인할 게 없다 — 그 경우 verify가 401로 떨어지는 건
      // 이전과 동일하다. user.id는 UUID라 Apple의 UUID 요구와 Play의 64자 제한을
      // 둘 다 만족한다.
      const { data: sess } = await supabase.auth.getSession();
      const accountId = sess.session?.user?.id;

      if (Platform.OS === 'ios') {
        await requestPurchase({
          request: { apple: { sku, appAccountToken: accountId } },
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
              obfuscatedAccountId: accountId,
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

    // 스토어 연결 전에는 getAvailablePurchases가 던지지 않고 그냥 빈 배열을 준다 —
    // "아직 물어볼 수 없다"와 "복원할 게 없다"가 호출부에서 구분되지 않는다. 그래서
    // 연결 전에 누르면 sweep이 빈손으로 끝나고 화면은 조용히 idle로 돌아간다.
    // auto-reconcile에는 이 가드가 처음부터 있었고 여기만 빠져 있었다.
    if (!connected) {
      console.warn('[billing-diag] restore aborted: not connected');
      setError(mapPurchaseError(new Error('not_connected')));
      setStage('failed');
      return;
    }

    setStage('verifying');
    try {
      // 세션을 먼저 확인한다 — getSession()은 만료된 액세스 토큰을 리프레시하므로
      // 진단이 아니라 예방이다. verify-purchase는 `--no-verify-jwt` 없이 배포돼
      // 게이트웨이가 JWT를 먼저 검사하는데, 만료 토큰은 **함수가 부팅되기 전에**
      // 401로 잘린다 — 그러면 Edge 함수 로그에도 안 남아 "요청이 아예 없었다"로
      // 보인다. buy/reconcileReplayed는 원래 이 호출을 하고 있었고 여기만 빠져 있었다.
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        console.warn('[billing-diag] restore aborted: no session');
        setError(mapPurchaseError(new Error('not_signed_in')));
        setStage('failed');
        return;
      }

      const purchases = await getAvailablePurchases();
      // [billing-diag] 복원이 조용히 실패할 때 원인을 가르는 한 줄. 0이면 스토어가
      // 아무것도 안 준 것(계정·연결), 0이 아닌데 아래 proMatches가 0이면 SKU 필터가
      // 어긋난 것이다. 토큰은 절대 찍지 않는다 — productId만.
      console.warn(
        '[billing-diag] restore sweep',
        'count=', purchases.length,
        'ids=', purchases.map((p) => p.productId).join(',') || '(none)',
      );

      let restored = false;
      // 복원 대상이 있긴 한데 전부 다른 계정 것이었던 경우. 이게 없으면 화면이
      // 조용히 idle로 돌아가 사용자는 "눌렀는데 아무 일도 안 일어났다"를 겪는다.
      let ownedByOther = false;
      // verify가 일시 오류(네트워크·5xx)로 실패한 경우. "복원할 구매가 없다"와
      // 반드시 구분해야 한다 — 구매는 있었는데 확인을 못 한 것이므로 재시도가 정답이다.
      let verifyFailed = false;
      let proMatches = 0;
      for (const p of purchases) {
        if (!PRO_SKUS.includes(p.productId as ProSku)) continue;
        proMatches += 1;
        const token = p.purchaseToken ?? '';
        if (!token) {
          console.warn('[billing-diag] restore: pro purchase without token', p.productId);
          continue;
        }
        const { data, error: edgeErr } = await supabase.functions.invoke('verify-purchase', {
          body: { purchaseToken: token, productId: p.productId, platform: Platform.OS },
        });
        console.warn(
          '[billing-diag] restore verify',
          'productId=', p.productId,
          'ok=', data?.ok,
          'edgeErrMsg=', edgeErr?.message ?? null,
        );
        if (edgeErr && isOwnershipRejection(await readEdgeErrorBody(edgeErr))) {
          ownedByOther = true;
          continue;
        }
        if (data?.ok) {
          // Acknowledge the purchase. Without this, an un-acknowledged purchase
          // lingers and Play blocks any re-purchase / plan change with
          // "developer has not acknowledged the purchase". The success path
          // (handleSuccess) finishes the transaction; restore must too.
          await finishTransaction({ purchase: p, isConsumable: false });
          restored = true;
        } else {
          verifyFailed = true;
        }
      }
      console.warn(
        '[billing-diag] restore result',
        'proMatches=', proMatches,
        'restored=', restored,
        'ownedByOther=', ownedByOther,
        'verifyFailed=', verifyFailed,
      );

      if (restored) {
        await useQuotaStore.getState().refresh(true);
        setStage('success');
      } else if (ownedByOther) {
        setError(mapPurchaseError(new Error('owned_by_other')));
        setStage('failed');
      } else if (verifyFailed) {
        setError(mapPurchaseError(new Error('restore_failed')));
        setStage('failed');
      } else {
        // 여기서 조용히 idle로 돌아가면 사용자는 "눌렀는데 아무 일도 없다"를 겪는다.
        // 복원할 구매가 없었다는 것도 결과이므로 그대로 말해 준다.
        //
        // 단, 이미 Pro면 말이 달라진다. 구독은 앱 계정에 붙어 있어서 다른 스토어에서
        // 산 구독을 쓰는 기기(Play로 결제 → iPhone에서 사용)에서는 이 스토어에
        // 복원할 구매가 없는 게 정상이다. 그 사람에게 "복원할 구매가 없다"만 말하면
        // 화면의 "현재 Pro 구독 중"과 모순돼 구독이 깨진 줄 안다.
        const alreadyPro = useQuotaStore.getState().status?.tier === 'pro';
        setError(mapPurchaseError(new Error(alreadyPro ? 'already_pro_no_restore' : 'no_restorable_purchase')));
        setStage('failed');
      }
    } catch (e: any) {
      console.warn('[billing-diag] restore threw', 'msg=', e?.message ?? String(e));
      setError(mapPurchaseError(e?.message ? e : new Error('restore_failed')));
      setStage('failed');
    }
  }, [connected, getAvailablePurchases, finishTransaction]);

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
