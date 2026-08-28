/**
 * 캐시에 채워진 굴절형 원형(baseForm/inflection)을 **두 번째 의견으로 검증**하고,
 * 확인되지 않은 것은 그 두 칸만 비운다.
 *
 * 왜 (2026-08-28):
 *   소급(backfill-base-form.ts)은 표제어 36,522개를 모델에 한 번 물어 채웠다. 형식 검사는
 *   있었지만(코드가 목록 안인가·원형 ≠ 표제어) **판정이 사실인지는 아무도 안 봤다.** 그래서
 *   이런 것이 남았다:
 *       피해 → 피하다      被害(한자어 명사)를 피하다(avoid)의 활용형이라고 했다
 *       밀지 → 밀다        密旨(밀명)를 밀다(push)에 붙였다
 *       출발하다 → 출발    출발하다는 그 자체로 사전 표제어다
 *       abuela → abuelo    스페인어 성 변화는 활용이 아니다
 *   학습자는 없는 사실을 배우게 된다. 그리고 이 값은 단어 추가 화면에 그대로 나간다.
 *
 * 🔑 규칙으로는 못 가른다. `피해→피하다` 는 `가려→가리다` 와 생김새가 같다. 그래서
 *    **두 번째 의견**을 묻는다 — 이 저장소에서 이미 검증된 기법이다(지어낸 뜻 판정 때
 *    "한 번만 물으면 절반이 뒤집힌다"를 겪고 세운 규칙: 두 판정이 겹치는 것만 남긴다).
 *
 * 🔑 첫 판정과 **다른 질문**을 한다. "이게 굴절형이냐"를 다시 물으면 같은 답이 돌아온다.
 *    여기서는 이미 붙은 주장을 보여주고 "이 주장이 맞느냐"를 묻는다.
 *
 * 🔴 "표제어이면서 동시에 굴절형인 것"은 반려 사유가 아니다. meeting·running·thanks 처럼
 *    명사 뜻을 가지면서 굴절형이기도 한 것에 원형을 붙이는 것은 **설계된 동작**이다
 *    (목업 "굴절형 원형 표기안" B안, 소급 프롬프트에도 명시). 프롬프트가 이걸 반박하지
 *    않으면 멀쩡한 수천 건을 지운다.
 *
 * 검증 대상을 좁힌다 — 영어 규칙 굴절은 물을 필요가 없다. base 에 표준 어미 규칙을
 * 적용해 표제어가 만들어지면(anomaly+ies → anomalies) 그것으로 증명이 끝난다.
 * 남는 것은 영어 불규칙 · 한국어 전량 · 스페인어 전량이다.
 *
 * 실행:
 *   npx tsx scripts/verify-base-form.ts               # 안 쓰고 대상·결과만 본다
 *   npx tsx scripts/verify-base-form.ts --apply       # 반려된 행의 두 칸을 비운다
 * 옵션:
 *   --lang ko,es      언어 한정 (기본: 검증이 필요한 전 언어)
 *   --sample 100      표본만 판정해 품질 확인
 *   --batch 40        한 호출에 넘길 건수
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, appendFileSync } from 'node:fs';
import { resolveScriptModel } from './_shared/model';

const PROMPT_VERSION = 7;
const BACKUP_FILE = 'scripts/_verify-base-form-backup.jsonl';

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
const LANGS = arg('lang', '').split(',').map(s => s.trim()).filter(Boolean);
const SAMPLE = Number(arg('sample', '0'));
const BATCH = Math.max(1, Math.min(60, Number(arg('batch', '40'))));
const MODEL = resolveScriptModel();

const sb = createClient(
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const LANG_NAME: Record<string, string> = {
  en: 'English', ko: 'Korean', ja: 'Japanese', zh: 'Chinese', vi: 'Vietnamese', es: 'Spanish',
};

/**
 * base 에 표준 영어 어미 규칙을 적용해 만들 수 있는 형태. 표제어가 여기 들어 있으면
 * 모델에 물을 이유가 없다 — 철자가 곧 증명이다.
 */
function derive(base: string, code: string): string[] {
  const b = base.toLowerCase().trim();
  if (!b) return [];
  const y2i = /[^aeiou]y$/.test(b) ? b.slice(0, -1) + 'i' : null;
  const dropE = b.endsWith('e') ? b.slice(0, -1) : null;
  const dbl = /[^aeiou][aeiou][bdgklmnprtvz]$/.test(b) ? b + b.slice(-1) : null;
  const out = new Set<string>();
  const add = (...xs: (string | null)[]) => xs.forEach(x => x && out.add(x));
  if (code === 'plural' || code === 'third_person') {
    add(b + 's', b + 'es', y2i && y2i + 'es');
    if (b.endsWith('f')) add(b.slice(0, -1) + 'ves');
    if (b.endsWith('fe')) add(b.slice(0, -2) + 'ves');
  }
  if (code === 'past' || code === 'past_participle') add(b + 'ed', b + 'd', y2i && y2i + 'ed', dbl && dbl + 'ed');
  if (code === 'ing_form') add(b + 'ing', dropE && dropE + 'ing', dbl && dbl + 'ing');
  if (code === 'comparative') add(b + 'er', b + 'r', y2i && y2i + 'er', dbl && dbl + 'er');
  if (code === 'superlative') add(b + 'est', b + 'st', y2i && y2i + 'est', dbl && dbl + 'est');
  return [...out];
}

