// ③ Edge Function 핸들러 통합 — verify-purchase/handler.ts (createVerifyHandler)
//
// 의존성을 mock 주입해 제어 흐름의 모든 분기(405/401/400/429/402/500/200)를 검증한다.
// (구독 상태 판정 자체는 billing-verify-logic.test.ts 에서 별도로 다룬다.)

import {
  createVerifyHandler,
  type VerifyDeps,
  type VerifyRequest,
} from '../supabase/functions/verify-purchase/handler';

const FUTURE = new Date('2026-12-31T00:00:00Z').toISOString();
const FUTURE_MS = new Date(FUTURE).getTime();
const PRODUCT = 'pro_monthly';
const PKG = 'com.soksokvoca';
const BUNDLE = 'com.soksokvoca';
const APPLE_ORIGINAL_TX = 'orig-tx-1';
const APPLE_TX = 'tx-renewal-1';

const activePlayData = {
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
  lineItems: [{ productId: PRODUCT, expiryTime: FUTURE }],
};

const activeApplePayload = {
  bundleId: BUNDLE,
  productId: PRODUCT,
  transactionId: APPLE_TX,
  originalTransactionId: APPLE_ORIGINAL_TX,
  expiresDate: FUTURE_MS,
};

function playResponse(over: Partial<{ ok: boolean; status: number; data: unknown }> = {}) {
  const { ok = true, status = 200, data = activePlayData } = over;
  return { ok, status, json: async () => data, text: async () => '' };
}

function makeDeps(over: Partial<VerifyDeps> = {}): jest.Mocked<VerifyDeps> {
  return {
    getUser: jest.fn(async () => ({ id: 'user-1' })),
    checkRate: jest.fn(() => ({ ok: true })),
    getPlayConfig: jest.fn(() => ({ clientEmail: 'e@x', privateKey: 'k', packageName: PKG })),
    getAccessToken: jest.fn(async () => 'access-token'),
    fetchPlay: jest.fn(async () => playResponse()),
    getAppleConfig: jest.fn(() => ({ keyId: 'KID', issuerId: 'ISS', bundleId: BUNDLE, privateKey: 'pk' })),
    fetchAppleTransaction: jest.fn(async () => ({ environment: 'production' as const, payload: { ...activeApplePayload } })),
    decodeAppleJWS: jest.fn(() => ({ transactionId: APPLE_TX })),
    findTokenOwner: jest.fn(async () => null),
    upsertSubscription: jest.fn(async () => ({ error: null })),
    ...over,
  } as jest.Mocked<VerifyDeps>;
}

function makeReq(over: Partial<VerifyRequest> = {}): VerifyRequest {
  return {
    method: 'POST',
    authHeader: 'Bearer jwt-token',
    json: async () => ({ purchaseToken: 'tok-123', productId: PRODUCT, platform: 'android' }),
    ...over,
  };
}

