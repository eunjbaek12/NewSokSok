// 예문 학습(features/study/examples)의 빈칸 만들기.
//
// 이전 구현은 예문에서 표제어를 단순 부분문자열로 찾았다(`sentence.split(new RegExp(term,'gi'))`).
// 실사용 단어 4,000개로 재현해 보니 두 가지가 깨져 있었다:
//
//   1. 못 찾으면 빈칸이 0개가 되어 **예문이 통째로 노출** — 답을 고르기 전에 정답이 보인다.
//      영어 14.5%, 한국어 31.1%. 원인은 굴절·활용(“읽다”↔“읽어요”, signify↔signifies,
//      “look for”↔“looking for”)이라 구조적으로 항상 실패한다.
//   2. 단어 경계가 없어 **엉뚱한 자리에 빈칸**이 박힌다 — Despite→De[?], international→inter[?]al,
//      notepad→note[?]. 굴절 어미가 빈칸 밖에 남는 것도 같은 원인(elephants→[?]s).
//
// 그래서 언어군마다 규칙을 나눈다. 단어 경계(\b)를 일괄 적용하면 중국어·일본어가 망가지고
// (띄어쓰기가 없어 모든 매칭이 “단어 중간”이 된다), 한국어는 조사가 붙는 게 정상이다
// (“저는 [?]가 되고 싶어요”). 라틴 문자권만 토큰 경계를 요구한다.
//
// 언어 판정은 저장된 sourceLang이 아니라 **표제어의 문자 체계**로 한다 — source_lang='en'인데
// 표제어가 한국어인 행이 실제로 대량 존재한다(언어쌍 저장 오염).
//
// ⚠️ Hermes의 `\p{Script=...}` 지원이 불확실해 명시적 유니코드 범위를 쓴다(lib/stopwords.ts와 동일 방침).

const HANGUL_RE = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
const KANA_RE = /[぀-ヿ]/;
const HAN_RE = /[一-鿿]/;
const LATIN_RE = /[A-Za-zÀ-ɏḀ-ỿ]/;

