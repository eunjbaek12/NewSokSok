// App Store Server API 호출 + JWS 페이로드 디코딩.
//
// Apple 응답(signedTransactionInfo)은 Apple이 서명한 JWS다. 서명까지 직접
// 검증하려면 Apple 인증서 체인 검증이 필요한데, API 호출 자체가 우리 JWT로
// 인증된 채널을 통해 Apple 서버에서 직접 받은 응답이므로 payload만 base64url
// decode해서 사용한다. 위변조된 transactionId를 보내봐야 Apple이 404로 응답해
// 검증이 통과되지 않는다.

import { getAppleApiToken, type AppleApiCredentials } from './apple-auth.ts';

const PROD_ENDPOINT = 'https://api.storekit.itunes.apple.com';
const SANDBOX_ENDPOINT = 'https://api.storekit-sandbox.itunes.apple.com';

export interface AppleTransactionInfo {
  bundleId?: string;
  productId?: string;
  transactionId?: string;
  originalTransactionId?: string;
  /** epoch ms. 자동 갱신 구독의 만료 시각. */
  expiresDate?: number;
  /** epoch ms. 환불된 경우만 set. */
  revocationDate?: number;
  /** "Auto-Renewable Subscription" 등 */
  type?: string;
  inAppOwnershipType?: string;
}

export interface FetchTransactionResult {
  /** Apple 환경 (어느 endpoint에서 검증됐는지) */
  environment: 'production' | 'sandbox';
  /** 디코딩된 payload */
  info: AppleTransactionInfo;
}

/**
 * transactionId로 최신 transaction info를 가져온다.
 * Production 먼저 시도하고, 404거나 sandbox 신호면 sandbox로 재시도.
 * Apple 권장 패턴 (TestFlight·Xcode 시뮬레이터는 sandbox).
 */
export async function fetchAppleTransaction(
  transactionId: string,
  creds: AppleApiCredentials,
): Promise<FetchTransactionResult | null> {
  const token = await getAppleApiToken(creds);

  // Production 우선
  const prodRes = await callTransactionApi(PROD_ENDPOINT, transactionId, token);
  if (prodRes.ok) {
    return { environment: 'production', info: prodRes.info };
  }

  // 404 또는 prod에서 못 찾으면 sandbox 재시도. Apple 가이드: prod에서 transaction
  // 못 찾으면 sandbox 시도. 다른 에러(401 등)는 그대로 실패 처리.
  if (prodRes.status === 404) {
    const sbRes = await callTransactionApi(SANDBOX_ENDPOINT, transactionId, token);
    if (sbRes.ok) {
      return { environment: 'sandbox', info: sbRes.info };
    }
  }
  return null;
}

interface ApiCallResult {
  ok: boolean;
  status: number;
  info: AppleTransactionInfo;
}

async function callTransactionApi(
  endpoint: string,
  transactionId: string,
  token: string,
): Promise<ApiCallResult> {
  const url = `${endpoint}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return { ok: false, status: res.status, info: {} };
  }
  const json = await res.json() as { signedTransactionInfo?: string };
  if (!json.signedTransactionInfo) {
    return { ok: false, status: 500, info: {} };
  }
  const info = decodeJWSPayload(json.signedTransactionInfo) as AppleTransactionInfo;
  return { ok: true, status: 200, info };
}

/**
 * JWS(`header.payload.signature`)의 payload만 base64url decode.
 * Apple 서명 검증은 하지 않음 — 위 callTransactionApi가 Apple 서버에서 직접
 * 받은 응답이라 신뢰. 클라이언트가 보낸 purchaseToken에서 transactionId만
 * 뽑을 때도 같은 함수 사용.
 */
export function decodeJWSPayload(jws: string): Record<string, unknown> {
  const parts = jws.split('.');
  if (parts.length < 2) {
    throw new Error('invalid JWS: not enough segments');
  }
  const padded = parts[1] + '='.repeat((4 - (parts[1].length % 4)) % 4);
  const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  let str = '';
  // 멀티바이트(한글 등) 안전 처리.
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  str = new TextDecoder().decode(bytes);
  return JSON.parse(str) as Record<string, unknown>;
}
