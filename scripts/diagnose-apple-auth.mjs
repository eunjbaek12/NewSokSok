// Apple App Store Server API 인증 진단 스크립트 (로컬 전용, 임시).
//
// 배포된 supabase/functions/_shared/apple-auth.ts 와 동일한 ES256 JWT를 만들어
// Apple에 직접 요청한다. verify-purchase가 받는 "401 + 빈 본문"의 원인이
// 자격 증명(KEY_ID/ISSUER_ID/.p8) 문제인지, 키 종류/권한 문제인지 격리한다.
//
// 거래 ID 없이 인증만 검사하려고 "Request a Test Notification"
// (POST /inApps/v1/notifications/test) 엔드포인트를 쓴다. 이 엔드포인트는
// 유효한 인증만 있으면 200 + testNotificationToken 을 돌려준다.
//   - 401 (빈 본문)  → JWT 거부 = KEY_ID/ISSUER_ID/.p8/키종류 중 하나가 틀림
//   - 200            → 인증 정상. (그럼 원래 문제는 다른 곳)
//   - 403 / errorCode → 인증은 통과, 권한 부족
//
// 값은 전부 로컬(환경변수/플래그/파일)에서만 읽는다. 출력에 키 원문은 안 찍는다.
//
// 사용법 (PowerShell):
//   $env:APPLE_KEY_ID="6VRBZPDM3P"
//   $env:APPLE_ISSUER_ID="<issuer-uuid>"
//   $env:APPLE_BUNDLE_ID="com.soksokvoca"
//   node scripts/diagnose-apple-auth.mjs --p8 "C:\path\to\AuthKey_6VRBZPDM3P.p8"
//
// 또는 전부 플래그로:
//   node scripts/diagnose-apple-auth.mjs --p8 <path> --key-id <id> --issuer <uuid> --bundle com.soksokvoca
//
// 특정 거래로 실제 transaction 조회까지 재현하려면:
//   node scripts/diagnose-apple-auth.mjs --p8 <path> --transaction <transactionId>

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

// ── 인자 파싱 ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
}

const p8Path = flag('p8');
const keyId = flag('key-id') ?? process.env.APPLE_KEY_ID;
const issuerId = flag('issuer') ?? process.env.APPLE_ISSUER_ID;
const bundleId = flag('bundle') ?? process.env.APPLE_BUNDLE_ID ?? 'com.soksokvoca';
const transactionId = flag('transaction'); // 선택

