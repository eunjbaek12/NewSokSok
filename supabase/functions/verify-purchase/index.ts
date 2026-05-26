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
import { evaluateSubscription, type PlaySubscriptionV2Response } from './verify-logic.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PLAY_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;
interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json(401, { ok: false, error: 'unauthorized' });
  }

  const authClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json(401, { ok: false, error: 'unauthorized' });
  }
  const userId = userData.user.id;

  let body: { purchaseToken?: string; productId?: string; platform?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: 'invalid_request', detail: 'malformed json' });
  }

  const purchaseToken = (body.purchaseToken ?? '').trim();
  const productId = (body.productId ?? '').trim();
  const platform = (body.platform ?? '').toLowerCase();

  if (!purchaseToken || !productId) {
    return json(400, { ok: false, error: 'invalid_request' });
  }
  if (platform !== 'android') {
    // iOS는 v1.2 — StoreKit 2 JWS 검증 필요
    return json(400, { ok: false, error: 'invalid_request', detail: 'platform_not_supported' });
  }

  const rl = checkRate(userId);
  if (!rl.ok) {
    return json(429, { ok: false, error: 'rate_limited', retry_after: rl.retryAfter });
  }

  // Play Developer API 인증
  const clientEmail = Deno.env.get('PLAY_SA_CLIENT_EMAIL');
  const privateKey = Deno.env.get('PLAY_SA_PRIVATE_KEY');
  const packageName = Deno.env.get('ANDROID_PACKAGE_NAME');
  if (!clientEmail || !privateKey || !packageName) {
    console.error('verify-purchase: missing PLAY_SA_* or ANDROID_PACKAGE_NAME');
    return json(500, { ok: false, error: 'internal_error' });
  }

  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken({
      clientEmail,
      privateKey,
      scope: PLAY_SCOPE,
    });
  } catch (e) {
    console.error('play token exchange failed', e);
    return json(500, { ok: false, error: 'internal_error' });
  }

  // subscriptionsv2: 새 unified API. 기존 v3 subscriptions API 대비 권장.
  const apiUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;

  let playRes: Response;
  try {
    playRes = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (e) {
    console.error('play api fetch failed', e);
    return json(500, { ok: false, error: 'upstream_failure' });
  }

  if (!playRes.ok) {
    const text = await playRes.text().catch(() => '');
    console.error('play api error', playRes.status, text);
    if (playRes.status === 404 || playRes.status === 410) {
      return json(402, { ok: false, error: 'subscription_invalid', detail: 'not_found' });
    }
    return json(500, { ok: false, error: 'upstream_failure' });
  }

  const playData = await playRes.json() as PlaySubscriptionV2Response;

  // 상태 검증 (순수 로직은 verify-logic.ts 로 추출 — Jest 로 단위 테스트)
  const evaluation = evaluateSubscription(playData, productId);
  if (!evaluation.ok) {
    return json(evaluation.status, { ok: false, error: evaluation.error, detail: evaluation.detail });
  }
  const expiryTime = evaluation.expiryTime;

  // user_subscriptions 갱신 (service_role)
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error: upsertErr } = await svc
    .from('user_subscriptions')
    .upsert({
      user_id: userId,
      tier: 'pro',
      pro_until: expiryTime,
      play_purchase_token: purchaseToken,
      play_product_id: productId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (upsertErr) {
    console.error('user_subscriptions upsert failed', upsertErr);
    return json(500, { ok: false, error: 'internal_error' });
  }

  return json(200, {
    ok: true,
    tier: 'pro',
    pro_until: expiryTime,
    product_id: productId,
  });
});
