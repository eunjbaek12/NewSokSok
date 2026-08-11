/**
 * 공용 enrich 캐시 시딩 — 사용자를 기다리지 않고 창고를 미리 채운다.
 *
 * 대상: 큐레이션 덱의 단어(출발어별 중복 제거) × 자기 자신을 뺀 나머지 도착어 5개.
 *       덱을 위한 게 아니라, 덱이 곧 "학습자가 찾을 법한 어휘 1만 개" 목록이라서 쓴다.
 *
 * 흐름
 *   1. 덱에서 단어 추출 → (term, source, target) 작업 목록 → 언어쌍을 고르게 섞는다
 *   2. 이미 만들어 둔 것은 DB에서 조회해 제외 → 중간에 끊겨도 그대로 재개된다
 *   3. seed-enrich Edge 를 배치로 호출 (service_role 전용, quota·rate limit 없음)
 *   4. 품질 검사 → 어긋나면 한 번 다시 만들고, 그래도 안 되면 기록만 남기고 저장
 *   5. service_role 로 enrich_cache 에 직접 upsert
 *
 * 🔑 저장을 서버가 아니라 여기서 하는 이유: 검사를 통과시킨 뒤에 넣기 위해서다.
 *    서버가 곧바로 쓰면 표제어 빠진 예문이 검사 없이 굳는다. 판정에는 앱이 실제로
 *    쓰는 canBlankExample 을 그대로 import 한다 — 복제하면 앱과 어긋나도 모른다.
 *
 * 실행:
 *   SUPABASE_URL=... SERVICE_ROLE_KEY=... npx -y tsx scripts/seed-cache.ts [옵션]
 * 옵션:
 *   --limit N        앞에서 N건만 (소규모 시험용. 목록이 섞여 있어 전 언어쌍이 골고루 들어간다)
 *   --concurrency N  동시 배치 수 (기본 2 = 동시 40건). 4(=동시 80건)로 올리면 Vertex 가
 *                    429 를 쏟는다 — 실측 15,050건 중 46.8% 실패. 2 를 넘기지 말 것.
 *   --pairs a>b,c>d  언어쌍을 골라서만 (기본: 30쌍 전부). 없는 쌍을 적으면 즉시 실패한다
 *   --dry-run        호출·저장 없이 대상 건수만 센다
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { canBlankExample } from '../lib/example-blank';
import { cleanPhonetic } from '../lib/phonetic';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL 과 SERVICE_ROLE_KEY 가 필요합니다.');
  process.exit(1);
}

const CURATION_PATH = 'constants/curationData.ts';
const LANGS = ['en', 'ko', 'ja', 'zh', 'vi', 'es'] as const;
const BATCH = 20;            // seed-enrich 한 요청에 담는 건수 (함수의 MAX_ITEMS 와 동일)
const UPSERT_CHUNK = 200;    // 캐시에 한 번에 밀어 넣는 행 수
const PROMPT_VERSION = 7;
const COST_PER_CALL = 0.4;   // ₩/건 (docs/pricing-decision.md 실측)

// ── 버전 어긋남 방지 ─────────────────────────────────────────────────────
// 이 상수가 배포된 Edge 와 다르면 시딩이 통째로 헛돈다(조회는 Edge 버전으로 하므로
// 전부 미스가 된다). 복사본을 믿지 말고 원본에서 읽어 대조한다.
function assertVersionSync() {
  const checks: [string, RegExp][] = [
    ['supabase/functions/enrich-word/index.ts', /const PROMPT_VERSION = (\d+)/],
    ['lib/enrich-cache-shared.ts', /SHARED_ENRICH_PROMPT_VERSION = (\d+)/],
  ];
  for (const [path, re] of checks) {
    const m = readFileSync(path, 'utf8').match(re);
    if (!m) throw new Error(`${path} 에서 버전을 못 읽었습니다.`);
    if (Number(m[1]) !== PROMPT_VERSION) {
      throw new Error(`버전 불일치: ${path} = ${m[1]}, 이 스크립트 = ${PROMPT_VERSION}`);
    }
  }
}

// ── 옵션 ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const optNum = (name: string, dflt: number) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : dflt;
};
const optStr = (name: string, dflt: string) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const LIMIT = optNum('--limit', 0);
const CONCURRENCY = optNum('--concurrency', 2);
const DRY_RUN = argv.includes('--dry-run');
// 언어쌍을 골라 돌린다 (예: --pairs en>ko,ko>en). 실사용이 en>ko 에 86.5% 몰려 있어
// 30쌍을 한 번에 만들 이유가 없다 — 수요가 확인된 쌍부터 채우고 넓힌다.
const PAIR_FILTER = (() => {
  const raw = optStr('--pairs', '').trim();
  if (!raw) return null;
  return new Set(raw.split(',').map(s => s.trim()).filter(Boolean));
})();

interface Job { term: string; sourceLang: string; targetLang: string }
interface SeedResult { term: string; sourceLang: string; targetLang: string; ok: boolean; result?: any; error?: string }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const pairOf = (x: { sourceLang: string; targetLang: string }) => `${x.sourceLang}>${x.targetLang}`;

// ── 언어 이탈 검사 ───────────────────────────────────────────────────────
// 표제어 검사만으로는 "뜻과 번역이 통째로 엉뚱한 언어"인 경우를 놓친다(실측 약 1%:
// 베트남어 cả 를 중국어로 풀이해야 하는데 셋 다 베트남어로 나왔다). 문자 체계로
// 명백한 이탈만 잡는다 — 라틴을 쓰는 en/es/vi 끼리는 구분하지 않는다.
const HANGUL = /[가-힣]/;
const KANA = /[぀-ヿ]/;
const HAN = /[一-鿿]/;

// 문자가 "있느냐"가 아니라 "지배적이냐"로 본다. 도착어 설명에 출발어를 인용하는 것은
// 사전에서 정상이기 때문이다 — ja>vi 뜻 "Là kính ngữ của 「いる」「ある」" 를 섞임으로
// 잡으면 가짜 경보가 된다. 반대로 ja>zh 뜻이 통째로 일본어인 경우는 비율로 드러난다.

function scriptRatios(text: string) {
  const chars = [...text].filter(c => /\S/.test(c));
  const n = chars.length || 1;
  let hangul = 0, kana = 0, han = 0;
  for (const c of chars) {
    if (HANGUL.test(c)) hangul++;
    else if (KANA.test(c)) kana++;
    else if (HAN.test(c)) han++;
  }
  return { hangul: hangul / n, kana: kana / n, han: han / n };
}

function scriptViolation(text: string | undefined, lang: string): string | null {
  if (!text) return '빈 값';
  const r = scriptRatios(text);
  switch (lang) {
    case 'ko': return r.hangul >= 0.3 ? null : '한글이 거의 없음';
    case 'ja': return r.kana + r.han >= 0.3 ? null : '일본어 문자가 거의 없음';
    case 'zh':
      if (r.han < 0.3) return '한자가 거의 없음';
      // 중국어 문장에는 가나가 섞일 일이 없다. 인용 수준(<8%)만 봐준다.
      if (r.kana >= 0.08) return '일본어로 보임';
      if (r.hangul >= 0.08) return '한국어가 섞임';
      return null;
    case 'en': case 'es': case 'vi':
      return r.hangul + r.kana + r.han >= 0.4 ? '다른 문자 체계가 지배적' : null;
    default: return null;
  }
}

// ── 병기 번호 정합 ───────────────────────────────────────────────────────
// 동음이의어는 senses 배열이 화면의 뜻 칩이 되고, meaningKr·definition 의 ①②③ 가
// 그 옆에 붙는 설명이 된다. 둘의 개수가 어긋나면 아무 설명도 없는 칩이 남는다
// (실측 v7: 뜻 15% · 정의 18%. en>ko "feather" 는 senses 3개인데 뜻은 "① 새의 깃털
// ② 깃털을 달다" 두 개뿐이었다). 앞에 요약 줄을 덧붙이는 오염도 같이 잡는다
// (ko>en "위치": "어떤 대상이 차지하고 있는 자리" 다음 줄에 다시 ①②).
//
// ⚠️ 번호를 코드로 잘라내지 않는 이유: ① 이 본문 예시로 쓰인 정상 문장이 있다
//    (ko>vi "첫째" 의 뜻풀이가 "…나타내는 말. ①\n둘째, 셋째 …"). 기계적으로
//    자르면 멀쩡한 글이 깨지므로, 판정만 하고 재생성에 맡긴다.
const MARKS = ['①', '②', '③'];
const markCount = (text?: string) => (text ? MARKS.filter(m => text.includes(m)).length : 0);

function numberingViolation(label: string, text: string | undefined, nSenses: number): string | null {
  const marks = markCount(text);
  if (nSenses >= 2) {
    if (marks !== nSenses) return `${label} 병기 ${marks}개 ≠ 뜻 ${nSenses}개`;
    if (text && !text.trimStart().startsWith('①')) return `${label} ① 앞에 군더더기`;
  } else if (marks > 0) {
    return `${label}에 뜻이 하나인데 병기 번호`;
  }
  return null;
}

/** 다시 만들어야 하는 이유. 문제없으면 null. */
function defectOf(r: SeedResult): string | null {
  const res = r.result ?? {};
  if (res.isReal === false) return null;          // 없는 단어는 재생성 대상이 아니다

  const check = (label: string, text: string | undefined, lang: string) => {
    const v = scriptViolation(text, lang);
    return v ? `${label} ${v}` : null;
  };

  if (!canBlankExample(res.exampleEn, r.term)) return '예문에 표제어 없음';
  const top = check('뜻', res.meaningKr, r.targetLang)
    ?? check('예문', res.exampleEn, r.sourceLang)
    ?? check('예문번역', res.exampleKr, r.targetLang);
  if (top) return top;

  // 발음 표기는 '가드가 통째로 버리는 것'만 재생성 사유로 삼는다. 살려내는 흠(괄호 병기
  // "ああ (아아)", 공백 "ござ いま す", vi 성조 막대)까지 사유로 삼으면 헛돈이다 — 특히
  // vi 성조 막대는 프롬프트가 금지하는데도 실측 8.9%로 계속 나오고(v7 포함) 재생성해도
  // 같은 관성으로 또 붙는데, stripToneBars 가 읽기 경로에서 완전히 지운다. 반면 일본어
  // 한글 전사("와인")는 가드가 버릴 수밖에 없어 발음 정보가 사라지므로 다시 만들 값어치가
  // 있다. senses 예문의 slay/slain 가짜 경보와 같은 함정을 피하려는 것이다.
  const phoneticGone = (p: unknown) =>
    typeof p === 'string' && p.trim().length > 0 && !cleanPhonetic(p, r.sourceLang, r.term);
  if (phoneticGone(res.phonetic)) return `발음 표기 이탈 ${JSON.stringify(res.phonetic)}`;

  // 동음이의어는 뜻마다 별도 예문을 갖고 그게 화면(뜻 고르기 칩)에서 실제로 쓰인다.
  // 대표 필드만 보면 이 안쪽이 아무리 어긋나도 통과한다.
  //
  // 단, 여기서는 언어 이탈만 재생성 사유로 삼는다. senses 예문의 표제어 누락은
  // 실측해 보니 잡히는 것이 거의 전부 가짜 경보였다 — "kept", "써서", "불렀다"처럼
  // 단어가 실제로 들어 있는데 canBlankExample 이 활용형을 못 따라간 경우다. 재생성해도
  // 같은 판정이 나서 헛돈만 쓰고, 무엇보다 결함 숫자가 부풀어 진짜 불량을 가린다.
  // → 통계로만 센다(senseBlankMisses).
  const senses = Array.isArray(res.senses) ? res.senses : [];
  for (let i = 0; i < senses.length; i++) {
    const s = senses[i] ?? {};
    const v = check(`뜻${i + 1}`, s.meaningKr, r.targetLang)
      ?? check(`뜻${i + 1} 예문`, s.exampleEn, r.sourceLang)
      ?? check(`뜻${i + 1} 예문번역`, s.exampleKr, r.targetLang);
    if (v) return v;
    // 뜻마다 별도 발음 표기를 갖는다. 상위만 보면 안쪽 오염을 놓친다(실측: 御座います 는
    // 상위와 senses 2개가 함께 "ござ이마스"로 나왔다).
    if (phoneticGone(s.phonetic)) return `뜻${i + 1} 발음 표기 이탈 ${JSON.stringify(s.phonetic)}`;
  }

  return numberingViolation('뜻', res.meaningKr, senses.length)
    ?? numberingViolation('정의', res.definition, senses.length);
}

