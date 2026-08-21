import { classifyGeminiQuotaError, quotaMetricOf } from '@/lib/ai/gemini-quota';

/**
 * 429 의 주기(일/분) 판정. 분당 한도는 1분이면 풀리므로 일일 한도와 같은 안내를 하면
 * "오늘은 끝났다"로 읽힌다 — 두 화면(AI 단어 생성·사진 스캔)이 이 함수 하나를 공유한다.
 *
 * 🔴 이 테스트가 있는 이유: 옛 코드는 `quotaMetric` 만 검사했는데 **실제 응답의 metric 에는
 * 주기가 들어 있지 않다.** 아래 REAL_DAILY_429 는 2026-08-17 에 실제로 받은 본문이다.
 */

// 실측 본문(2026-08-17, gemini-2.5-flash-lite 무료 티어 일일 한도 소진)
const REAL_DAILY_429 = {
  code: 429,
  status: 'RESOURCE_EXHAUSTED',
  details: [
    {
      '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
      violations: [
        {
          quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
          quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
          quotaValue: '20',
        },
      ],
    },
    { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '29s' },
  ],
};

const perMinute429 = {
  details: [
    {
      '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
      violations: [
        {
          quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
          quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier',
        },
      ],
    },
  ],
};

describe('Gemini 429 한도 주기 판정', () => {
  it('실측 일일 한도 응답을 perDay 로 가려낸다 — metric 이 아니라 quotaId 에 주기가 있다', () => {
    expect(classifyGeminiQuotaError(REAL_DAILY_429)).toBe('perDay');
    // metric 만 봤다면 못 잡았을 것이라는 사실 자체를 고정한다.
    expect(/per_?day/i.test(quotaMetricOf(REAL_DAILY_429))).toBe(false);
  });

  it('분당 한도를 perMinute 로 가려낸다', () => {
    expect(classifyGeminiQuotaError(perMinute429)).toBe('perMinute');
  });

  it('주기가 metric 쪽에만 있어도 잡는다 — 응답 형식이 바뀌어도 한쪽만 보지 않는다', () => {
    const metricOnly = {
      details: [{
        '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
        violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_requests_per_minute' }],
      }],
    };
    expect(classifyGeminiQuotaError(metricOnly)).toBe('perMinute');
  });

  it('판정할 수 없으면 other 로 떨어진다 — 틀린 안내보다 공통 안내가 낫다', () => {
    expect(classifyGeminiQuotaError(undefined)).toBe('other');
    expect(classifyGeminiQuotaError(null)).toBe('other');
    expect(classifyGeminiQuotaError({})).toBe('other');
    expect(classifyGeminiQuotaError({ details: 'not-an-array' })).toBe('other');
    expect(classifyGeminiQuotaError({ details: [] })).toBe('other');
    expect(classifyGeminiQuotaError({
      details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '29s' }],
    })).toBe('other');
    expect(classifyGeminiQuotaError({
      details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [] }],
    })).toBe('other');
  });

  it('quotaMetricOf 는 진단 로그용 문자열을 그대로 준다', () => {
    expect(quotaMetricOf(REAL_DAILY_429))
      .toBe('generativelanguage.googleapis.com/generate_content_free_tier_requests');
    expect(quotaMetricOf({})).toBe('');
  });
});
