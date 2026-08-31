/**
 * 뜻 칸에 덧붙은 문법 설명 괄호를 잘라낸다.
 *
 *   "열었다 (open의 과거형 및 과거분사)."  →  "열었다."
 *
 * 왜 (2026-08-28):
 *   굴절형 소급(backfill-base-form.ts)은 원형을 전용 칸(baseForm/inflection)에 넣었지만,
 *   뜻 칸에 이미 괄호로 적혀 있던 문법 설명은 **일부러 두었다** — 그때는 "뜻이 앞에 있으면
 *   건드리지 않는다"가 옳았다(멀쩡한 뜻을 덮어쓸 위험). 이제 원형 줄이 생겨서 단어 상세에
 *   같은 사실이 세 번 나온다:
 *       ↳ open의 과거형        (원형 줄)
 *       뜻   열었다 (open의 과거형 및 과거분사).
 *       정의 Past tense and past participle of 'open'.
 *   괄호는 이제 순수한 중복이다.
 *
 * 🔑 이 스크립트는 **뜻을 새로 만들지 않는다**. AI 호출 0회. 괄호만 잘라낸다.
 *    잘라낸 내용은 baseForm/inflection 칸에 그대로 남아 있으므로 정보 손실이 0이다.
 *
 * 🔴 자르는 조건을 좁게 잠근다. 넷 다 만족해야만 자른다:
 *      1. 그 행에 baseForm 이 이미 있다 (잘라낸 정보가 갈 곳이 있다는 증거)
 *      2. 괄호가 **문자열 끝**에 있다 (앞·중간 괄호는 뉘앙스 설명이다 —
 *         "(겁을 먹거나 신이 나서) 쏜살같이 달리다" 를 자르면 안 된다)
 *      3. 괄호 안에서 문법 용어와 구두점을 다 걷어냈을 때 **남는 것이 없거나
 *         그 행의 baseForm 과 같다** (다른 정보가 섞여 있으면 손대지 않는다)
 *      4. 자르고 난 뒤 남는 뜻이 비어 있지 않다
 *
 * 대상: result.meaningKr 와 result.senses[].meaningKr.
 *   senses 도 함께 자르는 이유 — 동음이의어 칩을 고르면 composeSenseFill 이 senses 에서
 *   폼을 다시 만든다(lib/senses.ts). 위만 고치면 칩을 누르는 순간 괄호가 되돌아온다.
 *
 * 실행:
 *   npx tsx scripts/trim-inflection-note.ts              # 안 쓰고 대상만 보여준다
 *   npx tsx scripts/trim-inflection-note.ts --apply      # 실제로 쓴다
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, appendFileSync } from 'node:fs';

const PROMPT_VERSION = 7;
const BACKUP_FILE = 'scripts/_trim-inflection-note-backup.jsonl';

for (const f of ['.env.local', '.env']) {
  try {
    for (const l of readFileSync(f, 'utf8').split('\n')) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* 없으면 무시 */ }
}

const APPLY = process.argv.includes('--apply');