/** senses 예문에서 표제어 자리를 못 찾은 개수 — 재생성하지 않고 기록만 한다. */
function senseBlankMisses(r: SeedResult): { miss: number; total: number } {
  const senses = Array.isArray(r.result?.senses) ? r.result.senses : [];
  let miss = 0;
  for (const s of senses) if (!canBlankExample(s?.exampleEn, r.term)) miss++;
  return { miss, total: senses.length };
}

// ── 1. 덱에서 단어 추출 ──────────────────────────────────────────────────
function collectJobs(): Job[] {
  const src = readFileSync(CURATION_PATH, 'utf8');
  // 첫 '['는 타입 선언 `VocaList[]` 의 것이라 '= [' 를 기준으로 잡는다.
  const start = src.indexOf('[', src.indexOf('= ['));
  const decks = JSON.parse(src.slice(start, src.lastIndexOf(']') + 1));

  const bySrc = new Map<string, Set<string>>();
  for (const d of decks) {
    const s = d.sourceLanguage ?? 'en';
    if (!bySrc.has(s)) bySrc.set(s, new Set());
    for (const w of d.words ?? []) {
      const t = String(w.term ?? '').trim().toLowerCase();
      if (t && t.length <= 100) bySrc.get(s)!.add(t);
    }
  }

  // 오타 난 쌍 이름은 조용히 0건이 되어 "다 만들었다"는 착각을 부른다. 먼저 막는다.
  if (PAIR_FILTER) {
    const all = new Set<string>();
    for (const s of bySrc.keys()) for (const t of LANGS) if (t !== s) all.add(`${s}>${t}`);
    const unknown = [...PAIR_FILTER].filter(p => !all.has(p));
    if (unknown.length) {
      throw new Error(`--pairs 에 없는 언어쌍: ${unknown.join(', ')}\n  가능한 쌍: ${[...all].sort().join(', ')}`);
    }
  }

  const byPair = new Map<string, Job[]>();
  for (const [sourceLang, terms] of bySrc) {
    for (const targetLang of LANGS) {
      if (targetLang === sourceLang) continue;   // 같은 언어쌍은 시딩 대상에서 제외
      const pair = `${sourceLang}>${targetLang}`;
      if (PAIR_FILTER && !PAIR_FILTER.has(pair)) continue;
      byPair.set(pair, [...terms].map(term => ({ term, sourceLang, targetLang })));
    }
  }

  // 언어쌍을 번갈아 섞는다. 순서대로 쌓으면 --limit 도 중단도 한 언어쌍만 훑게 되어,
  // "검증했다"는 말이 실제로는 30개 조합 중 1개만 본 것이 된다(첫 시험이 그랬다).
  const lists = [...byPair.values()];
  const out: Job[] = [];
  for (let i = 0; ; i++) {
    let pushed = false;
    for (const l of lists) if (i < l.length) { out.push(l[i]); pushed = true; }
    if (!pushed) break;
  }
  return out;
}

