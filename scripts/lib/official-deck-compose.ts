/**
 * 공식 덱 시딩의 합성 규칙 — 덱 단어 + enrich_cache → 서버에 넣을 단어.
 *
 * scripts/seed-official-decks.ts 의 순수 로직만 떼어 둔 것이다. 여기만 순수하게
 * 유지하면 규칙을 테스트로 고정할 수 있다(__tests__/official-deck-compose.test.ts).
 * 규칙의 배경과 실측 근거는 시딩 스크립트 헤더에 있다.
 */
import {
  normalizeSenses,
  composeSenseFill,
  fitsSaveLimits,
  defaultSenseSelection,
} from '../../lib/senses';
import type { Word } from '../../lib/types';
import type { WordSense } from '../../shared/contracts';

export interface CachedEnrich {
  definition?: string;
  meaningKr?: string;
  exampleEn?: string;
  exampleKr?: string;
  pos?: string;
  phonetic?: string;
  senses?: unknown;
}

export type Outcome =
  | 'unchanged'                   // 캐시 없음 또는 고칠 것 없음
  | 'definition-filled'           // 빈 definition 을 채웠다
  | 'definition-fixed'            // meaningKr 복사본을 뜻풀이로 바꿨다
  | 'senses-merged'               // ①② 병기를 넣었다
  | 'senses-skipped-nooverlap'    // 덱 뜻이 캐시 뜻에 없어 손대지 않았다
  | 'senses-skipped-limit';       // 병기가 저장 한도를 넘어 포기했다

export interface Composed {
  word: Word;
  outcome: Outcome;
  senses: WordSense[] | null;
  exampleChanged: boolean;
}

/** 뜻 비교용 정규화: 괄호 주석과 구두점을 지우고 공백을 고른다. */
export function normMeaning(s: string | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[.,;·:!?"'`~\-–—/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 덱 뜻이 캐시 뜻들 안에 흔적이라도 있는가.
 *
 * 🔴 없으면 병기를 넣지 않는다. 실측 22.9%가 여기 걸리는데, 그중엔 문자열만 다른
 *    같은 뜻("박사" 덱=doctor (Ph.D.) 캐시=Academic degree)도 있고 캐시가 덱 뜻을
 *    아예 안 가진 것("困" 덱=졸리다 캐시=곤란하게 하다/지치게 하다)도 있다. 자동으로
 *    가를 수 없으니, 통째로 교체해 덱 뜻이 사라지는 쪽을 막는다.
 */
export function overlapsDeckMeaning(deckMeaning: string, senses: readonly WordSense[]): boolean {
  const a = normMeaning(deckMeaning);
  if (!a) return false;
  const aTokens = new Set(a.split(' ').filter(w => w.length > 1));
  for (const s of senses) {
    const b = normMeaning(s.meaningKr);
    if (!b) continue;
    if (a === b || a.includes(b) || b.includes(a)) return true;
    for (const t of b.split(' ')) {
      if (t.length > 1 && aTokens.has(t)) return true;
    }
  }
  return false;
}

export function composeWord(w: Word, cached: CachedEnrich | undefined): Composed {
  const base = {
    definition: cached?.definition ?? '',
    meaningKr: cached?.meaningKr ?? '',
    exampleEn: cached?.exampleEn ?? '',
    exampleKr: cached?.exampleKr ?? '',
    pos: cached?.pos ?? '',
    phonetic: cached?.phonetic ?? '',
    mnemonic: '',
  };
  const senses = cached ? normalizeSenses(cached.senses) : null;

  // ── ⑤ 동음이의어 병기 ────────────────────────────────────────────────
  if (senses && senses.length >= 2) {
    if (!overlapsDeckMeaning(w.meaningKr, senses)) {
      return { word: w, outcome: 'senses-skipped-nooverlap', senses, exampleChanged: false };
    }
    const selection = defaultSenseSelection(senses, base);
    // 한도 때문에 뜻이 하나로 줄면 병기가 아니라 "덱 뜻을 캐시 첫 뜻으로 교체"가
    // 되어 버린다 — 뜻은 안 늘고 덱 것만 사라지므로 포기한다.
    if (selection.length < 2) {
      return { word: w, outcome: 'senses-skipped-limit', senses, exampleChanged: false };
    }
    const fill = composeSenseFill(selection, senses, base);
    if (!fitsSaveLimits(fill)) {
      return { word: w, outcome: 'senses-skipped-limit', senses, exampleChanged: false };
    }
    return {
      word: {
        ...w,
        meaningKr: fill.meaningKr,
        definition: fill.definition,
        exampleEn: fill.exampleEn,
        exampleKr: fill.exampleKr,
        // 발음·품사는 덱 것을 지킨다 — 이 작업에 그것을 바꿀 이유가 없다.
        pos: w.pos,
        phonetic: w.phonetic,
      },
      outcome: 'senses-merged',
      senses,
      exampleChanged: true,
    };
  }

  // ── ④ definition 결함 ────────────────────────────────────────────────
  const def = (w.definition ?? '').trim();
  const cachedDef = (cached?.definition ?? '').trim();
  if (cachedDef) {
    if (!def) {
      return {
        word: { ...w, definition: cachedDef },
        outcome: 'definition-filled',
        senses,
        exampleChanged: false,
      };
    }
    // definition 은 "출발어로 쓴 뜻풀이"여야 하는데 도착어 번역(meaningKr)이 복사된
    // 덱이 있다 — ko>en·ko>vi·ko>ja·ko>zh 4,400건.
    if (normMeaning(def) === normMeaning(w.meaningKr)) {
      return {
        word: { ...w, definition: cachedDef },
        outcome: 'definition-fixed',
        senses,
        exampleChanged: false,
      };
    }
  }
  return { word: w, outcome: 'unchanged', senses, exampleChanged: false };
}
