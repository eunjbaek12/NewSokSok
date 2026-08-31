/**
 * 정의 칸이 **문법 설명뿐**인 캐시 행을 실제 정의로 되살린다.
 *
 *   added: "Past tense and past participle of add."  →  "Joined to something to increase it."
 *
 * 왜 (2026-08-28):
 *   굴절형 소급(backfill-base-form.ts)은 뜻 칸(meaningKr)만 복구하고 정의는
 *   **범위 밖으로 명시적으로 잠갔다** ("예문·정의·발음·senses·pos 는 어떤 경우에도
 *   건드리지 않는다"). 그래서 사전 관행을 그대로 베낀 행이 남아 있다:
 *       accepts: "Third-person singular present tense of accept."
 *       agreed:  "Past tense and past participle of agree."
 *   원형 줄(↳ accept의 3인칭 단수)이 바로 위에 생긴 지금은 같은 말의 반복이고,
 *   정의 칸에서 배울 것이 사라진다.
 *
 * 🔴 문법 문구로 **시작만** 하고 뒤에 진짜 정의가 붙은 것은 건드리지 않는다:
 *       "Present participle of adapt: making or becoming suitable for a new use."
 *    여기엔 배울 내용이 있다. 앞머리만 거슬린다고 통째로 새로 만들면 멀쩡한 정의를 잃는다.
 *    (실측: 문법 문구로 시작하는 1,320행 중 567행이 이 부류다.)
 *
 * 🔴 복구값이 또 문법 설명이면 쓰지 않는다 — 나쁜 값을 나쁜 값으로 바꾸지 않는다.
 *    소급에서 뜻 복구 18건이 이 가드에 걸려 남았고, 그 판단은 옳았다.
 *
 * 🔑 정의는 **출발어**로 쓴다(영어 단어면 영어 정의). 도착어와 무관하므로 표제어 하나당
 *    한 번만 물어 모든 언어쌍 행에 같은 값을 쓴다.
 *
 * 실행:
 *   npx tsx scripts/fix-grammar-definition.ts             # 안 쓰고 대상만 본다
 *   npx tsx scripts/fix-grammar-definition.ts --apply     # 실제로 쓴다
 * 옵션:
 *   --sample 100    표본만 처리해 품질 확인
 *   --batch 30      한 호출에 넘길 표제어 수
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, appendFileSync } from 'node:fs';
import { resolveScriptModel } from './_shared/model';

const PROMPT_VERSION = 7;
const BACKUP_FILE = 'scripts/_fix-grammar-definition-backup.jsonl';

for (const f of ['.env.local', '.env']) {
  try {
    for (const l of readFileSync(f, 'utf8').split('\n')) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* 없으면 무시 */ }
}

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const APPLY = process.argv.includes('--apply');
const SAMPLE = Number(arg('sample', '0'));
const BATCH = Math.max(1, Math.min(50, Number(arg('batch', '30'))));
const MODEL = resolveScriptModel();