// ── 2. 이미 있는 것 제외 (재개) ──────────────────────────────────────────
async function loadExistingKeys(db: any): Promise<Set<string>> {
  const keys = new Set<string>();
  const PAGE = 1000;   // PostgREST 는 조용히 1000행에서 자른다 — 반드시 페이지네이션
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('enrich_cache')
      .select('source_lang,target_lang,term')
      .eq('prompt_version', PROMPT_VERSION)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`기존 캐시 조회 실패: ${error.message}`);
    if (!data?.length) break;
    for (const r of data as any[]) keys.add(`${r.source_lang}|${r.target_lang}|${r.term}`);
    if (data.length < PAGE) break;
  }
  return keys;
}

// ── 3. Edge 호출 ────────────────────────────────────────────────────────
const VERTEX_RETRY = 3;           // Vertex 429 를 맞은 '항목'을 다시 시도하는 횟수
const VERTEX_BACKOFF_MS = 5000;   // 5s → 10s → 15s

const keyOf = (x: { sourceLang: string; targetLang: string; term: string }) =>
  `${x.sourceLang}|${x.targetLang}|${x.term}`;

/** Vertex 가 지금 바쁜 것뿐이라 다시 던지면 될 실패인가. */
const isVertexBusy = (r: SeedResult) =>
  !r.ok && /\(429\)|RESOURCE_EXHAUSTED|\(5\d\d\)/.test(r.error ?? '');

