// 「저장됨」 배지 — 이 덱을 이미 내 단어장으로 가져왔는가.
//
// 가져온 단어장에는 원본 id 가 남지 않아 제목으로 판정한다. 예전에는 `startsWith` 라서
// 「토익」 덱이 「토익 필수 600」을 가져온 사람에게도 저장됨으로 떴다. 가져올 때 이름이 겹치면
// `getUniqueName`(screen.tsx)이 「제목-1」「제목-2」를 붙이므로, **같은 제목이거나 그 꼴일 때만**
// 가져온 것으로 본다.
//
// 원본 id 로 판정하는 길(`sourceThemeId`)은 docs/share-to-friend-spec.md §4.3 이 계획해 두었다.
// 그게 들어오면 이 함수는 그 값이 없는 옛 단어장에만 쓰인다.

const normalize = (s: string) => s.trim().toLowerCase();

export function isSavedCopyOf(listTitle: string, themeTitle: string): boolean {
  const list = normalize(listTitle);
  const theme = normalize(themeTitle);
  if (!theme) return false;
  if (list === theme) return true;
  if (!list.startsWith(theme + '-')) return false;
  return /^\d+$/.test(list.slice(theme.length + 1));
}

/**
 * 담을 때 붙일 이름. 같은 제목이 있으면 「제목-1」「제목-2」로 비켜 간다.
 *
 * 🔑 **`isSavedCopyOf` 와 같은 규칙의 반대쪽이다.** 이름을 만드는 쪽과 「담았는가」를 읽는
 * 쪽이 떨어져 있으면 규칙이 조용히 갈라진다 — 한쪽이 「제목 (2)」로 바뀌는 순간 저장됨
 * 배지가 영영 안 뜬다. 그래서 두 함수를 한 파일에 둔다.
 */
export function getUniqueName(base: string, existingNames: string[]): string {
  const lowerNames = existingNames.map(n => n.trim().toLowerCase());
  let candidate = base;
  let suffix = 1;
  while (lowerNames.includes(candidate.trim().toLowerCase())) {
    candidate = `${base}-${suffix}`;
    suffix++;
  }
  return candidate;
}

/**
 * 같은 단어를 한 단어장에 두 번 넣지 않는다. words 테이블의
 * (listId, LOWER(TRIM(term))) UNIQUE 인덱스에 걸리므로 INSERT 직전에 결정론적으로 거른다.
 */
export function dedupeByTerm<T extends { term?: string }>(words: T[]): T[] {
  const seen = new Set<string>();
  return words.filter(w => {
    const key = (w.term ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
