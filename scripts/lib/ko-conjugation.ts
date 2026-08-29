/**
 * 용언 표제어가 예문에 **실제로 활용되어 쓰였는지** 판정한다.
 *
 * 왜 따로 만들었나: `ko-deck-checks.ts`의 '예문에 표제어 없음' 검사는 용언이면
 * `term.slice(0, 1)` 한 글자로 완화해서 봤다. 그래서 `그러다`의 예문 "그가 그렇게
 * 갑자기 태도를 바꿀 줄은…"이 **"그"에 걸려 통과했다.** 레딧 제보자가 그 카드를
 * 발견해 알려 준 뒤에야 알았고, advisory라 exit 0 이었으므로 아무도 보지 않았다.
 *
 * 2026-08-28 이 판정기로 사다리 4덱 3,168장을 세었다: 표제어 미사용 34장(1.1%),
 * 그중 표제어가 예문에 아예 없는 것 12장. 측정 경위는 `docs/claude-handoff.md`.
 *
 * 🔑 **결정적인 규칙은 받침 제한이다.** 어간 앞부분을 그대로 요구하고 마지막 음절만
 * 초성 일치 + 중성 축약/불규칙 후보로 여는 것까지는 자연스럽게 나오는데, 거기서
 * 받침을 무제한 허용하면 `그러` + `렇`이 매칭되어 `그러다`를 **또** 놓친다.
 * 어미가 붙여 줄 수 있는 받침은 ㄴ ㄹ ㅁ ㅆ ㅂ 뿐이고 ㅎ은 거기 없다 — 이 한 줄이
 * 제보 건을 잡아낸다. 완화하기 전에 `__tests__/ko-conjugation.test.ts`를 먼저 볼 것.
 *
 * 목적은 완벽한 형태소 분석이 아니라 **사람이 볼 후보를 좁히는 것**이다. 실측 정확도:
 * 통과분 1,037장에서 뽑은 35장(어간 짧은 순 20 + 무작위 15) 눈검수에서 놓침 0,
 * 걸린 34장 중 6장이 오탐(분리 사용 `시험 준비를 하고`, 부사 파생 `철저히`)이었다.
 */

const HANGUL_BASE = 0xac00;
const HANGUL_END = 0xd7a3;

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

interface Syllable {
  cho: string;
  jung: string;
  jong: string;
}

function decompose(ch: string): Syllable | null {
  const code = ch.charCodeAt(0) - HANGUL_BASE;
  if (code < 0 || code > HANGUL_END - HANGUL_BASE) return null;
  return {
    cho: CHO[Math.floor(code / 588)],
    jung: JUNG[Math.floor((code % 588) / 28)],
    jong: JONG[code % 28],
  };
}

function isHangul(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c >= HANGUL_BASE && c <= HANGUL_END;
}

function compose(cho: string, jung: string, jong: string): string {
  return String.fromCharCode(HANGUL_BASE + CHO.indexOf(cho) * 588 + JUNG.indexOf(jung) * 28 + JONG.indexOf(jong));
}

/**
 * 어간 끝 모음이 어미 -아/-어와 만나 취할 수 있는 형태.
 * 이+어→여(외치다→외쳤다), 오+아→와(보다→봐요), 되+어→돼, 으탈락(쓰다→써).
 */
const CONTRACTION: Record<string, string[]> = {
  ㅏ: ['ㅏ'], ㅐ: ['ㅐ'], ㅑ: ['ㅑ'], ㅒ: ['ㅒ'], ㅓ: ['ㅓ'], ㅔ: ['ㅔ'],
  ㅕ: ['ㅕ'], ㅖ: ['ㅖ'], ㅗ: ['ㅗ', 'ㅘ'], ㅘ: ['ㅘ'], ㅙ: ['ㅙ'],
  ㅚ: ['ㅚ', 'ㅙ'], ㅛ: ['ㅛ'], ㅜ: ['ㅜ', 'ㅝ'], ㅝ: ['ㅝ'], ㅞ: ['ㅞ'],
  ㅟ: ['ㅟ', 'ㅕ'], ㅠ: ['ㅠ'], ㅡ: ['ㅡ', 'ㅓ', 'ㅏ'], ㅢ: ['ㅢ'], ㅣ: ['ㅣ', 'ㅕ'],
};