/** 라틴 토큰. 하이픈은 분리자로 둔다 — "well-being"은 두 토큰 시퀀스로 매칭된다. */
const LATIN_TOKEN_RE = /[A-Za-zÀ-ɏḀ-ỿ0-9'’]+/g;

/** 표제어에 붙는 동음이의어 병기 기호(lib/senses.ts). 빈칸 탐색에서는 무시한다. */
const SENSE_MARKER_RE = /[①②③④⑤]/g;

export type ExampleSegment = { text: string; isBlank: boolean };

/**
 * 예문에서 표제어 자리를 찾아 세그먼트로 쪼갠다.
 * 빈칸을 하나도 만들지 못하면 **null** — 호출부는 이 예문을 출제하면 안 된다
 * (그대로 보여주면 정답 공개가 된다).
 */
export function segmentExample(sentence: string, term: string): ExampleSegment[] | null {
  if (!sentence || !term) return null;
  const cleanTerm = term.replace(SENSE_MARKER_RE, ' ').replace(/\s+/g, ' ').trim();
  if (!cleanTerm) return null;

  let ranges: Range[] = [];
  if (HANGUL_RE.test(cleanTerm)) ranges = findHangulRanges(sentence, cleanTerm);
  else if (KANA_RE.test(cleanTerm) || HAN_RE.test(cleanTerm)) ranges = findCjkRanges(sentence, cleanTerm);
  else if (LATIN_RE.test(cleanTerm)) ranges = findLatinRanges(sentence, cleanTerm);
  else ranges = findLiteralRanges(sentence, cleanTerm);

  if (ranges.length === 0) return null;
  return toSegments(sentence, ranges);
}

/** 빈칸을 만들 수 있는 예문인지. 출제 목록을 거를 때 쓴다. */
export function canBlankExample(sentence: string | null | undefined, term: string | null | undefined): boolean {
  if (!sentence || !term) return false;
  return segmentExample(sentence, term) !== null;
}

/**
 * 스피커가 읽을 문장. 정답 공개 전에는 **빈칸 구간을 빼고** 읽는다.
 *
 * 화면은 답을 가려 놓고 소리로는 그대로 흘리면 문제가 성립하지 않는다. 이 동작은 한때
 * "자발적 힌트"로 판정해 그냥 뒀다가 실기에서 뒤집힌 자리다 — 스피커는 답을 보려고
 * 누르는 버튼이 아니라 **발음을 들으려고** 누르는 버튼이라, 학습 의도대로 눌렀는데
 * 문제가 무력화된다. 자발적 선택이 아니라 함정이다. (되돌리지 말 것.)
 *
 * 공개된 뒤에는 원문 그대로 읽는다. 빈칸을 계속 빼면 정작 그 단어의 발음을 끝내
 * 못 듣게 되는데, 발음 학습이야말로 이 버튼의 존재 이유다.
 *
 * 빈칸 자리에 "블랭크" 같은 말을 넣지 않는다 — 덱 언어마다 그 단어를 따로 정해야 하고,
 * 읽히는 순간 문장이 아니라 문제지가 된다.
 *
 * 빈칸을 못 만드는 문장은 통째로 답이므로 **빈 문자열**을 준다(호출부는 스피커를 감춘다).
 */
export function spokenExample(
  sentence: string | null | undefined,
  term: string | null | undefined,
  revealed: boolean,
): string {
  if (!sentence) return '';
  // 동음이의어 병기 기호(①②)는 읽을 대상이 아니다. 공백 정리도 여기서 함께 한다 —
  // 빈칸을 들어내면 앞뒤 공백이 붙어 이중 공백이 남는다.
  const clean = (s: string) => s.replace(SENSE_MARKER_RE, ' ').replace(/\s+/g, ' ').trim();

  if (revealed) return clean(sentence);
  if (!term) return '';

  const segments = segmentExample(sentence, term);
  if (!segments) return '';
  return clean(segments.filter(s => !s.isBlank).map(s => s.text).join(''));
}

type Range = [start: number, end: number];

// ── 라틴 (en / es / vi …) ────────────────────────────────────────
// 토큰 경계를 요구하고, 매칭되면 **토큰 전체**를 빈칸에 넣는다.
// elephants → [?] (이전에는 [?]s로 어미가 새어 나왔다)

/** 굴절 어미 화이트리스트. 임의 접미사를 허용하면 car→carpet 같은 오탐이 생긴다. */
const INFLECTION_SUFFIXES = new Set([
  's', 'es', 'ed', 'd', 'ing', 'ies', 'ier', 'iest', 'er', 'est', 'ly', 'n', 'ren', 'men',
  // 소유격 — 토큰에 아포스트로피가 포함되므로("author's") 어미로 함께 처리한다.
  // 곧은 따옴표와 굽은 따옴표(U+2019) 둘 다 실데이터에 있다.
  "'s", '’s', "s'", 's’', "'", '’',
]);

/** token이 base의 굴절형인가. base가 2글자 이하면 폴백을 막는다(an→and 오탐). */
function inflectsFrom(token: string, base: string): boolean {
  const t = token.toLowerCase();
  const b = base.toLowerCase();
  if (t === b) return true;
  if (b.length < 3) return false;

  const tryStem = (stem: string) =>
    stem.length >= 2 && t.startsWith(stem) && INFLECTION_SUFFIXES.has(t.slice(stem.length));

  if (tryStem(b)) return true;                                  // elephant → elephants
  if (b.endsWith('e') && tryStem(b.slice(0, -1))) return true;   // discharge → discharging
  if (/[^aeiou]y$/.test(b) && tryStem(`${b.slice(0, -1)}i`)) return true; // signify → signifies
  const last = b.slice(-1);                                     // yap → yapping (자음 중복)
  if (/[bdgklmnprt]/.test(last) && tryStem(b + last)) return true;
  return false;
}

function findLatinRanges(sentence: string, term: string): Range[] {
  const termWords = term.match(LATIN_TOKEN_RE);
  if (!termWords || termWords.length === 0) return findLiteralRanges(sentence, term);

  const tokens: { text: string; start: number; end: number }[] = [];
  LATIN_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LATIN_TOKEN_RE.exec(sentence)) !== null) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }

  const ranges: Range[] = [];
  for (let i = 0; i + termWords.length <= tokens.length; i++) {
    let hit = true;
    for (let k = 0; k < termWords.length; k++) {
      // 구동사는 앞 단어가 굴절한다(popped off) — 모든 자리에 굴절을 허용한다.
      if (!inflectsFrom(tokens[i + k].text, termWords[k])) { hit = false; break; }
    }
    if (hit) {
      ranges.push([tokens[i].start, tokens[i + termWords.length - 1].end]);
      i += termWords.length - 1;
    }
  }
  return ranges;
}