const problems = [];
if (!p8Path) problems.push('--p8 <.p8 파일 경로> 필요');
if (!keyId) problems.push('--key-id 또는 $env:APPLE_KEY_ID 필요');
if (!issuerId) problems.push('--issuer 또는 $env:APPLE_ISSUER_ID 필요');
if (problems.length) {
  console.error('❌ 입력 부족:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}

let p8Raw;
try {
  p8Raw = readFileSync(p8Path, 'utf8');
} catch (e) {
  console.error(`❌ .p8 파일을 못 읽음: ${p8Path}\n   ${e.message}`);
  process.exit(1);
}

// ── 자격 증명 요약 (원문 미노출) ──────────────────────────────────────────────
console.log('── 입력 요약 ───────────────────────────────');
console.log('KEY_ID    :', keyId);
console.log('ISSUER_ID :', issuerId, `(len ${issuerId.length}, UUID형식 ${/^[0-9a-f-]{36}$/i.test(issuerId) ? 'O' : 'X ⚠️'})`);
console.log('BUNDLE_ID :', bundleId);
console.log('p8 파일   :', p8Path);
console.log('  헤더    :', /-----BEGIN PRIVATE KEY-----/.test(p8Raw) ? 'PKCS8 (-----BEGIN PRIVATE KEY-----) O' : '⚠️ PKCS8 헤더 없음 — 잘못된 파일일 수 있음');
console.log('');

// ── 키 로드 ──────────────────────────────────────────────────────────────────
let privateKey;
try {
  // 함수 코드와 동일하게 \n 이스케이프도 허용.
  const normalized = p8Raw.replace(/\\n/g, '\n').trim();
  privateKey = crypto.createPrivateKey({ key: normalized, format: 'pem' });
  const jwk = privateKey.export({ format: 'jwk' });
  if (jwk.crv !== 'P-256') {
    console.log(`⚠️ 곡선이 P-256이 아님: ${jwk.crv} — App Store API는 ES256(P-256) 필요`);
  } else {
    console.log('✅ 키 로드 OK (EC P-256)');
  }
} catch (e) {
  console.error('❌ .p8 키 파싱 실패:', e.message);
  console.error('   → 파일이 손상됐거나 다른 형식. App Store Connect에서 받은 AuthKey_*.p8 원본인지 확인.');
  process.exit(1);
}

// ── JWT 생성 (apple-auth.ts 와 동일 구조) ────────────────────────────────────
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const iat = Math.floor(Date.now() / 1000);
const exp = iat + 1200;
const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
const claim = { iss: issuerId, iat, exp, aud: 'appstoreconnect-v1', bid: bundleId };
const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
// JWS ES256 = raw r||s (IEEE P-1363), DER 아님.
const sig = crypto.sign('sha256', Buffer.from(signingInput), { key: privateKey, dsaEncoding: 'ieee-p1363' });
const jwt = `${signingInput}.${b64url(sig)}`;

console.log('');
console.log('── 생성된 JWT ─────────────────────────────');
console.log('header:', JSON.stringify(header));
console.log('claim :', JSON.stringify(claim));
console.log('jwt len:', jwt.length, '(sig', sig.length, 'bytes — P-256이면 64)');
console.log('');

// ── Apple 호출 ───────────────────────────────────────────────────────────────
const PROD = 'https://api.storekit.itunes.apple.com';
const SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com';

async function call(label, url) {
  try {
    const res = await fetch(url, {
      method: transactionId ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    });
    const body = await res.text().catch(() => '');
    console.log(`[${label}] ${res.status} ${res.statusText}`);
    if (body) console.log(`  body: ${body.slice(0, 600)}`);
    else console.log('  body: (빈 본문)');
    return res.status;
  } catch (e) {
    console.log(`[${label}] 네트워크 오류: ${e.message}`);
    return -1;
  }
}

const path = transactionId
  ? `/inApps/v1/transactions/${encodeURIComponent(transactionId)}`
  : '/inApps/v1/notifications/test';

console.log('── Apple 호출 ─────────────────────────────');
console.log('엔드포인트:', transactionId ? `transaction 조회 (${transactionId})` : 'Request Test Notification (인증만 검사)');
console.log('');

const prodStatus = await call('PROD   ', PROD + path);
const sbStatus = await call('SANDBOX', SANDBOX + path);

// ── 해석 ─────────────────────────────────────────────────────────────────────
console.log('');
console.log('── 해석 ───────────────────────────────────');
const ok = (s) => s === 200;
if (ok(prodStatus) || ok(sbStatus)) {
  console.log('✅ 인증 통과! KEY_ID/ISSUER_ID/.p8 조합이 정상입니다.');
  console.log('   → Supabase secret 값이 이 조합과 다르면 그게 원인. 동일 값으로 secret 재설정 후 재배포하세요.');
} else if (prodStatus === 401 && sbStatus === 401) {
  console.log('❌ 양쪽 401 — Apple이 JWT를 거부. 자격 증명/키 문제 확정.');
  console.log('   점검 순서:');
  console.log('   1) ISSUER_ID 가 App Store Connect → 사용자 및 액세스 → 통합 페이지 상단 Issuer ID와 정확히 같은가');
  console.log('   2) 이 .p8 가 KEY_ID(' + keyId + ') 키의 원본 파일이 맞는가 (다른 키의 .p8 아님?)');
  console.log('   3) 해당 키가 revoke 안 됐는가');
  console.log('   4) 1~3 다 맞는데 401이면 → 키 종류/권한 문제. App Store Server API 접근 권한 있는 키로 재발급');
} else if (prodStatus === 403 || sbStatus === 403) {
  console.log('⚠️ 403 — 인증은 통과, 권한 부족. 키에 더 높은 역할(예: Admin) 부여 또는 IAP 접근 권한 필요.');
} else {
  console.log(`예상 외 상태 (prod=${prodStatus}, sandbox=${sbStatus}). 위 body 참고.`);
}