describe('verify-purchase 핸들러 — 성공 경로', () => {
  it('정상 요청 → 200 + tier=pro, upsert 호출', async () => {
    const deps = makeDeps();
    const res = await createVerifyHandler(deps)(makeReq());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true, tier: 'pro', pro_until: FUTURE, product_id: PRODUCT,
    });
    expect(deps.upsertSubscription).toHaveBeenCalledTimes(1);
    const row = deps.upsertSubscription.mock.calls[0][0];
    expect(row).toMatchObject({
      user_id: 'user-1', tier: 'pro', pro_until: FUTURE,
      play_purchase_token: 'tok-123', play_product_id: PRODUCT,
    });
  });

  it('Play API 를 올바른 subscriptionsv2 URL 로 호출한다', async () => {
    const deps = makeDeps();
    await createVerifyHandler(deps)(makeReq());

    const [url, token] = deps.fetchPlay.mock.calls[0];
    expect(url).toBe(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}/purchases/subscriptionsv2/tokens/tok-123`,
    );
    expect(token).toBe('access-token');
  });
});

describe('verify-purchase 핸들러 — 메서드/인증', () => {
  it('POST 가 아니면 → 405', async () => {
    const deps = makeDeps();
    const res = await createVerifyHandler(deps)(makeReq({ method: 'GET' }));
    expect(res.status).toBe(405);
    expect(deps.getUser).not.toHaveBeenCalled();
  });

  it('Authorization 헤더 없음 → 401, getUser 미호출', async () => {
    const deps = makeDeps();
    const res = await createVerifyHandler(deps)(makeReq({ authHeader: null }));
    expect(res.status).toBe(401);
    expect(deps.getUser).not.toHaveBeenCalled();
  });

  it('Bearer 가 아닌 헤더 → 401', async () => {
    const deps = makeDeps();
    const res = await createVerifyHandler(deps)(makeReq({ authHeader: 'Basic abc' }));
    expect(res.status).toBe(401);
  });

  it('JWT 검증 실패(getUser null) → 401', async () => {
    const deps = makeDeps({ getUser: jest.fn(async () => null) });
    const res = await createVerifyHandler(deps)(makeReq());
    expect(res.status).toBe(401);
  });
});

describe('verify-purchase 핸들러 — 본문 검증', () => {
  it('JSON 파싱 실패 → 400 malformed json', async () => {
    const deps = makeDeps();
    const req = makeReq({ json: async () => { throw new Error('bad'); } });
    const res = await createVerifyHandler(deps)(req);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ detail: 'malformed json' });
  });

  it('purchaseToken 누락 → 400', async () => {
    const deps = makeDeps();
    const req = makeReq({ json: async () => ({ productId: PRODUCT, platform: 'android' }) });
    const res = await createVerifyHandler(deps)(req);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ ok: false, error: 'invalid_request' });
  });

  it('productId 누락 → 400', async () => {
    const deps = makeDeps();
    const req = makeReq({ json: async () => ({ purchaseToken: 'tok', platform: 'android' }) });
    const res = await createVerifyHandler(deps)(req);
    expect(res.status).toBe(400);
  });

  it('platform 누락/미지원 값 → 400 platform_not_supported', async () => {
    const deps = makeDeps();
    const req = makeReq({ json: async () => ({ purchaseToken: 'tok', productId: PRODUCT, platform: 'web' }) });
    const res = await createVerifyHandler(deps)(req);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ detail: 'platform_not_supported' });
    expect(deps.checkRate).not.toHaveBeenCalled();
  });
});

describe('verify-purchase 핸들러 — iOS 경로', () => {
  function iosReq(over: Partial<{ purchaseToken: string; productId: string }> = {}) {
    return makeReq({
      json: async () => ({
        purchaseToken: over.purchaseToken ?? 'jws-token',
        productId: over.productId ?? PRODUCT,
        platform: 'ios',
      }),
    });
  }

  it('정상 iOS 요청 → 200, originalTransactionId가 play_purchase_token에 저장', async () => {
    const deps = makeDeps();
    const res = await createVerifyHandler(deps)(iosReq());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, tier: 'pro', pro_until: FUTURE, product_id: PRODUCT });
    expect(deps.decodeAppleJWS).toHaveBeenCalledWith('jws-token');
    expect(deps.fetchAppleTransaction).toHaveBeenCalledWith(APPLE_TX, expect.objectContaining({ bundleId: BUNDLE }));
    const row = deps.upsertSubscription.mock.calls[0][0];
    expect(row).toMatchObject({
      user_id: 'user-1',
      tier: 'pro',
      pro_until: FUTURE,
      play_purchase_token: APPLE_ORIGINAL_TX,
      play_product_id: PRODUCT,
    });
    expect(deps.fetchPlay).not.toHaveBeenCalled();
  });

  it('Apple 설정 누락 → 500 internal_error', async () => {
    const deps = makeDeps({ getAppleConfig: jest.fn(() => null) });
    const res = await createVerifyHandler(deps)(iosReq());
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'internal_error' });
    expect(deps.fetchAppleTransaction).not.toHaveBeenCalled();
  });

  it('JWS 디코딩 실패(transactionId 없음) → 400 no_transaction_id', async () => {
    const deps = makeDeps({ decodeAppleJWS: jest.fn(() => ({})) });
    const res = await createVerifyHandler(deps)(iosReq());
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ detail: 'no_transaction_id' });
    expect(deps.fetchAppleTransaction).not.toHaveBeenCalled();
  });

  it('JWS 디코딩 throw → 400 malformed_jws', async () => {
    const deps = makeDeps({ decodeAppleJWS: jest.fn(() => { throw new Error('bad'); }) });
    const res = await createVerifyHandler(deps)(iosReq());
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ detail: 'malformed_jws' });
  });

  it('App Store transaction 조회 결과 null → 402 not_found', async () => {
    const deps = makeDeps({ fetchAppleTransaction: jest.fn(async () => null) });
    const res = await createVerifyHandler(deps)(iosReq());
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ error: 'subscription_invalid', detail: 'not_found' });
    expect(deps.upsertSubscription).not.toHaveBeenCalled();
  });

  it('App Store API 예외 → 500 upstream_failure', async () => {
    const deps = makeDeps({ fetchAppleTransaction: jest.fn(async () => { throw new Error('net'); }) });
    const res = await createVerifyHandler(deps)(iosReq());
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'upstream_failure' });
  });

  it('bundleId 불일치 → 402 bundle_mismatch', async () => {
    const deps = makeDeps({
      fetchAppleTransaction: jest.fn(async () => ({
        environment: 'production' as const,
        payload: { ...activeApplePayload, bundleId: 'com.attacker' },
      })),
    });
    const res = await createVerifyHandler(deps)(iosReq());
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ detail: 'bundle_mismatch' });
  });

  it('환불됨(revocationDate 존재) → 402 revoked', async () => {
    const deps = makeDeps({
      fetchAppleTransaction: jest.fn(async () => ({
        environment: 'production' as const,
        payload: { ...activeApplePayload, revocationDate: FUTURE_MS - 1000 },
      })),
    });
    const res = await createVerifyHandler(deps)(iosReq());
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ detail: 'revoked' });
  });
});

describe('verify-purchase 핸들러 — rate limit', () => {
  it('checkRate 거부 → 429 + retry_after', async () => {
    const deps = makeDeps({ checkRate: jest.fn(() => ({ ok: false, retryAfter: 42 })) });
    const res = await createVerifyHandler(deps)(makeReq());
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ ok: false, error: 'rate_limited', retry_after: 42 });
    expect(deps.fetchPlay).not.toHaveBeenCalled();
  });

  it('checkRate 는 식별된 userId 로 호출된다', async () => {
    const deps = makeDeps();
    await createVerifyHandler(deps)(makeReq());
    expect(deps.checkRate).toHaveBeenCalledWith('user-1');
  });
});

describe('verify-purchase 핸들러 — Play 설정/토큰/네트워크 오류', () => {
  it('Play 설정 누락 → 500 internal_error', async () => {
    const deps = makeDeps({ getPlayConfig: jest.fn(() => null) });
    const res = await createVerifyHandler(deps)(makeReq());
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'internal_error' });
  });

  it('access token 교환 실패 → 500 internal_error', async () => {
    const deps = makeDeps({ getAccessToken: jest.fn(async () => { throw new Error('token'); }) });
    const res = await createVerifyHandler(deps)(makeReq());
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'internal_error' });
  });

  it('Play API fetch 예외 → 500 upstream_failure', async () => {
    const deps = makeDeps({ fetchPlay: jest.fn(async () => { throw new Error('net'); }) });
    const res = await createVerifyHandler(deps)(makeReq());
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'upstream_failure' });
  });
});

describe('verify-purchase 핸들러 — Play API 응답 매핑', () => {
  it.each([404, 410])('Play %d → 402 not_found', async (status) => {
    const deps = makeDeps({ fetchPlay: jest.fn(async () => playResponse({ ok: false, status })) });
    const res = await createVerifyHandler(deps)(makeReq());
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ error: 'subscription_invalid', detail: 'not_found' });
    expect(deps.upsertSubscription).not.toHaveBeenCalled();
  });

  it('Play 5xx → 500 upstream_failure', async () => {
    const deps = makeDeps({ fetchPlay: jest.fn(async () => playResponse({ ok: false, status: 503 })) });
    const res = await createVerifyHandler(deps)(makeReq());
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'upstream_failure' });
  });

  it('상태 비활성(CANCELED) → 402 subscription_invalid', async () => {
    const data = { subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', lineItems: [{ productId: PRODUCT, expiryTime: FUTURE }] };
    const deps = makeDeps({ fetchPlay: jest.fn(async () => playResponse({ data })) });
    const res = await createVerifyHandler(deps)(makeReq());
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ error: 'subscription_invalid' });
    expect(deps.upsertSubscription).not.toHaveBeenCalled();
  });

  it('상품 불일치 → 402 product_mismatch', async () => {
    const data = { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', lineItems: [{ productId: 'pro_yearly', expiryTime: FUTURE }] };
    const deps = makeDeps({ fetchPlay: jest.fn(async () => playResponse({ data })) });
    const res = await createVerifyHandler(deps)(makeReq());
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ detail: 'product_mismatch' });
  });
});

describe('verify-purchase 핸들러 — DB 오류', () => {
  it('user_subscriptions upsert 실패 → 500 internal_error', async () => {
    const deps = makeDeps({ upsertSubscription: jest.fn(async () => ({ error: { message: 'db down' } })) });
    const res = await createVerifyHandler(deps)(makeReq());
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'internal_error' });
  });
});

// 구매는 스토어 계정에, 권한은 앱 계정에 귀속된다. 스토어 응답만 보고 부여하면
// 같은 Play 계정으로 다른 앱 계정에 로그인해 복원하는 것만으로 결제 하나가 계정
// 여럿에 Pro를 뿌린다(2026-08-03 실측: 토큰 1개 · 계정 2개).
describe('verify-purchase 핸들러 — 구매 토큰 소유권', () => {
  it('다른 계정이 이미 보유한 토큰 → 409, 권한 부여 안 함', async () => {
    const deps = makeDeps({ findTokenOwner: jest.fn(async () => 'user-OTHER') });
    const res = await createVerifyHandler(deps)(makeReq());

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ ok: false, error: 'subscription_owned_by_other' });
    // 가장 중요한 단언 — 거절했으면 DB에 아무것도 쓰지 않아야 한다.
    expect(deps.upsertSubscription).not.toHaveBeenCalled();
  });

  it('같은 계정이 보유한 토큰 → 200 (갱신은 막지 않는다)', async () => {
    const deps = makeDeps({ findTokenOwner: jest.fn(async () => 'user-1') });
    const res = await createVerifyHandler(deps)(makeReq());

    expect(res.status).toBe(200);
    expect(deps.upsertSubscription).toHaveBeenCalledTimes(1);
  });

  it('아무도 보유하지 않은 토큰 → 200 (최초 귀속)', async () => {
    const deps = makeDeps({ findTokenOwner: jest.fn(async () => null) });
    const res = await createVerifyHandler(deps)(makeReq());

    expect(res.status).toBe(200);
    expect(deps.upsertSubscription).toHaveBeenCalledTimes(1);
  });

  it('iOS는 originalTransactionId 로 소유권을 조회한다', async () => {
    // 구독 갱신마다 transactionId는 바뀌지만 originalTransactionId는 고정이다.
    // 갱신 때 transactionId로 조회하면 매번 "주인 없음"이 되어 검사가 무의미해진다.
    const deps = makeDeps();
    await createVerifyHandler(deps)(
      makeReq({ json: async () => ({ purchaseToken: 'jws-blob', productId: PRODUCT, platform: 'ios' }) }),
    );

    expect(deps.findTokenOwner).toHaveBeenCalledWith(APPLE_ORIGINAL_TX);
  });

  // 각인 대조는 우리 DB가 아니라 스토어가 확인해 준 값을 본다 — 사후 판정이
  // 아니라 구매 시점의 사실이라 더 강한 근거다.
  it('Android: Play가 돌려준 각인이 다른 계정이면 → 409 (DB 조회 전에 막힌다)', async () => {
    const data = {
      ...activePlayData,
      externalAccountIdentifiers: { obfuscatedExternalAccountId: 'user-OTHER' },
    };
    const deps = makeDeps({ fetchPlay: jest.fn(async () => playResponse({ data })) });
    const res = await createVerifyHandler(deps)(makeReq());

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'subscription_owned_by_other' });
    expect(deps.upsertSubscription).not.toHaveBeenCalled();
  });

  it('Android: 각인이 요청자와 같으면 → 200', async () => {
    const data = {
      ...activePlayData,
      externalAccountIdentifiers: { obfuscatedExternalAccountId: 'user-1' },
    };
    const deps = makeDeps({ fetchPlay: jest.fn(async () => playResponse({ data })) });
    const res = await createVerifyHandler(deps)(makeReq());

    expect(res.status).toBe(200);
  });

  it('iOS: 서명 payload의 appAccountToken 이 다르면 → 409', async () => {
    const deps = makeDeps({
      fetchAppleTransaction: jest.fn(async () => ({
        environment: 'production' as const,
        payload: { ...activeApplePayload, appAccountToken: 'user-OTHER' },
      })),
    });
    const res = await createVerifyHandler(deps)(
      makeReq({ json: async () => ({ purchaseToken: 'jws-blob', productId: PRODUCT, platform: 'ios' }) }),
    );

    expect(res.status).toBe(409);
    expect(deps.upsertSubscription).not.toHaveBeenCalled();
  });

  it('각인 UUID 의 대소문자는 무시한다 (Apple 이 대문자로 돌려주는 경우)', async () => {
    const deps = makeDeps({
      getUser: jest.fn(async () => ({ id: 'abcdef12-3456-7890-abcd-ef1234567890' })),
      fetchAppleTransaction: jest.fn(async () => ({
        environment: 'production' as const,
        payload: { ...activeApplePayload, appAccountToken: 'ABCDEF12-3456-7890-ABCD-EF1234567890' },
      })),
    });
    const res = await createVerifyHandler(deps)(
      makeReq({ json: async () => ({ purchaseToken: 'jws-blob', productId: PRODUCT, platform: 'ios' }) }),
    );

    expect(res.status).toBe(200);
  });

  it('각인이 없는 옛 구매는 통과하고 토큰 소유권으로 폴백한다', async () => {
    // 각인 도입 이전에 결제된 구독에는 값이 없다. 여기서 막으면 기존 유료
    // 사용자가 전원 409를 받는다 — 폴백이 반드시 살아 있어야 한다.
    const deps = makeDeps({ findTokenOwner: jest.fn(async () => 'user-OTHER') });
    const res = await createVerifyHandler(deps)(makeReq());

    expect(res.status).toBe(409); // 각인이 아니라 토큰 소유권이 막은 것
    expect(deps.findTokenOwner).toHaveBeenCalled();
  });

  it('소유권 조회 실패로 통과해도 unique 위반(23505)이 409로 잡힌다', async () => {
    // findTokenOwner는 조회 실패 시 fail-open이다. 최종 방어선은 부분 unique
    // 인덱스이고, 그게 잡은 것은 원인이 소유권 충돌 하나뿐이라 500이 아니라 409다.
    const deps = makeDeps({
      findTokenOwner: jest.fn(async () => null),
      upsertSubscription: jest.fn(async () => ({ error: { code: '23505', message: 'duplicate key' } })),
    });
    const res = await createVerifyHandler(deps)(makeReq());

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'subscription_owned_by_other' });
  });
});
