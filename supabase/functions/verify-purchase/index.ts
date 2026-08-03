// POST /functions/v1/verify-purchase
// Body: { purchaseToken: string, productId: string, platform: 'android' | 'ios' }
// Headers: Authorization: Bearer <supabase JWT>
//
// 흐름:
//   1. JWT 검증 → 사용자 식별
//   2. rate-limit (분당 5건)
//   3. Android: purchaseToken으로 Play Developer subscriptionsv2 조회
//      iOS:     purchaseToken(JWS)에서 transactionId 디코딩 → App Store Server
//               API에 transaction 조회 (production → 404면 sandbox fallback)
//   4. Android: SUBSCRIPTION_STATE_ACTIVE | IN_GRACE_PERIOD + productId 일치 + expiry > now
//      iOS:     bundleId 일치 + productId 일치 + revocationDate 없음 + expiresDate > now
//   5. user_subscriptions 갱신 (service_role): tier='pro', pro_until=expiryTime,
//      play_purchase_token=(Android purchaseToken | iOS originalTransactionId),
//      play_product_id
//
// 제어 흐름은 handler.ts(createVerifyHandler) 로 추출 — Deno 없이 Jest 로 테스트.
// 이 파일은 Deno/esm.sh 의존성(getUser/Play API/Apple API/upsert)을 주입하고
// HTTP 로 감싸는 wiring 만 담당.
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
//   APPLE_KEY_ID           App Store Connect API Key ID
//   APPLE_ISSUER_ID        App Store Connect Issuer ID (UUID)
//   APPLE_BUNDLE_ID        com.soksokvoca (iOS bundle 식별자)
//   APPLE_PRIVATE_KEY      App Store Connect API .p8 EC private key (PEM, \n 이스케이프 OK)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { getGoogleAccessToken } from '../_shared/google-auth.ts';
import { fetchAppleTransaction, decodeJWSPayload } from '../_shared/apple-storekit.ts';
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

  getAppleConfig() {
    const keyId = Deno.env.get('APPLE_KEY_ID');
    const issuerId = Deno.env.get('APPLE_ISSUER_ID');
    const bundleId = Deno.env.get('APPLE_BUNDLE_ID');
    const privateKey = Deno.env.get('APPLE_PRIVATE_KEY');
    if (!keyId || !issuerId || !bundleId || !privateKey) {
      console.error('verify-purchase: missing APPLE_KEY_ID/ISSUER_ID/BUNDLE_ID/PRIVATE_KEY');
      return null;
    }
    return { keyId, issuerId, bundleId, privateKey };
  },

  async fetchAppleTransaction(transactionId, creds) {
    const result = await fetchAppleTransaction(transactionId, creds);
    if (!result) return null;
    // _shared의 AppleTransactionInfo 와 handler의 AppleTransactionPayload는
    // 형태가 동일 — 그대로 통과.
    return { environment: result.environment, payload: result.info };
  },

  decodeAppleJWS(jws) {
    try {
      const payload = decodeJWSPayload(jws);
      const transactionId = typeof payload.transactionId === 'string' ? payload.transactionId : undefined;
      return { transactionId };
    } catch {
      return null;
    }
  },

  async findTokenOwner(token: string) {
    const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    // maybeSingle()이 아니라 limit(1) — 인덱스를 걸기 전에 이미 들어온 중복 행이
    // 있으면 maybeSingle은 에러를 던져 정상 요청까지 막는다.
    const { data, error } = await svc
      .from('user_subscriptions')
      .select('user_id')
      .eq('play_purchase_token', token)
      .limit(1);
    if (error) {
      // 조회 실패는 통과시킨다(fail-open). 최종 방어선은 코드가 아니라
      // play_purchase_token의 부분 unique 인덱스이고, 그쪽이 막으면 아래
      // upsert가 23505로 떨어져 409가 된다.
      console.error('[verify] findTokenOwner failed:', error.message);
      return null;
    }
    return data?.[0]?.user_id ?? null;
  },

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
