// App Store Server API 인증용 ES256 JWT.
//
// Apple 발급 .p8 key(PKCS8 EC P-256)로 매번 새 JWT를 만든다. TTL은 최대 20분
// (Apple 제한). 모듈 스코프 캐시로 호출당 새 서명 비용을 줄인다.
//
// 동일 구조의 Google JWT (_shared/google-auth.ts)와 키 import 방식·base64url
// 인코딩은 동일하지만, 알고리즘이 RS256(RSASSA-PKCS1) → ES256(ECDSA P-256)으로
// 다르고, WebCrypto의 ECDSA.sign이 IEEE P-1363 raw(r||s, 64바이트)로 반환하므로
// 추가 변환 없이 base64url 그대로 사용 가능 (DER 변환 X).

const TOKEN_TTL_SECONDS = 1200; // Apple 최대 20분
const SAFETY_MARGIN_MS = 60_000;

interface CachedToken {
  token: string;
  expiresAt: number;
}

const cache = new Map<string, CachedToken>();

export interface AppleApiCredentials {
  /** App Store Connect API Key ID (.p8 키 ID, 예: "ABC123XYZ") */
  keyId: string;
  /** App Store Connect Issuer ID (UUID 형태) */
  issuerId: string;
  /** 앱 번들 ID (예: "com.soksokvoca") */
  bundleId: string;
  /** PKCS8 PEM 형식 EC P-256 private key. \n 이스케이프 허용. */
  privateKey: string;
}

export async function getAppleApiToken(creds: AppleApiCredentials): Promise<string> {
  const cacheKey = `${creds.keyId}::${creds.bundleId}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt - SAFETY_MARGIN_MS > now) {
    return cached.token;
  }

  const iat = Math.floor(now / 1000);
  const exp = iat + TOKEN_TTL_SECONDS;
  const claim = {
    iss: creds.issuerId,
    iat,
    exp,
    aud: 'appstoreconnect-v1',
    bid: creds.bundleId,
  };
  const header = {
    alg: 'ES256',
    kid: creds.keyId,
    typ: 'JWT',
  };

  const token = await signEs256Jwt(header, claim, creds.privateKey);
  cache.set(cacheKey, {
    token,
    expiresAt: now + TOKEN_TTL_SECONDS * 1000,
  });
  return token;
}

async function signEs256Jwt(
  header: Record<string, unknown>,
  claim: Record<string, unknown>,
  pkcs8Pem: string,
): Promise<string> {
  const enc = (obj: unknown) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));
  const signingInput = `${enc(header)}.${enc(claim)}`;

  const key = await importEcPkcs8Key(pkcs8Pem);
  // WebCrypto는 IEEE P-1363 raw(r||s, 64 bytes for P-256)로 반환 — JWS 표준과 동일하므로 추가 변환 불필요.
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`;
}

async function importEcPkcs8Key(pem: string): Promise<CryptoKey> {
  const normalized = pem.replace(/\\n/g, '\n').trim();
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const der = base64ToBytes(body);
  return await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
