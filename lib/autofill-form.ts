// 자동완성이 폼에 써넣는 칸들과, 그중 "앞 단어의 잔재"를 가려내는 순수 로직.
//
// 왜 있나(2026-08-21 실기): AI 한도를 다 쓰면 서버는 뜻만 싣고 온다
// (`enrichment_level: 'basic'`). 폼 반영은 값이 있는 칸만 덮으므로, 한도가 소진된 뒤
// 다른 단어를 검색하면 **앞 단어의 발음기호·예문이 그대로 남았다.** `nimble` 을 검색했는데
// 발음기호가 `kiːn`, 예문이 `keen` 의 ①②③ 인 카드가 만들어졌고, 칸이 채워져 있으니
// 사용자가 알아채기도 어렵다.
//
// 판정을 훅 밖으로 뺀 이유는 이 규칙에 예외가 세 개나 붙어서다 — 같은 단어 재검색(광고
// 보상 뒤 재시도·"상세 채우기")은 지우면 안 되고, 사용자가 직접 고친 값과 편집 중인 단어가
// 원래 갖고 있던 값도 건드리면 안 된다. 셋 다 테스트로 못 박아 둔다.

/** 자동완성이 채우는 칸. term·tags·isStarred는 대상이 아니다. */
export const AUTOFILL_FIELDS = ['definition', 'meaningKr', 'phonetic', 'pos', 'exampleEn', 'exampleKr'] as const;

export type AutoFillField = (typeof AUTOFILL_FIELDS)[number];
export type AutoFillFields = Partial<Record<AutoFillField, string>>;

/** 자동완성이 마지막으로 써넣은 값과 그때의 표제어. 아직 채운 적이 없으면 null. */
export interface LastAutoFill {
  term: string;
  fields: AutoFillFields;
}

/**
 * 새 검색 결과를 반영하기 **직전에** 비워야 할 칸을 고른다.
 *
 * @param last     자동완성이 마지막으로 써넣은 값(없으면 null)
 * @param current  지금 폼에 들어 있는 값
 * @param nextTerm 이번에 검색한 표제어
 *
 * 규칙은 하나다: **표제어가 바뀐 검색에서, 우리가 쓴 값이 손대지 않은 채 남아 있는 칸**만
 * 비운다. 그래서
 *   - 같은 표제어 재검색 → 아무것도 안 지운다(보상 광고 뒤 재시도가 여기 걸린다).
 *   - 사용자가 고친 칸 → 값이 달라졌으므로 안 지운다.
 *   - `last`가 null(편집 화면의 첫 검색) → 원래 있던 값을 우리가 쓴 적이 없으므로 안 지운다.
 */
export function staleAutoFillKeys(
  last: LastAutoFill | null,
  current: AutoFillFields,
  nextTerm: string,
): AutoFillField[] {
  if (!last || last.term === nextTerm) return [];
  return AUTOFILL_FIELDS.filter(key => {
    const written = last.fields[key];
    // 빈 값으로 기록된 칸은 우리가 채운 적이 없는 것이다 — 지울 것도 없다.
    if (!written) return false;
    return current[key] === written;
  });
}