/**
 * 어간 끝 음절에 받침이 **없을 때**, 어미가 붙여 줄 수 있는 받침.
 * ㅎ이 여기 없다 — 그래서 `그러`(그러다) + `렇`(그렇다)이 걸러진다.
 */
const ENDING_JONG = new Set(['', 'ㄴ', 'ㄹ', 'ㅁ', 'ㅆ', 'ㅂ']);

/** 어간 마지막 음절이 활용에서 취할 수 있는 (초성, 중성) 후보. */
function lastSyllableVariants(s: Syllable): Set<string> {
  const out = new Set<string>();
  const add = (cho: string, jung: string) => out.add(`${cho}${jung}`);
  for (const j of CONTRACTION[s.jung] ?? [s.jung]) add(s.cho, j);

  if (s.jong === 'ㅂ') {                        // ㅂ불규칙: 맵다→매워, 돕다→도와
    add(s.cho, s.jung); add(s.cho, 'ㅗ'); add(s.cho, 'ㅜ');
  }
  if (s.jong === 'ㄷ') add(s.cho, s.jung);      // ㄷ불규칙: 듣다→들어
  if (s.jong === 'ㅅ') add(s.cho, s.jung);      // ㅅ불규칙: 낫다→나아
  if (s.jong === 'ㄹ') add(s.cho, s.jung);      // ㄹ탈락: 살다→사니
  if (s.jong === 'ㅎ') {                        // ㅎ불규칙: 그렇다→그런, 파랗다→파래서
    add(s.cho, s.jung);
    if (s.jung === 'ㅏ') add(s.cho, 'ㅐ');
    if (s.jung === 'ㅓ') add(s.cho, 'ㅔ');
    if (s.jung === 'ㅑ') add(s.cho, 'ㅒ');
    if (s.jung === 'ㅕ') add(s.cho, 'ㅖ');
  }
  if (s.jung === 'ㅡ') { add(s.cho, 'ㅓ'); add(s.cho, 'ㅏ'); }         // 으탈락: 쓰다→써
  if (s.cho === 'ㅎ' && s.jung === 'ㅏ' && !s.jong) add('ㅎ', 'ㅐ');   // 여불규칙: 하다→해
  if (s.cho === 'ㅅ' && s.jung === 'ㅣ' && !s.jong) add('ㅅ', 'ㅔ');   // 존칭: 계시다→계세요
  return out;
}

/** 용언 표제어의 어간(`-다`를 뗀 것). */
export function stemOf(term: string): string {
  const t = term.trim();
  return t.endsWith('다') ? t.slice(0, -1) : t;
}

/** 표제어가 용언인가 — `-다`로 끝나면 용언으로 본다(명사는 이 꼴이 거의 없다). */
export function looksLikeVerb(term: string): boolean {
  const t = term.trim();
  return t.length >= 2 && t.endsWith('다');
}

/** 르불규칙(자르다→잘랐어요): 앞 음절에 ㄹ 받침이 붙고 다음 음절이 ㄹ초성으로 온다. */
function matchesReuIrregular(head: string, text: string): boolean {
  if (!head) return false;
  const h = decompose(head[head.length - 1]);
  if (!h) return false;
  const target = head.slice(0, -1) + compose(h.cho, h.jung, 'ㄹ');
  for (let i = text.indexOf(target); i !== -1; i = text.indexOf(target, i + 1)) {
    const next = text[i + target.length];
    if (next && isHangul(next) && decompose(next)!.cho === 'ㄹ') return true;
  }
  return false;
}

/**
 * 예문 `text` 안에서 용언 `term`이 활용형으로 쓰였는지.
 *
 * 어간이 통째로 들어 있으면 바로 참이고, 아니면 어간 앞부분은 그대로 요구한 채
 * 마지막 음절만 초성 일치 + 중성 축약/불규칙 후보 + 받침 제한으로 본다.
 */