/** seed-enrich 를 한 번 호출한다. 여기서 다시 시도하는 건 HTTP 단의 429·5xx 뿐이다. */
async function postSeed(items: Job[], attempt = 1): Promise<SeedResult[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/seed-enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) {
      const text = await res.text();
      // 429·5xx 는 잠시 쉬고 다시 — Vertex 쪽 일시적 한계일 뿐이라 포기할 이유가 없다.
      if ((res.status === 429 || res.status >= 500) && attempt <= 4) {
        await sleep(2000 * attempt);
        return postSeed(items, attempt + 1);
      }
      return items.map(it => ({ ...it, ok: false, error: `${res.status} ${text.slice(0, 120)}` }));
    }
    return (await res.json()).results as SeedResult[];
  } catch (e: any) {
    if (attempt <= 4) { await sleep(2000 * attempt); return postSeed(items, attempt + 1); }
    return items.map(it => ({ ...it, ok: false, error: e?.message ?? String(e) }));
  }
}

/**
 * Vertex 429 는 Edge 가 HTTP 200 으로 감싸 results[].error 안에 담아 보낸다 — postSeed 의
 * 상태코드 재시도는 이걸 볼 수 없다. 실측: 동시 80건으로 15,050건을 돌리자 7,023건(46.8%)이
 * 한 번도 재시도되지 않고 실패로 굳었다. 그래서 항목 단위로 다시 시도한다.
 *
 * 백오프를 5초부터 길게 잡는 이유는, 이 429 가 순간 폭주가 아니라 할당량 소진이라서다.
 * 곧바로 다시 던지면 같은 벽에 그대로 부딪힌다.
 */
