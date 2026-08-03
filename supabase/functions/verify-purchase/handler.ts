// verify-purchase 핸들러의 제어 흐름 (Deno/HTTP 글로벌 비의존).
//
// 외부 I/O(JWT 검증, rate limit, Play 설정, Google 토큰, Play API, DB upsert)를
// 전부 deps 로 주입받고, 요청/응답도 단순 인터페이스로 추상화한다. 덕분에 Deno
// 없이 Jest 로 모든 분기(405/401/400/429/402/500/200)를 테스트할 수 있다.
// index.ts 가 실제 Deno/esm.sh 구현을 주입하고 Request/Response 로 감싼다.

import {
  evaluateSubscription,
  evaluateAppleSubscription,
  type PlaySubscriptionV2Response,
  type AppleTransactionPayload,
} from './verify-logic.ts';

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

export interface AppleConfig {
  keyId: string;
  issuerId: string;
  bundleId: string;
  privateKey: string;
}

/**
 * Apple transaction 조회 결과. 검증 실패(404 등)는 null로 반환,
 * 디코딩된 payload는 evaluate 단계에서 검증.
 */
export interface AppleTransactionResult {
  environment: 'production' | 'sandbox';
  payload: AppleTransactionPayload;
}

export interface SubscriptionRow {
  user_id: string;
  tier: 'pro';
  pro_until: string;
  /** Android purchaseToken or iOS originalTransactionId — provider 무관 unique id. */
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
  /** Apple App Store Connect API 설정. 누락 시 null → 500 (iOS 요청 한정). */
  getAppleConfig(): AppleConfig | null;
  /** App Store Server API에서 transactionId로 최신 transaction 조회. 못 찾으면 null. */
  fetchAppleTransaction(transactionId: string, creds: AppleConfig): Promise<AppleTransactionResult | null>;
  /** iOS purchaseToken(JWS)에서 transactionId만 디코딩. */
  decodeAppleJWS(jws: string): { transactionId?: string } | null;
  /**
   * 이 구매 토큰을 이미 보유한 user_id. 없으면 null.
   *
   * 스토어는 "이 구매가 유효한가"에는 답하지만 "누구 것인가"에는 답하지 않는다.
   * 귀속은 우리만 아는 사실이라 우리가 기록해 둔 것과 대조해야 한다.
   */
  findTokenOwner(token: string): Promise<string | null>;
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
    if (platform !== 'android' && platform !== 'ios') {
      return r(400, { ok: false, error: 'invalid_request', detail: 'platform_not_supported' });
    }

    // 3. rate limit
    const rl = deps.checkRate(user.id);
    if (!rl.ok) {
      return r(429, { ok: false, error: 'rate_limited', retry_after: rl.retryAfter });
    }

    // 4~6. 플랫폼별 검증
    let expiryTime: string;
    let storedToken: string = purchaseToken;
    if (platform === 'android') {
      const result = await verifyAndroid(deps, productId, purchaseToken);
      if (!result.ok) return result.response;
      expiryTime = result.expiryTime;
    } else {
      const result = await verifyApple(deps, productId, purchaseToken);
      if (!result.ok) return result.response;
      expiryTime = result.expiryTime;
      // iOS는 originalTransactionId를 안정 키로 저장 (구독 갱신마다 transactionId가
      // 바뀌지만 originalTransactionId는 동일). 환불·취소 추적 시 일관성.
      storedToken = result.originalTransactionId;
    }

    // 7. 소유권 검사 — 구매는 스토어 계정에, 권한은 앱 계정에 귀속된다.
    //
    // 이 둘은 서로 다른 네임스페이스이고, 스토어 응답만으로는 이어지지 않는다.
    // Play/Apple은 "이 구독이 유효한가"까지만 답하므로, 그 답만 보고 부여하면
    // 같은 Play·Apple 계정으로 다른 앱 계정에 로그인한 뒤 복원하는 것만으로
    // 결제 하나가 여러 계정에 Pro를 뿌린다(2026-08-03 실측: 토큰 1개 · 계정 2개).
    //
    // 선점 정책: 먼저 귀속된 계정이 계속 보유한다. 계정을 옮기려는 정상 사용자는
    // 조용한 자동 이전 대신 명시적인 이전 절차로 다뤄야 한다 — 여기서 소유자를
    // 바꿔주면 "의도한 이전"과 "권한 새기"를 서버가 구분할 방법이 없다.
    const owner = await deps.findTokenOwner(storedToken);
    if (owner && owner !== user.id) {
      console.error('[verify] token already owned by another user:', { owner, requester: user.id });
      return r(409, { ok: false, error: 'subscription_owned_by_other' });
    }

    // 8. user_subscriptions 갱신
    const { error: upsertErr } = await deps.upsertSubscription({
      user_id: user.id,
      tier: 'pro',
      pro_until: expiryTime,
      play_purchase_token: storedToken,
      play_product_id: productId,
      updated_at: new Date().toISOString(),
    });
    if (upsertErr) {
      // 23505 = unique 위반. play_purchase_token의 부분 unique 인덱스가 잡은
      // 것이므로 원인은 소유권 충돌 하나뿐이다 — 위 검사와 이 쓰기 사이의 경쟁,
      // 또는 findTokenOwner가 조회 실패로 통과시킨 경우. 500이 아니라 409다.
      if ((upsertErr as { code?: string })?.code === '23505') {
        console.error('[verify] token owned by another user (unique violation):', user.id);
        return r(409, { ok: false, error: 'subscription_owned_by_other' });
      }
      console.error('[verify] upsert failed:', (upsertErr as { message?: string })?.message ?? JSON.stringify(upsertErr));
      return r(500, { ok: false, error: 'internal_error' });
    }

