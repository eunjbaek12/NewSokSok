/** 한국어 출발 덱에서 단음절 표제어에 병기가 적용되는 것을 뽑는다 (검수용). */
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { composeWord } from './lib/official-deck-compose';
import type { VocaList } from '../lib/types';

const URL = process.env.SUPABASE_URL!, KEY = process.env.SERVICE_ROLE_KEY!;
const db = createClient(URL, KEY, { auth: { persistSession: false } });

async function main() {
  const src = readFileSync('constants/curationData.ts', 'utf8');
  const decks: VocaList[] = JSON.parse(src.slice(src.indexOf('= [') + 2, src.lastIndexOf(']') + 1));
  // ko>en 만. 시딩은 언어쌍별 캐시를 쓰므로 ko>vi 덱에 ko>en 캐시를 물리면 거짓 결과가 난다.
  const ko = decks.filter(d => d.sourceLanguage === 'ko' && d.targetLanguage === 'en');

  // 새 4덱 표제어도 검수 대상에 넣는다 — 통합 뒤 다시 뽑지 않아도 되게.
  const ladder = JSON.parse(readFileSync('scripts/ko-ladder-source.json', 'utf8'));
  const ladderTerms = new Set<string>();
  for (const d of ladder.decks) for (const e of d.entries) if (e.term.length === 1) ladderTerms.add(e.term);

  const monoTerms = new Set<string>(ladderTerms);
  for (const d of ko) for (const w of d.words) if (w.term.length === 1) monoTerms.add(w.term);
  console.log(`단음절 표제어 ${monoTerms.size}개 (기존 덱 + 새 4덱)`);

  const terms = [...monoTerms];
  const cache = new Map<string, any>();
  for (let i = 0; i < terms.length; i += 100) {
    const { data, error } = await db.from('enrich_cache')
      .select('term,result').eq('source_lang', 'ko').eq('target_lang', 'en')
      .in('term', terms.slice(i, i + 100));
    if (error) throw new Error(error.message);
    for (const r of data ?? []) cache.set(r.term, r.result);
  }
  console.log(`캐시 보유 ${cache.size}`);

  const rows: any[] = [];
  const seen = new Set<string>();
  for (const d of ko) {
    for (const w of d.words) {
      if (w.term.length !== 1 || seen.has(w.term)) continue;
      const cached = cache.get(w.term);
      if (!cached) continue;
      const r = composeWord(w, cached);
      if (r.outcome !== 'senses-merged') continue;
      seen.add(w.term);
      rows.push({
        term: w.term, deck: d.id.replace('curated-', ''),
        deckMeaning: w.meaningKr, merged: r.word.meaningKr, definition: r.word.definition,
        // 덱이 가르치던 뜻이 병기 결과에서 사라졌는가 — 가장 확실한 결함 신호다.
        deckMeaningLost: !w.meaningKr.toLowerCase().split(/[,;]/).map(x=>x.trim()).filter(Boolean)
          .some(x => r.word.meaningKr.toLowerCase().includes(x)),
      });
    }
  }
  rows.sort((a, b) => a.term.localeCompare(b.term, 'ko'));
  console.log(`병기가 적용되는 단음절: ${rows.length}건`);
  writeFileSync('scripts/.mono-review.json', JSON.stringify(rows, null, 1));
}
main().catch(e => { console.error(e); process.exit(1); });
