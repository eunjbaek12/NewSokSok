// ① 순수 로직: 결제 에러 매핑 (features/billing/error-mapping.ts)
//
// expo-iap ErrorCode + 자체 throw 에러를 UI i18n key 로 매핑. expo-iap 는 네이티브
// 모듈을 로드하므로 jest(node) 에서 깨진다 → ErrorCode enum 을 실제 값(kebab-case)
// 그대로 mock 한다. (값은 node_modules/expo-iap/build/types.d.ts 기준)

jest.mock('expo-iap', () => ({
  ErrorCode: {
    ActivityUnavailable: 'activity-unavailable',
    AlreadyOwned: 'already-owned',
    AlreadyPrepared: 'already-prepared',
    BillingResponseJsonParseError: 'billing-response-json-parse-error',
    BillingUnavailable: 'billing-unavailable',
    ConnectionClosed: 'connection-closed',
    DeferredPayment: 'deferred-payment',
    DeveloperError: 'developer-error',
    EmptySkuList: 'empty-sku-list',
    FeatureNotSupported: 'feature-not-supported',
    IapNotAvailable: 'iap-not-available',
    InitConnection: 'init-connection',
    Interrupted: 'interrupted',
    ItemNotOwned: 'item-not-owned',
    ItemUnavailable: 'item-unavailable',
    NetworkError: 'network-error',
    NotEnded: 'not-ended',
    NotPrepared: 'not-prepared',
    Pending: 'pending',
    PurchaseError: 'purchase-error',
    PurchaseVerificationFailed: 'purchase-verification-failed',
    PurchaseVerificationFinishFailed: 'purchase-verification-finish-failed',
    PurchaseVerificationFinished: 'purchase-verification-finished',
    QueryProduct: 'query-product',
    ReceiptFailed: 'receipt-failed',
    ReceiptFinished: 'receipt-finished',
    ReceiptFinishedFailed: 'receipt-finished-failed',
    RemoteError: 'remote-error',
    ServiceDisconnected: 'service-disconnected',
    ServiceError: 'service-error',
    SkuNotFound: 'sku-not-found',
    SkuOfferMismatch: 'sku-offer-mismatch',
    SyncError: 'sync-error',
    TransactionValidationFailed: 'transaction-validation-failed',
    Unknown: 'unknown',
    UserCancelled: 'user-cancelled',
    UserError: 'user-error',
  },
}));

import { mapPurchaseError, readEdgeErrorBody, isDefinitiveVerifyRejection } from '../features/billing/error-mapping';

describe('mapPurchaseError — expo-iap 코드 매핑', () => {
  it('사용자 취소는 silent (Alert 미표시)', () => {
    const r = mapPurchaseError({ code: 'user-cancelled' });
    expect(r.key).toBe('cancelled');
    expect(r.silent).toBe(true);
  });

  it('이미 소유 → 복원 제안', () => {
    const r = mapPurchaseError({ code: 'already-owned' });
    expect(r.key).toBe('alreadyOwned');
    expect(r.suggestRestore).toBe(true);
  });

  it.each(['network-error', 'service-error', 'service-disconnected', 'interrupted', 'connection-closed'])(
    '%s → network',
    (code) => {
      expect(mapPurchaseError({ code }).key).toBe('network');
    },
  );

  it.each(['billing-unavailable', 'iap-not-available', 'feature-not-supported'])(
    '%s → billingUnavailable',
    (code) => {
      expect(mapPurchaseError({ code }).key).toBe('billingUnavailable');
    },
  );

  it.each(['item-unavailable', 'sku-not-found'])('%s → itemUnavailable', (code) => {
    expect(mapPurchaseError({ code }).key).toBe('itemUnavailable');
  });

  it.each(['pending', 'deferred-payment'])('%s → pending', (code) => {
    expect(mapPurchaseError({ code }).key).toBe('pending');
  });

  it('developer-error → developerError', () => {
    expect(mapPurchaseError({ code: 'developer-error' }).key).toBe('developerError');
  });

  it.each(['purchase-verification-failed', 'receipt-failed', 'transaction-validation-failed'])(
    '%s → verifyFailed + 복원 제안',
    (code) => {
      const r = mapPurchaseError({ code });
      expect(r.key).toBe('verifyFailed');
      expect(r.suggestRestore).toBe(true);
    },
  );
});