// ── 한국어 ───────────────────────────────────────────────────────
// 조사·어미는 빈칸 밖에 남긴다("[?]가", "[?]어요") — 문법 단서가 남아야 자연스럽다.

const HANGUL_SYLLABLE_BASE = 0xac00;
const HANGUL_SYLLABLE_LAST = 0xd7a3;

/**
 * 어간 음절이 활용형 음절로 바뀔 수 있는 모음 축약.
 * 어간 중성 → 활용형에서 허용되는 중성. (중성 인덱스: ㅏ0 ㅓ4 ㅕ6 ㅗ8 ㅘ9 ㅙ10 ㅚ11 ㅜ13 ㅝ14 ㅡ18 ㅣ20)
 */
const VOWEL_CONTRACTIONS: Record<number, readonly number[]> = {
  20: [6],     // ㅣ→ㅕ  달리다→달렸어요, 무너지다→무너졌다
  8: [9],      // ㅗ→ㅘ  나오다→나와서
  13: [14],    // ㅜ→ㅝ  배우다→배웠어요
  18: [4, 0],  // ㅡ→ㅓ/ㅏ  쓰다→썼다, 크다→컸다
  11: [10],    // ㅚ→ㅙ  되다→돼요
};

/**
 * 어간의 마지막 음절 stem이 활용형 음절 actual로 나타날 수 있는가.
 * 종성은 무시하고(“모르”↔“모릅니다”, ㅂ불규칙 “어렵”↔“어려워요”), 중성은 축약을 허용한다.
 * 초성이 다르면 무조건 불일치 — 여기까지 풀면 오탐이 급증한다(르불규칙 “오르”↔“올라”는 포기).
 */
function sameIgnoringFinal(a: string, b: string): boolean {
  if (a === b) return true;
  const ca = a.charCodeAt(0);
  const cb = b.charCodeAt(0);
  if (ca < HANGUL_SYLLABLE_BASE || ca > HANGUL_SYLLABLE_LAST) return false;
  if (cb < HANGUL_SYLLABLE_BASE || cb > HANGUL_SYLLABLE_LAST) return false;
  const ia = ca - HANGUL_SYLLABLE_BASE;
  const ib = cb - HANGUL_SYLLABLE_BASE;
  const initialA = Math.floor(ia / 588);
  const initialB = Math.floor(ib / 588);
  if (initialA !== initialB) return false;
  const medialA = Math.floor((ia % 588) / 28); // a = 문장 쪽, b = 어간 쪽
  const medialB = Math.floor((ib % 588) / 28);
  if (medialA === medialB) return true;
  return (VOWEL_CONTRACTIONS[medialB] ?? []).includes(medialA);
}

/**
 * 어절 시작에서 stem이 매칭되는가.
 * 마지막 음절은 종성을 무시하되(“모르”↔“모릅”), **어간이 1글자면 정확히 일치해야 한다** —
 * 종성만 무시하면 “안다”의 어간 “안”이 “아기가”의 “아”에 붙는다.
 */