const sb = createClient(
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

/**
 * 괄호 안에서 걷어낼 문법 용어.
 *
 * 🔑 "목록에 걸리면 자른다"가 아니라 "**걷어내고 남는 게 없어야** 자른다"로 뒤집어 놓은
 *    것이 요점이다. 목록에 없는 낱말이 하나라도 섞여 있으면 잔여물로 남으므로,
 *    모르는 내용을 실수로 지울 수가 없다.
 */
const GRAMMAR_WORDS = [
  // 한국어 — 긴 것부터(짧은 것이 먼저 지워지면 긴 것이 안 걸린다)
  '과거분사', '현재분사', '과거형', '현재형', '미래형', '복수형', '단수형', '진행형', '수동형',
  '분사형', '동명사', '비교급', '최상급', '활용형', '과거', '현재', '미래', '시제', '분사',
  '복수', '단수', '진행', '인칭', '원형', '형태', '동사', '명사', '형용사', '및', '또는',
  // 영어
  'past', 'tense', 'participle', 'present', 'plural', 'singular', 'third', 'person',
  'comparative', 'superlative', 'gerund', 'progressive', 'form', 'of', 'the', 'and', 'or',
  // 스페인어
  'pasado', 'participio', 'comparativo', 'superlativo', 'gerundio', 'presente',
  'forma', 'tercera', 'persona', 'del', 'de', 'y',
];

/**
 * 괄호가 **굴절 설명**이라는 증거. 이 중 하나라도 없으면 자르지 않는다.
 *
 * 🔴 이 관문이 없으면 실측에서 두 부류가 잘려 나갔다:
 *      "① 시도하다, 검사하다 (동사) ② 시도, 검사 (명사)"  → (명사) 가 잘렸다. 품사 표시다.
 *      "③ 미국 공보원 (과거)"                              → (과거) 가 잘렸다. 옛 기관이라는 뜻이다.
 *    둘 다 GRAMMAR_WORDS 로만 이루어져 잔여물이 0이었기 때문이다. 그래서 "문법 낱말로만
 *    되어 있다"에 더해 "**굴절**을 가리키는 말이 실제로 있다"를 따로 요구한다.
 *    맨 '과거'·'현재'·'복수'·'명사' 는 증거가 못 되고, '과거형'·'복수형'·'3인칭' 은 된다.
 */
const INFLECTION_MARKER = new RegExp([
  '과거\\s*형', '과거\\s*분사', '과거\\s*시제', '현재\\s*분사', '현재\\s*형', '미래\\s*형',
  '복수\\s*형', '단수\\s*형', '진행\\s*형', '수동\\s*형', '분사\\s*형', '활용\\s*형',
  '동명사', '비교급', '최상급', '[123]\\s*인칭', '시제',
  'past\\s+(tense|participle)', 'present\\s+participle', 'plural\\s+(of|form)',
  'singular\\s+(of|form)', 'third[- ]person', 'comparative', 'superlative', 'gerund',
  'participio', 'pasado', 'gerundio',
].join('|'), 'i');

/** 잔여물이 원형 하나로 볼 수 있는가 — "artifact의 복수형" 처럼 철자 변형도 받는다. */
function residueIsBase(residue: string, base: string): boolean {
  if (!residue) return true;
  if (base && residue.toLowerCase() === base.toLowerCase()) return true;
  // 라틴 문자 한 낱말이면 원형 표기로 본다(이미 굴절 표지가 있는 괄호 안이다).
  return /^[A-Za-z][A-Za-z'’-]*$/.test(residue);
}

function grammarResidue(inner: string): string {
  let s = inner;
  // "open의" 처럼 원형에 붙은 조사를 먼저 떼어낸다.
  s = s.replace(/의(?=\s|$)/g, ' ');
  // 숫자 인칭("3인칭", "1 인칭")
  s = s.replace(/[123]\s*인칭/g, ' ');
  for (const w of GRAMMAR_WORDS) {
    s = s.replace(new RegExp(w, 'gi'), ' ');
  }
  // 구두점·따옴표·구분자
  s = s.replace(/[.,·、/\\|~\-–—'"’‘“”:;()]/g, ' ');
  return s.replace(/\s+/g, '');
}

/** 한 토막(번호 없는 뜻 하나)의 끝에 붙은 문법 괄호를 잘라낸 결과. 자를 게 없으면 null. */
function trimSegment(segment: string, baseForm: string): string | null {
  const s = segment.trim();
  // 조건 2: 괄호가 토막 **끝**(뒤에 마침표 정도만 허용)에 있어야 한다.
  const m = s.match(/^(.*?)\s*[(（]([^()（）]*)[)）]\s*([.。;；]?)\s*$/);
  if (!m) return null;
  const [, head, inner, tailDot] = m;
  if (!head.trim()) return null;                        // 조건 4: 앞이 비면 자를 수 없다
  if (!INFLECTION_MARKER.test(inner)) return null;      // 굴절 표지가 없으면 손대지 않는다

  // 조건 3: 문법 낱말을 걷어내고 남는 것이 없거나 원형 하나여야 한다.
  if (!residueIsBase(grammarResidue(inner), baseForm.trim())) return null;

  const next = (head.trim() + (tailDot ?? '')).trim();
  return next && next !== s ? next : null;
}

/**
 * 뜻 한 칸을 자른다. `①②③` 병기는 **토막마다** 따로 본다.
 *
 * 🔴 통째로 한 번만 보면 맨 끝 괄호 하나만 잘려 짝이 안 맞는다(실측):
 *      "① 증폭기 (복수형) ② 암페어 (복수형)" → "① 증폭기 (복수형) ② 암페어"
 *    같은 줄 안에서 하나는 남고 하나는 사라지는 것이 원본보다 나쁘다.
 */
export function trimTail(meaning: string, baseForm: string): string | null {
  const s = meaning.trim();
  if (!s) return null;

  if (!/[①②③④]/.test(s)) return trimSegment(s, baseForm);

  // 번호를 구분자로 쓰되 번호 자체는 토막 앞에 남긴다.
  const parts = s.split(/(?=[①②③④])/).filter(p => p.trim());
  let hit = false;
  const next = parts.map(p => {
    const mark = p.match(/^([①②③④]\s*)([\s\S]*)$/);
    if (!mark) return p.trim();
    const [, num, body] = mark;
    const t = trimSegment(body, baseForm);
    if (t === null) return (num + body).trim();
    hit = true;
    return (num + t).trim();
  }).join(' ');

  return hit && next !== s ? next : null;
}

type Row = { source_lang: string; target_lang: string; term: string; result: any };

const PAGE = 500;
async function retry<T>(label: string, fn: () => Promise<{ data: T | null; error: any }>): Promise<T> {
  for (let a = 1; ; a++) {
    const { data, error } = await fn();
    if (!error) return (data ?? []) as T;
    if (a >= 5) { console.error(`\n${label} 실패: ${error.message}`); process.exit(1); }
    await new Promise(r => setTimeout(r, 2000 * a));
  }
}

async function main() {
  console.log(APPLY ? '⚠️  APPLY — 실제로 씁니다\n' : 'DRY RUN — 아무것도 쓰지 않습니다\n');

  // baseForm 이 있는 행만 끌어온다(조건 1). 전체를 훑을 필요가 없다.
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const b = await retry<Row[]>('스캔', () => sb.from('enrich_cache')
      .select('source_lang, target_lang, term, result')
      .eq('prompt_version', PROMPT_VERSION)
      .not('result->>baseForm', 'is', null)
      .neq('result->>baseForm', '')
      .order('source_lang').order('term').order('target_lang')
      .range(from, from + PAGE - 1) as any);
    rows.push(...b);
    process.stdout.write(`\r원형 있는 행 ${rows.length}…    `);
    if (b.length < PAGE) break;
  }
  process.stdout.write('\r');
  console.log(`원형이 채워진 행 ${rows.length}\n`);

  const changes: { row: Row; next: any; before: string; after: string; senses: number }[] = [];
  for (const row of rows) {
    const base = String(row.result?.baseForm ?? '');
    const before = String(row.result?.meaningKr ?? '');
    const topNext = before ? trimTail(before, base) : null;

    let senseHits = 0;
    let nextSenses = row.result?.senses;
    if (Array.isArray(nextSenses)) {
      const mapped = nextSenses.map((s: any) => {
        const t = typeof s?.meaningKr === 'string' ? trimTail(s.meaningKr, base) : null;
        if (t === null) return s;
        senseHits++;
        return { ...s, meaningKr: t };
      });
      if (senseHits > 0) nextSenses = mapped;
    }

    if (!topNext && senseHits === 0) continue;
    const next = { ...row.result };
    if (topNext) next.meaningKr = topNext;
    if (senseHits > 0) next.senses = nextSenses;
    changes.push({ row, next, before, after: topNext ?? before, senses: senseHits });
  }

  const byLang = new Map<string, number>();
  for (const c of changes) byLang.set(c.row.source_lang, (byLang.get(c.row.source_lang) ?? 0) + 1);
  console.log(`자를 행 ${changes.length}  [${[...byLang].map(([k, v]) => `${k}:${v}`).join(' ')}]`);
  console.log(`  그중 senses 도 함께 자르는 행 ${changes.filter(c => c.senses > 0).length}\n`);

  // 🔑 600행을 눈으로 다 볼 수는 없다. **지워지는 괄호 내용만** 중복을 없애 전부 세면
  //    한 화면에 들어오고, 굴절 설명이 아닌 것이 섞였는지 즉시 드러난다.
  const removed = new Map<string, number>();
  for (const c of changes) {
    const beforeParens = [...c.before.matchAll(/[(（]([^()（）]*)[)）]/g)].map(m => m[1]);
    const afterParens = [...c.after.matchAll(/[(（]([^()（）]*)[)）]/g)].map(m => m[1]);
    const left = [...afterParens];
    for (const p of beforeParens) {
      const i = left.indexOf(p);
      if (i >= 0) { left.splice(i, 1); continue; }
      removed.set(p, (removed.get(p) ?? 0) + 1);
    }
  }
  console.log(`--- 지워지는 괄호 내용 전량 (${removed.size}종) — 굴절 설명이 아닌 것이 있는지 보세요 ---`);
  for (const [text, n] of [...removed].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}회  (${text})`);
  }

  console.log('\n--- 바뀌는 모습 15개 ---');
  for (const c of changes.slice(0, 15)) {
    console.log(`  [${c.row.source_lang}>${c.row.target_lang}] ${c.row.term}`);
    console.log(`      전: ${JSON.stringify(c.before)}`);
    console.log(`      후: ${JSON.stringify(c.after)}`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN 이라 여기서 멈춥니다. 실제로 쓰려면 --apply');
    return;
  }

  let written = 0;
  for (const c of changes) {
    // 🔑 free 플랜은 서버 백업이 없다. 파괴적 쓰기 직전에 스스로 원본을 남긴다.
    appendFileSync(BACKUP_FILE, JSON.stringify({
      at: new Date().toISOString(),
      source_lang: c.row.source_lang, target_lang: c.row.target_lang, term: c.row.term,
      before: c.row.result,
    }) + '\n', 'utf8');
    const { error } = await sb.from('enrich_cache')
      .update({ result: c.next })
      .eq('source_lang', c.row.source_lang)
      .eq('target_lang', c.row.target_lang)
      .eq('term', c.row.term)
      .eq('prompt_version', PROMPT_VERSION);
    if (error) console.error(`\n쓰기 실패 ${c.row.term}: ${error.message}`);
    else written++;
    if (written % 50 === 0) process.stdout.write(`\r쓰기 ${written}/${changes.length}…    `);
  }
  console.log(`\n\n완료 — ${written}행. 원본은 ${BACKUP_FILE} 에 남겼습니다.`);
  console.log('⚠️ 사용자 단어장(cloud_words)은 건드리지 않았습니다 — 캐시만 고쳤습니다.');
}

main().catch(e => { console.error(e); process.exit(1); });
