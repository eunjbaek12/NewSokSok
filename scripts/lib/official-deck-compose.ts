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
import { stripControlChars } from '../../utils/word-sanitize';
import type { Word } from '../../lib/types';
import type { WordSense } from '../../shared/contracts';
import type { DefinitionDecision } from './ko-ladder-definition-decisions';

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
  | 'senses-skipped-limit'        // 병기가 저장 한도를 넘어 포기했다
  | 'definition-cleared'          // 사람이 blank 로 판정해 definition 을 비웠다
  | 'senses-all-dropped';         // 뜻이 전부 제외 목록에 걸려 캐시를 쓰지 않았다

export interface Composed {
  word: Word;
  outcome: Outcome;
  senses: WordSense[] | null;
  exampleChanged: boolean;
  /** definition 을 캐시 것으로 바꿨는가. outcome 이 병기/보류여도 참일 수 있다 —
   *  definition 교정은 병기 여부와 무관하게 먼저 적용되기 때문이다. */
  definitionFixed: boolean;
}

/**
 * 뜻 비교용 정규화: 괄호 주석과 구두점을 지우고 공백을 고른다.
 *
 * 🔴 CJK 구분자(`、，。；：！？`)를 반드시 함께 지운다. 뜻 겹침 판정은 정규화한
 *    문자열을 **공백으로 쪼갠 토큰**으로 비교하는데, 일본어·중국어는 낱말을 공백이
 *    아니라 이 구분자로 나눈다. 빠뜨리면 `こと、もの` 가 통째로 한 토큰이 되어
 *    캐시의 `言葉、言語` 와 한 글자도 겹치지 않는 것으로 판정된다.
 *    실측: ko>ja 121장 · ko>zh 136장이 이 이유로 definition 이 교정되지 않고
 *    meaningKr 복사본인 채 서버에 올라가 있었다(둘 합쳐 92장이 이 한 줄로 살아난다).
 *
 * 🔴 **전각 괄호 `（）` 는 지우지 말 것.** 반각 괄호를 지우는 건 영어 부연
 *    (`doctor (Ph.D.)`)을 떼려는 것인데, CJK 는 괄호 안에 뜻 자체가 들어 있다 —
 *    `数詞（一つ）` 에서 괄호를 떼면 덱 뜻 `一つ` 와의 겹침이 사라진다.
 *    시뮬레이션에서 이 한 줄 때문에 멀쩡하던 판정 4건이 깨졌다.
 */
