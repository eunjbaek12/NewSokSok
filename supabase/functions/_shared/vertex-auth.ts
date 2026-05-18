// Vertex AI(= Agent Platform) 호출용 OAuth2 access_token 발급.
// 서비스 계정 JSON 키로 RS256 JWT 서명 → Google OAuth2 엔드포인트 교환.
//
// access_token은 1시간 유효. Edge Function 인스턴스가 살아있는 동안 module
// 스코프에 캐시(Deno는 isolate를 warm 상태로 재사용함).
//
// 환경변수:
//   VERTEX_SA_CLIENT_EMAIL  서비스 계정 이메일
//   VERTEX_SA_PRIVATE_KEY   서비스 계정 private key (PEM, \n 이스케이프 OK)

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const TOKEN_TTL_SECONDS = 3600;
const SAFETY_MARGIN_MS = 60_000;

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;

export async function getVertexAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt - SAFETY_MARGIN_MS > now) {
    return cached.token;
  }

  const clientEmail = Deno.env.get('VERTEX_SA_CLIENT_EMAIL');
  const privateKeyPem = Deno.env.get('VERTEX_SA_PRIVATE_KEY');
  if (!clientEmail || !privateKeyPem) {
    throw new Error('VERTEX_SA_CLIENT_EMAIL / VERTEX_SA_PRIVATE_KEY not configured');
  }

  const iat = Math.floor(now / 1000);
  const exp = iat + TOKEN_TTL_SECONDS;
  const claim = {
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_ENDPOINT,
    exp,
    iat,
  };

  const assertion = await signRs256Jwt(claim, privateKeyPem);

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
    throw new Error(`vertex token exchange failed (${res.status}): ${text}`);
  }

  const json = await res.json() as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error('vertex token exchange returned no access_token');
  }

  const expiresIn = json.expires_in ?? TOKEN_TTL_SECONDS;
  cached = {
    token: json.access_token,
    expiresAt: now + expiresIn * 1000,
  };
  return cached.token;
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
