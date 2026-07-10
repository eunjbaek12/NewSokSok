// Maps expo-iap PurchaseError codes + our own thrown errors to UI-facing i18n
// keys. Used by usePurchaseFlow so callers (plans.tsx) can show users a
// specific reason ("이미 구독중", "결제 취소", "네트워크 오류" …) instead of a
// generic "결제에 실패했어요".
//
// Returns an opaque object so callers don't have to know the code enum —
// they just consume `key` for the i18n lookup, `silent` to decide whether to
// suppress the Alert (user-initiated cancel), and `suggestRestore` to add a
// "복원하기" action button to the Alert when the underlying state is
// recoverable via getAvailablePurchases.

import { ErrorCode } from 'expo-iap';

export interface MappedPurchaseError {
  /** Suffix under i18n key `plans.errors.*`. */
  key: string;
  /** True when the user cancelled deliberately — caller should not show an Alert. */
  silent?: boolean;
  /** True when retrying via "이전 구매 복원" is the right user action. */
  suggestRestore?: boolean;
  /** Raw code for diagnostic logging. */
  rawCode: string;
  /** Raw message for diagnostic logging. */
  rawMessage: string;
}

// supabase.functions.invoke의 FunctionsHttpError(non-2xx)에서 응답 body를 꺼낸다.
// (edge-enrich.ts와 같은 패턴 — context가 Response류일 때만 성공, 아니면 null.)
export async function readEdgeErrorBody(error: unknown): Promise<unknown | null> {
  const ctx = (error as any)?.context;
  try {
    if (typeof ctx?.json === 'function') return await ctx.json();
    if (typeof ctx?.text === 'function') return JSON.parse(await ctx.text());
  } catch {
    // body 소진·비JSON 등 — 판별 불가로 처리
  }
  return null;
}

// verify-purchase의 "확정 거절"(402 subscription_invalid: expired/revoked/
// product_mismatch…) 판별. 확정 거절인 미완료 거래는 finishTransaction으로
// 큐에서 제거해도 안전하다 — 구독은 finish 후에도 getAvailablePurchases로
// 복원 가능해 잃을 게 없고, 남겨두면 연결 때마다 영구 재생된다.
// 일시 오류(unauthorized/rate_limited/upstream_failure/internal_error)는
// 진짜 결제일 수 있으므로 false — 큐에 남겨 다음 기회에 재검증.
export function isDefinitiveVerifyRejection(body: unknown): boolean {
  return (body as { error?: string } | null)?.error === 'subscription_invalid';
}

export function mapPurchaseError(err: any): MappedPurchaseError {
  const rawCode = String(err?.code ?? '');
  const rawMessage = String(err?.message ?? err ?? '');
  const base = { rawCode, rawMessage };

  switch (rawCode) {
    case ErrorCode.UserCancelled:
      return { ...base, key: 'cancelled', silent: true };

    case ErrorCode.AlreadyOwned:
      // Active subscription exists on Play but our app didn't acknowledge —
      // the standard escape hatch is restore.
      return { ...base, key: 'alreadyOwned', suggestRestore: true };

    case ErrorCode.NetworkError:
    case ErrorCode.ServiceError:
    case ErrorCode.ServiceDisconnected:
    case ErrorCode.Interrupted:
    case ErrorCode.ConnectionClosed:
      return { ...base, key: 'network' };

    case ErrorCode.BillingUnavailable:
    case ErrorCode.IapNotAvailable:
    case ErrorCode.FeatureNotSupported:
      return { ...base, key: 'billingUnavailable' };

    case ErrorCode.ItemUnavailable:
    case ErrorCode.SkuNotFound:
      return { ...base, key: 'itemUnavailable' };

    case ErrorCode.Pending:
    case ErrorCode.DeferredPayment:
      // Slow approval / parent-approval / async payment. Play will fire the
      // success listener later when it resolves.
      return { ...base, key: 'pending' };

    case ErrorCode.DeveloperError:
      // Misconfigured client (wrong SKU, missing offerToken, etc.). User
      // can't fix this — point to contact support.
      return { ...base, key: 'developerError' };

    case ErrorCode.PurchaseVerificationFailed:
    case ErrorCode.ReceiptFailed:
    case ErrorCode.TransactionValidationFailed:
      return { ...base, key: 'verifyFailed', suggestRestore: true };
  }

  // Our own thrown errors (Error.message constants in usePurchaseFlow).
  switch (rawMessage) {
    case 'no_token':
      return { ...base, key: 'noToken' };
    case 'verify_failed':
      return { ...base, key: 'verifyFailed', suggestRestore: true };
    case 'no_offer_token':
      return { ...base, key: 'developerError' };
    case 'load_products_failed':
      return { ...base, key: 'loadProductsFailed' };
    case 'restore_failed':
      return { ...base, key: 'restoreFailed' };
    case 'purchase_failed':
      return { ...base, key: 'generic' };
  }

  return { ...base, key: 'generic' };
}
