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
