/**
 * enrich_cache 의 굴절형 표제어에 원형(base_form)과 형태 코드를 채운다.
 *
 * 왜 (2026-08-28 캐시 83,935행 실측):
 *   굴절형으로 저장된 표제어의 72%가 원형을 어디에도 알려주지 않는다. 게다가 사전이
 *   불규칙형을 "plural of mouse" 한 줄로 처리하는 관행을 모델이 따라가면서 **뜻 칸이
 *   문법 설명에 잡아먹힌** 행이 생겼다:
 *       went    → 뜻="'go'의 과거 시제."   ("갔다" 를 못 받는다)
 *       mice    → 뜻="mouse의 복수형"       ("쥐들" 을 못 받는다)
 *       accepts → 뜻="accept의 3인칭 단수 현재형."
 *   뜻 칸은 플래시카드 뒷면·퀴즈 선택지에 그대로 나가므로, 이 소급은 빈 칸 채우기가 아니라
 *   **결함 수정**이다.
 *
 * 🔴 덮어쓰기 범위를 좁게 잠근다. 이 스크립트가 바꾸는 것은 딱 둘이다.
 *      1. result.baseForm / result.inflection  (새 칸)
 *      2. result.meaningKr — **문법 설명만 남은 경우에만**
 *    예문·정의·발음·senses·pos 는 어떤 경우에도 건드리지 않는다.
 *
 * 🔑 PROMPT_VERSION 은 올리지 않는다. 새 키는 optional 이라 옛 행이 틀려지지 않는다.
 *    (bump 는 옛 캐시가 *틀린 답*을 줄 때 하는 것이다 — 2026-08-14 에 그 구분을 놓쳐
 *     80,714행·₩37,412 어치를 버리고 v8→7 로 되돌린 기록이 enrich-word/index.ts 에 있다.)
 *
 * 대상 언어: en · es · ko. 규칙으로 후보를 고르지 않고 **표제어 전량을 모델에 판정시킨다** —
 *   `-er/-est` 로 끝나는 표제어 1,220개의 앞 40개에 비교급이 하나도 없었고
 *   (answer·anger·after·banker…), `analysis → analysi` 같은 오탐이 확실하다.
 *
 * 🔴 실행 전에 **Gemini 선불 크레딧 잔액을 확인할 것**. 2026-08-28 실행이 중간에
 *    `429 Your prepayment credits are depleted` 로 478회 연속 실패했다. 무료 폴백이
 *    없어서 그 뒤로는 아무것도 진행되지 않는다. 충전: https://ai.studio/projects
 *    (Vertex 와 지갑이 다르다 — 서버가 멀쩡해도 이쪽은 따로 떨어진다.)
 *
 * 🔴 백그라운드로 돌렸다면 **정말 멈췄는지 확인할 것**. 같은 날 kill 알림을 받은 실행이
 *    실제로는 계속 돌아 판정을 마치고 9,535행을 썼다. 뒤이어 띄운 실행과 잠시 겹쳤는데,
 *    "값이 이미 같으면 건너뛴다" 가드 덕에 중복 쓰기는 없었다 — 그 가드를 지울 것.
 *
 * 실행:
 *   npx tsx scripts/backfill-base-form.ts --dry-run          # 대상 규모만 집계(호출 없음)
 *   npx tsx scripts/backfill-base-form.ts --sample 200       # 200개만 판정해 품질 확인
 *   npx tsx scripts/backfill-base-form.ts                    # 전량
 * 옵션:
 *   --lang en,ko     언어 한정 (기본 en,es,ko)
 *   --batch 50       한 호출에 넘길 표제어 수
 *   --concurrency 2  동시 호출 (2 초과 금지 — 캐시 시딩에서 정한 상한)
 *   --resume         progress 파일에서 이어서
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { resolveScriptModel } from './_shared/model';

const PROGRESS_FILE = 'scripts/_backfill-base-form-progress.json';
// 🔑 덮어쓰기 전 원본을 남긴다. free 플랜은 백업이 없어서, 파괴적 쓰기 직전에
//    스스로 남기는 것 말고는 되돌릴 방법이 없다(project_supabase_backup).
const BACKUP_FILE = 'scripts/_backfill-base-form-backup.jsonl';
const PROMPT_VERSION = 7; // enrich-word/index.ts 와 동일. 올리지 않는다.
const CODES = [
  'plural', 'past', 'past_participle', 'third_person',
  'ing_form', 'comparative', 'superlative', 'conjugated',
] as const;
const CODE_SET = new Set<string>(CODES);

const LANG_NAME: Record<string, string> = {
  en: 'English', es: 'Spanish', ko: 'Korean',
  ja: 'Japanese', zh: 'Chinese', vi: 'Vietnamese',
};

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    try {
      for (const l of readFileSync(f, 'utf8').split('\n')) {
        const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch { /* 없으면 무시 */ }
  }
}
loadEnv();

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const has = (name: string) => process.argv.includes(`--${name}`);

