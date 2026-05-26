// verify-purchase 핸들러의 제어 흐름 (Deno/HTTP 글로벌 비의존).
//
// 외부 I/O(JWT 검증, rate limit, Play 설정, Google 토큰, Play API, DB upsert)를
// 전부 deps 로 주입받고, 요청/응답도 단순 인터페이스로 추상화한다. 덕분에 Deno
// 없이 Jest 로 모든 분기(405/401/400/429/402/500/200)를 테스트할 수 있다.
// index.ts 가 실제 Deno/esm.sh 구현을 주입하고 Request/Response 로 감싼다.

import { evaluateSubscription, type PlaySubscriptionV2Response } from './verify-logic.ts';

const PLAY_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

/** 핸들러가 요청에서 실제로 쓰는 것만 추린 최소 인터페이스. */
export interface VerifyRequest {
  method: string;
  authHeader: string | null;
  json(): Promise<unknown>;
}

export interface HandlerResult {
  status: number;
  body: unknown;
}

/** fetch Response 의 구조적 부분집합 (Play API 응답). */
export interface PlayResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface PlayConfig {
  clientEmail: string;
  privateKey: string;
  packageName: string;
}

export interface SubscriptionRow {
  user_id: string;
  tier: 'pro';
  pro_until: string;
  play_purchase_token: string;
  play_product_id: string;
  updated_at: string;
}

export interface VerifyDeps {
  /** JWT(Authorization 헤더)로 사용자 식별. 실패 시 null. */
  getUser(authHeader: string): Promise<{ id: string } | null>;
  /** userId 기준 rate limit. */
  checkRate(userId: string): { ok: boolean; retryAfter?: number };
  /** Play 서비스 계정 설정. 누락 시 null → 500. */
  getPlayConfig(): PlayConfig | null;
  /** Google access token 교환. */
  getAccessToken(args: { clientEmail: string; privateKey: string; scope: string }): Promise<string>;
  /** Play Developer API 호출. */
  fetchPlay(url: string, accessToken: string): Promise<PlayResponse>;
  /** user_subscriptions upsert. */
  upsertSubscription(row: SubscriptionRow): Promise<{ error: unknown | null }>;
}

function r(status: number, body: unknown): HandlerResult {
  return { status, body };
}

export function createVerifyHandler(deps: VerifyDeps) {
  return async (req: VerifyRequest): Promise<HandlerResult> => {
    if (req.method !== 'POST') return r(405, { ok: false, error: 'method_not_allowed' });

    // 1. JWT 검증
    if (!req.authHeader?.startsWith('Bearer ')) {
      return r(401, { ok: false, error: 'unauthorized' });
    }
    const user = await deps.getUser(req.authHeader);
    if (!user) return r(401, { ok: false, error: 'unauthorized' });

    // 2. 본문 파싱 + 검증
    let body: { purchaseToken?: string; productId?: string; platform?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return r(400, { ok: false, error: 'invalid_request', detail: 'malformed json' });
    }

    const purchaseToken = (body.purchaseToken ?? '').trim();
    const productId = (body.productId ?? '').trim();
    const platform = (body.platform ?? '').toLowerCase();

    if (!purchaseToken || !productId) {
      return r(400, { ok: false, error: 'invalid_request' });
    }
    if (platform !== 'android') {
      // iOS는 v1.2 — StoreKit 2 JWS 검증 필요
      return r(400, { ok: false, error: 'invalid_request', detail: 'platform_not_supported' });
    }

    // 3. rate limit
    const rl = deps.checkRate(user.id);
    if (!rl.ok) {
      return r(429, { ok: false, error: 'rate_limited', retry_after: rl.retryAfter });
    }

    // 4. Play Developer API 인증
    const cfg = deps.getPlayConfig();
    if (!cfg) return r(500, { ok: false, error: 'internal_error' });

    let accessToken: string;
    try {
      accessToken = await deps.getAccessToken({ ...cfg, scope: PLAY_SCOPE });
    } catch {
      return r(500, { ok: false, error: 'internal_error' });
    }

    // 5. subscriptionsv2 조회
    const apiUrl =
      'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'
      + `${encodeURIComponent(cfg.packageName)}/purchases/subscriptionsv2/tokens/`
      + encodeURIComponent(purchaseToken);

    let playRes: PlayResponse;
    try {
      playRes = await deps.fetchPlay(apiUrl, accessToken);
    } catch {
      return r(500, { ok: false, error: 'upstream_failure' });
    }

    if (!playRes.ok) {
      if (playRes.status === 404 || playRes.status === 410) {
        return r(402, { ok: false, error: 'subscription_invalid', detail: 'not_found' });
      }
      return r(500, { ok: false, error: 'upstream_failure' });
    }

    // 6. 상태 판정 (순수 로직)
    const playData = (await playRes.json()) as PlaySubscriptionV2Response;
    const evaluation = evaluateSubscription(playData, productId);
    if (!evaluation.ok) {
      return r(evaluation.status, { ok: false, error: evaluation.error, detail: evaluation.detail });
    }
    const expiryTime = evaluation.expiryTime;

    // 7. user_subscriptions 갱신
    const { error: upsertErr } = await deps.upsertSubscription({
      user_id: user.id,
      tier: 'pro',
      pro_until: expiryTime,
      play_purchase_token: purchaseToken,
      play_product_id: productId,
      updated_at: new Date().toISOString(),
    });
    if (upsertErr) return r(500, { ok: false, error: 'internal_error' });

    return r(200, { ok: true, tier: 'pro', pro_until: expiryTime, product_id: productId });
  };
}
