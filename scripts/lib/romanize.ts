/**
 * 한글 → 개정 로마자(Revised Romanization) 변환 — 큐레이션 덱의 romaja 검수용.
 *
 * 왜 필요한가: ko→en 덱 4개(의성어·Untranslatable·편의점·TOPIK I, 550단어)를 만들면서
 * AI가 낸 로마자에서 40건이 틀렸다. 전부 사람이 눈으로 잡은 것이고 자동 검사는 하나도
 * 없었다. 표제어가 많을수록 오류도 비례해 늘어(350개 덱에서 16건) 눈검수만으로는
 * 감당이 안 된다.
 *
 * 무엇을 목표로 하는가: 완벽한 변환기가 아니라 **불일치 경고**다. 사람이 확인할 후보를
 * 수백 개에서 몇 개로 좁히는 게 목적이라, 애매한 경우는 후보를 여러 개 허용해
 * 거짓 경보를 줄인다(격음화 반영/미반영 등 표기 관행이 갈리는 자리).
 *
 * 개정 로마자는 표기가 아니라 **표준 발음**을 적으므로 자모를 분해한 뒤 음운 변화를
 * 적용하고 매핑한다. 구현한 규칙: 연음, 비음화, 유음화, 격음화, ㅎ 탈락.
 * 구현하지 않은 것: 사잇소리, 구개음화, 한자어 특수 독음 — 이런 낱말은 후보가 어긋날
 * 수 있으니 경고가 뜨면 사람이 판단한다.
 */

const HANGUL_BASE = 0xac00;
const HANGUL_END = 0xd7a3;

// 초성 19 (인덱스 11 = ㅇ, 음가 없음)
const CHO_ROM = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
// 중성 21 — '의'는 발음이 [ㅣ]로 나도 규정상 ui로 적는다
const JUNG_ROM = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];

// 종성 28 → 대표음 그룹(7종성). 음운 규칙은 이 그룹으로 판단한다.
type Coda = '' | 'k' | 'n' | 't' | 'l' | 'm' | 'p' | 'ng';
const JONG_SOUND: Coda[] = [
  '', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l',
  'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't',
];
// 종성 → 뒤 음절이 ㅇ으로 시작할 때 넘어가는 초성 인덱스(-1 = 넘기지 않음/탈락)
const JONG_TO_CHO: number[] = [
  -1, 0, 1, 9, 2, 12, -1, 3, 5, 0, 6, 7, 9, 16, 17, -1,
  6, 7, 9, 9, 10, -1, 12, 14, 15, 16, 17, -1,
];
// 겹받침이 연음될 때 앞 음절에 남는 종성 인덱스(0 = 없음)
const JONG_REMAIN: number[] = [
  0, 0, 0, 1, 0, 4, 4, 0, 0, 8, 8, 8, 8, 8, 8, 8,
  0, 0, 17, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];
// ㅎ을 품은 종성(ㅎ·ㄶ·ㅀ) — 뒤 예사소리를 거센소리로 만든다
const CODA_HAS_H = new Set([6, 15, 27]);
// 격음화 대상 초성: ㄱ→ㅋ, ㄷ→ㅌ, ㅂ→ㅍ, ㅈ→ㅊ
const ASPIRATE: Record<number, number> = { 0: 15, 3: 16, 7: 17, 12: 14 };

interface Syl { cho: number; jung: number; jong: number }

function decompose(ch: string): Syl | null {
  const code = ch.charCodeAt(0);
  if (code < HANGUL_BASE || code > HANGUL_END) return null;
  const n = code - HANGUL_BASE;
  return { cho: Math.floor(n / 588), jung: Math.floor((n % 588) / 28), jong: n % 28 };
}

/**
 * 음운 변화를 적용한다. aspirate=false면 격음화를 건너뛴다 — 부탁하다를
 * butakada(축약)로도 butakhada(표기 유지)로도 적는 관행이 둘 다 통용되기 때문이다.
 */
