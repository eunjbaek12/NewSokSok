/**
 * 새 한국어 사다리 4덱의 단음절 표제어 중 **실제로 병기가 붙는 것만** 뽑는다 (검수 범위 산정).
 *
 * 🔑 list-mono-senses.ts 와 나눠 둔 이유 두 가지:
 *   ① 저쪽은 `constants/curationData.ts` 의 단어만 돈다. 사다리 4덱은 아직 통합 전이라
 *      표제어가 그 파일에 없어 전부 빠진다. 여기서는 ko-ladder-source.json 을 읽고,
 *      뜻은 기존 덱 단어 → 없으면 생성된 카드(.ko-ladder-progress.json) 순으로 찾는다.
 *      실측 218개 중 172개가 이미 뜻을 갖고 있어, 카드 생성을 기다릴 필요가 없었다.
 *   ② 검수 대상은 senses 가 2개 이상인 것 전부가 아니라 **composeWord 가 실제로
 *      senses-merged 를 내는 것**뿐이다. 캐시 뜻이 덱 뜻과 하나도 안 겹치면 병기가
 *      통째로 건너뛰어져(senses-skipped-nooverlap) 오답이 카드에 실리지 않는다.
 *      실측: senses>=2 는 177건인데 실제로 병기가 붙는 것은 104건이다.
 *
 * 🔴 저쪽의 deckMeaningLost 는 쓰지 않는다. 덱 뜻을 쉼표로 쪼개 문자열 포함으로 재는데,
 *    `soup (served with rice, thinner than stew)` 가 괄호 안에서 갈리고
 *    `what (informal)` ↔ `What (colloquial)` 같은 바꿔 쓰기까지 "잃음"으로 잡는다.
 *    실측 51건 중 개념이 진짜 사라진 것은 8건뿐이었다.
 *
 * 실행: SUPABASE_URL=... SERVICE_ROLE_KEY=... SCRATCH=<dir> npx -y tsx scripts/list-mono-merged.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { composeWord } from './lib/official-deck-compose';
import type { VocaList } from '../lib/types';

const db = createClient(process.env.SUPABASE_URL!, process.env.SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
  const ladder = JSON.parse(readFileSync('scripts/ko-ladder-source.json', 'utf8'));
  const prog = new Map<string, any>(
    JSON.parse(readFileSync('scripts/.ko-ladder-progress.json', 'utf8')).map((e: any) => [e.term, e]));

  // 기존 덱의 ko>en 단어 뜻 (재사용 1,482장)
  const src = readFileSync('constants/curationData.ts', 'utf8');
  const decks: VocaList[] = JSON.parse(src.slice(src.indexOf('= [') + 2, src.lastIndexOf(']') + 1));
  const existing = new Map<string, any>();
  for (const d of decks) {
    if (d.sourceLanguage !== 'ko' || d.targetLanguage !== 'en') continue;
    for (const w of d.words) if (!existing.has(w.term)) existing.set(w.term, w);
  }

  // 새 4덱 단음절 표제어 → 알고 있는 뜻(기존 덱 단어 또는 생성된 카드)
  const known: { term: string; deck: string; word: any; source: string }[] = [];
  const unknown: string[] = [];
  for (const d of ladder.decks) for (const e of d.entries) {
    if (e.term.length !== 1) continue;
    const ex = existing.get(e.term);
    const card = prog.get(e.term);
    if (ex) known.push({ term: e.term, deck: d.key, word: ex, source: '기존덱' });
    else if (card) known.push({ term: e.term, deck: d.key, source: '신규카드',
      word: { term: e.term, meaningKr: card.meaningEn, definition: '', exampleEn: card.exampleEn, exampleKr: card.exampleKo, pos: card.pos, phonetic: card.romaja } });
    else unknown.push(e.term);
  }

  const terms = [...new Set(known.map(k => k.term))];
  const cache = new Map<string, any>();
  for (let i = 0; i < terms.length; i += 100) {
    const { data, error } = await db.from('enrich_cache')
      .select('term,result').eq('source_lang', 'ko').eq('target_lang', 'en').in('term', terms.slice(i, i + 100));
    if (error) throw new Error(error.message);
    for (const r of data ?? []) cache.set(r.term, r.result);
  }

  const byOutcome: Record<string, number> = {};
  const merged: any[] = [];
  const seen = new Set<string>();
  for (const k of known) {
    if (seen.has(k.term)) continue;
    seen.add(k.term);
    const cached = cache.get(k.term);
    if (!cached) { byOutcome['캐시없음'] = (byOutcome['캐시없음'] ?? 0) + 1; continue; }
    const r = composeWord(k.word, cached);
    byOutcome[r.outcome] = (byOutcome[r.outcome] ?? 0) + 1;
    if (r.outcome === 'senses-merged') {
      merged.push({ term: k.term, deck: k.deck, source: k.source,
        deckMeaning: k.word.meaningKr, merged: r.word.meaningKr,
        senses: (cached.senses ?? []).map((s: any) => s.meaningKr) });
    }
  }
  console.log(`새 4덱 단음절 ${known.length + unknown.length}개 — 뜻을 아는 것 ${seen.size} · 카드 대기 ${unknown.length}`);
  console.log('결과:', JSON.stringify(byOutcome));
  console.log(`\n■ 실제로 병기가 붙는 것: ${merged.length}건`);
  writeFileSync(process.env.SCRATCH + '/mono-merged-now.json', JSON.stringify(merged, null, 1));
}
main().catch(e => { console.error(e); process.exit(1); });
