// 클라우드 단어 손실 진단 스크립트 (로컬 전용, service role 필요).
//
// 목적: "큐레이션에서 받은 단어장이 줄었다 + 제목에 -1 중복" 신고의 원인이
//   (A) 복구 가능: 클라우드엔 단어가 멀쩡, 로컬 pull만 부분 누락
//   (B) 영구 손실: push 미완으로 클라우드 자체에 단어가 적음
// 중 무엇인지 가린다. cloud_lists / cloud_words를 service role로 직접 조회해
// 단어장별 실제 클라우드 단어 수를 센다. RLS는 service role로 우회한다.
//
// ⚠️ SUPABASE_SERVICE_ROLE_KEY는 서버 전용 시크릿이다. 절대 코드/깃에 넣지 말고
//    실행 시 환경변수로만 주입한다(아래 사용법). 출력에 키 원문은 찍지 않는다.
//
// 사용법 (PowerShell):
//   $env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
//   node scripts/diagnose-cloud-words.mjs --email you@example.com
//
//   # 또는 user_id를 직접 알 때:
//   node scripts/diagnose-cloud-words.mjs --user-id <uuid>
//
//   # 특정 제목만 보고 싶을 때(부분일치, 대소문자 무시):
//   node scripts/diagnose-cloud-words.mjs --email you@example.com --title "슬랭"
//
//   # 특정 단어장의 Day(assigned_day)별 클라우드 단어 분포까지 보고 싶을 때:
//   #   (로컬 플랜에 Day 4,8만 남았다면, 클라우드엔 Day 1~8 다 있는지 확인 = 복구 가능 판정)
//   node scripts/diagnose-cloud-words.mjs --email you@example.com --breakdown "슬랭"
//
// SUPABASE_URL은 .env의 EXPO_PUBLIC_SUPABASE_URL을 자동으로 읽는다(없으면 플래그/환경변수).

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// ── 인자/환경 파싱 ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
};

function readEnvFromDotenv(key) {
  try {
    const txt = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    const m = txt.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined;
  } catch {
    return undefined;
  }
}

const SUPABASE_URL =
  flag('url') || process.env.SUPABASE_URL || readEnvFromDotenv('EXPO_PUBLIC_SUPABASE_URL');
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || flag('service-role');
const email = flag('email');
let userId = flag('user-id');
const titleFilter = flag('title');
const breakdownFilter = flag('breakdown');