function applyPhonology(sylsIn: Syl[], aspirate: boolean): Syl[] {
  const s = sylsIn.map(x => ({ ...x }));
  for (let i = 0; i < s.length - 1; i++) {
    const cur = s[i], next = s[i + 1];

    // 격음화: 종성 ㄱ/ㄷ/ㅂ/ㅈ + 초성 ㅎ → 거센소리, 그리고 종성 ㅎ + 예사소리
    if (aspirate) {
      if (next.cho === 18 && ASPIRATE[jongAsCho(cur.jong)] !== undefined) {
        next.cho = ASPIRATE[jongAsCho(cur.jong)];
        cur.jong = JONG_REMAIN[cur.jong];
        continue;
      }
      if (CODA_HAS_H.has(cur.jong) && ASPIRATE[next.cho] !== undefined) {
        next.cho = ASPIRATE[next.cho];
        cur.jong = JONG_REMAIN[cur.jong];
        continue;
      }
    }
    // 구개음화: 종성 ㄷ/ㅌ + '이' → 지/치 (같이 → 가치, 굳이 → 구지).
    // 연음보다 먼저 봐야 한다 — 연음으로 넘겨 버리면 gati가 되어 정답 gachi를 오탐한다.
    if ((cur.jong === 7 || cur.jong === 25) && next.cho === 11 && next.jung === 20) {
      next.cho = cur.jong === 7 ? 12 : 14;   // ㄷ→ㅈ, ㅌ→ㅊ
      cur.jong = 0;
      continue;
    }
    // ㅎ 종성은 뒤에 모음이 오면 탈락 (쌓이다 → 싸이다)
    if (CODA_HAS_H.has(cur.jong) && next.cho === 11) {
      const remain = JONG_REMAIN[cur.jong];
      cur.jong = remain;
      if (remain !== 0) { next.cho = JONG_TO_CHO[remain]; cur.jong = 0; }
      continue;
    }
    // 연음: 종성(ㅇ 제외) + 초성 ㅇ → 종성이 다음 초성으로
    if (cur.jong !== 0 && cur.jong !== 21 && next.cho === 11) {
      const moved = JONG_TO_CHO[cur.jong];
      if (moved >= 0) { next.cho = moved; cur.jong = JONG_REMAIN[cur.jong]; }
      continue;
    }
    const coda = JONG_SOUND[cur.jong];
    // 유음화: ㄴ+ㄹ → ㄹㄹ (관람 → 괄람), ㄹ+ㄴ → ㄹㄹ (설날 → 설랄)
    if (coda === 'n' && next.cho === 5) { cur.jong = 8; continue; }
    if (coda === 'l' && next.cho === 2) { next.cho = 5; continue; }
    // 비음화: 폐쇄음 + ㄴ/ㅁ → 같은 자리 비음 (박물관 → 방물관)
    if (next.cho === 2 || next.cho === 6) {
      if (coda === 'k') { cur.jong = 21; continue; }
      if (coda === 't') { cur.jong = 4; continue; }
      if (coda === 'p') { cur.jong = 16; continue; }
    }
    // 폐쇄음/비음 + ㄹ → ㄹ이 ㄴ으로, 앞은 비음화 (독립 → 동닙)
    if (next.cho === 5) {
      if (coda === 'k') { cur.jong = 21; next.cho = 2; continue; }
      if (coda === 'p') { cur.jong = 16; next.cho = 2; continue; }
      if (coda === 'm' || coda === 'ng') { next.cho = 2; continue; }
    }
  }
  return s;
}

// 종성 인덱스를 '초성 자리 인덱스'로 환산 (격음화 판정용).
// 대표음 기준이라 ㅅ·ㅆ·ㅈ·ㅊ·ㅌ은 모두 ㄷ 자리로 본다 — 따뜻해지다 [따뜨태지다]처럼
// ㅅ 받침도 뒤 ㅎ과 만나면 거센소리가 된다.
function jongAsCho(jong: number): number {
  const map: Record<number, number> = {
    1: 0, 2: 1, 9: 0, 24: 0,          // ㄱ 계열
    7: 3, 19: 3, 20: 3, 22: 3, 23: 3, 25: 3,  // ㄷ 계열(ㅅ·ㅆ·ㅈ·ㅊ·ㅌ 포함)
    17: 7, 18: 7, 26: 7,              // ㅂ 계열
  };
  return map[jong] ?? -1;
}

