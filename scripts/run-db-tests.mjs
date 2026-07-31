// 원격 Supabase(테스트 프로젝트)에서 pgTAP 테스트를 실행하는 러너.
//
// `supabase test db` 는 로컬 Docker 전용이라, Docker 없이 클라우드 Postgres 에서
// supabase/tests/*.test.sql 을 돌리기 위한 대체 러너다. pgTAP 함수의 TAP 출력을
// 수집해 'not ok' 가 있으면 실패로 종료한다.
//
// 준비:
//   1) 별도 Supabase '테스트' 프로젝트 생성 (프로덕션 아님 — 테스트가 auth.users 에 insert)
//   2) .env.test.local 에 직접 연결 문자열 저장 (.gitignore 의 .env*.local 로 자동 제외):
//        TEST_DB_URL=postgresql://postgres:<PW>@db.<ref>.supabase.co:5432/postgres
//      (Dashboard → Settings → Database → Connection string → URI → Direct connection)
//
// 사용:
//   node scripts/run-db-tests.mjs --migrate   # 첫 실행: 마이그레이션 적용 + 테스트
//   node scripts/run-db-tests.mjs             # 이후: 테스트만
//   TAP_VERBOSE=1 node scripts/run-db-tests.mjs   # 모든 TAP 라인 출력

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

// ── .env.test.local 로드 (의존성 없이 단순 파싱) ──────────────────────────────
function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith('#')) {
      process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
    }
  }
}
loadEnvFile('.env.test.local');

const url = process.env.TEST_DB_URL;
if (!url) {
  console.error('✖ TEST_DB_URL 이 없습니다. .env.test.local 을 확인하세요.');
  console.error('  예: TEST_DB_URL=postgresql://postgres:<PW>@db.<ref>.supabase.co:5432/postgres');
  process.exit(2);
}
const doMigrate = process.argv.includes('--migrate');
const doFresh = process.argv.includes('--fresh');

// 이 pgTAP 스위트가 의존하는 마이그레이션만 적용한다(전체 히스토리 아님). 레포의
// 다른 마이그레이션(enrich_cache / curation_reports 등)은 별도 선행 의존성이 있어
// 단독 순차 적용이 안 되며, quota/trial 테스트와도 무관하다. 순서 중요.
const REQUIRED_MIGRATIONS = [
  '20260518000000_ai_quota.sql',
  '20260519000000_quota_status_client_grant.sql',
  '20260523000000_trial_reacquisition_guard.sql',
  '20260727000000_signup_boost_replaces_trial.sql',
];

// ── dollar-quote 를 인식하는 SQL statement splitter ──────────────────────────
// (throws_ok($$ ... $$) / 함수 본문 $$ ... $$ 안의 세미콜론을 분리하지 않기 위함)
function splitStatements(sql) {
  const out = [];
  let cur = '';
  let i = 0;
  let tag = null;
  while (i < sql.length) {
    if (tag) {
      if (sql.startsWith(tag, i)) { cur += tag; i += tag.length; tag = null; continue; }
      cur += sql[i++];
      continue;
    }
    const m = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
    if (m) { tag = m[0]; cur += m[0]; i += m[0].length; continue; }
    if (sql[i] === '-' && sql[i + 1] === '-') { // 한 줄 주석
      const nl = sql.indexOf('\n', i);
      const end = nl < 0 ? sql.length : nl;
      cur += sql.slice(i, end); i = end; continue;
    }
    if (sql[i] === ';') { out.push(cur + ';'); cur = ''; i++; continue; }
    cur += sql[i++];
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

const TAP_LINE = /^(ok |not ok|\d+\.\.\d+|# )/;

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  // pgTAP 활성화 + 세션 search_path 에 extensions 포함 (plan/ok/is 등을 비한정 호출)
  await client.query('create extension if not exists pgtap with schema extensions;');
  await client.query('set search_path to public, extensions;');

  if (doFresh) {
    // 재실행 멱등성: public 스키마를 비우고 다시 만든다. (테스트 프로젝트 전용 —
    // 프로덕션엔 절대 사용 금지. auth/extensions 등 다른 스키마는 건드리지 않음.)
    process.stdout.write('▶ public 스키마 리셋 ... ');
    await client.query(
      'drop schema if exists public cascade;'
      + ' create schema public;'
      + ' grant usage on schema public to anon, authenticated, service_role;'
      + ' grant all on schema public to postgres, service_role;',
    );
    console.log('ok');
  }

  if (doMigrate) {
    const migDir = 'supabase/migrations';
    for (const f of REQUIRED_MIGRATIONS) {
      process.stdout.write(`▶ migrate ${f} ... `);
      await client.query(readFileSync(path.join(migDir, f), 'utf8'));
      console.log('ok');
    }
    console.log('');
  }

  const testDir = 'supabase/tests';
  let totalFail = 0;
  let totalRun = 0;
  for (const f of readdirSync(testDir).filter((n) => n.endsWith('.test.sql')).sort()) {
    const lines = [];
    for (const stmt of splitStatements(readFileSync(path.join(testDir, f), 'utf8'))) {
      const res = await client.query(stmt);
      for (const row of res.rows || []) {
        const v = Object.values(row)[0];
        if (typeof v === 'string' && TAP_LINE.test(v)) lines.push(v);
      }
    }
    const fails = lines.filter((l) => l.startsWith('not ok'));
    const oks = lines.filter((l) => l.startsWith('ok '));
    totalFail += fails.length;
    totalRun += oks.length + fails.length;
    const mark = fails.length ? '✖' : '✓';
    console.log(`${mark} ${f} — ${oks.length} passed, ${fails.length} failed`);
    if (process.env.TAP_VERBOSE) lines.forEach((l) => console.log('   ' + l));
    else fails.forEach((l) => console.log('   ' + l));
  }

  console.log('\n' + '─'.repeat(52));
  console.log(`총 ${totalRun}개 실행 / ${totalFail}개 실패`);
  process.exit(totalFail > 0 ? 1 : 0);
} catch (e) {
  console.error('\n✖ 실행 중 오류:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