const problems = [];
if (!SUPABASE_URL) problems.push('SUPABASE_URL 없음 (.env EXPO_PUBLIC_SUPABASE_URL 또는 --url)');
if (!SERVICE_ROLE) problems.push('$env:SUPABASE_SERVICE_ROLE_KEY 필요 (서버 전용 시크릿)');
if (!email && !userId) problems.push('--email 또는 --user-id 중 하나 필요');
if (problems.length) {
  console.error('❌ 입력 부족:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── 이메일 → user_id 해석 (auth admin) ───────────────────────────────────────
async function resolveUserIdByEmail(targetEmail) {
  const wanted = targetEmail.trim().toLowerCase();
  // identities까지 보려고 페이지를 돈다(보통 1페이지면 충분).
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users ?? [];
    for (const u of users) {
      const emails = new Set();
      if (u.email) emails.add(u.email.toLowerCase());
      for (const id of u.identities ?? []) {
        const e = id.identity_data?.email;
        if (e) emails.add(String(e).toLowerCase());
      }
      if (emails.has(wanted)) {
        return { id: u.id, providers: (u.identities ?? []).map((i) => i.provider), emails: [...emails] };
      }
    }
    if (users.length < 200) break;
  }
  return null;
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!userId) {
    const found = await resolveUserIdByEmail(email);
    if (!found) {
      console.error(`❌ 이메일로 사용자 못 찾음: ${email}`);
      console.error('   (앱에서 쓰는 로그인 이메일이 맞는지, Apple "이메일 가리기" 릴레이는 아닌지 확인)');
      process.exit(2);
    }
    userId = found.id;
    console.log(`👤 user_id=${userId}  providers=[${found.providers.join(', ')}]  emails=[${found.emails.join(', ')}]\n`);
  } else {
    console.log(`👤 user_id=${userId}\n`);
  }

  // 단어장 전부(삭제 포함) 조회
  const { data: lists, error: listErr } = await admin
    .from('cloud_lists')
    .select('id, title, is_curated, is_deleted, created_at')
    .eq('user_id', userId);
  if (listErr) throw listErr;

  if (!lists || lists.length === 0) {
    console.log('클라우드에 단어장이 없습니다. (게스트였거나, 한 번도 push되지 않음)');
    return;
  }

  // 단어장별 단어 수 집계 (live / deleted 분리)
  const rows = [];
  for (const l of lists) {
    if (titleFilter && !l.title.toLowerCase().includes(titleFilter.toLowerCase())) continue;

    const { count: liveCount, error: e1 } = await admin
      .from('cloud_words')
      .select('*', { count: 'exact', head: true })
      .eq('list_id', l.id)
      .eq('is_deleted', false);
    if (e1) throw e1;

    const { count: delCount, error: e2 } = await admin
      .from('cloud_words')
      .select('*', { count: 'exact', head: true })
      .eq('list_id', l.id)
      .eq('is_deleted', true);
    if (e2) throw e2;

    rows.push({
      title: l.title,
      id: l.id,
      curated: l.is_curated,
      listDeleted: l.is_deleted,
      live: liveCount ?? 0,
      deleted: delCount ?? 0,
      created: new Date(l.created_at).toISOString().slice(0, 19).replace('T', ' '),
    });
  }

  // 제목 기준 정렬(중복 base가 붙어 보이도록)
  const baseTitle = (t) => t.replace(/-\d+$/, '');
  rows.sort((a, b) => {
    const c = baseTitle(a.title).localeCompare(baseTitle(b.title));
    return c !== 0 ? c : a.title.localeCompare(b.title);
  });

  console.log('클라우드 단어장별 단어 수 (live = 사용자에게 보이는 단어):\n');
  console.log(
    '  live  삭제  curated  listDel  생성일                제목  [id]'
  );
  console.log('  ' + '─'.repeat(78));
  for (const r of rows) {
    const dupMark = /-\d+$/.test(r.title) ? ' ⟵중복(-N)' : '';
    console.log(
      `  ${String(r.live).padStart(4)}  ${String(r.deleted).padStart(4)}  ` +
        `${(r.curated ? 'Y' : 'N').padStart(7)}  ${(r.listDeleted ? 'Y' : 'N').padStart(7)}  ` +
        `${r.created}  ${r.title}${dupMark}  [${r.id.slice(0, 8)}]`
    );
  }

  // 같은 base 제목끼리 묶어 단어 수 비교
  const byBase = new Map();
  for (const r of rows) {
    const b = baseTitle(r.title);
    if (!byBase.has(b)) byBase.set(b, []);
    byBase.get(b).push(r);
  }
  const dupGroups = [...byBase.entries()].filter(([, arr]) => arr.length > 1);
  if (dupGroups.length > 0) {
    console.log('\n⚠️ 중복 제목 그룹(같은 덱을 여러 번 받은 것):');
    for (const [base, arr] of dupGroups) {
      const counts = arr.map((r) => `${r.title}=${r.live}`).join(', ');
      console.log(`  • "${base}": ${counts}`);
    }
  }

  // ── assigned_day 분포 (--breakdown) ───────────────────────────────────────
  if (breakdownFilter) {
    const targets = lists.filter(
      (l) =>
        l.id === breakdownFilter ||
        l.title.toLowerCase().includes(breakdownFilter.toLowerCase()),
    );
    if (targets.length === 0) {
      console.log(`\n(--breakdown "${breakdownFilter}" 에 해당하는 단어장 없음)`);
    }
    for (const l of targets) {
      // 해당 단어장의 live 단어를 전부 가져와 assigned_day별로 센다.
      // 페이지네이션(기본 1000행)으로 큰 덱도 누락 없이 집계.
      const dayMap = new Map();
      let total = 0;
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await admin
          .from('cloud_words')
          .select('assigned_day')
          .eq('list_id', l.id)
          .eq('is_deleted', false)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const w of data) {
          const d = w.assigned_day ?? 0; // 0 = 미배정
          dayMap.set(d, (dayMap.get(d) ?? 0) + 1);
          total++;
        }
        if (data.length < PAGE) break;
      }
      console.log(`\n📊 "${l.title}" [${l.id.slice(0, 8)}] 클라우드 live 단어 ${total}개의 Day 분포:`);
      const days = [...dayMap.keys()].sort((a, b) => a - b);
      for (const d of days) {
        const label = d === 0 ? '미배정' : `Day ${d}`;
        console.log(`    ${label.padEnd(8)} : ${dayMap.get(d)}개`);
      }
    }
  }

  console.log('\n판정 가이드:');
  console.log('  - live 수가 원래 덱 개수(예: 500)와 같다 → (A) 클라우드 정상. 로컬 pull만 부분 누락 = 재설치(같은 버전)로 전체 재pull하면 복구.');
  console.log('  - live 수 자체가 적다 → (B) push 미완으로 클라우드도 손실. 재설치해도 복구 안 됨. 해당 덱 재다운로드 필요.');
  if (breakdownFilter) {
    console.log('  - (breakdown) 클라우드 Day 분포가 1~8 골고루 → 로컬 플랜에 Day 4,8만 보이는 건 로컬 한정 = (A) 복구 가능.');
    console.log('  - (breakdown) 클라우드도 Day 4,8뿐 → 나머지 Day 단어가 클라우드에서도 소실 = (B).');
  }
}

main().catch((e) => {
  console.error('진단 실패:', e?.message ?? e);
  process.exit(1);
});