const sb = createClient(
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const LANG_NAME: Record<string, string> = {
  en: 'English', ko: 'Korean', ja: 'Japanese', zh: 'Chinese', vi: 'Vietnamese', es: 'Spanish',
};

const EXEMPT = /축약|줄임말|contraction|abbreviation|viết tắt/i;

/** 문법 문구로 시작하는가. 시작만 본다 — 문장 중간의 언급은 정상적인 서술일 수 있다. */
const STARTS_GRAMMAR: RegExp[] = [
  /^(the\s+)?(plural|past tense|past participle|present participle|gerund|comparative|superlative|third[- ]person|simple past)\b[\w\s'’,-]*\s+(of|form of)\s+/i,
  /^(past|present) (tense|participle) (and|or) past participle\b/i,
  /^(the )?(form|stem|conjugation) of (the )?(verb|adjective|noun)\b/i,
  /^this is the (stem|form)\b/i,
  /^the (stem|adnominal|inflected|conjugated|declarative|connective|honorific|imperative|passive|causative|polite|volitional|potential) (form|of)\b/i,
  /^['"]?[A-Za-z][\w'’-]*['"]?\s*(동사|명사|형용사)?\s*의\s*(과거|현재|복수|비교급|최상급|[123]인칭|단수|진행|분사)/,
];

/** 문법 문구 **뒤에 실제 뜻풀이가 이어지는가**. 이어지면 건드리지 않는다. */
function hasRealDefinition(s: string): boolean {
  const t = s.trim();
  const head = t.match(/^[^:;,.]*[:;,]\s*(.+)$/);
  if (head && head[1].trim().replace(/[.]$/, '').length > 15) return true;
  const parts = t.split(/(?<=\.)\s+/).filter(x => x.trim());
  return parts.length > 1 && parts.slice(1).join(' ').trim().length > 15;
}

function isGrammarOnly(def: string | null | undefined): boolean {
  const s = (def ?? '').trim();
  if (!s || EXEMPT.test(s)) return false;
  if (!STARTS_GRAMMAR.some(re => re.test(s))) return false;
  return !hasRealDefinition(s);
}

type Row = { source_lang: string; target_lang: string; term: string; result: any };

function buildPrompt(lang: string, items: { term: string; meaning: string }[]): string {
  const name = LANG_NAME[lang] ?? lang;
  return `Write a short dictionary definition in ${name} for each ${name} entry below.

Entries (the gloss in parentheses is what the entry means, for disambiguation only):
${items.map((it, i) => `${i + 1}. ${it.term}${it.meaning ? `  (${it.meaning})` : ''}`).join('\n')}

Return ONLY a JSON array with EXACTLY ${items.length} items, same order:
{"term": "<copy exactly>", "definition": "<one sentence in ${name}>"}

🔴 CRITICAL: these entries are inflected forms whose stored definition was written as a grammar
note. Do NOT repeat that mistake.
- WRONG: "Past tense and past participle of add." / "Third-person singular of accept."
- RIGHT: "Joined to something else so as to increase it." / "Receives or agrees to something offered."
- Define what the WORD MEANS as used in a sentence. Never name the base form, never name a
  grammatical category (tense, participle, plural, person, conjugation).
- Keep it to one sentence, under 120 characters, in ${name}.
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
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
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

async function retry<T>(label: string, fn: () => Promise<{ data: T | null; error: any }>): Promise<T> {
  for (let a = 1; ; a++) {
    const { data, error } = await fn();
    if (!error) return (data ?? []) as T;
    if (a >= 5) { console.error(`\n${label} 실패(${a}회): ${error.message}`); process.exit(1); }
    process.stdout.write(`\r${label} 재시도 ${a}…            `);
    await new Promise(r => setTimeout(r, 2000 * a));
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

async function main() {
  console.log(`모델 ${MODEL}${APPLY ? ' · ⚠️ APPLY' : ' · DRY RUN'}\n`);

  /*
   * 🔴 스캔은 반드시 **가벼운 조회**로 한다. `result` jsonb 를 통째로 끌어오면 8만 행에서
   *    `canceling statement due to statement timeout` 이 난다(backfill-base-form.ts 가 같은
   *    이유로 ScanRow 를 따로 둔다 — 그 주석을 읽고도 같은 실수를 했다).
   *    판정에 필요한 두 키만 뽑고, 전체 result 는 **실제로 고칠 행에서만** 읽는다.
   */
  type ScanRow = { source_lang: string; target_lang: string; term: string; def: string | null; meaning: string | null };
  const byTerm = new Map<string, { lang: string; term: string; def: string; meaning: string; rows: Row[] }>();
  let scanned = 0;
  for (let from = 0; ; from += 500) {
    const batch = await retry<ScanRow[]>('스캔', () => sb.from('enrich_cache')
      .select('source_lang, target_lang, term, def:result->>definition, meaning:result->>meaningKr')
      .eq('prompt_version', PROMPT_VERSION)
      .order('source_lang').order('term').order('target_lang')
      .range(from, from + 499) as any);
    for (const r of batch) {
      scanned++;
      const def = String(r.def ?? '');
      if (!isGrammarOnly(def)) continue;
      const k = `${r.source_lang}|${r.term.trim().toLowerCase()}`;
      const hit = byTerm.get(k);
      if (hit) continue; // 행은 나중에 표제어 단위로 한 번에 읽는다
      byTerm.set(k, {
        lang: r.source_lang, term: r.term.trim(), def,
        meaning: String(r.meaning ?? '').slice(0, 60), rows: [],
      });
    }
    process.stdout.write(`\r스캔 ${scanned}행 · 대상 ${byTerm.size} 표제어…    `);
    if (batch.length < 500) break;
  }
  process.stdout.write('\r');

  let targets = [...byTerm.values()];
  const byLang = new Map<string, number>();
  for (const t of targets) byLang.set(t.lang, (byLang.get(t.lang) ?? 0) + 1);
  console.log(`캐시 ${scanned}행 · 정의가 문법 설명뿐인 표제어 ${targets.length}`);
  console.log(`  ${[...byLang].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')}\n`);
  if (SAMPLE > 0) targets = targets.slice(0, SAMPLE);
  console.log(`처리 ${targets.length} 표제어 · 예상 호출 ${Math.ceil(targets.length / BATCH)}회\n`);

  const groups: (typeof targets)[] = [];
  const perLang = new Map<string, typeof targets>();
  for (const t of targets) (perLang.get(t.lang) ?? perLang.set(t.lang, []).get(t.lang)!).push(t);
  for (const list of perLang.values()) {
    for (let i = 0; i < list.length; i += BATCH) groups.push(list.slice(i, i + BATCH));
  }

  const fixes: { t: (typeof targets)[number]; next: string }[] = [];
  let done = 0, refused = 0;
  await mapLimit(groups, 2, async (g) => {
    try {
      const res = await callGemini(buildPrompt(g[0].lang, g.map(x => ({ term: x.term, meaning: x.meaning }))));
      for (let i = 0; i < g.length; i++) {
        const next = typeof res[i]?.definition === 'string' ? res[i].definition.trim() : '';
        // 🔴 복구값이 또 문법 설명이면 쓰지 않는다.
        if (!next || isGrammarOnly(next) || STARTS_GRAMMAR.some(re => re.test(next))) { refused++; continue; }
        fixes.push({ t: g[i], next });
      }
    } catch (e: any) {
      console.error(`\n생성 실패(${g[0].lang}, ${g.length}건): ${e.message}`);
    }
    done += g.length;
    process.stdout.write(`\r생성 ${done}/${targets.length} · 채택 ${fixes.length} · 거부 ${refused}    `);
  });
  process.stdout.write('\r');

  console.log(`\n채택 ${fixes.length} 표제어 · 또 문법 설명이라 거부 ${refused}\n`);
  console.log('--- 바뀌는 모습 20개 ---');
  for (const f of fixes.slice(0, 20)) {
    console.log(`  ${f.t.term}`);
    console.log(`      전: ${JSON.stringify(f.t.def)}`);
    console.log(`      후: ${JSON.stringify(f.next)}`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN 이라 여기서 멈춥니다. 실제로 쓰려면 --apply');
    return;
  }

  // 🔑 전체 result 는 여기서 처음 읽는다 — 실제로 고칠 표제어의 행만.
  const perLangTerms = new Map<string, string[]>();
  for (const f of fixes) (perLangTerms.get(f.t.lang) ?? perLangTerms.set(f.t.lang, []).get(f.t.lang)!).push(f.t.term);
  const rowsByKey = new Map<string, Row[]>();
  for (const [lang, terms] of perLangTerms) {
    for (let i = 0; i < terms.length; i += 100) {
      const chunk = terms.slice(i, i + 100);
      const got = await retry<Row[]>('행 조회', () => sb.from('enrich_cache')
        .select('source_lang, target_lang, term, result')
        .eq('source_lang', lang).eq('prompt_version', PROMPT_VERSION)
        .in('term', chunk) as any);
      for (const r of got) {
        const k = `${r.source_lang}|${r.term.trim().toLowerCase()}`;
        (rowsByKey.get(k) ?? rowsByKey.set(k, []).get(k)!).push(r);
      }
      process.stdout.write(`\r행 조회 ${rowsByKey.size}/${fixes.length} 표제어…    `);
    }
  }
  process.stdout.write('\r');
  for (const f of fixes) f.t.rows = rowsByKey.get(`${f.t.lang}|${f.t.term.trim().toLowerCase()}`) ?? [];
  const willWrite = fixes.reduce((s, f) => s + f.t.rows.length, 0);
  console.log(`쓸 행 ${willWrite}\n`);

  let written = 0;
  for (const f of fixes) {
    for (const row of f.t.rows) {
      appendFileSync(BACKUP_FILE, JSON.stringify({
        at: new Date().toISOString(),
        source_lang: row.source_lang, target_lang: row.target_lang, term: row.term,
        before: row.result,
      }) + '\n', 'utf8');
      // definition 한 칸만 바꾼다. 뜻·예문·발음·senses·원형은 건드리지 않는다.
      const { error } = await sb.from('enrich_cache')
        .update({ result: { ...row.result, definition: f.next } })
        .eq('source_lang', row.source_lang)
        .eq('target_lang', row.target_lang)
        .eq('term', row.term)
        .eq('prompt_version', PROMPT_VERSION);
      if (error) console.error(`\n쓰기 실패 ${row.term}: ${error.message}`);
      else written++;
    }
    process.stdout.write(`\r쓰기 ${written}/${willWrite}…    `);
  }
  console.log(`\n\n완료 — ${written}행. 원본은 ${BACKUP_FILE}.`);
  console.log('⚠️ 사용자 단어장·공식 덱은 건드리지 않았습니다 — 캐시만입니다.');
}

main().catch(e => { console.error(e); process.exit(1); });