export function verbUsedInExample(term: string, text: string): boolean {
  if (!text) return false;
  const stem = stemOf(term);
  if (!stem) return false;
  if (text.includes(stem)) return true;

  const head = stem.slice(0, -1);
  const last = decompose(stem[stem.length - 1]);
  if (!last) return false;
  const variants = lastSyllableVariants(last);
  const jongOk = (jong: string) => Boolean(last.jong) || ENDING_JONG.has(jong);

  if (last.cho === 'ㄹ' && last.jung === 'ㅡ' && !last.jong && matchesReuIrregular(head, text)) return true;

  if (head) {
    for (let i = text.indexOf(head); i !== -1; i = text.indexOf(head, i + 1)) {
      const next = text[i + head.length];
      if (!next || !isHangul(next)) continue;
      const d = decompose(next)!;
      if (variants.has(`${d.cho}${d.jung}`) && jongOk(d.jong)) return true;
    }
    return false;
  }
  // 1음절 어간(하다·크다·살다 …)은 앞부분이 없어 예문 전체에서 후보 음절을 찾는다.
  for (const ch of text) {
    if (!isHangul(ch)) continue;
    const d = decompose(ch)!;
    if (variants.has(`${d.cho}${d.jung}`) && jongOk(d.jong)) return true;
  }
  return false;
}

/**
 * 합성 용언이 조사·부사를 끼워 **분리되어** 쓰인 경우.
 * `낯가리다` → "낯을 가려서", `정들다` → "정이 많이 들었어", `준비하다` → "시험 준비를 하고".
 *
 * 어간을 앞뒤로 쪼개, 앞 조각이 예문에 있고 **그 뒤쪽에** 뒤 조각의 활용형이 오면 쓰인 것으로
 * 본다. 앞 조각 바로 다음에 붙어 있는 경우는 이미 통째 매칭에서 걸렸을 것이므로 여기서
 * 다루는 것은 사이에 무언가 끼어든 형태뿐이다.
 *
 * ⚠️ 느슨해 보이지만 `그러다`는 여전히 걸린다 — `그` 뒤의 `렇`은 받침 ㅎ이라 `러`의
 * 활용형 후보에 없다. 완화 폭을 넓히기 전에 그 케이스를 먼저 확인할 것.
 */
function splitVerbUsed(stem: string, text: string): boolean {
  for (let cut = 1; cut < stem.length; cut++) {
    const head = stem.slice(0, cut);
    const tail = stem.slice(cut);
    const at = text.indexOf(head);
    if (at === -1) continue;
    const rest = text.slice(at + head.length);
    if (rest && verbUsedInExample(tail + '다', rest)) return true;
  }
  return false;
}

/** 표제어(용언이든 아니든)가 예문에 쓰였는지. 용언이 아니면 형태가 안 변하므로 그대로 찾는다. */
export function termUsedInExample(term: string, text: string): boolean {
  if (!text) return false;
  const t = term.trim();
  // 여러 어절짜리 표제어(`푹 쉬세요`, `몸을 풀다`)는 어절이 그대로 붙어 나오는 일이
  // 드물다 — 어절을 순서대로 따라가며 각각 쓰였는지 본다.
  if (/\s/.test(t)) {
    let rest = text;
    for (const word of t.split(/\s+/)) {
      if (!rest || !termUsedInExample(word, rest)) return false;
      const at = rest.indexOf(word[0]);
      rest = at === -1 ? rest : rest.slice(at + 1);
    }
    return true;
  }
  // 영문·로마자 표제어(슬랭 덱의 `TMI`)는 예문에서 소문자로 쓰이기도 한다.
  if (!looksLikeVerb(t)) return text.includes(t) || text.toLowerCase().includes(t.toLowerCase());
  if (verbUsedInExample(t, text)) return true;
  const stem = stemOf(t);
  return stem.length >= 2 && splitVerbUsed(stem, text);
}
