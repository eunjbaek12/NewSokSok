/**
 * 취소를 알리는 에러 — `name === 'AbortError'`.
 *
 * 🔴 `new DOMException('Aborted', 'AbortError')` 를 쓰면 안 된다. **Hermes 에는
 * DOMException 전역이 없다**(브라우저 전용). 그 자리에서 `ReferenceError: Property
 * 'DOMException' doesn't exist` 가 나는데, 하필 그 자리가 abort 리스너 안이라
 * reject 가 일어나지 않고 예외만 새 나간다 — 취소가 조용히 실패하고, 위에서
 * `e?.name === 'AbortError'` 로 갈라 놓은 분기(lib/enrich-queue-core.ts:59,
 * lib/ai/edge-*.ts, features/curation/screen.tsx …)가 전부 빗나간다.
 *
 * 실기에서 "뜻만 남은 단어 채우기"의 [중단] 을 누르자 개발 빌드에 빨간 배너로 드러났고,
 * 같은 경로를 단어 검색 취소·일괄 추가 취소·사진 스캔 취소가 함께 쓴다.
 */
export function abortError(message = 'Aborted'): Error {
  const e = new Error(message);
  e.name = 'AbortError';
  return e;
}