function render(syls: Syl[]): string {
  let out = '';
  for (let i = 0; i < syls.length; i++) {
    const s = syls[i];
    // ㄹㄹ은 'll'로 적는다(설날 seollal, 물론 mullon). ㄹ의 기본 음가는 r이라
    // 그대로 두면 'lr'이 되어 유음화 결과가 어긋난다.
    const prevCoda = i > 0 ? JONG_SOUND[syls[i - 1].jong] : '';
    const cho = (s.cho === 5 && prevCoda === 'l') ? 'l' : CHO_ROM[s.cho];
    out += cho + JUNG_ROM[s.jung] + (s.jong ? JONG_SOUND[s.jong] : '');
  }
  return out;
}

/** 비교용 정규화: 붙임표·공백·대소문자 차이는 오류로 보지 않는다. */
export function normalizeRomaja(s: string): string {
  return s.toLowerCase().replace(/[-\s'’.]/g, '');
}

/**
 * 허용 가능한 로마자 후보들을 돌려준다. 격음화 반영/미반영 두 갈래를 모두 포함한다.
 * 어절이 여럿이면 어절 단위로 변환해 이어 붙인다.
 */
export function romanizeCandidates(hangul: string): string[] {
  const words = hangul.trim().split(/\s+/).filter(Boolean);
  const perWord = words.map(word => {
    const syls: Syl[] = [];
    for (const ch of word) {
      const d = decompose(ch);
      if (!d) return null;          // 한글이 아닌 글자가 섞이면 판정을 포기한다
      syls.push(d);
    }
    if (!syls.length) return null;
    const cands = [render(applyPhonology(syls, true)), render(applyPhonology(syls, false))];
    // 반복형 의성어·의태어(오싹오싹, 아삭아삭)는 단위를 끊어 적는 관행이 있다.
    // 이어 읽으면 연음이 일어나 ossagossak이 되지만 카드에는 ossak-ossak으로 적는
    // 편이 학습자에게 읽히므로, 앞뒤 절반이 같으면 절반씩 변환한 형태도 후보에 넣는다.
    const half = syls.length / 2;
    if (Number.isInteger(half) && half > 0) {
      const a = syls.slice(0, half), b = syls.slice(half);
      if (a.every((s, i) => s.cho === b[i].cho && s.jung === b[i].jung && s.jong === b[i].jong)) {
        const one = render(applyPhonology(a, true));
        cands.push(one + one);
      }
    }
    return cands;
  });
  if (perWord.some(w => w === null)) return [];

  // 표제어는 거의 한 어절이므로 그때는 후보를 전부 쓰고, 여러 어절이면 후보가
  // 곱으로 불어나는 걸 막아 격음화 on/off 두 갈래만 이어 붙인다.
  const base = perWord.length === 1
    ? [...new Set(perWord[0]!)]
    : [...new Set([perWord.map(w => w![0]).join(''), perWord.map(w => w![1]).join('')])];
  // 같은 자음이 셋 이상 겹치는 자리(색깔 saek+kkal = saekkkal)는 표기 관행이 갈린다.
  // 규정 논리로는 겹쳐 적는 쪽이 맞지만 축약형도 흔히 쓰이므로 둘 다 후보로 둔다.
  return [...new Set(base.flatMap(c => [c, c.replace(/([a-z])\1{2,}/g, '$1$1')]))];
}

/**
 * AI가 낸 로마자가 후보 중 하나와 맞는지 확인.
 * 판정 불가(한글 외 문자 포함 등)면 null을 돌려 호출부가 건너뛰게 한다.
 */
export function checkRomaja(hangul: string, romaja: string): { ok: boolean; expected: string[] } | null {
  const cands = romanizeCandidates(hangul);
  if (!cands.length) return null;
  const got = normalizeRomaja(romaja);
  return { ok: cands.some(c => normalizeRomaja(c) === got), expected: cands };
}