describe('replay 침묵 정산 — verify 실패 분류', () => {
  it('readEdgeErrorBody: FunctionsHttpError.context.json()에서 body를 꺼낸다', async () => {
    const err = { context: { json: async () => ({ ok: false, error: 'subscription_invalid', detail: 'expired' }) } };
    expect(await readEdgeErrorBody(err)).toEqual({ ok: false, error: 'subscription_invalid', detail: 'expired' });
  });

  it('readEdgeErrorBody: json 없고 text만 있으면 JSON.parse 폴백', async () => {
    const err = { context: { text: async () => '{"error":"rate_limited"}' } };
    expect(await readEdgeErrorBody(err)).toEqual({ error: 'rate_limited' });
  });

  it('readEdgeErrorBody: context 없음·비JSON·throw는 null (판별 불가 = 일시 오류 취급)', async () => {
    expect(await readEdgeErrorBody(new Error('network'))).toBeNull();
    expect(await readEdgeErrorBody(null)).toBeNull();
    expect(await readEdgeErrorBody({ context: { text: async () => 'not json' } })).toBeNull();
    expect(await readEdgeErrorBody({ context: { json: async () => { throw new Error('consumed'); } } })).toBeNull();
  });

  it('확정 거절(subscription_invalid)만 true — finishTransaction으로 큐 청소 허용', () => {
    expect(isDefinitiveVerifyRejection({ ok: false, error: 'subscription_invalid', detail: 'expired' })).toBe(true);
    expect(isDefinitiveVerifyRejection({ ok: false, error: 'subscription_invalid', detail: 'revoked' })).toBe(true);
  });

  it('일시 오류(401/429/5xx)·판별 불가는 false — 진짜 결제 보호를 위해 큐에 남긴다', () => {
    expect(isDefinitiveVerifyRejection({ ok: false, error: 'unauthorized' })).toBe(false);
    expect(isDefinitiveVerifyRejection({ ok: false, error: 'rate_limited' })).toBe(false);
    expect(isDefinitiveVerifyRejection({ ok: false, error: 'upstream_failure' })).toBe(false);
    expect(isDefinitiveVerifyRejection({ ok: false, error: 'internal_error' })).toBe(false);
    expect(isDefinitiveVerifyRejection(null)).toBe(false);
    expect(isDefinitiveVerifyRejection(undefined)).toBe(false);
    expect(isDefinitiveVerifyRejection('subscription_invalid')).toBe(false);
  });
});

describe('mapPurchaseError — 자체 throw 메시지 매핑', () => {
  it.each([
    ['no_token', 'noToken', undefined],
    ['verify_failed', 'verifyFailed', true],
    ['no_offer_token', 'developerError', undefined],
    ['load_products_failed', 'loadProductsFailed', undefined],
    ['restore_failed', 'restoreFailed', undefined],
    ['purchase_failed', 'generic', undefined],
    ['not_connected', 'notConnected', undefined],
    ['no_restorable_purchase', 'noRestorablePurchase', undefined],
    ['already_pro_no_restore', 'alreadyProNoRestore', undefined],
    ['not_signed_in', 'notSignedIn', undefined],
  ])('message=%s → %s', (message, key, suggestRestore) => {
    const r = mapPurchaseError(new Error(message as string));
    expect(r.key).toBe(key);
    expect(r.suggestRestore).toBe(suggestRestore);
  });
});

describe('복원 경로 결과는 "결제 실패"가 아니다 — 전용 제목', () => {
  // 복원할 구매가 없던 사람에게 "결제에 실패했어요"라고 말하면, 결제한 적 없는
  // 사용자가 자기 카드에 문제가 생긴 줄 안다.
  it.each([
    ['not_connected', 'plans.restoreNotReadyTitle'],
    ['no_restorable_purchase', 'plans.restoreNoneTitle'],
    // 다른 스토어에서 산 구독을 쓰는 기기(Play 결제 → iPhone 사용). 복원할 게 없는
    // 게 정상인데 "찾지 못했어요"만 뜨면 화면의 "현재 Pro 구독 중"과 모순돼 보인다.
    ['already_pro_no_restore', 'plans.restoreAlreadyProTitle'],
    ['not_signed_in', 'plans.loginRequiredTitle'],
  ])('message=%s → titleKey=%s', (message, titleKey) => {
    expect(mapPurchaseError(new Error(message)).titleKey).toBe(titleKey);
  });

  it('결제 실패 계열엔 titleKey가 없다 — 호출부가 기본 제목을 쓴다', () => {
    expect(mapPurchaseError({ code: 'network-error' }).titleKey).toBeUndefined();
    expect(mapPurchaseError(new Error('verify_failed')).titleKey).toBeUndefined();
    expect(mapPurchaseError(new Error('owned_by_other')).titleKey).toBeUndefined();
  });

  it('복원 재시도를 권하지 않는다 — 같은 결과로 되돌아온다', () => {
    expect(mapPurchaseError(new Error('not_connected')).suggestRestore).toBeUndefined();
    expect(mapPurchaseError(new Error('no_restorable_purchase')).suggestRestore).toBeUndefined();
  });
});

describe('mapPurchaseError — 폴백 / 진단 필드', () => {
  it('알 수 없는 코드 → generic', () => {
    expect(mapPurchaseError({ code: 'something-unmapped' }).key).toBe('generic');
  });

  it('완전 빈 에러 → generic', () => {
    expect(mapPurchaseError(undefined).key).toBe('generic');
  });

  it('취소가 아닌 경우 silent 는 설정되지 않는다', () => {
    expect(mapPurchaseError({ code: 'network-error' }).silent).toBeUndefined();
  });

  it('rawCode / rawMessage 를 진단용으로 보존한다', () => {
    const r = mapPurchaseError({ code: 'network-error', message: 'boom' });
    expect(r.rawCode).toBe('network-error');
    expect(r.rawMessage).toBe('boom');
  });
});
