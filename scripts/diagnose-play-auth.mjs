// Google Play Developer API 인증 진단 스크립트 (로컬 전용, 임시).
//
// 배포된 supabase/functions/_shared/google-auth.ts 와 동일한 RS256 JWT를 만들어
// Google 에 직접 요청한다. verify-purchase 가 안드로이드에서 내는 "500" 의 원인이
//   A. internal_error  = 토큰 교환(자격 증명) 실패 → PLAY_SA_CLIENT_EMAIL / PRIVATE_KEY 문제
//   B. upstream_failure = 토큰은 받았지만 Play API 가 401/403 거부 → 서비스계정 권한/ API 미활성
// 중 어느 쪽인지 격리한다.
//
// 2단계로 검사한다:
//   1) RS256 JWT → https://oauth2.googleapis.com/token 으로 access_token 교환
//      실패 → A(internal_error) 확정. 응답 본문(invalid_grant 등)으로 세부 원인.
//   2) access_token 으로 subscriptionsv2 조회
//      403 → B(upstream_failure) 확정 = 권한/ API 미활성
//      404/400 → 인증·권한 통과! (토큰만 무효) = 권한 정상, 원인은 전파지연/실토큰
//      200 → 완전 정상 (이 purchaseToken 은 유효)
//
// 값은 전부 로컬(환경변수/플래그/.env/JSON 키 파일)에서만 읽고, 키 원문은 출력 안 한다.
//
// 사용법 (택1):
//   A) GCP 서비스계정 JSON 키 파일로:
//      node scripts/diagnose-play-auth.mjs --json "C:\path\to\service-account.json"
//   B) .env 의 PLAY_SA_CLIENT_EMAIL / PLAY_SA_PRIVATE_KEY / ANDROID_PACKAGE_NAME 로:
//      node scripts/diagnose-play-auth.mjs
//   C) 환경변수로:
//      $env:PLAY_SA_CLIENT_EMAIL="..."; $env:PLAY_SA_PRIVATE_KEY="..."; node scripts/diagnose-play-auth.mjs
//
//   실제 구매 토큰까지 조회하려면 (전파지연/실토큰 확인):
//      node scripts/diagnose-play-auth.mjs --json <path> --token "<purchaseToken>" --product pro_monthly

import crypto from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// ── 인자 파싱 ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
}

// ── .env 보조 로더 (translate 스크립트들과 동일 방식) ─────────────────────────
function envFromDotenv(key) {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return undefined;
  const content = readFileSync(envPath, 'utf8');
  const m = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined;
}

let clientEmail;
let privateKey;
const jsonPath = flag('json');
if (jsonPath) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    console.error(`❌ JSON 키 파일을 못 읽음: ${jsonPath}\n   ${e.message}`);
    process.exit(1);
  }
  clientEmail = raw.client_email;
  privateKey = raw.private_key;
  if (!clientEmail || !privateKey) {
    console.error('❌ JSON 키 파일에 client_email / private_key 가 없습니다. GCP 서비스계정 키가 맞는지 확인.');
    process.exit(1);
  }
} else {
  clientEmail = flag('client-email') ?? process.env.PLAY_SA_CLIENT_EMAIL ?? envFromDotenv('PLAY_SA_CLIENT_EMAIL');
  privateKey = process.env.PLAY_SA_PRIVATE_KEY ?? envFromDotenv('PLAY_SA_PRIVATE_KEY');
}

const packageName =
  flag('package') ?? process.env.ANDROID_PACKAGE_NAME ?? envFromDotenv('ANDROID_PACKAGE_NAME') ?? 'com.soksokvoca';
const purchaseToken = flag('token'); // 선택
const productId = flag('product') ?? 'pro_monthly';

const problems = [];
if (!clientEmail) problems.push('PLAY_SA_CLIENT_EMAIL (--json / --client-email / 환경변수 / .env 중 하나)');
if (!privateKey) problems.push('PLAY_SA_PRIVATE_KEY (--json / 환경변수 / .env 중 하나)');
if (problems.length) {
  console.error('❌ 입력 부족:\n  - ' + problems.join('\n  - '));
  console.error('\n가장 간단: GCP 서비스계정 JSON 키 파일로\n  node scripts/diagnose-play-auth.mjs --json <path>');
  process.exit(1);
}

