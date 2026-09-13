// 공유 단어장 탭이 비어 보일 때, 그 이유가 무엇인지 하나로 정한다.
//
// 예전에는 이유가 셋이어도 화면은 하나였다 — 목록 요청 실패·아무도 안 올림·칩 때문에 0개가
// 모두 🔍「검색 결과가 없습니다」였다. 검색어가 없는데도 «검색 결과»라고 했다.
//
// 🔑 판정을 JSX 삼항에 흩지 않고 여기서 값으로 만든다 — 한쪽만 고쳐 서로 어긋나는 걸 막는다
//    (screen.tsx 의 showMeaningLangEmpty 와 같은 이유).

export type CommunityEmptyReason =
  /** 목록을 한 번도 못 받았다 → 공식 탭과 같은 [다시 시도]. */
  | 'failed'
  /** 올라온 게 하나도 없다 → 목록 끝의 «내 단어장도 올려 보세요» 박스가 첫 화면이 된다. */
  | 'none'
  /** 배울 언어 칩 때문에 0개다 → 무엇이 없는지 말하고 [전체 보기]. */
  | 'chip'
  /** 검색어 때문에 0개다 → 「검색 결과가 없습니다」. */
  | 'search';

export function pickCommunityEmpty(input: {
  failed: boolean;
  /** 서버에서 받은 공유 덱 전체 수(필터 전). */
  total: number;
  /** 검색어·칩을 거친 뒤 남은 수. */
  visible: number;
  searchQuery: string;
  languageFilter: string;
}): CommunityEmptyReason | null {
  const { failed, total, visible, searchQuery, languageFilter } = input;
  // 받아 둔 목록이 있으면 새로 받기가 실패해도 그대로 보여 준다 — 실패 화면은 «빈 손»일 때만.
  if (failed && total === 0) return 'failed';
  if (total === 0) return 'none';
  if (visible > 0) return null;
  // 검색어가 있으면 검색이 이유다. 칩까지 걸려 있어도 검색어부터 지우는 게 맞다.
  if (searchQuery.trim().length > 0) return 'search';
  if (languageFilter !== 'all') return 'chip';
  // 검색어도 칩도 없는데 0개인 경우는 없다(total > 0). 방어적으로 검색 문구.
  return 'search';
}
