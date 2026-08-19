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
  /** definition 을 캐시 것으로 바꿨는가. outcome 이 병기/보류여도 참일 수 있다 —
   *  definition 교정은 병기 여부와 무관하게 먼저 적용되기 때문이다. */
  definitionFixed: boolean;
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
/**
 * 덱 뜻과 겹치는 뜻만 골라 인덱스로 돌려준다. 겹치는 게 없으면 빈 배열.
 *
 * 🔴 이게 없던 때 definition 을 캐시 **최상위**(①②③ 전체 병기)로 통째 덮어써서,
 *    동음이의 다른 단어의 뜻풀이가 카드에 실렸다. 실측 490건 — 특히 단음절 한자어에서
 *    심했다: `미`(덱 뜻 beauty)에 "① 털 뭉친 덩어리 ② 꼬아 만든 실 ③ 쌀 찐 가루",
 *    `한`(limit)에 "① 나라의 이름 ② 한국 사람 ③ 횟수 세는 단위".
 *    뜻마다 definition 이 짝지어 있으므로, 덱이 가르치는 뜻에 해당하는 것만 가져오면 된다.
 */
export function matchingSenseIndexes(deckMeaning: string, senses: readonly WordSense[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < senses.length; i++) {
    if (overlapsDeckMeaning(deckMeaning, [senses[i]])) out.push(i);
  }
  return out;
}

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

  // ── ④ definition 결함부터 고친다 ─────────────────────────────────────
  // 🔴 순서가 중요하다. 병기를 먼저 시도하면, 병기가 보류된 단어(덱 뜻이 캐시에
  //    없거나 한도를 넘은 경우)는 definition 규칙에 **도달하지 못한 채** 반환되어
  //    결함이 그대로 남는다. 실제로 그렇게 짰다가 dry-run 에서 발견했다 —
  //    definition 교정이 4,907 건이 아니라 2,496 건으로 줄어 있었다.
  //    병기가 적용되면 definition 은 어차피 병기본으로 덮이므로 손해가 없다.
  const def = (w.definition ?? '').trim();
  // 캐시에 뜻이 여럿이면 **덱이 가르치는 뜻에 해당하는 것만** 가져온다. 최상위
  // definition 은 뜻 전부를 병기한 것이라, 그대로 쓰면 동음이의 다른 단어의 뜻풀이가
  // 섞여 들어온다(matchingSenseIndexes 주석의 실측 490건). 겹치는 뜻이 하나도 없으면
  // 캐시가 이 단어를 아예 다르게 알고 있다는 뜻이므로 definition 을 손대지 않는다.
  const topDef = (cached?.definition ?? '').trim();
  const matchedSenses = senses ? matchingSenseIndexes(w.meaningKr, senses) : [];
  const cachedDef = !senses
    ? topDef
    : matchedSenses.length
      ? composeSenseFill(matchedSenses, senses, base).definition.trim()
      // 겹치는 뜻이 없다. 최상위가 뜻 전부를 병기한 것이면 통째로 남의 뜻이므로 버리고,
      // senses 와 무관한 단일 뜻풀이면 그건 이 단어를 설명한 것이라 살린다.
      // (실측으로는 senses 2개 이상인 캐시 379건 전부가 병기본이라 후자는 방어에 가깝다.)
      : /[①②③④⑤]/.test(topDef) ? '' : topDef;
  let word = w;
  let outcome: Outcome = 'unchanged';
  if (cachedDef) {
    if (!def) {
      word = { ...w, definition: cachedDef };
      outcome = 'definition-filled';
    } else if (normMeaning(def) === normMeaning(w.meaningKr)) {
      // definition 은 "출발어로 쓴 뜻풀이"여야 하는데 도착어 번역(meaningKr)이
      // 복사된 덱이 있다 — ko>en·ko>vi·ko>ja·ko>zh 4,400건.
      word = { ...w, definition: cachedDef };
      outcome = 'definition-fixed';
    }
  }
  const definitionFixed = outcome !== 'unchanged';

  // ── ⑤ 동음이의어 병기 ────────────────────────────────────────────────
  if (senses && senses.length >= 2) {
    if (!matchedSenses.length) {
      return { word, outcome: 'senses-skipped-nooverlap', senses, exampleChanged: false, definitionFixed };
    }
    // 🔑 병기는 **덱 뜻으로 좁히지 않는다.** 동음이의어를 함께 보여주는 것이 이 기능의
    //    의도이고(사과 = apple ② apology), 좁히면 기능 자체가 사라진다. 캐시가 틀린 뜻을
    //    아는 경우(논 = 쟁기)가 여기 섞이지만, 그것과 진짜 동음이의어는 형태로 구별되지
    //    않는다 — 캐시 품질 문제이지 병기 범위 문제가 아니다.
    const selection = defaultSenseSelection(senses, base);
    // 한도 때문에 뜻이 하나로 줄면 병기가 아니라 "덱 뜻을 캐시 첫 뜻으로 교체"가
    // 되어 버린다 — 뜻은 안 늘고 덱 것만 사라지므로 포기한다.
    if (selection.length < 2) {
      return { word, outcome: 'senses-skipped-limit', senses, exampleChanged: false, definitionFixed };
    }
    const fill = composeSenseFill(selection, senses, base);
    if (!fitsSaveLimits(fill)) {
      return { word, outcome: 'senses-skipped-limit', senses, exampleChanged: false, definitionFixed };
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
      definitionFixed,
    };
  }

  return { word, outcome, senses, exampleChanged: false, definitionFixed };
}
