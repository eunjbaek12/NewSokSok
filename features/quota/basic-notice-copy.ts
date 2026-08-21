import { hasRewardViewsRemaining } from './reward-eligibility';
import type { QuotaStatus } from './store';

/**
 * 자동완성이 뜻만 채워 돌아왔을 때(enrichment_level: 'basic') 단어 추가 화면이 띄우는 안내.
 *
 * 이유를 단정해도 되는 근거: basic 은 서버의 한도 초과 분기 안에서만 나간다
 * (supabase/functions/enrich-word/index.ts:193). 캐시 히트는 full 일 때만 히트로 치므로
 * (:231) "캐시라서 뜻만 왔다" 같은 다른 사유가 섞일 수 없다. 배너가 보인다 = 한도를 다
 * 썼다, 예외 없음. 예전 문구는 "기본 뜻만 불러왔어요"로 결과만 말하고 이유를 빼놨는데,
 * 그러면 사용자에게는 AI 가 일을 덜 한 것으로 보인다.
 *
 * 🔴 판정을 순수 함수로 빼 두는 이유: 보상형 모달이 같은 판정을 제목·본문·버튼 세 곳에서
 * 각자 계산하다 제목만 분기를 빠뜨린 적이 있고, JSX 삼항 안이라 테스트로 잡히지 않았다
 * (rewarded-copy.ts 주석). 이 배너는 그 모달로 이어지는 화면이라 같은 실수를 반복하기
 * 딱 좋은 자리다 — 배너가 "광고 보고"라고 말했으면 뒤이어 뜨는 모달의 버튼도 광고여야
 * 한다. 두 함수의 정합은 __tests__/basic-notice-copy.test.ts 가 교차로 고정한다.
 */
export type BasicNoticeCopy = {
  /** 안내 문장. */
  textKey: string;
  /** 액션 문구. null 이면 누를 것이 없다. */
  actionKey: string | null;
  /**
   * 액션의 성격. 'pro' 도 곧장 요금제로 보내지 않고 보상형 모달을 거친다 — 그 모달에만
   * "한국 시간 자정에 광고 횟수가 초기화된다"는 안내가 있어서, 건너뛰면 결제가 유일한
   * 길인 것처럼 보인다.
   */
  action: 'watchAd' | 'pro' | null;
};

export function pickBasicNoticeCopy(status: QuotaStatus | null | undefined): BasicNoticeCopy {
  // Pro 는 일일 제한이 없다(day_limit = month_limit = 3,000). 그래서 여기 온 Pro 는 월 풀을
  // 비운 것이고, "오늘 한도를 다 썼다"고 쓰면 거짓이 된다. 광고 보상도 Free·게스트 전용이라
  // 풀 방법이 없으므로 누를 것을 주지 않고, 대신 언제 돌아오는지를 문장에 담는다.
  if (status?.tier === 'pro') {
    return { textKey: 'addWord.basicQuotaExceededPro', actionKey: null, action: null };
  }

  // ⚠️ `!!status &&` 를 빼면 안 된다 — hasRewardViewsRemaining(null) 은 false 라서 부정하면
  //    status 가 아직 안 온 사용자가 광고 소진으로 잘못 분류된다(rewarded-copy.ts:39 와 같은 이유).
  const adsExhausted = !!status && !hasRewardViewsRemaining(status);
  return adsExhausted
    ? { textKey: 'addWord.basicQuotaExceeded', actionKey: 'addWord.basicProAction', action: 'pro' }
    : { textKey: 'addWord.basicQuotaExceeded', actionKey: 'addWord.basicWatchAdAction', action: 'watchAd' };
}