    return r(200, { ok: true, tier: 'pro', pro_until: expiryTime, product_id: productId });
  };
}

// ─── 플랫폼별 검증 ──────────────────────────────────────────────────────────

type VerifyOutcome =
  | { ok: true; expiryTime: string; originalTransactionId: string }
  | { ok: false; response: HandlerResult };

async function verifyAndroid(
  deps: VerifyDeps,
  productId: string,
  purchaseToken: string,
): Promise<VerifyOutcome> {
  const cfg = deps.getPlayConfig();
  if (!cfg) return { ok: false, response: r(500, { ok: false, error: 'internal_error' }) };

  let accessToken: string;
  try {
    accessToken = await deps.getAccessToken({ ...cfg, scope: PLAY_SCOPE });
  } catch (e) {
    console.error('[verify] android getAccessToken failed:', (e as Error)?.message ?? String(e));
    return { ok: false, response: r(500, { ok: false, error: 'internal_error' }) };
  }

  const apiUrl =
    'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'
    + `${encodeURIComponent(cfg.packageName)}/purchases/subscriptionsv2/tokens/`
    + encodeURIComponent(purchaseToken);

  let playRes: PlayResponse;
  try {
    playRes = await deps.fetchPlay(apiUrl, accessToken);
  } catch (e) {
    console.error('[verify] android fetchPlay threw:', (e as Error)?.message ?? String(e));
    return { ok: false, response: r(500, { ok: false, error: 'upstream_failure' }) };
  }

  if (!playRes.ok) {
    const detail = await playRes.text().catch(() => '');
    console.error(`[verify] android play API non-ok status=${playRes.status} sa=${cfg.clientEmail} pkg=${cfg.packageName} body=${detail.slice(0, 500)}`);
    if (playRes.status === 404 || playRes.status === 410) {
      return { ok: false, response: r(402, { ok: false, error: 'subscription_invalid', detail: 'not_found' }) };
    }
    return { ok: false, response: r(500, { ok: false, error: 'upstream_failure' }) };
  }

  const playData = (await playRes.json()) as PlaySubscriptionV2Response;
  const evaluation = evaluateSubscription(playData, productId);
  if (!evaluation.ok) {
    return { ok: false, response: r(evaluation.status, { ok: false, error: evaluation.error, detail: evaluation.detail }) };
  }
  return { ok: true, expiryTime: evaluation.expiryTime, originalTransactionId: purchaseToken };
}

async function verifyApple(
  deps: VerifyDeps,
  productId: string,
  purchaseToken: string,
): Promise<VerifyOutcome> {
  const cfg = deps.getAppleConfig();
  if (!cfg) return { ok: false, response: r(500, { ok: false, error: 'internal_error' }) };

  // 1. 클라이언트가 보낸 JWS purchaseToken에서 transactionId 디코딩
  let transactionId: string;
  try {
    const decoded = deps.decodeAppleJWS(purchaseToken);
    if (!decoded?.transactionId) {
      console.error('[verify] ios JWS decode: no transactionId in token');
      return { ok: false, response: r(400, { ok: false, error: 'invalid_request', detail: 'no_transaction_id' }) };
    }
    transactionId = decoded.transactionId;
  } catch (e) {
    console.error('[verify] ios JWS decode threw (malformed_jws):', (e as Error)?.message ?? String(e));
    return { ok: false, response: r(400, { ok: false, error: 'invalid_request', detail: 'malformed_jws' }) };
  }

  // 2. App Store Server API로 최신 transaction info 조회
  let txResult: AppleTransactionResult | null;
  try {
    txResult = await deps.fetchAppleTransaction(transactionId, cfg);
  } catch (e) {
    console.error('[verify] ios fetchAppleTransaction threw:', (e as Error)?.message ?? String(e));
    return { ok: false, response: r(500, { ok: false, error: 'upstream_failure' }) };
  }
  if (!txResult) {
    console.error(`[verify] ios apple transaction not found (402) txId=${transactionId} bundle=${cfg.bundleId}`);
    return { ok: false, response: r(402, { ok: false, error: 'subscription_invalid', detail: 'not_found' }) };
  }

  // 3. 평가
  const evaluation = evaluateAppleSubscription(txResult.payload, productId, cfg.bundleId);
  if (!evaluation.ok) {
    console.error(`[verify] ios apple eval failed status=${evaluation.status} error=${evaluation.error} detail=${evaluation.detail} env=${txResult.environment} productId=${productId} bundle=${cfg.bundleId}`);
    return { ok: false, response: r(evaluation.status, { ok: false, error: evaluation.error, detail: evaluation.detail }) };
  }
  const originalTransactionId = txResult.payload.originalTransactionId ?? transactionId;
  return { ok: true, expiryTime: evaluation.expiryTime, originalTransactionId };
}
