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
const PRODUCT = 'pro_monthly';
const PKG = 'com.soksokvoca';

const activePlayData = {
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
  lineItems: [{ productId: PRODUCT, expiryTime: FUTURE }],
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

  it('platform=ios → 400 platform_not_supported (v1.1 미지원)', async () => {
    const deps = makeDeps();
    const req = makeReq({ json: async () => ({ purchaseToken: 'tok', productId: PRODUCT, platform: 'ios' }) });
    const res = await createVerifyHandler(deps)(req);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ detail: 'platform_not_supported' });
    expect(deps.checkRate).not.toHaveBeenCalled();
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
