// 범용 Google OAuth2 access_token 발급 (서비스 계정 JSON 키 기반).
// Vertex AI / Play Developer API 등 여러 scope를 같은 RS256 JWT 로직으로 처리.
//
// 모듈 스코프 캐시는 (clientEmail, scope) 단위. Vertex와 Play 서로 다른 서비스 계정/
// scope 조합으로 호출돼도 분리 캐싱.

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const TOKEN_TTL_SECONDS = 3600;
const SAFETY_MARGIN_MS = 60_000;

interface CachedToken {
  token: string;
  expiresAt: number;
}

const cache = new Map<string, CachedToken>();

export interface GoogleSaCredentials {
  clientEmail: string;
  privateKey: string; // PEM, \n 이스케이프 허용
  scope: string;
}

export async function getGoogleAccessToken(creds: GoogleSaCredentials): Promise<string> {
  const cacheKey = `${creds.clientEmail}::${creds.scope}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt - SAFETY_MARGIN_MS > now) {
    return cached.token;
  }

  const iat = Math.floor(now / 1000);
  const exp = iat + TOKEN_TTL_SECONDS;
  const claim = {
    iss: creds.clientEmail,
    scope: creds.scope,
    aud: TOKEN_ENDPOINT,
    exp,
    iat,
  };

  const assertion = await signRs256Jwt(claim, creds.privateKey);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`google token exchange failed (${res.status}): ${text}`);
  }

  const json = await res.json() as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error('google token exchange returned no access_token');
  }

  const expiresIn = json.expires_in ?? TOKEN_TTL_SECONDS;
  const next: CachedToken = {
    token: json.access_token,
    expiresAt: now + expiresIn * 1000,
  };
  cache.set(cacheKey, next);
  return next.token;
}

async function signRs256Jwt(claim: Record<string, unknown>, pkcs8Pem: string): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const enc = (obj: unknown) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));
  const signingInput = `${enc(header)}.${enc(claim)}`;

  const key = await importPkcs8Key(pkcs8Pem);
  const sig = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`;
}

async function importPkcs8Key(pem: string): Promise<CryptoKey> {
  const normalized = pem.replace(/\\n/g, '\n').trim();
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const der = base64ToBytes(body);
  return await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
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