const DRY = has('dry-run');
const LANGS = arg('lang', 'en,es,ko').split(',').map(s => s.trim()).filter(Boolean);
const BATCH = Math.max(1, Math.min(80, Number(arg('batch', '50'))));
const CONCURRENCY = Math.max(1, Math.min(2, Number(arg('concurrency', '2'))));
const SAMPLE = Number(arg('sample', '0'));
const MODEL = resolveScriptModel();

const sb = createClient(
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

type Row = {
  source_lang: string; target_lang: string; term: string; result: any;
};

/**
 * 뜻 칸이 문법 설명으로 채워졌는지. 여기 걸린 행만 뜻을 다시 만든다.
 *
 * 🔴 보수적으로 잡는다 — 정상적인 뜻에 우연히 걸리면 멀쩡한 뜻을 덮어쓴다.
 *    "가르쳤다 (teach의 과거형 및 과거분사)" 처럼 **뜻이 앞에 있고 괄호로 덧붙은 것은
 *    건드리지 않는다**. 문법 설명이 문장 전체를 차지한 경우만 대상이다.
 *
 * 판정 기준을 넓혔다가 되돌린 이력(실측 64,314행):
 *   - "의" 앞을 아무 문자나 허용했더니 462건이 잡혔는데 그 안에 오탐이 있었다 —
 *     `abbreviations` "단어나 구의 축약형." 과 `adverts` "광고들의 복수형, 특히…" 는
 *     **정상적인 뜻**이다. 덮어썼다면 멀쩡한 뜻을 잃었다.
 *   - 그래서 "의" 앞이 **라틴 문자 원형**일 때만 문법 설명으로 본다 → 239건, 오탐 0.
 *
 * ⚠️ 그 대가로 놓치는 것: `bought` → "사다의 과거 시제 및 과거 분사형." 처럼 원형이 한국어로
 *    적힌 경우. 학습자가 "샀다"를 못 받는 것은 여전하지만, 여기엔 "사다"라는 뜻 정보가
 *    남아 있어 **잘못 덮어쓰는 쪽이 더 나쁘다**. 새 프롬프트가 적용된 뒤 재조회되면 고쳐진다.
 */
function meaningIsOnlyGrammar(meaning: string): boolean {
  const m = (meaning ?? '').trim();
  if (!m) return false;

  // 🔑 축약형 설명은 **그 자체가 뜻이다** — 덮어쓰면 안 된다.
  //    couldnt → "'could not'의 축약형."  /  코로나 → "Abbreviation for COVID-19"
  //    이 예외가 없으면 정상적인 뜻 수백 건을 문법 설명으로 오인한다.
  if (/축약|줄임말|contraction|abbreviation|viết tắt/i.test(m)) return false;

  // 영어로 쓰인 문법 서술로 **시작**하는 것. 한국어 활용형 쪽에 대량으로 있었고
  // (막히 → "The stem of the verb 'makhida'", 떠날 → "The future adnominal form…"),
  // 길이가 60자를 넘어 아래 패턴들이 통째로 놓치고 있었다 — 그래서 길이 제한 밖에 둔다.
  if (/^(the |an? )?(stem|adnominal|inflected|conjugated|declarative|connective|honorific|imperative|passive|causative)\s/i.test(m)) return true;
  if (/^(the |a )?(present|past|future)\s+(tense|participle|adnominal|progressive)/i.test(m)) return true;
  if (/^past (tense|participle)/i.test(m)) return true;
  if (/^(the )?(form|stem) of (the )?(verb|adjective|noun)/i.test(m)) return true;
  if (/^this is the (stem|form)/i.test(m)) return true;

  if (m.length > 60) return false;
  const patterns: RegExp[] = [
    // 🔑 판정의 핵심은 "의" 앞이 **출발어(라틴 문자) 원형인가**이다. 거기가 한국어면 그것은
    //    이미 뜻이고, 문법 설명이 뒤에 덧붙었을 뿐이라 덮어쓰면 멀쩡한 뜻을 잃는다.
    //      mouse의 복수형          → 문법 설명 (라틴 원형)      ✔ 고친다
    //      광고들의 복수형, 특히…   → 뜻 + 덧붙임 (한국어)       ✘ 둔다
    //      단어나 구의 축약형.      → 그냥 뜻                    ✘ 둔다
    //      사다의 과거 시제 및…     → 뜻이 앞에 있다             ✘ 둔다
    //    "be 동사의 1인칭…" 처럼 원형과 "의" 사이에 품사어가 끼는 형태까지 받는다.
    /^['"]?[A-Za-z][\w'’-]*['"]?\s*(동사|명사|형용사)?\s*의\s*(과거|현재|복수|비교급|최상급|[123]인칭|단수|진행)/,
    // 영어로 쓰인 같은 것: "plural of mouse", "past participle of abandon".
    /^(the\s+)?(plural|past tense|past participle|present participle|gerund|comparative|superlative|third[- ]person)[\w\s'’-]*\s+(of|form of)\s+['"]?[\w\s'’-]+['"]?\.?$/i,
  ];
  return patterns.some(re => re.test(m));
}

function buildPrompt(langCode: string, terms: string[]): string {
  const lang = LANG_NAME[langCode] ?? langCode;
  return `For each ${lang} vocabulary entry below, decide whether it is an INFLECTED FORM of some dictionary headword, or a headword itself.

Entries:
${terms.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Return ONLY a JSON array with EXACTLY ${terms.length} items, in the SAME ORDER. Each item:
{"term": "<copy exactly>", "baseForm": "<headword>", "inflection": "<code>"}

Rules:
- "inflection" MUST be exactly one of: ${CODES.join(', ')}. Use "conjugated" for Korean/Japanese verb-adjective conjugations.
- If the entry is ALREADY a dictionary headword, or you are unsure, return "baseForm": "" and "inflection": "".
- Include irregular forms — these matter most: went → go (past), mice → mouse (plural), better → good (comparative), children → child (plural), taught → teach (past).
- Proper nouns are NOT inflected forms even when they end in -s: Abrams, Athens, Paris, Reuters, Wales, Naples. Return empty for them. (Observed defect: "abrams" was judged as plural of "abram".)
- Be careful with look-alikes that are NOT inflected: "analysis", "glass", "business", "answer", "anger", "after", "banker", "banner" are headwords, not inflections. Korean "가을", "마을", "또는" are headwords too.
- A word that is BOTH a headword and an inflected form (e.g. "meeting", "building", "feeling" as nouns) → still give its baseForm and "ing_form"; the app shows the noun meaning and the origin side by side.
- Never write a phrase or a translated label in "inflection". Only the codes above.
Return ONLY the JSON array.`;
}

function buildMeaningPrompt(items: { term: string; srcLang: string; tgtLang: string }[]): string {
  const src = LANG_NAME[items[0].srcLang] ?? items[0].srcLang;
  const tgt = LANG_NAME[items[0].tgtLang] ?? items[0].tgtLang;
  return `Give the actual MEANING of each ${src} word, translated into ${tgt}.

Words:
${items.map((it, i) => `${i + 1}. ${it.term}`).join('\n')}

Return ONLY a JSON array with EXACTLY ${items.length} items, same order: {"term": "<copy exactly>", "meaning": "<meaning in ${tgt}>"}

🔴 CRITICAL: these are inflected forms whose stored meaning was wrongly written as a grammar note. Do NOT repeat that mistake.
- WRONG: "go의 과거 시제", "plural of mouse", "third-person singular of accept"
- RIGHT: "갔다", "쥐들", "받아들이다"
- Give the meaning of the INFLECTED form as used in a sentence, in ${tgt}. Short — a few words, comma-separated.
- Never mention the base form, never name a grammatical category.
Return ONLY the JSON array.`;
}

async function callGemini(prompt: string): Promise<any[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY 가 필요합니다 (.env)');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json: any = await res.json();
  let text = (json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
  if (text.startsWith('```')) {
    const nl = text.indexOf('\n'); const last = text.lastIndexOf('```');
    if (nl !== -1 && last !== -1) text = text.slice(nl, last).trim();
  }
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('배열이 아님');
  return parsed;
}

/**
 * 스캔용 경량 조회. `result` jsonb 를 통째로 끌어오면 6만 행에서
 * `canceling statement due to statement timeout` 이 난다(실측) — 판정에 필요한 두 키만 뽑는다.
 * 전체 result 는 실제로 고칠 행에서만 읽는다(fetchRowsForTerms).
 */
type ScanRow = {
  source_lang: string; target_lang: string; term: string;
  meaning: string | null; base: string | null; hits: number | null;
};

const PAGE = 500;

async function withRetry<T>(label: string, fn: () => Promise<{ data: T | null; error: any }>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await fn();
    if (!error) return (data ?? []) as T;
    // 타임아웃은 부하에 따라 오락가락한다 — 몇 초 쉬고 다시 시도하면 대개 지나간다.
    if (attempt >= 4) { console.error(`\n${label} 실패(${attempt}회):`, error.message); process.exit(1); }
    process.stdout.write(`\r${label} 재시도 ${attempt}…            `);
    await new Promise(r => setTimeout(r, 2000 * attempt));
  }
}

async function scanCache(langs: string[]): Promise<ScanRow[]> {
  const out: ScanRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const b = await withRetry<ScanRow[]>('스캔', () => sb.from('enrich_cache')
      .select('source_lang, target_lang, term, hits:hit_count, meaning:result->>meaningKr, base:result->>baseForm')
      .in('source_lang', langs)
      .eq('prompt_version', PROMPT_VERSION)
      .order('term').order('source_lang').order('target_lang')
      .range(from, from + PAGE - 1) as any);
    out.push(...b);
    process.stdout.write(`\r캐시 ${out.length}행…            `);
    if (b.length < PAGE) break;
  }
  process.stdout.write('\r');
  return out;
}

/** 실제로 고칠 표제어의 행만 result 포함으로 읽는다. */
async function fetchRowsForTerms(lang: string, terms: string[]): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < terms.length; i += 100) {
    const chunk = terms.slice(i, i + 100);
    const b = await withRetry<Row[]>('행 조회', () => sb.from('enrich_cache')
      .select('source_lang, target_lang, term, result')
      .eq('source_lang', lang)
      .eq('prompt_version', PROMPT_VERSION)
      .in('term', chunk) as any);
    out.push(...b);
  }
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