// ── 자격 증명 요약 (원문 미노출) ──────────────────────────────────────────────
const normalizedKey = privateKey.replace(/\\n/g, '\n').trim();
console.log('── 입력 요약 ───────────────────────────────');
console.log('CLIENT_EMAIL :', clientEmail);
console.log('  형식       :', /\.iam\.gserviceaccount\.com$/.test(clientEmail) ? '서비스계정 이메일 O' : '⚠️ .iam.gserviceaccount.com 으로 안 끝남');
console.log('PACKAGE_NAME :', packageName);
console.log('PRIVATE_KEY  :', `len ${normalizedKey.length}`,
  /-----BEGIN PRIVATE KEY-----/.test(normalizedKey) ? '(PKCS8 헤더 O)' : '⚠️ (PKCS8 헤더 없음 — 값 잘렸을 수 있음)');
console.log('소스         :', jsonPath ? `JSON 키 파일 (${jsonPath})` : '.env / 환경변수');
console.log('');

// ── 키 로드 ──────────────────────────────────────────────────────────────────
let key;
try {
  key = crypto.createPrivateKey({ key: normalizedKey, format: 'pem' });
  const jwk = key.export({ format: 'jwk' });
  console.log('✅ 키 로드 OK', jwk.kty === 'RSA' ? '(RSA)' : `(${jwk.kty})`);
} catch (e) {
  console.error('❌ private key 파싱 실패:', e.message);
  console.error('   → PLAY_SA_PRIVATE_KEY 값이 깨졌습니다. 가장 흔한 원인:');
  console.error('     · Supabase secret 에 붙여넣을 때 줄바꿈이 망가짐 (실제 개행 또는 \\n 이스케이프 둘 다 가능해야 함)');
  console.error('     · -----BEGIN/END PRIVATE KEY----- 헤더 누락 / 키 일부 잘림');
  console.error('   ⇒ 이게 곧 verify-purchase 의 500 "internal_error" 원인입니다.');
  process.exit(1);
}

// ── 1단계: RS256 JWT → Google 토큰 교환 (google-auth.ts 와 동일 구조) ─────────
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const iat = Math.floor(Date.now() / 1000);
const exp = iat + 3600;
const header = { alg: 'RS256', typ: 'JWT' };
const claim = { iss: clientEmail, scope: SCOPE, aud: TOKEN_ENDPOINT, exp, iat };
const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
const sig = crypto.sign('RSA-SHA256', Buffer.from(signingInput), key); // RS256 = RSASSA-PKCS1-v1_5
const assertion = `${signingInput}.${b64url(sig)}`;

console.log('');
console.log('── 1단계: Google 토큰 교환 ─────────────────');
let accessToken;
try {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const text = await res.text().catch(() => '');
  console.log(`[token] ${res.status} ${res.statusText}`);
  if (res.ok) {
    accessToken = JSON.parse(text).access_token;
    console.log('✅ access_token 발급 성공 — 자격 증명(CLIENT_EMAIL + PRIVATE_KEY) 정상');
  } else {
    console.log(`  body: ${text.slice(0, 500)}`);
    console.log('');
    console.log('❌ 토큰 교환 실패 = verify-purchase 의 500 "internal_error" 원인 확정.');
    const t = text.toLowerCase();
    if (t.includes('invalid_grant')) {
      console.log('   invalid_grant → CLIENT_EMAIL 오타이거나, 이 서비스계정 키가 GCP에서 삭제/비활성됨,');
      console.log('                    또는 PRIVATE_KEY 가 이 CLIENT_EMAIL 의 것이 아님(다른 키).');
    } else if (t.includes('invalid_scope')) {
      console.log('   invalid_scope → 스코프 문제(코드는 androidpublisher 고정이라 보통 권한쪽).');
    } else {
      console.log('   → JWT 형식/시계 문제. 위 body 참고.');
    }
    process.exit(2);
  }
} catch (e) {
  console.log(`[token] 네트워크 오류: ${e.message}`);
  process.exit(2);
}

