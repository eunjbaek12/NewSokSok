/**
 * 공식 덱(official_words)의 굴절형 원형·형태를 enrich 캐시에서 채운다.
 *
 * 왜 (2026-08-28):
 *   덱 단어에는 뜻·정의·예문·발음이 다 들어 있는데(채움률 96~100%) base_form 만 0 이다.
 *   클라이언트 배선은 이미 끝나 있다 — `features/curation/catalog.ts` 의 DECK_SELECT 가
 *   base_form/inflection 을 읽고, 담기(createCuratedList)가 그대로 로컬로 복사한다.
 *   덱 단어는 세션마다 서버에서 새로 받으므로(디스크 캐시 없음) 여기를 채우면 앱 업데이트
 *   없이 즉시 모두에게 보인다. content_version 은 어디서도 무효화에 쓰이지 않아 올리지 않는다.
 *
 * 🔑 AI 를 부르지 않는다. 캐시에 이미 있는 값을 옮길 뿐이다.
 *
 * 🔴 옮겨도 되는 이유는 캐시가 **검증을 거쳤기** 때문이다(scripts/verify-base-form.ts).
 *    검증 전에는 `피해 → 피하다`·`밀지 → 밀다`·`abuela → abuelo` 같은 것이 섞여 있었고,
 *    그대로 덱에 넣었으면 덱이 가르치는 내용과 어긋났을 것이다.
 *    **이 스크립트를 verify-base-form 보다 먼저 돌리지 말 것.**
 *
 * 🔑 덱의 언어는 official_words 가 아니라 official_themes.source_language 에 있다.
 *    캐시 키가 (source_lang, term) 이라 테마를 거쳐야 맞출 수 있다.
 *
 * 실행:
 *   npx tsx scripts/fill-deck-base-form.ts            # 안 쓰고 대상만 본다
 *   npx tsx scripts/fill-deck-base-form.ts --apply    # 실제로 쓴다
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, appendFileSync } from 'node:fs';

const PROMPT_VERSION = 7;
const BACKUP_FILE = 'scripts/_fill-deck-base-form-backup.jsonl';

for (const f of ['.env.local', '.env']) {
  try {
    for (const l of readFileSync(f, 'utf8').split('\n')) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* 없으면 무시 */ }
}

const APPLY = process.argv.includes('--apply');

/**
 * 덱에 넣지 않는 것. 캐시 검증(verify-base-form.ts)을 통과했지만 **덱 기준으로는** 틀렸다.
 *
 * 🔴 덱은 모두에게 보이는 편집 콘텐츠라 개인 캐시보다 기준이 높다. 실제로 2차 판정이
 *    `밀지 → 밀다` 를 통과시켰다 — 密旨(밀명)와 밀다(push)는 아무 관계가 없는데도.
 *    170행이면 눈으로 볼 수 있는 규모이므로, 자동 판정을 마지막 관문으로 삼지 않는다.
 *
 * 여기 없는 애매한 것들은 **일부러 남겼다**: `그림→그리다`·`얼음→얼다`·`슬픔→슬프다` 는
 * 연결이 맞고 "활용형"이라는 라벨만 부정확하다(파생명사). 한국어를 conjugated 하나로
 * 묶기로 한 결정의 대가이지 오답이 아니다.
 */
const SKIP: Record<string, string> = {
  '밀지': '密旨(밀명)와 밀다(push)는 무관',
  '교사로서': '조사 결합이지 활용이 아니다',
  '내가': '조사 결합(나+가)',
  '나는': '조사인데 동사 나다에 붙었다',
  '충분히': '방향 뒤집힘 — 원형은 충분하다여야 한다',
  '책이에요': '원형은 책이다여야 한다(의사예요→의사이다는 맞게 돼 있다)',
  '실화냐': '"실화다"는 사전에 없는 말',
  '어쨌든': '어쩌다와 무관',
  '가즈아': '슬랭 늘여쓰기지 활용이 아니다',
  'damages': '계약법 덱의 "손해배상금"인데 3인칭 단수라고 했다',
};