function matchesStemAt(sentence: string, at: number, stem: string): boolean {
  if (at + stem.length > sentence.length) return false;
  for (let i = 0; i < stem.length - 1; i++) {
    if (sentence[at + i] !== stem[i]) return false;
  }
  const lastIdx = stem.length - 1;
  if (stem.length === 1) return sentence[at] === stem[0];
  return sameIgnoringFinal(sentence[at + lastIdx], stem[lastIdx]);
}

/** 용언 기본형에서 어간 후보. "계속하다"→["계속하","계속"], "읽다"→["읽"] */
function hangulStems(term: string): string[] {
  if (!term.endsWith('다') || term.length < 2) return [];
  const stems = [term.slice(0, -1)];
  if (term.endsWith('하다') && term.length > 2) stems.push(term.slice(0, -2));
  return stems.filter(s => s.length >= 1);
}

/** 어절(공백 구분) 시작 위치 목록. */
function wordStarts(sentence: string): number[] {
  const starts: number[] = [];
  let atStart = true;
  for (let i = 0; i < sentence.length; i++) {
    if (/\s/.test(sentence[i])) { atStart = true; continue; }
    if (atStart) { starts.push(i); atStart = false; }
  }
  return starts;
}

function findHangulRanges(sentence: string, term: string): Range[] {
  // 1) 표제어 그대로 (조사만 붙은 정상 케이스: "의사가" → [?]가)
  const literal = findLiteralRanges(sentence, term);
  if (literal.length > 0) return literal;

  // 2) 용언 활용 — 어절 시작에서 어간 매칭 ("읽다" → "읽어요")
  for (const stem of hangulStems(term)) {
    const ranges: Range[] = [];
    for (const start of wordStarts(sentence)) {
      if (matchesStemAt(sentence, start, stem)) ranges.push([start, start + stem.length]);
    }
    if (ranges.length > 0) return ranges;
  }
  return [];
}

// ── 중국어 · 일본어 ──────────────────────────────────────────────
// 띄어쓰기가 없어 토큰 경계를 요구할 수 없다. 부분 매칭이 정상 동작이다.

function findCjkRanges(sentence: string, term: string): Range[] {
  const literal = findLiteralRanges(sentence, term);
  if (literal.length > 0) return literal;

  // 일본어 활용: 어미를 떼고 재시도. 1글자("取れる"→"取れ")로 안 되면 2글자
  // ("勉強する"→"勉強" — する동사는 어미가 2글자다).
  if (KANA_RE.test(term)) {
    for (const cut of [1, 2]) {
      if (term.length - cut < 1) break;
      const hit = findLiteralRanges(sentence, term.slice(0, -cut));
      if (hit.length > 0) return hit;
    }
  }
  return [];
}

// ── 공통 ─────────────────────────────────────────────────────────

function findLiteralRanges(sentence: string, needle: string): Range[] {
  const ranges: Range[] = [];
  const hay = sentence.toLowerCase();
  const nee = needle.toLowerCase();
  let from = 0;
  for (;;) {
    const at = hay.indexOf(nee, from);
    if (at < 0) break;
    ranges.push([at, at + needle.length]);
    from = at + needle.length;
  }
  return ranges;
}

function toSegments(sentence: string, ranges: Range[]): ExampleSegment[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: ExampleSegment[] = [];
  let pos = 0;
  for (const [start, end] of sorted) {
    if (start < pos) continue; // 겹친 매칭은 앞선 것만 남긴다
    if (start > pos) out.push({ text: sentence.slice(pos, start), isBlank: false });
    out.push({ text: sentence.slice(start, end), isBlank: true });
    pos = end;
  }
  if (pos < sentence.length) out.push({ text: sentence.slice(pos), isBlank: false });
  return out;
}
