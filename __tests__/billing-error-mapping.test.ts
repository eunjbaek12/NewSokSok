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

import { mapPurchaseError } from '../features/billing/error-mapping';

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

describe('mapPurchaseError — 자체 throw 메시지 매핑', () => {
  it.each([
    ['no_token', 'noToken', undefined],
    ['verify_failed', 'verifyFailed', true],
    ['no_offer_token', 'developerError', undefined],
    ['load_products_failed', 'loadProductsFailed', undefined],
    ['restore_failed', 'restoreFailed', undefined],
    ['purchase_failed', 'generic', undefined],
  ])('message=%s → %s', (message, key, suggestRestore) => {
    const r = mapPurchaseError(new Error(message as string));
    expect(r.key).toBe(key);
    expect(r.suggestRestore).toBe(suggestRestore);
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
