// POST /functions/v1/verify-purchase
// Body: { purchaseToken: string, productId: string, platform: 'android' | 'ios' }
// Headers: Authorization: Bearer <supabase JWT>
//
// 흐름:
//   1. JWT 검증 → 사용자 식별
//   2. rate-limit (분당 5건)
//   3. Android: Play Developer API로 subscription 상태 조회
//      iOS:     (v1.2 follow-up — Apple StoreKit 2 JWS 검증)
//   4. SUBSCRIPTION_STATE_ACTIVE | IN_GRACE_PERIOD 만 인정
//      productId 일치 + expiryTime > now 검증
//   5. user_subscriptions 갱신 (service_role): tier='pro', pro_until=expiryTime,
//      play_purchase_token, play_product_id
//
// 제어 흐름은 handler.ts(createVerifyHandler) 로 추출 — Deno 없이 Jest 로 테스트.
// 이 파일은 Deno/esm.sh 의존성(getUser/Play API/upsert)을 주입하고 HTTP 로 감싸는 wiring 만 담당.
//
// 응답:
//   200 { ok: true, tier: 'pro', pro_until: ISOString, product_id }
//   400 { ok: false, error: 'invalid_request' }
//   401 { ok: false, error: 'unauthorized' }
//   402 { ok: false, error: 'subscription_invalid' }  (취소·만료·환불)
//   429 { ok: false, error: 'rate_limited', retry_after }
//   500 { ok: false, error: 'upstream_failure' | 'internal_error' }
//
// 필요한 Secret:
//   PLAY_SA_CLIENT_EMAIL   Play Developer API 서비스 계정 이메일
//   PLAY_SA_PRIVATE_KEY    Play Developer API 서비스 계정 private key (PEM, \n 이스케이프 OK)
//   ANDROID_PACKAGE_NAME   com.soksokvoca (앱 패키지명)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { getGoogleAccessToken } from '../_shared/google-auth.ts';
import { createVerifyHandler, type SubscriptionRow } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ── rate limit (in-memory, 인스턴스 단위) ──────────────────────────────────────
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;
interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

function checkRate(userId: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const b = buckets.get(userId);
  if (!b || b.resetAt <= now) {
    buckets.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true };
  }
  if (b.count >= RATE_MAX) return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  b.count += 1;
  return { ok: true };
}

// ── 핸들러 + 실제 의존성 주입 ──────────────────────────────────────────────────
const handle = createVerifyHandler({
  async getUser(authHeader) {
    const authClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data, error } = await authClient.auth.getUser();
    if (error || !data?.user) return null;
    return { id: data.user.id };
  },

  checkRate,

  getPlayConfig() {
    const clientEmail = Deno.env.get('PLAY_SA_CLIENT_EMAIL');
    const privateKey = Deno.env.get('PLAY_SA_PRIVATE_KEY');
    const packageName = Deno.env.get('ANDROID_PACKAGE_NAME');
    if (!clientEmail || !privateKey || !packageName) {
      console.error('verify-purchase: missing PLAY_SA_* or ANDROID_PACKAGE_NAME');
      return null;
    }
    return { clientEmail, privateKey, packageName };
  },

  getAccessToken: getGoogleAccessToken,

  // subscriptionsv2: 새 unified API. 기존 v3 subscriptions API 대비 권장.
  fetchPlay: (url, accessToken) =>
    fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }),

  async upsertSubscription(row: SubscriptionRow) {
    const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    return await svc.from('user_subscriptions').upsert(row, { onConflict: 'user_id' });
  },
});

Deno.serve(async (req) => {
  const result = await handle({
    method: req.method,
    authHeader: req.headers.get('Authorization'),
    json: () => req.json(),
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
});
