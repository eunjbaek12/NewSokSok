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
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolveScriptModel } from './_shared/model';

const PROGRESS_FILE = 'scripts/_backfill-base-form-progress.json';
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
  if (!m || m.length > 60) return false;
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
  meaning: string | null; base: string | null;
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
      .select('source_lang, target_lang, term, meaning:result->>meaningKr, base:result->>baseForm')
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

async function main() {
  console.log(`모델 ${MODEL} · 언어 ${LANGS.join(',')} · 배치 ${BATCH} · 동시 ${CONCURRENCY}${DRY ? ' · DRY RUN' : ''}\n`);

  const scan = await scanCache(LANGS);
  console.log(`캐시 ${scan.length}행 (prompt_version=${PROMPT_VERSION})`);

  // 이미 채워진 행은 건너뛴다(재실행 안전).
  const pending = scan.filter(r => !r.base);
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
  const calls = Math.ceil(byTerm.size / BATCH);
  console.log(`\n예상 호출 ${calls}회 (배치 ${BATCH})`);

  if (DRY) {
    console.log('\n--dry-run 이라 여기서 멈춘다. 호출도 쓰기도 하지 않았다.');
    return;
  }

  // ── Phase 1: 표제어 판정 ────────────────────────────────
  let keys = [...byTerm.keys()];
  if (SAMPLE > 0) keys = keys.slice(0, SAMPLE);

  const done: Record<string, { baseForm: string; inflection: string }> =
    has('resume') && existsSync(PROGRESS_FILE)
      ? JSON.parse(readFileSync(PROGRESS_FILE, 'utf8'))
      : {};
  const todo = keys.filter(k => !(k in done));
  console.log(`판정할 표제어 ${todo.length} (이미 판정 ${Object.keys(done).length})`);

  const groups: string[][] = [];
  for (let i = 0; i < todo.length; i += BATCH) groups.push(todo.slice(i, i + BATCH));

  let judged = 0, inflected = 0, rejected = 0;
  await mapLimit(groups, CONCURRENCY, async (group) => {
    const lang = group[0].split('|')[0];
    // 배치는 같은 언어끼리만 — 프롬프트가 언어를 명시한다.
    const sameLang = group.filter(k => k.startsWith(`${lang}|`));
    const terms = sameLang.map(k => byTerm.get(k)![0].term);
    try {
      const res = await callGemini(buildPrompt(lang, terms));
      for (let i = 0; i < sameLang.length; i++) {
        const item = res[i] ?? {};
        const base = typeof item.baseForm === 'string' ? item.baseForm.trim() : '';
        const infl = typeof item.inflection === 'string' ? item.inflection.trim() : '';
        const term = terms[i];
        // 검증 3종: 코드가 목록 안 · 원형이 비지 않음 · 원형 ≠ 표제어.
        if (base && CODE_SET.has(infl) && base.toLowerCase() !== term.trim().toLowerCase()) {
          done[sameLang[i]] = { baseForm: base, inflection: infl };
          inflected++;
        } else {
          done[sameLang[i]] = { baseForm: '', inflection: '' };
          if (base && !CODE_SET.has(infl)) rejected++;
        }
      }
    } catch (e: any) {
      console.error(`\n판정 실패(${lang}, ${terms.length}개): ${e.message}`);
    }
    judged += sameLang.length;
    process.stdout.write(`\r판정 ${judged}/${todo.length} · 굴절형 ${inflected} · 코드거부 ${rejected}   `);
    writeFileSync(PROGRESS_FILE, JSON.stringify(done), 'utf8');
  });
  console.log(`\n판정 완료 — 굴절형 ${inflected} / ${judged}`);

  // ── Phase 2: 캐시에 두 칸 쓰기 ───────────────────────────
  let written = 0, failed = 0;
  const targets = Object.entries(done).filter(([, v]) => v.baseForm);
  // 고칠 행만 result 포함으로 읽는다 — 스캔은 두 키만 받았다.
  const byLangTerms = new Map<string, string[]>();
  for (const [key] of targets) {
    const [lang, term] = key.split('|');
    (byLangTerms.get(lang) ?? byLangTerms.set(lang, []).get(lang)!).push(term);
  }
  const fullRows = new Map<string, Row[]>();
  for (const [lang, terms] of byLangTerms) {
    const rows = await fetchRowsForTerms(lang, terms);
    for (const r of rows) {
      const k = `${r.source_lang}|${r.term.trim().toLowerCase()}`;
      (fullRows.get(k) ?? fullRows.set(k, []).get(k)!).push(r);
    }
    process.stdout.write(`대상 행 로드 ${lang} ${rows.length}…   `);
  }
  console.log();
  for (const [key, v] of targets) {
    for (const row of fullRows.get(key) ?? []) {
      // result 를 통째로 읽어 두 키만 얹는다 — 다른 키를 잃지 않게.
      const next = { ...row.result, baseForm: v.baseForm, inflection: v.inflection };
      const { error } = await sb.from('enrich_cache')
        .update({ result: next })
        .eq('source_lang', row.source_lang)
        .eq('target_lang', row.target_lang)
        .eq('term', row.term)
        .eq('prompt_version', PROMPT_VERSION);
      if (error) { failed++; if (failed < 4) console.error(`\n쓰기 실패 ${row.term}: ${error.message}`); }
      else written++;
      if (written % 200 === 0) process.stdout.write(`\r쓰기 ${written}…   `);
    }
  }
  console.log(`\n캐시 쓰기 ${written}행 (실패 ${failed})`);

  // ── Phase 3: 문법 설명만 남은 뜻 복구 ────────────────────
  // 굴절형으로 판정된 것만 대상 — 판정이 안 된 행의 뜻을 건드리면 범위를 넘는다.
  const fixable = dirty.filter(r => {
    const k = `${r.source_lang}|${r.term.trim().toLowerCase()}`;
    return done[k]?.baseForm;
  });
  console.log(`\n뜻 복구 대상 ${fixable.length}행 (판정된 굴절형 중 문법 설명만인 것)`);
  if (!fixable.length) return;

  const byPair = new Map<string, ScanRow[]>();
  for (const r of fixable) {
    const k = `${r.source_lang}>${r.target_lang}`;
    (byPair.get(k) ?? byPair.set(k, []).get(k)!).push(r);
  }
  // 뜻을 갈아끼우려면 result 원본이 필요하다 — 대상만 다시 읽는다.
  const fixRows = new Map<string, Row>();
  for (const [pair, list] of byPair) {
    const lang = pair.split('>')[0];
    for (const r of await fetchRowsForTerms(lang, list.map(x => x.term))) {
      fixRows.set(`${r.source_lang}>${r.target_lang}|${r.term}`, r);
    }
  }
  let fixed = 0;
  for (const [pair, list] of byPair) {
    const [srcLang, tgtLang] = pair.split('>');
    for (let i = 0; i < list.length; i += BATCH) {
      const chunk = list.slice(i, i + BATCH);
      try {
        const res = await callGemini(buildMeaningPrompt(chunk.map(r => ({ term: r.term, srcLang, tgtLang }))));
        for (let j = 0; j < chunk.length; j++) {
          const meaning = typeof res[j]?.meaning === 'string' ? res[j].meaning.trim() : '';
          // 복구값이 또 문법 설명이면 쓰지 않는다 — 나쁜 값을 나쁜 값으로 바꾸지 않는다.
          if (!meaning || meaningIsOnlyGrammar(meaning)) continue;
          const scanRow = chunk[j];
          const row = fixRows.get(`${scanRow.source_lang}>${scanRow.target_lang}|${scanRow.term}`);
          if (!row) continue;
          const next = { ...row.result, meaningKr: meaning };
          const { error } = await sb.from('enrich_cache')
            .update({ result: next })
            .eq('source_lang', row.source_lang)
            .eq('target_lang', row.target_lang)
            .eq('term', row.term)
            .eq('prompt_version', PROMPT_VERSION);
          if (!error) fixed++;
        }
      } catch (e: any) {
        console.error(`\n뜻 복구 실패(${pair}): ${e.message}`);
      }
      process.stdout.write(`\r뜻 복구 ${fixed}/${fixable.length}   `);
    }
  }
  console.log(`\n뜻 복구 완료 ${fixed}행`);
  console.log('\n⚠️ 사용자 단어장(cloud_words)은 건드리지 않았다 — 캐시만 고쳤다.');
  console.log('   기존 단어는 그 단어를 다시 조회할 때 채워진다.');
}

main().catch(e => { console.error(e); process.exit(1); });