export function normMeaning(s: string | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[.,;·:!?"'`~\-–—/]/g, ' ')
    .replace(/[、，。；：！？]/g, ' ')
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

/**
 * 서버에 넣기 직전의 마지막 손질 — 제어문자를 지운다.
 *
 * 🔴 캐시 뜻풀이에는 AI 가 넣은 개행이 섞여 있다(실측: official_words 51행).
 *    그대로 심으면 그 덱을 담은 사용자의 **클라우드 동기화가 영구히 끊긴다** —
 *    cloud_words 의 CHECK(chk_cloud_words_definition_noctrl)에 걸려 push 가 throw 하고
 *    dirty 가 남아 다음 시도도 같은 자리에서 막힌다. 앱 쪽 저장 경계에도 같은 정제가
 *    있지만(utils/word-sanitize), 서버 데이터 자체를 깨끗하게 두는 편이 옳다 —
 *    옛 앱은 그 정제를 안 거치는 경로로 이 덱을 담을 수 있다.
 * 🔑 길이는 건드리지 않는다. 문장을 자르면 뜻이 잘려 나간다.
 */
function cleanText<T extends Record<string, any>>(obj: T, fields: readonly string[]): T {
  const out: Record<string, any> = { ...obj };
  for (const f of fields) {
    if (typeof out[f] === 'string') out[f] = stripControlChars(out[f]);
  }
  return out as T;
}

const WORD_TEXT_FIELDS = ['term', 'definition', 'meaningKr', 'exampleEn', 'exampleKr', 'pos', 'phonetic'] as const;

export function composeWord(
  w: Word,
  cached: CachedEnrich | undefined,
  decision?: DefinitionDecision,
  dropSenses?: readonly number[],
): Composed {
  const out = composeWordRaw(w, cached, decision, dropSenses);
  return {
    ...out,
    word: cleanText(out.word, WORD_TEXT_FIELDS),
    senses: out.senses ? out.senses.map(s => cleanText(s, WORD_TEXT_FIELDS)) : out.senses,
  };
}

function composeWordRaw(
  w: Word,
  cached: CachedEnrich | undefined,
  /** 사람이 내린 판정. 목록은 scripts/lib/ko-ladder-definition-decisions.ts. 없으면 규칙대로. */
  decision?: DefinitionDecision,
  /** 카드에 실으면 안 되는 뜻 번호(1부터). 목록은 scripts/lib/sense-drops.ts. */
  dropSenses?: readonly number[],
): Composed {
  const base = {
    definition: cached?.definition ?? '',
    meaningKr: cached?.meaningKr ?? '',
    exampleEn: cached?.exampleEn ?? '',
    exampleKr: cached?.exampleKr ?? '',
    pos: cached?.pos ?? '',
    phonetic: cached?.phonetic ?? '',
    mnemonic: '',
  };
  const rawSenses = cached ? normalizeSenses(cached.senses) : null;
  // 지어낸 뜻은 여기서 걸러 낸다. 병기는 뜻을 **카드 앞면까지** 올리므로, 뒤에서 막으면
  // 늦다 — definition·예문·meaningKr 이 전부 그 뜻으로 덮인다.
  const senses = rawSenses && dropSenses?.length
    ? rawSenses.filter((_, i) => !dropSenses.includes(i + 1))
    : rawSenses;

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
  // 캐시 최상위 definition 은 **뜻 전부를 병기한 것**이라 제외한 뜻의 문장이 섞여 있다.
  // 걸러 낸 게 있으면 남은 뜻으로 다시 짜야 한다.
  const topDef = dropSenses?.length && senses?.length
    ? composeSenseFill(senses.map((_, i) => i), senses, base).definition.trim()
    : (cached?.definition ?? '').trim();
  const matchedSenses = senses ? matchingSenseIndexes(w.meaningKr, senses) : [];
  // 사람이 blank 로 판정한 단어는 여기서 끝난다. 캐시가 다른 단어를 설명하고 있거나
  // (개 = dog 인데 캐시는 접두사 '개-'), 뜻풀이 자체가 깨진 것들이다.
  // 🔴 "손대지 않는다"가 아니라 **비운다**. 그냥 두면 meaningKr 복사본이 남아 카드에
  //    영어가 두 번 뜬다(레딧 제보 ④). 병기(⑤)도 타지 않는다 — 겹치는 뜻이 없으니
  //    어차피 보류되지만, 남의 뜻을 끌어올 경로를 아예 막아 둔다.
  if (decision === 'blank') {
    return {
      word: def ? { ...w, definition: '' } : w,
      outcome: def ? 'definition-cleared' : 'unchanged',
      senses,
      exampleChanged: false,
      definitionFixed: false,
    };
  }
  // 뜻이 하나도 안 남았다 = 캐시가 이 단어를 통째로 잘못 알고 있다. 최상위 definition 도
  // 그 뜻들로 짠 것이라 쓸 수 없으므로, 덱 것을 그대로 둔다.
  if (rawSenses?.length && senses && senses.length === 0) {
    return { word: w, outcome: 'senses-all-dropped', senses: rawSenses, exampleChanged: false, definitionFixed: false };
  }
  const cachedDef = !senses
    ? topDef
    : matchedSenses.length
      ? composeSenseFill(matchedSenses, senses, base).definition.trim()
      // 겹치는 뜻이 없다. 최상위가 뜻 전부를 병기한 것이면 통째로 남의 뜻이므로 버리고,
      // senses 와 무관한 단일 뜻풀이면 그건 이 단어를 설명한 것이라 살린다.
      // (실측으로는 senses 2개 이상인 캐시 379건 전부가 병기본이라 후자는 방어에 가깝다.)
      // 🔑 사람이 fill 로 판정했으면 그 판단이 앞선다. 겹침 판정은 영어 문자열 비교라
      //    같은 뜻을 다른 낱말로 쓴 것(감독 = supervision vs Director)을 가려내지 못한다.
      : decision === 'fill'
        ? topDef
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
