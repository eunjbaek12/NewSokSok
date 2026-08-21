/**
 * Google Generative Language API 의 429 응답에서 **어떤 한도**에 걸렸는지 가려낸다.
 *
 * 왜 가려야 하나: 분당 한도는 1분이면 풀리고 일일 한도는 하루가 지나야 풀린다. 뭉뚱그려
 * "사용량을 모두 썼어요"라고 안내하면 분당 한도에 걸린 사용자가 오늘은 끝났다고 읽는다.
 *
 * BYOK(사용자 자기 키) 경로 전용이다 — 운영자 키(Edge)는 서버가 `quota_exceeded` /
 * `rate_limited` 를 따로 돌려주므로 이 함수를 거치지 않는다.
 *
 * 🔑 판정을 **각 호출부가 따로 정규식으로 하지 않는다.** 예전에는 AI 단어 생성에만 있었고
 * 사진 스캔은 429 를 구분조차 하지 않아, 같은 상황에 두 화면이 다른 안내를 했다.
 */
export type GeminiQuotaKind = 'perDay' | 'perMinute' | 'other';

interface QuotaViolation {
  quotaMetric?: string;
  quotaId?: string;
}

/**
 * 429 본문의 첫 QuotaFailure 위반 항목. 형식이 다르면 undefined.
 *
 * 실제 응답(2026-08-17 실측):
 * ```
 * quotaId    : GenerateRequestsPerDayPerProjectPerModel-FreeTier
 * quotaMetric: generativelanguage.googleapis.com/generate_content_free_tier_requests
 * quotaValue : 20
 * ```
 */
function firstQuotaViolation(error: unknown): QuotaViolation | undefined {
  const details = (error as { details?: unknown })?.details;
  if (!Array.isArray(details)) return undefined;
  const quotaFailure = details.find(
    (d) => typeof (d as { '@type'?: unknown })?.['@type'] === 'string'
      && ((d as { '@type': string })['@type']).includes('QuotaFailure'),
  ) as { violations?: unknown } | undefined;
  const violations = quotaFailure?.violations;
  if (!Array.isArray(violations) || violations.length === 0) return undefined;
  const v = violations[0] as QuotaViolation;
  return typeof v === 'object' && v !== null ? v : undefined;
}

/**
 * 진단 로그용 metric 문자열(없으면 빈 문자열).
 * ⚠️ 주기(일/분) 판정에는 쓸 수 없다 — 아래 classify 주석 참고.
 */
export function quotaMetricOf(error: unknown): string {
  const metric = firstQuotaViolation(error)?.quotaMetric;
  return typeof metric === 'string' ? metric : '';
}

/**
 * @param error 429 응답 본문의 `error` 객체(`JSON.parse(body).error`). 파싱 실패·형식
 *              불일치는 전부 `'other'` 로 떨어진다 — 판정이 안 되면 보수적인 공통 안내를 쓴다.
 *
 * 🔴 **`quotaMetric` 만 보면 안 된다.** 실측한 일일 한도 응답의 metric 은
 * `.../generate_content_free_tier_requests` 로 **주기가 들어 있지 않고**, 주기는
 * `quotaId`(`GenerateRequestsPerDayPerProjectPerModel-FreeTier`)에 있다. metric 만 검사하던
 * 옛 코드는 그래서 일일/분당을 한 번도 가려내지 못하고 전부 기타로 떨어뜨렸다.
 * 둘 다 이어 붙여 검사한다 — 어느 쪽에 들어오든 잡힌다.
 */
export function classifyGeminiQuotaError(error: unknown): GeminiQuotaKind {
  const v = firstQuotaViolation(error);
  const haystack = `${v?.quotaId ?? ''} ${v?.quotaMetric ?? ''}`;
  if (/per_?day/i.test(haystack)) return 'perDay';
  if (/per_?minute/i.test(haystack)) return 'perMinute';
  return 'other';
}
