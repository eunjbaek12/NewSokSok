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
  /**
   * Alert 제목의 전체 i18n 키. 없으면 caller가 `plans.purchaseFailedTitle`을 쓴다.
   *
   * 복원 경로의 결과는 "결제 실패"가 아니다 — 복원할 구매가 없었거나 아직 스토어에
   * 연결되지 않은 것이라, 같은 제목을 달면 결제한 적 없는 사용자에게 "결제에
   * 실패했어요"라고 말하게 된다.
   */
  titleKey?: string;
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

// verify-purchase의 409 — 이 구독이 다른 앱 계정에 귀속돼 있다는 뜻.
// 재시도·복원으로 풀리지 않으므로(선점 정책) 조용히 삼키면 안 되고, 사용자에게
// 그 사실을 알려야 한다. 여기서 finishTransaction은 하지 않는다 — 그 거래는
// 진짜 소유자 계정에서 정리되어야 한다.
export function isOwnershipRejection(body: unknown): boolean {
  return (body as { error?: string } | null)?.error === 'subscription_owned_by_other';
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
    case 'owned_by_other':
      // 복원을 제안하지 않는다 — 복원해도 같은 409를 받는다. 사용자가 할 수 있는
      // 일은 그 구독을 산 계정으로 로그인하는 것뿐이다.
      return { ...base, key: 'ownedByOther' };
    case 'verify_failed':
      return { ...base, key: 'verifyFailed', suggestRestore: true };
    case 'no_offer_token':
      return { ...base, key: 'developerError' };
    case 'load_products_failed':
      return { ...base, key: 'loadProductsFailed' };
    case 'restore_failed':
      return { ...base, key: 'restoreFailed' };
    case 'not_connected':
      // 스토어 연결 전에 복원을 누른 경우. 재시도가 정답이라 복원을 다시 제안하지
      // 않는다 — Alert의 복원 버튼은 같은 미연결 상태로 곧장 되돌아온다.
      return { ...base, key: 'notConnected', titleKey: 'plans.restoreNotReadyTitle' };
    case 'no_restorable_purchase':
      // sweep은 정상이었는데 이 스토어 계정에 복원할 구독이 없었다. 실패가 아니라
      // 결과이므로 제목도 결과로 말한다.
      return { ...base, key: 'noRestorablePurchase', titleKey: 'plans.restoreNoneTitle' };
    case 'already_pro_no_restore':
      // 복원할 게 없는데 이미 Pro인 경우 — 다른 스토어에서 산 구독을 쓰는 기기가
      // 여기다(예: Play로 결제하고 iPhone에서 사용). 권한은 앱 계정에 붙어 있어
      // 정상 동작인데, "복원할 구매를 찾지 못했어요"만 뜨면 화면의 "현재 Pro 구독 중"과
      // 모순처럼 읽혀 사용자가 구독이 깨진 줄 안다.
      return { ...base, key: 'alreadyProNoRestore', titleKey: 'plans.restoreAlreadyProTitle' };
    case 'not_signed_in':
      // 세션이 풀렸거나 만료. verify는 401 확정이라 호출해도 소용없고, 사용자가
      // 할 일은 재로그인이다.
      return { ...base, key: 'notSignedIn', titleKey: 'plans.loginRequiredTitle' };
    case 'purchase_failed':
      return { ...base, key: 'generic' };
  }

  return { ...base, key: 'generic' };
}