async function callSeed(items: Job[]): Promise<SeedResult[]> {
  const got = new Map<string, SeedResult>();
  let pending = items;

  for (let round = 0; round <= VERTEX_RETRY && pending.length; round++) {
    if (round > 0) await sleep(VERTEX_BACKOFF_MS * round);
    const results = await postSeed(pending);
    for (const r of results) got.set(keyOf(r), r);
    pending = results.filter(isVertexBusy)
      .map(r => ({ term: r.term, sourceLang: r.sourceLang, targetLang: r.targetLang }));
  }

  // 응답에 없던 항목까지 반드시 자리를 채운다 — 빠지면 호출자가 조용히 건수를 잃는다.
  return items.map(it => got.get(keyOf(it)) ?? { ...it, ok: false, error: '응답 누락' });
}

// ── 실행 ────────────────────────────────────────────────────────────────
async function main() {
  assertVersionSync();

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('덱에서 단어를 모으는 중...');
  let jobs = collectJobs();
  console.log(`  작업 후보 ${jobs.length.toLocaleString()}건`);

  console.log(`이미 만들어 둔 v${PROMPT_VERSION} 캐시 확인 중...`);
  const existing = await loadExistingKeys(db);
  const before = jobs.length;
  jobs = jobs.filter(j => !existing.has(`${j.sourceLang}|${j.targetLang}|${j.term}`));
  console.log(`  v${PROMPT_VERSION} 캐시 ${existing.size.toLocaleString()}건 중 ` +
    `${(before - jobs.length).toLocaleString()}건이 대상과 겹쳐 제외 → 남은 작업 ${jobs.length.toLocaleString()}건`);

  if (LIMIT > 0) { jobs = jobs.slice(0, LIMIT); console.log(`  --limit 적용 → ${jobs.length}건`); }
  if (DRY_RUN) { console.log('\n--dry-run 이라 여기서 멈춥니다.'); return; }
  if (!jobs.length) { console.log('\n할 일이 없습니다.'); return; }

  // 위 버전 검사는 저장소 파일만 본다 — 배포된 서버가 무엇을 들고 있는지는 모른다.
  // enrich-word 와 seed-enrich 는 _shared/gemini-vertex.ts 를 각자 번들하므로,
  // 프롬프트를 고치고 한쪽만 배포하면 시딩은 옛 프롬프트로 조용히 진행된다.
  console.log('\n⚠ 프롬프트(_shared/gemini-vertex.ts)를 고친 뒤라면 enrich-word 와 seed-enrich 를');
  console.log('  둘 다 배포했는지 확인하세요. 한쪽만 배포하면 옛 프롬프트로 5만 건이 만들어집니다.');

  console.log(`\n예상 비용 약 ₩${Math.round(jobs.length * COST_PER_CALL).toLocaleString()} · ` +
    `동시 배치 ${CONCURRENCY}개(=${CONCURRENCY * BATCH}건)`);
  console.log('중단하려면 Ctrl+C — 모아둔 결과를 저장하고 멈춥니다(이미 만든 것은 다음 실행에서 건너뜁니다).\n');

  // Ctrl+C 는 플래그만 세우고, 저장은 워커 루프가 빠져나온 뒤에 한다.
  // 핸들러에서 곧바로 죽이면 버퍼에 모아둔 결과(최대 200건, 이미 돈을 쓴 것)가 날아간다.
  let interrupted = false;
  process.on('SIGINT', () => {
    if (interrupted) { console.log('\n강제 종료합니다.'); process.exit(1); }
    interrupted = true;
    console.log('\n중단 요청을 받았습니다 — 진행 중인 배치를 끝내고 저장한 뒤 멈춥니다. (한 번 더 누르면 강제 종료)');
  });

  const batches: Job[][] = [];
  for (let i = 0; i < jobs.length; i += BATCH) batches.push(jobs.slice(i, i + BATCH));

  const stat = { done: 0, saved: 0, notReal: 0, clean: 0, defect: 0, retried: 0, recovered: 0,
                 callFailed: 0, saveFailed: 0, senseMiss: 0, senseTotal: 0 };
  const perPair = new Map<string, { n: number; defect: number; notReal: number }>();
  const callFailures: string[] = [];
  // 저장에 끝내 실패한 행은 이름만이 아니라 내용을 통째로 보관한다 — 이미 AI 를 불러
  // 돈을 쓴 결과라, 파일로 남겨두면 DB 가 회복된 뒤 그대로 다시 넣을 수 있다.
  const unsavedRows: any[] = [];
  const notRealList: string[] = [];
  const defectSamples: string[] = [];
  let buffer: any[] = [];
  const started = Date.now();

  async function flush() {
    if (!buffer.length) return;
    const rows = buffer; buffer = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error } = await db.from('enrich_cache')
        .upsert(rows, { onConflict: 'source_lang,target_lang,term' });
      if (!error) { stat.saved += rows.length; return; }
      console.error(`  ⚠ 저장 실패(${attempt}/3) ${rows.length}건: ${error.message}`);
      if (attempt < 3) await sleep(1500 * attempt);
    }
    stat.saveFailed += rows.length;
    unsavedRows.push(...rows);
  }

  function record(r: SeedResult, defect: string | null) {
    const pair = pairOf(r);
    if (!perPair.has(pair)) perPair.set(pair, { n: 0, defect: 0, notReal: 0 });
    const p = perPair.get(pair)!;
    p.n++;

    const res = r.result ?? {};
    // 모델이 "없는 단어"로 판정한 것은 저장하지 않는다 — 한 번 굳으면 그 단어는 모두에게
    // 영영 "없는 단어"가 된다(2026-08-08 에 고친 그 버그와 같은 이유).
    // 덱에 실린 단어가 이렇게 판정되는 것은 오판 신호이므로 목록을 남긴다.
    if (res.isReal === false) {
      stat.notReal++; p.notReal++;
      if (notRealList.length < 300) notRealList.push(`${pair} ${r.term}`);
      return;
    }
    const sm = senseBlankMisses(r);
    stat.senseMiss += sm.miss; stat.senseTotal += sm.total;

    if (defect) {
      stat.defect++; p.defect++;
      if (defectSamples.length < 200) {
        defectSamples.push(`${pair} ${r.term} [${defect}] :: ${(res.exampleEn ?? '').slice(0, 60)} / ${(res.meaningKr ?? '').slice(0, 40)}`);
      }
    } else stat.clean++;

    buffer.push({
      source_lang: r.sourceLang, target_lang: r.targetLang, term: r.term,
      result: res, prompt_version: PROMPT_VERSION, updated_at: new Date().toISOString(),
    });
  }

  let nextBatch = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (!interrupted) {
      const idx = nextBatch++;
      if (idx >= batches.length) break;
      const batch = batches[idx];

      const results = await callSeed(batch);

      // 어긋난 건 한 번만 다시 만들어 본다. 두 번째도 어긋나면 그대로 저장한다 —
      // 뜻·발음은 대개 멀쩡하고, 안 넣으면 그 단어는 캐시가 아예 없어진다.
      const defects = new Map<string, string>();
      for (const r of results) {
        if (!r.ok) continue;
        const d = defectOf(r);
        if (d) defects.set(`${r.sourceLang}|${r.targetLang}|${r.term}`, d);
      }
      let retryMap = new Map<string, SeedResult>();
      if (defects.size) {
        stat.retried += defects.size;
        const retryJobs = results
          .filter(r => r.ok && defects.has(`${r.sourceLang}|${r.targetLang}|${r.term}`))
          .map(r => ({ term: r.term, sourceLang: r.sourceLang, targetLang: r.targetLang }));
        const retried = await callSeed(retryJobs);
        retryMap = new Map(retried.filter(r => r.ok).map(r => [`${r.sourceLang}|${r.targetLang}|${r.term}`, r]));
      }

      for (const r of results) {
        if (!r.ok) {
          stat.callFailed++;
          callFailures.push(`${pairOf(r)} ${r.term} — ${r.error ?? '?'}`);
          continue;
        }
        const key = `${r.sourceLang}|${r.targetLang}|${r.term}`;
        const defect = defects.get(key) ?? null;
        if (!defect) { record(r, null); continue; }

        // 재생성이 깨끗하게 나왔을 때만 갈아탄다. 둘 다 어긋났으면 원본을 둔다 —
        // 어느 쪽도 낫지 않은데 굳이 바꿀 이유가 없다.
        const better = retryMap.get(key);
        if (better && !defectOf(better)) { stat.recovered++; record(better, null); }
        else record(r, defect);
      }
      stat.done += batch.length;

      if (buffer.length >= UPSERT_CHUNK) await flush();

      if (idx % 10 === 0 || stat.done >= jobs.length) {
        const pct = (stat.done / jobs.length * 100).toFixed(1);
        const elapsed = (Date.now() - started) / 1000;
        const eta = stat.done > 0 ? (jobs.length - stat.done) / (stat.done / elapsed) / 60 : 0;
        console.log(`  ${stat.done.toLocaleString()}/${jobs.length.toLocaleString()} (${pct}%) · ` +
          `저장 ${stat.saved.toLocaleString()} · 정상 ${stat.clean.toLocaleString()} · 결함 ${stat.defect} · ` +
          `없는단어 ${stat.notReal} · 호출실패 ${stat.callFailed} · 남은시간 ${eta.toFixed(0)}분`);
      }
    }
  }));
  await flush();

  const mins = ((Date.now() - started) / 60000).toFixed(1);
  const graded = stat.clean + stat.defect;
  console.log('\n' + '='.repeat(64));
  console.log(`${interrupted ? '중단됨' : '완료'} — ${mins}분 · 저장 ${stat.saved.toLocaleString()}건`);
  console.log(`  검사 통과 ${stat.clean.toLocaleString()}/${graded.toLocaleString()}` +
    (graded ? ` (${(stat.clean / graded * 100).toFixed(1)}%)` : ''));
  console.log(`  재생성 시도 ${stat.retried} → 회복 ${stat.recovered} · 끝내 결함 ${stat.defect}`);
  console.log(`  없는 단어로 판정(미저장) ${stat.notReal}`);
  if (stat.senseTotal) {
    // 재생성하지 않는 참고 수치. 상당수는 활용형을 못 읽은 가짜 경보다.
    console.log(`  동음이의어 뜻별 예문 ${stat.senseTotal - stat.senseMiss}/${stat.senseTotal} ` +
      `(${((stat.senseTotal - stat.senseMiss) / stat.senseTotal * 100).toFixed(1)}%) — 참고용, 재생성 안 함`);
  }
  console.log(`  호출 실패 ${stat.callFailed} · 저장 실패 ${stat.saveFailed}`);
  console.log(`  실제 비용 약 ₩${Math.round((stat.done + stat.retried) * COST_PER_CALL).toLocaleString()}`);

  const bad = [...perPair].filter(([, p]) => p.defect || p.notReal).sort((a, b) => b[1].defect - a[1].defect);
  if (bad.length) {
    console.log('\n  언어쌍별 결함 (표본  결함  없는단어)');
    for (const [pair, p] of bad.slice(0, 12)) {
      console.log(`    ${pair.padEnd(8)} ${String(p.n).padStart(6)} ${String(p.defect).padStart(6)} ${String(p.notReal).padStart(8)}`);
    }
  }
  console.log('='.repeat(64));

  if (callFailures.length || notRealList.length || defectSamples.length) {
    const path = 'seed-cache-report.json';
    writeFileSync(path, JSON.stringify({
      summary: { ...stat, perPair: Object.fromEntries(perPair) },
      callFailures, notRealList, defectSamples,
    }, null, 2), 'utf8');
    console.log(`\n상세 내역을 ${path} 에 적었습니다.`);
  }
  if (unsavedRows.length) {
    const path = 'seed-cache-unsaved.json';
    writeFileSync(path, JSON.stringify(unsavedRows), 'utf8');
    console.log(`\n⚠ 저장 못 한 ${unsavedRows.length}건의 내용을 ${path} 에 남겼습니다 — ` +
      `DB 가 회복되면 이 파일로 다시 넣을 수 있습니다(다시 만들면 그만큼 돈이 또 듭니다).`);
  }
  if (interrupted) process.exit(130);
}

main().catch(e => { console.error(e); process.exit(1); });
