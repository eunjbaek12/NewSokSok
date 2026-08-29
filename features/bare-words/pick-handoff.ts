/**
 * 고르기 화면 → 단어장 화면으로 "이것들을 채워라"를 넘기는 자리.
 *
 * 라우터 파라미터를 쓰지 않는 이유: `router.back()` 뒤의 `setParams` 는 어느 화면에 붙는지
 * 보장되지 않고, 수백 개의 id 를 URL 에 실으면 길이 제한에 걸린다. 화면 하나가 화면 하나에게
 * 한 번 건네는 값이라 모듈 변수로 충분하다 — 저장할 이유도, 동기화할 이유도 없다.
 *
 * 🔴 **단어장 id 로 잠근다.** 잠그지 않으면 A 단어장을 위해 넣어 둔 값을 B 단어장이 먼저
 * 열리면서 가져간다. id 가 안 맞아 실제로 채워지는 단어는 없지만(그쪽 단어 목록에 없으니
 * 걸러진다) **값은 소비돼 사라져** A 로 돌아가도 아무 일이 일어나지 않는다 — 사용자가 고른
 * 수고가 조용히 증발한다.
 *
 * take() 는 **읽으면서 비운다.** 남겨 두면 다음에 그 화면에 들어갈 때 또 채우기가 시작된다.
 */

let pending: { listId: string; ids: string[] } | null = null;

export function setPendingFill(listId: string, ids: string[]): void {
  pending = ids.length > 0 ? { listId, ids } : null;
}

/** 이 단어장 몫이 있으면 돌려주면서 비운다. 남의 것이면 건드리지 않는다. */
export function takePendingFill(listId: string): string[] | null {
  if (pending?.listId !== listId) return null;
  const v = pending.ids;
  pending = null;
  return v;
}
