/**
 * 공식 큐레이션 덱을 서버(official_themes / official_words)에 심는다.
 *
 * 설계: docs/curation-server-migration-spec.md
 * 입력: constants/curationData.ts (덱 원본) + enrich_cache (뜻·정의 보강분)
 *
 * 이 스크립트가 고치는 것 (2026-08-17 실측 근거)
 *   ④ definition 결함 4,907건 — 507건은 빈칸, 4,400건은 meaningKr 복사본이다.
 *      복사본은 전부 출발어가 한국어인 덱(ko>en 2,800 · ko>vi 600 · ko>ja 500 ·
 *      ko>zh 500)에서 나온다. definition 은 "출발어로 쓴 뜻풀이"여야 하는데
 *      (supabase/functions/_shared/gemini-vertex.ts 의 프롬프트 "A simple definition
 *      in ${srcName}") 도착어 번역이 그대로 복사돼 있었다. 캐시에는 제대로 된
 *      한국어 뜻풀이가 있다("행동" → "사람이나 동물이 하는 모든 행위나 움직임").
 *   ⑤ 뜻이 여러 개인데 예문이 하나 — 캐시의 senses(뜻마다 예문을 가진 배열)로
 *      ①② 병기를 만든다. 조립은 앱의 lib/senses.ts 를 그대로 쓴다(복제 금지 —
 *      add-word 가 저장하는 형태와 한 글자도 달라선 안 된다).
 *
 * 🔑 senses 를 배열로 저장하지 않고 병기 텍스트로 만드는 이유: 로컬 SQLite words
 *    테이블에 senses 컬럼이 없어서, 배열로 내려보내도 가져오기 시점에 버려진다.
 *    병기 텍스트는 지금 앱이 그대로 표시한다 → 앱 변경 없이 ⑤가 해결된다.
 *    (official_words.senses 에는 원본 배열도 함께 넣어 둔다. 나중에 로컬 컬럼이
 *     생기면 재시딩 없이 칩 UI 를 붙일 수 있다.)
 *
 * 🔴 덱 뜻이 캐시 뜻과 전혀 겹치지 않는 단어는 건드리지 않는다. 실측 22.9%가 그런데,
 *    그중엔 문자열만 다른 같은 뜻("박사" 덱=doctor(Ph.D.) 캐시=Academic degree)도 있고
 *    캐시가 덱 뜻을 아예 안 가진 것("困" 덱=졸리다 캐시=곤란하게 하다/지치게 하다)도
 *    있다. 자동으로 가를 수 없으므로 통째로 교체하면 덱 뜻이 사라지는 퇴행이 섞인다.
 *
 * 실행:
 *   SUPABASE_URL=... SERVICE_ROLE_KEY=... npx -y tsx scripts/seed-official-decks.ts --dry-run
 *   SUPABASE_URL=... SERVICE_ROLE_KEY=... npx -y tsx scripts/seed-official-decks.ts
 *   SUPABASE_URL=... SERVICE_ROLE_KEY=... npx -y tsx scripts/seed-official-decks.ts --publish
 * 옵션:
 *   --dry-run       서버에 쓰지 않고 합성 결과만 집계한다
 *   --limit N       앞에서 덱 N개만
 *   --deck ID       덱 하나만 (여러 번 지정 가능)
 *   --publish       이미 심어 둔 덱의 is_published 를 true 로 올린다 (심기와 분리)
 *   --unpublish     되돌린다 (신버전 앱의 큐레이션 탭이 비므로 긴급용)
 *   --report FILE   건드리지 않은 단어·한도 초과 목록을 JSON 으로 남긴다
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { getTopTags } from '../lib/curation-tags';
import { composeWord, type CachedEnrich, type Composed, type Outcome } from './lib/official-deck-compose';
import type { VocaList } from '../lib/types';

// 🔑 service_role 키를 명령줄에 쓰지 않아도 되도록 .env.local 을 먼저 읽는다.
// 명령줄에 적으면 셸 기록과 도구 권한 허용 목록에 평문으로 굳는다(실제로 한 번
// 그렇게 새어 폐기한 토큰이 있다). .env.local 은 .gitignore 에 걸려 있다.
function loadEnvLocal() {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, key, rawValue] = m;
      if (process.env[key]) continue;   // 이미 넘어온 값이 우선
      process.env[key] = rawValue.replace(/^["']|["']$/g, '');
    }
  } catch {
    // 파일이 없으면 환경변수만 쓴다.
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CURATION_PATH = 'constants/curationData.ts';
const PROMPT_VERSION = 7;
const CACHE_CHUNK = 200;   // PostgREST in() 은 URL 길이 제한이 있다
const WORD_CHUNK = 500;    // insert 한 번에 넣는 단어 수

// ── 옵션 ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (name: string) => argv.includes(name);
const optStr = (name: string, dflt = '') => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const optNum = (name: string, dflt: number) => {
  const v = optStr(name);
  return v ? Number(v) : dflt;
};
const DRY_RUN = has('--dry-run');
const PUBLISH = has('--publish');
const UNPUBLISH = has('--unpublish');
const LIMIT = optNum('--limit', 0);
const REPORT = optStr('--report');
const ONLY_DECKS = argv.reduce<string[]>((acc, a, i) => {
  if (a === '--deck' && argv[i + 1]) acc.push(argv[i + 1]);
  return acc;
}, []);

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL 과 SERVICE_ROLE_KEY 가 필요합니다.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── 버전 어긋남 방지 ─────────────────────────────────────────────────────
// 이 상수가 배포된 Edge 와 다르면 캐시 조회가 전부 미스가 되어 보강이 통째로 헛돈다.
// seed-cache.ts 와 같은 방식으로 원본에서 읽어 대조한다.
function assertVersionSync() {
  const checks: [string, RegExp, string][] = [
    ['supabase/functions/enrich-word/index.ts', /const PROMPT_VERSION = (\d+)/, 'Edge 프롬프트 버전'],
    ['lib/enrich-cache-shared.ts', /SHARED_ENRICH_PROMPT_VERSION = (\d+)/, '앱 공용 캐시 버전'],
  ];
  for (const [path, re, label] of checks) {
    const m = readFileSync(path, 'utf8').match(re);
    if (!m) throw new Error(`${path} 에서 ${label}을 못 읽었습니다.`);
    if (Number(m[1]) !== PROMPT_VERSION) {
      throw new Error(`${label} 불일치: ${path} = ${m[1]}, 이 스크립트 = ${PROMPT_VERSION}`);
    }
  }
}

// ── 덱 로드 ─────────────────────────────────────────────────────────────
function loadDecks(): VocaList[] {
  const src = readFileSync(CURATION_PATH, 'utf8');
  const start = src.indexOf('= [') + 2;
  const end = src.lastIndexOf(']');
  const all: VocaList[] = JSON.parse(src.slice(start, end + 1));
  let decks = all;
  if (ONLY_DECKS.length) {
    decks = all.filter(d => ONLY_DECKS.includes(d.id));
    const missing = ONLY_DECKS.filter(id => !all.some(d => d.id === id));
    if (missing.length) throw new Error(`없는 덱 id: ${missing.join(', ')}`);
  }
  if (LIMIT > 0) decks = decks.slice(0, LIMIT);
  return decks;
}

// ── 캐시 조회 ───────────────────────────────────────────────────────────
const cacheKey = (sl: string, tl: string, term: string) =>
  `${sl}|${tl}|${term.trim().toLowerCase()}`;

async function fetchCache(decks: VocaList[]): Promise<Map<string, CachedEnrich>> {
  // 언어쌍별 term 집합 (덱 사이에 중복이 많다 — 12,108 고유 / 13,874 인스턴스)
  const byPair = new Map<string, Set<string>>();
  for (const d of decks) {
    const sl = d.sourceLanguage ?? 'en';
    const tl = d.targetLanguage ?? 'ko';
    const key = `${sl}|${tl}`;
    const set = byPair.get(key) ?? byPair.set(key, new Set()).get(key)!;
    for (const w of d.words) {
      const t = (w.term ?? '').trim().toLowerCase();
      if (t) set.add(t);
    }
  }

  const out = new Map<string, CachedEnrich>();
  for (const [pair, terms] of byPair) {
    const [sl, tl] = pair.split('|');
    const list = [...terms];
    for (let i = 0; i < list.length; i += CACHE_CHUNK) {
      const chunk = list.slice(i, i + CACHE_CHUNK);
      const { data, error } = await db
        .from('enrich_cache')
        .select('term, result')
        .eq('source_lang', sl)
        .eq('target_lang', tl)
        .eq('prompt_version', PROMPT_VERSION)
        .in('term', chunk);
      if (error) throw new Error(`캐시 조회 실패 (${pair}): ${error.message}`);
      for (const row of data ?? []) {
        out.set(cacheKey(sl, tl, row.term), (row.result ?? {}) as CachedEnrich);
      }
    }
    process.stdout.write(`  캐시 ${pair}: ${terms.size} 조회\r`);
  }
  process.stdout.write('\n');
  return out;
}

// ── 서버 쓰기 ───────────────────────────────────────────────────────────
async function upsertDeck(deck: VocaList, composed: Composed[]) {
  const now = Date.now();
  const themeRow = {
    id: deck.id,
    title: deck.title,
    icon: deck.icon ?? null,
    description: deck.description ?? null,
    category: deck.category ?? null,
    level: deck.level ?? null,
    source_language: deck.sourceLanguage ?? 'en',
    target_language: deck.targetLanguage ?? 'ko',
    word_count: composed.length,
    top_tags: getTopTags({ words: composed.map(c => c.word), category: deck.category }),
    position: 0,
    // is_published 는 여기서 건드리지 않는다 — 검증이 끝난 뒤 --publish 로 올린다.
    // (upsert 라 컬럼을 빼면 기존 값이 유지된다. 처음 넣을 때는 기본값 false.)
    content_version: 1,
    created_at: deck.createdAt ?? now,
    updated_at: now,
  };
  const { error: themeErr } = await db.from('official_themes').upsert(themeRow, { onConflict: 'id' });
  if (themeErr) throw new Error(`덱 upsert 실패 (${deck.id}): ${themeErr.message}`);

  // 단어는 덱 단위로 전량 교체한다. upsert 로는 "이번에 사라진 단어"가 남는다.
  const { error: delErr } = await db.from('official_words').delete().eq('theme_id', deck.id);
  if (delErr) throw new Error(`단어 삭제 실패 (${deck.id}): ${delErr.message}`);

  const rows = composed.map((c, i) => ({
    id: `${deck.id}#${i}`,   // 결정론적 — 재시딩해도 같은 id
    theme_id: deck.id,
    position: i,
    term: c.word.term,
    definition: c.word.definition || null,
    meaning_kr: c.word.meaningKr || null,
    example_en: c.word.exampleEn || null,
    example_kr: c.word.exampleKr || null,
    pronunciation: c.word.phonetic || null,
    pos: c.word.pos || null,
    tags: c.word.tags ?? [],
    senses: c.senses ?? null,
  }));
  for (let i = 0; i < rows.length; i += WORD_CHUNK) {
    const { error } = await db.from('official_words').insert(rows.slice(i, i + WORD_CHUNK));
    if (error) throw new Error(`단어 insert 실패 (${deck.id} @${i}): ${error.message}`);
  }
}

// ── 실행 ────────────────────────────────────────────────────────────────
async function main() {
  assertVersionSync();

  if (PUBLISH || UNPUBLISH) {
    const value = PUBLISH;
    const target = ONLY_DECKS.length ? ONLY_DECKS : null;
    let q = db.from('official_themes').update({ is_published: value });
    if (target) q = q.in('id', target);
    else q = q.neq('id', '');   // 전체 (update 는 필터가 필수다)
    const { data, error } = await q.select('id');
    if (error) throw new Error(`is_published 갱신 실패: ${error.message}`);
    console.log(`is_published=${value} 로 갱신: ${data?.length ?? 0}개 덱`);
    return;
  }

  const decks = loadDecks();
  const totalWords = decks.reduce((a, d) => a + d.words.length, 0);
  console.log(`덱 ${decks.length}개 · 단어 ${totalWords}개`);

  // 단어 id 는 우리가 결정론적으로 만든다(덱 원본 id 는 쓰지 않는다) — 덱 사이
  // 중복이 있어도 안전하고, 재시딩해도 같은 행을 덮는다.
  console.log('캐시 조회…');
  const cache = await fetchCache(decks);
  console.log(`  캐시 히트 가능 term: ${cache.size}`);

  const stats: Record<Outcome, number> = {
    'unchanged': 0,
    'definition-filled': 0,
    'definition-fixed': 0,
    'senses-merged': 0,
    'senses-skipped-nooverlap': 0,
    'senses-skipped-limit': 0,
  };
  let cacheMiss = 0, exampleChanged = 0;
  const report: { skippedNoOverlap: any[]; skippedLimit: any[] } = { skippedNoOverlap: [], skippedLimit: [] };

  for (const deck of decks) {
    const sl = deck.sourceLanguage ?? 'en';
    const tl = deck.targetLanguage ?? 'ko';
    const composed: Composed[] = [];
    for (const w of deck.words) {
      const cached = cache.get(cacheKey(sl, tl, w.term));
      if (!cached) cacheMiss++;
      const c = composeWord(w, cached);
      stats[c.outcome]++;
      if (c.exampleChanged) exampleChanged++;
      if (c.outcome === 'senses-skipped-nooverlap' && report.skippedNoOverlap.length < 3000) {
        report.skippedNoOverlap.push({
          deck: deck.id, pair: `${sl}>${tl}`, term: w.term,
          deckMeaning: w.meaningKr, senseMeanings: (c.senses ?? []).map(s => s.meaningKr),
        });
      }
      if (c.outcome === 'senses-skipped-limit' && report.skippedLimit.length < 3000) {
        report.skippedLimit.push({
          deck: deck.id, pair: `${sl}>${tl}`, term: w.term,
          senseCount: (c.senses ?? []).length,
        });
      }
      composed.push(c);
    }

    if (!DRY_RUN) {
      await upsertDeck(deck, composed);
      process.stdout.write(`  심음: ${deck.id} (${composed.length})\r`);
    }
  }
  if (!DRY_RUN) process.stdout.write('\n');

  console.log('\n=== 합성 결과 ===');
  console.log(`캐시 미스(덱 것 그대로)      : ${cacheMiss}`);
  console.log(`손댈 것 없음                 : ${stats['unchanged']}`);
  console.log(`definition 빈칸 채움         : ${stats['definition-filled']}`);
  console.log(`definition 복사본 교정       : ${stats['definition-fixed']}`);
  console.log(`①② 병기 적용                : ${stats['senses-merged']}`);
  console.log(`  ↳ 예문이 캐시 것으로 바뀜  : ${exampleChanged}`);
  console.log(`병기 보류(덱 뜻이 캐시에 없음): ${stats['senses-skipped-nooverlap']}`);
  console.log(`병기 보류(저장 한도 초과)     : ${stats['senses-skipped-limit']}`);

  if (REPORT) {
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log(`\n보류 목록 저장: ${REPORT}`);
  }
  if (DRY_RUN) console.log('\n--dry-run 이라 서버에 쓰지 않았습니다.');
  else console.log('\n심기 완료. 검증 후 --publish 로 공개하세요.');
}

main().catch(e => {
  console.error('\n실패:', e.message);
  process.exit(1);
});
