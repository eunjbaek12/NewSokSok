// 품사(POS) 필터 공용 로직.
//
// word.pos는 소스별 형식이 제각각인 자유 텍스트다("verb", "noun, verb",
// "dependent noun", 빈값, 심지어 "classifier"·비영어 값 등). 그래서 원본을
// 그대로 비교하지 않고 정규 카테고리에 토큰 startsWith 부분일치로 매핑한다.
//
// 큐레이션 12,873개 pos를 실측하면 명·동·형·부가 96%. 전치사·접속사·한정사 등
// 기능어 품사는 개별로는 극소수이고 학습자가 품사별로 몰아 외우는 대상도 아니다.
// 따라서 필터는 내용어 4종 + 구 + 기타(그 외 전부)로 축소한다.
export const POS_FILTER_KEYS = ['noun', 'verb', 'adjective', 'adverb', 'phrase'] as const;
export type PosFilterKey = (typeof POS_FILTER_KEYS)[number];

// 필터 값 = 'all'(전체) | PosFilterKey | 'other'(기타)
export const POS_ALL = 'all';
export const POS_OTHER = 'other';
export type PosFilter = typeof POS_ALL | PosFilterKey | typeof POS_OTHER;

const MATCH: Record<PosFilterKey, string[]> = {
  noun: ['noun'],
  verb: ['verb'],
  // AI 생성 프롬프트가 한동안 'adj'/'adv' 약어를 예시로 줘서 그대로 저장된
  // 데이터가 존재한다 — 접두사 루트로 완화해 약어·전체 단어를 모두 잡는다
  // ("adjective"·"adverb"도 startsWith로 매칭됨).
  adjective: ['adj'],
  adverb: ['adv'],
  phrase: ['phrase', 'idiom', 'expression'],
};

// pos 문자열 → 매칭되는 필터 카테고리 키 배열.
// 토큰 단위 startsWith로 "pronoun"이 "noun"에 오분류되는 것을 막는다
// ("noun, verb" 같은 다중값은 noun·verb 둘 다 매칭).
export function posCategoriesOf(pos?: string): PosFilterKey[] {
  if (!pos) return [];
  const tokens = pos.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const out: PosFilterKey[] = [];
  for (const key of POS_FILTER_KEYS) {
    if (MATCH[key].some(root => tokens.some(t => t.startsWith(root)))) out.push(key);
  }
  return out;
}

// 단어가 주어진 필터에 부합하는가. 축소 카테고리에 안 걸리는 단어(기능어·빈값·
// 비표준 pos)는 전부 'other'로 모인다.
export function matchesPosFilter(pos: string | undefined, filter: PosFilter): boolean {
  if (filter === POS_ALL) return true;
  const cats = posCategoriesOf(pos);
  if (filter === POS_OTHER) return cats.length === 0;
  return (cats as string[]).includes(filter);
}

// 단어 집합에 실제로 존재하는 카테고리만 추린다(칩 노출용). 'other' 존재 여부 포함.
export function presentPosCategories(
  words: { pos?: string }[],
): { keys: PosFilterKey[]; hasOther: boolean } {
  const present = new Set<PosFilterKey>();
  let hasOther = false;
  for (const w of words) {
    const cats = posCategoriesOf(w.pos);
    if (cats.length === 0) hasOther = true;
    else cats.forEach(c => present.add(c));
  }
  return { keys: POS_FILTER_KEYS.filter(k => present.has(k)), hasOther };
}
