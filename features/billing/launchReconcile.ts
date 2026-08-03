// 앱 시작 시 구독 자동 재검증 — "갱신(renewal) 반영 gap" 보완.
//
// 문제: verify-purchase는 구매/복원 시점의 만료일(pro_until)을 한 번 저장할 뿐,
// Play/App Store가 자동 갱신해도 그걸 서버에 알려주는 장치(RTDN 웹훅)가 없다.
// 재검증은 요금제 화면(usePurchaseFlow의 auto-reconcile)에서만 돌아서, 갱신된
// 유료 구독자가 요금제 화면을 안 열면 pro_until이 지나 잠깐 Free로 보인다.
//
// 보완: 앱 시작 시 세션당 1회, "구독 이력이 있고 만료가 임박/경과한" 로그인
// 유저에 한해 조용히 재검증한다. restore()와 같은 수동 sweep 패턴이라 purchase
// 리스너를 새로 달지 않는다(= iOS 미완료거래 자동재생 알림 회귀[PR #58] 위험 없음).
// 무료·게스트·만료 여유 있는 구독자는 IAP 연결조차 안 한다.

import { Platform } from 'react-native';
import { initConnection, endConnection, getAvailablePurchases, finishTransaction } from 'expo-iap';
import { supabase } from '@/lib/supabase/client';
import { useQuotaStore } from '@/features/quota';
import { isProSku } from '@/lib/billing/skus';

// 세션당 1회. 앱 재시작 시 다시 시도(그때가 새 갱신을 잡을 시점이기도 함).
let attempted = false;

// 만료가 이 시간 이내(또는 이미 지남)일 때만 재검증 — 사이클 중반의 건강한
// 구독자는 매 실행 Play/App Store API를 안 친다(호출 절약).
const REVERIFY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3일

/**
 * 앱 시작(클라우드 로그인) 시 fire-and-forget으로 호출. 내부에서 모든 조건을
 * 자체 게이트하며, 실패해도 조용히 삼킨다(로그만). UI 상태·알림 없음.
 */
export async function reconcileSubscriptionOnLaunch(): Promise<void> {
  if (attempted) return;
  attempted = true;
  try {
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess.session?.user?.id;
    if (!userId) return; // 게스트/로그아웃 — 재검증 대상 아님

    // 구독 이력(play_product_id) + 현재 만료일 조회. RLS self_read 허용.
    const { data: sub } = await supabase
      .from('user_subscriptions')
      .select('play_product_id, pro_until')
      .eq('user_id', userId)
      .maybeSingle();

    // 실제 스토어 구매 이력이 없으면(무료·트라이얼) 스킵 → IAP 연결조차 안 함.
    if (!sub?.play_product_id) return;

    // 만료가 아직 넉넉하면 스킵 — 갱신 경계 근처에서만 재검증.
    const proUntilMs = sub.pro_until ? new Date(sub.pro_until).getTime() : 0;
    if (proUntilMs - Date.now() > REVERIFY_WINDOW_MS) {
      // [billing-diag] 이 경로가 "안 도는" 가장 흔한 이유다(설계대로). 로그가 없으면
      // 만료 3일 전까지는 침묵과 고장이 똑같아 보인다.
      console.warn('[billing-diag] launch reconcile skipped: pro_until far off', sub.pro_until);
      return;
    }

    await initConnection();
    let updated = false;
    try {
      const purchases = (await getAvailablePurchases()) ?? [];
      console.warn(
        '[billing-diag] launch reconcile sweep',
        'count=', purchases.length,
        'ids=', purchases.map((p) => p.productId).join(',') || '(none)',
      );
      for (const p of purchases) {
        if (!isProSku(p.productId)) continue;
        const token = p.purchaseToken ?? '';
        if (!token) continue;
        const { data, error: edgeErr } = await supabase.functions.invoke('verify-purchase', {
          body: { purchaseToken: token, productId: p.productId, platform: Platform.OS },
        });
        console.warn(
          '[billing-diag] launch reconcile verify',
          'productId=', p.productId,
          'ok=', data?.ok,
          'edgeErrMsg=', edgeErr?.message ?? null,
        );
        if (data?.ok) {
          // acknowledge(멱등). restore()와 동일 — 미완료 구매가 남아 재구매를
          // 막는 상황도 함께 정리.
          await finishTransaction({ purchase: p, isConsumable: false });
          updated = true;
        }
      }
    } finally {
      try { await endConnection(); } catch {}
    }

    if (updated) {
      try { await useQuotaStore.getState().refresh(true); } catch {}
    }
  } catch (e: any) {
    console.warn('[billing] launch reconcile failed:', e?.message ?? String(e));
  }
}