function isMechanical(lang: string, term: string, base: string, code: string): boolean {
  return lang === 'en' && derive(base, code).includes(term.trim().toLowerCase());
}

type Row = { source_lang: string; target_lang: string; term: string; result: any };
type Item = { lang: string; term: string; base: string; infl: string };

function buildPrompt(lang: string, items: Item[]): string {
  const name = LANG_NAME[lang] ?? lang;
  return `You are checking claims made by another system about ${name} vocabulary entries.

For each entry, it claims: "<term> is the <inflection> form of <baseForm>".
Decide whether that claim is CORRECT.

Entries:
${items.map((it, i) => `${i + 1}. "${it.term}" is claimed to be the ${it.infl} of "${it.base}"`).join('\n')}

Return ONLY a JSON array with EXACTLY ${items.length} items, in the SAME ORDER:
{"term": "<copy exactly>", "ok": true|false, "why": "<max 8 words, only when false>"}

Answer false when:
- <term> is NOT morphologically derived from <baseForm> at all. They may look similar by accident or share a syllable while being unrelated words (e.g. Sino-Korean noun 피해 "damage" is NOT a form of the native verb 피하다 "to avoid"; 밀지 "secret royal order" is NOT a form of 밀다 "to push").
- <baseForm> is not the correct dictionary headword for it (e.g. the honorific 납시오 comes from 납시다, not 나다).
- The relationship is real but the label is the wrong KIND of thing: Spanish gender pairs (abuela/abuelo) and diminutives are NOT conjugation; a slang lengthening (소오름 from 소름) is not inflection.
- <term> is itself the standard dictionary headword and <baseForm> is a *derived* or *shorter* form of it, i.e. the direction is reversed (Korean 출발하다 is the headword verb; 출발 is the noun it is built from, so calling 출발하다 a form of 출발 is backwards).

🔴 Answer TRUE in these cases — they are intended, not errors:
- <term> is BOTH a dictionary headword with its own meaning AND an inflected form. English "meeting", "running", "thanks", "means", "goods", "statistics" all have noun meanings and are still correctly linked to meet/run/thank/mean/good/statistic. Do not reject these.
- Korean derived nouns and adverbs whose stem really is <baseForm>: 그림 from 그리다, 느낌 from 느끼다, 슬픔 from 슬프다, 상당히 from 상당하다. The label "conjugated" is deliberately coarse here; judge the LINK, not the label.
- Korean conjugated phrases taught as a unit: 푹 쉬세요 from 푹 쉬다.
- Any ordinary, correct inflection, however irregular (went/go, mice/mouse, ate/eat, criteria/criterion).

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
  console.log(`모델 ${MODEL}${APPLY ? ' · ⚠️ APPLY — 반려 행의 두 칸을 비웁니다' : ' · DRY RUN'}\n`);

  // 원형이 붙은 행 전체를 훑고, 표제어 단위로 접는다(도착어가 달라도 판정은 같다).
  const byTerm = new Map<string, { item: Item; rows: Row[] }>();
  for (let from = 0; ; from += 500) {
    let q = sb.from('enrich_cache')
      .select('source_lang, target_lang, term, result')
      .eq('prompt_version', PROMPT_VERSION)
      .not('result->>baseForm', 'is', null).neq('result->>baseForm', '')
      .order('source_lang').order('term').order('target_lang')
      .range(from, from + 499);
    if (LANGS.length) q = q.in('source_lang', LANGS);
    const { data, error } = await q;
    if (error) { console.error(`스캔 실패: ${error.message}`); process.exit(1); }
    const batch = (data ?? []) as any as Row[];
    for (const r of batch) {
      const base = String(r.result?.baseForm ?? '').trim();
      const infl = String(r.result?.inflection ?? '').trim();
      if (!base) continue;
      const k = `${r.source_lang}|${r.term.trim().toLowerCase()}`;
      const hit = byTerm.get(k);
      if (hit) hit.rows.push(r);
      else byTerm.set(k, { item: { lang: r.source_lang, term: r.term.trim(), base, infl }, rows: [r] });
    }
    process.stdout.write(`\r스캔 ${byTerm.size} 표제어…    `);
    if (batch.length < 500) break;
  }
  process.stdout.write('\r');

  const all = [...byTerm.values()];
  const mechanical = all.filter(x => isMechanical(x.item.lang, x.item.term, x.item.base, x.item.infl));
  let review = all.filter(x => !mechanical.includes(x));
  console.log(`원형이 붙은 표제어 ${all.length}`);
  console.log(`  ✅ 영어 규칙 굴절 — 물을 필요 없음: ${mechanical.length}`);
  console.log(`  👀 두 번째 의견을 물을 것:        ${review.length}`);
  const byLang = new Map<string, number>();
  for (const x of review) byLang.set(x.item.lang, (byLang.get(x.item.lang) ?? 0) + 1);
  console.log(`     ${[...byLang].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')}`);
  if (SAMPLE > 0) review = review.slice(0, SAMPLE);
  console.log(`\n판정 ${review.length}건 · 예상 호출 ${Math.ceil(review.length / BATCH)}회\n`);

  // 언어별로 묶어 배치를 만든다 — 프롬프트가 언어를 명시한다.
  const groups: { lang: string; items: typeof review }[] = [];
  const perLang = new Map<string, typeof review>();
  for (const x of review) (perLang.get(x.item.lang) ?? perLang.set(x.item.lang, []).get(x.item.lang)!).push(x);
  for (const [lang, list] of perLang) {
    for (let i = 0; i < list.length; i += BATCH) groups.push({ lang, items: list.slice(i, i + BATCH) });
  }

  const rejected: { item: Item; why: string; rows: Row[] }[] = [];
  let judged = 0, unanswered = 0;
  await mapLimit(groups, 2, async (g) => {
    try {
      const res = await callGemini(buildPrompt(g.lang, g.items.map(x => x.item)));
      for (let i = 0; i < g.items.length; i++) {
        const r = res[i];
        // 🔑 답이 없거나 형식이 어긋나면 **살린다**. 확인 못 한 것을 지우면
        //    모델이 침묵할 때마다 멀쩡한 값이 사라진다.
        if (!r || typeof r.ok !== 'boolean') { unanswered++; continue; }
        if (r.ok === false) {
          rejected.push({ item: g.items[i].item, why: String(r.why ?? '').slice(0, 60), rows: g.items[i].rows });
        }
      }
    } catch (e: any) {
      console.error(`\n판정 실패(${g.lang}, ${g.items.length}건): ${e.message}`);
      unanswered += g.items.length;
    }
    judged += g.items.length;
    process.stdout.write(`\r판정 ${judged}/${review.length} · 반려 ${rejected.length}    `);
  });
  process.stdout.write('\r');

  const rows = rejected.reduce((s, r) => s + r.rows.length, 0);
  console.log(`\n두 판정이 갈린 것 ${rejected.length}건 (캐시 ${rows}행) · 답 못 받음 ${unanswered}건(그대로 둠)\n`);
  const byL = new Map<string, number>();
  for (const r of rejected) byL.set(r.item.lang, (byL.get(r.item.lang) ?? 0) + 1);
  console.log(`언어별: ${[...byL].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')}\n`);
  console.log('--- 비울 목록 ---');
  for (const r of rejected) {
    console.log(`  [${r.item.lang}] ${r.item.term} → ${r.item.base} (${r.item.infl})   ${r.why}`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN 이라 여기서 멈춥니다. 실제로 비우려면 --apply');
    return;
  }

  let written = 0;
  for (const r of rejected) {
    for (const row of r.rows) {
      // 🔑 덮어쓰기 전 원본을 남긴다. free 플랜은 서버 백업이 없다.
      appendFileSync(BACKUP_FILE, JSON.stringify({
        at: new Date().toISOString(), why: r.why,
        source_lang: row.source_lang, target_lang: row.target_lang, term: row.term,
        before: row.result,
      }) + '\n', 'utf8');
      // 두 칸만 비운다. 뜻·정의·예문·발음·senses 는 어떤 경우에도 건드리지 않는다.
      const next = { ...row.result, baseForm: '', inflection: '' };
      const { error } = await sb.from('enrich_cache')
        .update({ result: next })
        .eq('source_lang', row.source_lang)
        .eq('target_lang', row.target_lang)
        .eq('term', row.term)
        .eq('prompt_version', PROMPT_VERSION);
      if (error) console.error(`\n쓰기 실패 ${row.term}: ${error.message}`);
      else written++;
    }
    process.stdout.write(`\r비우기 ${written}/${rows}…    `);
  }
  console.log(`\n\n완료 — ${written}행의 원형·형태를 비웠습니다. 원본은 ${BACKUP_FILE}.`);
  console.log('⚠️ 사용자 단어장·공식 덱은 건드리지 않았습니다 — 캐시만입니다.');
}

main().catch(e => { console.error(e); process.exit(1); });