/** 덮어쓰기 전 원본 한 줄을 append 한다. 되돌릴 때 이 파일만 있으면 된다. */
function backup(row: Row, what: 'baseForm' | 'meaningKr') {
  appendFileSync(BACKUP_FILE, JSON.stringify({
    at: new Date().toISOString(), what,
    source_lang: row.source_lang, target_lang: row.target_lang, term: row.term,
    before: row.result,
  }) + '\n', 'utf8');
}


/**
 * 한 배치(같은 언어의 표제어 묶음)를 판정하고 **그 자리에서 캐시에 쓴다.**
 *
 * 🔴 판정을 다 끝낸 뒤 몰아서 쓰던 구조를 이렇게 바꿨다. 2026-08-28 실행이 5,700/36,524
 *    에서 끊겼는데, 그 시점까지 판정한 732개가 **캐시에 하나도 반영되지 않았다** —
 *    17분을 온전히 버텨야만 결과가 남는 구조였기 때문이다. 배치마다 쓰면 언제 멈춰도
 *    그 시점까지가 서버에 남고, 중간에 실제 값을 확인하고 계속할지 판단할 수 있다.
 */
async function processGroup(
  lang: string,
  keys: string[],
  byTerm: Map<string, ScanRow[]>,
  done: Record<string, { baseForm: string; inflection: string }>,
  stats: { judged: number; inflected: number; rejected: number; written: number; fixed: number },
): Promise<void> {
  // ① 판정 — progress 에 이미 있는 키는 건너뛴다(재개·선반영 경로).
  const need = keys.filter(k => !(k in done));
  if (need.length > 0) {
    const needTerms = need.map(k => byTerm.get(k)![0].term);
    try {
      const res = await callGemini(buildPrompt(lang, needTerms));
      for (let i = 0; i < need.length; i++) {
        const item = res[i] ?? {};
        const base = typeof item.baseForm === 'string' ? item.baseForm.trim() : '';
        const infl = typeof item.inflection === 'string' ? item.inflection.trim() : '';
        const term = needTerms[i];
        // 검증 3종: 코드가 목록 안 · 원형이 비지 않음 · 원형 ≠ 표제어.
        if (base && CODE_SET.has(infl) && base.toLowerCase() !== term.trim().toLowerCase()) {
          done[need[i]] = { baseForm: base, inflection: infl };
          stats.inflected++;
        } else {
          done[need[i]] = { baseForm: '', inflection: '' };
          if (base && !CODE_SET.has(infl)) stats.rejected++;
        }
      }
    } catch (e: any) {
      console.error(`\n판정 실패(${lang}, ${needTerms.length}개): ${e.message}`);
      return; // 이 배치는 건너뛴다 — progress 에 안 남으므로 재개 때 다시 시도된다.
    }
  }
  stats.judged += keys.length;

  // ② 굴절형으로 판정된 표제어의 행을 읽어 두 칸을 얹는다.
  const hit = keys.filter(k => done[k]?.baseForm);
  if (hit.length === 0) return;
  const rows = await fetchRowsForTerms(lang, hit.map(k => byTerm.get(k)![0].term));
  const dirtyRows: Row[] = [];
  for (const row of rows) {
    const k = `${row.source_lang}|${row.term.trim().toLowerCase()}`;
    const v = done[k];
    if (!v?.baseForm) continue;
    // 이미 같은 값이면 건너뛴다 — 재실행이 쓸데없이 쓰지 않게.
    if (row.result?.baseForm === v.baseForm && row.result?.inflection === v.inflection) {
      if (meaningIsOnlyGrammar(row.result?.meaningKr ?? '')) dirtyRows.push(row);
      continue;
    }
    backup(row, 'baseForm');
    const next = { ...row.result, baseForm: v.baseForm, inflection: v.inflection };
    const { error } = await sb.from('enrich_cache')
      .update({ result: next })
      .eq('source_lang', row.source_lang)
      .eq('target_lang', row.target_lang)
      .eq('term', row.term)
      .eq('prompt_version', PROMPT_VERSION);
    if (error) console.error(`\n쓰기 실패 ${row.term}: ${error.message}`);
    else stats.written++;
    // 뜻이 문법 설명뿐인 행은 뜻도 되살린다 — 이 소급의 핵심이다.
    if (meaningIsOnlyGrammar(row.result?.meaningKr ?? '')) dirtyRows.push({ ...row, result: next });
  }

  // ③ 뜻 복구 — 도착어가 갈리므로 언어쌍별로 묶어 부른다.
  if (dirtyRows.length === 0) return;
  const byPair = new Map<string, Row[]>();
  for (const r of dirtyRows) {
    const k = `${r.source_lang}>${r.target_lang}`;
    (byPair.get(k) ?? byPair.set(k, []).get(k)!).push(r);
  }
  for (const [pair, list] of byPair) {
    const [srcLang, tgtLang] = pair.split('>');
    try {
      const res = await callGemini(buildMeaningPrompt(list.map(r => ({ term: r.term, srcLang, tgtLang }))));
      for (let j = 0; j < list.length; j++) {
        const meaning = typeof res[j]?.meaning === 'string' ? res[j].meaning.trim() : '';
        // 복구값이 또 문법 설명이면 쓰지 않는다 — 나쁜 값을 나쁜 값으로 바꾸지 않는다.
        if (!meaning || meaningIsOnlyGrammar(meaning)) continue;
        const row = list[j];
        backup(row, 'meaningKr');
        const { error } = await sb.from('enrich_cache')
          .update({ result: { ...row.result, meaningKr: meaning } })
          .eq('source_lang', row.source_lang)
          .eq('target_lang', row.target_lang)
          .eq('term', row.term)
          .eq('prompt_version', PROMPT_VERSION);
        if (!error) stats.fixed++;
      }
    } catch (e: any) {
      console.error(`\n뜻 복구 실패(${pair}): ${e.message}`);
    }
  }
}