// ── 2단계: Play subscriptionsv2 조회 ─────────────────────────────────────────
// purchaseToken 이 없으면 더미로 호출 — 인증/권한 통과 시 400/404, 거부 시 401/403.
const token = purchaseToken ?? 'DIAGNOSTIC_DUMMY_TOKEN';
const apiUrl =
  'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' +
  `${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/` +
  encodeURIComponent(token);

console.log('');
console.log('── 2단계: Play API 권한 검사 ───────────────');
console.log('package :', packageName);
console.log('token   :', purchaseToken ? '(실제 purchaseToken 제공됨)' : '(더미 — 권한만 검사)');
let status;
try {
  const res = await fetch(apiUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  status = res.status;
  const text = await res.text().catch(() => '');
  console.log(`[play] ${res.status} ${res.statusText}`);
  if (text) console.log(`  body: ${text.slice(0, 500)}`);
} catch (e) {
  console.log(`[play] 네트워크 오류: ${e.message}`);
  process.exit(2);
}

// ── 해석 ─────────────────────────────────────────────────────────────────────
console.log('');
console.log('── 해석 ───────────────────────────────────');
if (status === 403) {
  console.log('❌ 403 = verify-purchase 의 500 "upstream_failure" 원인 확정 — 권한/ API 미활성.');
  console.log('   점검 순서:');
  console.log('   1) Google Cloud Console → "Google Play Android Developer API" 가 사용 설정됐는가');
  console.log('   2) Play Console → 설정 → API 액세스 → 이 서비스계정이 연결돼 있는가');
  console.log('   3) 그 계정에 "재무 데이터 보기" + "주문 및 구독 관리" 권한이 있는가');
  console.log('   4) 권한을 방금 줬다면 전파에 24~48시간 — 시간 두고 재시도');
  console.log('   (body 의 reason 이 PERMISSION_DENIED / SERVICE_DISABLED 인지 확인)');
} else if (status === 401) {
  // Play Developer API는 "서비스계정이 Play Console에 연결/권한 없음"을 401 permissionDenied로 돌려준다
  // (GCP API 자체 비활성은 403 SERVICE_DISABLED). 즉 401 = 권한 문제이지 일시 오류가 아니다.
  console.log('❌ 401 permissionDenied = Play Console 권한 문제 확정 (verify 500 "upstream_failure" 원인).');
  console.log('   GCP API는 켜졌으나, 이 서비스계정이 Play Console에 연결/권한이 없습니다.');
  console.log('   수정: Play Console → 설정 → API 액세스 → 이 서비스계정에');
  console.log('         "재무 데이터·주문 보기" + "주문 및 정기결제 관리" 권한 부여.');
  console.log('         (목록에 계정이 안 보이면 먼저 초대 필요. 부여 후 전파에 몇 분~수십 분.)');
} else if (status === 404 || status === 400 || status === 410) {
  console.log('✅ 인증·권한 모두 통과! (이 토큰만 무효라 ' + status + ')');
  if (purchaseToken) {
    console.log('   실제 purchaseToken 인데 ' + status + ' → 이 구매가 Play 에 안 보임 = 전파지연 또는 토큰/패키지 불일치.');
    console.log('   → 잠시 후 앱 재시작(auto-reconcile) 또는 ANDROID_PACKAGE_NAME 일치 확인.');
  } else {
    console.log('   더미 토큰이라 ' + status + '는 정상. 즉 PLAY_SA 자격·권한은 문제 없음.');
    console.log('   ⇒ verify 500 이 계속되면 원인은 실제 purchaseToken 의 전파지연/상태.');
    console.log('     --token "<실제토큰>" 으로 다시 돌려 확정하세요.');
  }
} else if (status === 200) {
  console.log('✅ 200 — 이 구독이 Play 에서 정상 조회됨. 자격·권한·토큰 전부 정상.');
  console.log('   ⇒ verify 500 의 원인이 이 경로가 아닐 수 있음(다른 productId/상태). body 의 subscriptionState 확인.');
} else {
  console.log(`예상 외 상태 (${status}). 위 body 참고.`);
}
