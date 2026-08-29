/**
 * 고르기 화면 → 단어장 화면으로 "이것들을 채워라"를 넘기는 자리.
 *
 * 라우터 파라미터를 쓰지 않는 이유: `router.back()` 뒤의 `setParams` 는 어느 화면에 붙는지
 * 보장되지 않고, 수백 개의 id 를 URL 에 실으면 길이 제한에 걸린다. 화면 하나가 화면 하나에게
 * 한 번 건네는 값이라 모듈 변수로 충분하다 — 저장할 이유도, 동기화할 이유도 없다.
 *
 * take() 는 **읽으면서 비운다.** 남겨 두면 다음에 그 화면에 들어갈 때 또 채우기가 시작된다.
 */

let pending: string[] | null = null;

export function setPendingFill(ids: string[]): void {
  pending = ids.length > 0 ? ids : null;
}

export function takePendingFill(): string[] | null {
  const v = pending;
  pending = null;
  return v;
}