const sb = createClient(
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

/**
 * 조회 재시도. `canceling statement due to statement timeout` 은 부하에 따라 오락가락하고
 * 몇 초 쉬면 대개 지나간다(backfill-base-form.ts 가 같은 이유로 갖고 있다).
 * 재시도가 없으면 스캔 도중 한 번 걸릴 때마다 처음부터 다시 돌려야 한다.
 */
async function retry<T>(label: string, fn: () => Promise<{ data: T | null; error: any }>): Promise<T> {
  for (let a = 1; ; a++) {
    const { data, error } = await fn();
    if (!error) return (data ?? []) as T;
    if (a >= 5) { console.error(`\n${label} 실패(${a}회): ${error.message}`); process.exit(1); }
    process.stdout.write(`\r${label} 재시도 ${a}…            `);
    await new Promise(r => setTimeout(r, 2000 * a));
  }
}

async function main() {
  console.log(APPLY ? '⚠️  APPLY — official_words 에 씁니다\n' : 'DRY RUN — 아무것도 쓰지 않습니다\n');

  // ① 검증을 통과해 캐시에 남아 있는 원형. (source_lang|term) → 값
  const cache = new Map<string, { base: string; infl: string }>();
  for (let from = 0; ; from += 500) {
    const batch = await retry<any[]>('캐시 스캔', () => sb.from('enrich_cache')
      .select('source_lang, term, base:result->>baseForm, infl:result->>inflection')
      .eq('prompt_version', PROMPT_VERSION)
      .not('result->>baseForm', 'is', null).neq('result->>baseForm', '')
      .order('source_lang').order('term').order('target_lang')
      .range(from, from + 499) as any);
    for (const r of batch) {
      cache.set(`${r.source_lang}|${String(r.term).trim().toLowerCase()}`, { base: r.base, infl: r.infl });
    }
    process.stdout.write(`\r캐시 ${cache.size}…            `);
    if (batch.length < 500) break;
  }
  process.stdout.write('\r');
  console.log(`캐시에서 검증된 원형 ${cache.size}개`);

  // ② 덱 언어 — official_words 에는 없고 테마에 있다.
  const { data: themes, error: te } = await sb.from('official_themes').select('id, title, source_language');
  if (te) { console.error(`테마 조회 실패: ${te.message}`); process.exit(1); }
  const lang = new Map<string, string>(), title = new Map<string, string>();
  for (const t of (themes ?? []) as any[]) { lang.set(t.id, t.source_language); title.set(t.id, t.title); }
  console.log(`덱 ${lang.size}개`);

  // ③ 덱 단어 — 키셋 페이지네이션(PostgREST 는 1,000행에서 조용히 자른다).
  const words: any[] = [];
  let after = '';
  for (;;) {
    const b = await retry<any[]>('덱 단어 조회', () => {
      let q = sb.from('official_words').select('id, term, theme_id, base_form, inflection').order('id').limit(1000);
      if (after) q = q.gt('id', after);
      return q as any;
    });
    words.push(...b);
    process.stdout.write(`\r덱 단어 ${words.length}…    `);
    if (b.length < 1000) break;
    after = b[b.length - 1].id;
  }
  process.stdout.write('\r');
  console.log(`덱 단어 ${words.length}행\n`);

  const todo: { row: any; base: string; infl: string; lang: string; deck: string }[] = [];
  const skipped: { term: string; why: string }[] = [];
  for (const w of words) {
    const L = lang.get(w.theme_id) ?? 'en';
    const key = String(w.term ?? '').trim().toLowerCase();
    const hit = cache.get(`${L}|${key}`);
    if (!hit) continue;
    const why = SKIP[key];
    if (why) { skipped.push({ term: String(w.term), why }); continue; }
    // 이미 같은 값이면 건너뛴다 — 재실행이 쓸데없이 쓰지 않게.
    if ((w.base_form ?? '') === hit.base && (w.inflection ?? '') === hit.infl) continue;
    todo.push({ row: w, base: hit.base, infl: hit.infl, lang: L, deck: title.get(w.theme_id) ?? '?' });
  }

  const byLang = new Map<string, number>();
  const byDeck = new Map<string, number>();
  for (const t of todo) {
    byLang.set(t.lang, (byLang.get(t.lang) ?? 0) + 1);
    byDeck.set(t.deck, (byDeck.get(t.deck) ?? 0) + 1);
  }
  console.log(`채울 덱 단어 ${todo.length}행  [${[...byLang].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')}]`);
  console.log(`제외한 것 ${skipped.length}행 (SKIP 목록):`);
  for (const [term, why] of new Map(skipped.map(s => [s.term, s.why]))) console.log(`    ${term} — ${why}`);
  console.log(`덱별: ${[...byDeck].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}(${v})`).join(' · ')}\n`);
  console.log('--- 전량 ---');
  for (const t of todo) console.log(`  [${t.lang}] ${t.row.term}  →  ${t.base} (${t.infl})   ·${t.deck}`);

  if (!APPLY) {
    console.log('\nDRY RUN 이라 여기서 멈춥니다. 실제로 쓰려면 --apply');
    return;
  }

  let written = 0;
  for (const t of todo) {
    // 되돌리려면 이 id 들의 두 칸을 NULL 로 되돌리면 된다.
    appendFileSync(BACKUP_FILE, JSON.stringify({
      at: new Date().toISOString(), id: t.row.id, term: t.row.term,
      before: { base_form: t.row.base_form ?? null, inflection: t.row.inflection ?? null },
      after: { base_form: t.base, inflection: t.infl },
    }) + '\n', 'utf8');
    const { error } = await sb.from('official_words')
      .update({ base_form: t.base, inflection: t.infl })
      .eq('id', t.row.id);
    if (error) console.error(`\n쓰기 실패 ${t.row.term}: ${error.message}`);
    else written++;
    process.stdout.write(`\r쓰기 ${written}/${todo.length}…    `);
  }
  console.log(`\n\n완료 — ${written}행. 원본은 ${BACKUP_FILE}.`);
  console.log('덱 단어는 세션마다 서버에서 새로 받으므로 앱 업데이트 없이 바로 반영됩니다.');
  console.log('⚠️ 이미 담아 간 사용자 단어는 복사본이라 바뀌지 않습니다.');
}

main().catch(e => { console.error(e); process.exit(1); });