async function main() {
  console.log(`모델 ${MODEL} · 언어 ${LANGS.join(',')} · 배치 ${BATCH} · 동시 ${CONCURRENCY}${DRY ? ' · DRY RUN' : ''}\n`);

  const scan = await scanCache(LANGS);
  console.log(`캐시 ${scan.length}행 (prompt_version=${PROMPT_VERSION})`);

  // --redo 는 이미 채워진 행도 다시 판정한다. 프롬프트를 고친 뒤 옛 판정을 덮을 때 쓴다.
  const pending = has('redo') ? scan : scan.filter(r => !r.base);
  const byTerm = new Map<string, ScanRow[]>();
  for (const r of pending) {
    const k = `${r.source_lang}|${r.term.trim().toLowerCase()}`;
    (byTerm.get(k) ?? byTerm.set(k, []).get(k)!).push(r);
  }
  const dirty = scan.filter(r => meaningIsOnlyGrammar(r.meaning ?? ''));

  console.log(`판정 대상 고유 표제어 ${byTerm.size} (행 ${pending.length})`);
  console.log(`뜻이 문법 설명만인 행 ${dirty.length}  ← 뜻도 복구한다`);
  if (dirty.length) {
    console.log('  예:');
    for (const r of dirty.slice(0, 6)) {
      console.log(`    [${r.source_lang}>${r.target_lang}] ${r.term} → "${r.meaning}"`);
    }
  }

  if (DRY) {
    console.log(`\n예상 호출 ${Math.ceil(byTerm.size / BATCH)}회 (배치 ${BATCH})`);
    console.log('--dry-run 이라 여기서 멈춘다. 호출도 쓰기도 하지 않았다.');
    return;
  }

  const done: Record<string, { baseForm: string; inflection: string }> =
    existsSync(PROGRESS_FILE) ? JSON.parse(readFileSync(PROGRESS_FILE, 'utf8')) : {};

  // 🔑 자주 조회되는 단어부터 처리한다. 알파벳 순으로 돌면 a 로 시작하는 단어에 시간을
  //    다 쓰고, 중간에 멈췄을 때 사용자가 체감하는 개선이 없다. 최종 결과는 같고
  //    중단에 대한 보험만 강해진다.
  const hitOf = (keys: ScanRow[]) => Math.max(...keys.map(r => r.hits ?? 0));
  let keys = [...byTerm.keys()].sort((a, b) => hitOf(byTerm.get(b)!) - hitOf(byTerm.get(a)!));
  if (SAMPLE > 0) keys = keys.slice(0, SAMPLE);

  // 이미 판정된 것을 앞으로 — API 호출 없이 캐시 반영만 하면 되므로 먼저 끝낸다.
  const already = keys.filter(k => k in done);
  const fresh = keys.filter(k => !(k in done));
  console.log(`\n표제어 ${keys.length} — 판정 완료 ${already.length}(선반영) · 새로 판정 ${fresh.length}`);

  const stats = { judged: 0, inflected: 0, rejected: 0, written: 0, fixed: 0 };
  const report = () => process.stdout.write(
    `\r판정 ${stats.judged}/${keys.length} · 굴절형 ${stats.inflected} · 쓰기 ${stats.written} · 뜻복구 ${stats.fixed}      `,
  );

  // 언어별로 배치를 만든다 — 프롬프트가 언어를 명시하므로 섞으면 안 된다.
  const makeGroups = (list: string[]): { lang: string; keys: string[] }[] => {
    const byLang = new Map<string, string[]>();
    for (const k of list) {
      const lang = k.split('|')[0];
      (byLang.get(lang) ?? byLang.set(lang, []).get(lang)!).push(k);
    }
    const out: { lang: string; keys: string[] }[] = [];
    for (const [lang, ks] of byLang) {
      for (let i = 0; i < ks.length; i += BATCH) out.push({ lang, keys: ks.slice(i, i + BATCH) });
    }
    return out;
  };

  for (const phase of [already, fresh]) {
    if (phase.length === 0) continue;
    await mapLimit(makeGroups(phase), CONCURRENCY, async (g) => {
      await processGroup(g.lang, g.keys, byTerm, done, stats);
      writeFileSync(PROGRESS_FILE, JSON.stringify(done), 'utf8');
      report();
    });
  }

  console.log(`\n\n완료 — 판정 ${stats.judged} · 굴절형 ${stats.inflected} · 캐시 쓰기 ${stats.written}행 · 뜻 복구 ${stats.fixed}행`);
  if (stats.rejected) console.log(`형식 이탈로 버린 판정 ${stats.rejected}건`);
  console.log('\n⚠️ 사용자 단어장(cloud_words)은 건드리지 않았다 — 캐시만 고쳤다.');
  console.log('   기존 단어는 그 단어를 다시 조회할 때 채워진다.');
}

main().catch(e => { console.error(e); process.exit(1); });
