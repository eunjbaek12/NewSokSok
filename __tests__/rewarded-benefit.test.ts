import { hasRewardViewsRemaining, isAiQuotaExhausted } from '@/features/quota/reward-eligibility';
import { pickRewardedCopy } from '@/features/quota/rewarded-copy';
import type { QuotaStatus } from '@/features/quota/store';
import ko from '@/i18n/locales/ko.json';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';

const status = (overrides: Partial<QuotaStatus> = {}): QuotaStatus => ({
  tier: 'free', used: 0, limit: 50, bonus: 0,
  trial_ends_at: null, pro_until: null, reset_at: new Date().toISOString(),
  ...overrides,
});

describe('isAiQuotaExhausted', () => {
  it('distinguishes a proactive benefit prompt from an actual quota block', () => {
    expect(isAiQuotaExhausted(status({ used: 12, limit: 50, bonus: 0 }))).toBe(false);
    expect(isAiQuotaExhausted(status({ used: 50, limit: 50, bonus: 0 }))).toBe(true);
    expect(isAiQuotaExhausted(status({ used: 60, limit: 50, bonus: 20 }))).toBe(false);
    expect(isAiQuotaExhausted(status({ used: 70, limit: 50, bonus: 20 }))).toBe(true);
  });
});

describe('hasRewardViewsRemaining', () => {
  it('does not treat a legacy or partially loaded status as exhausted', () => {
    expect(hasRewardViewsRemaining(status())).toBe(true);
  });

  it('allows free and guest users while their server-owned view count remains', () => {
    expect(hasRewardViewsRemaining(status({ reward_views: 1, reward_max_views: 2 }))).toBe(true);
    expect(hasRewardViewsRemaining(status({ tier: 'guest', reward_views: 0, reward_max_views: 1 }))).toBe(true);
  });

  it('blocks exhausted and Pro users', () => {
    expect(hasRewardViewsRemaining(status({ reward_views: 2, reward_max_views: 2 }))).toBe(false);
    expect(hasRewardViewsRemaining(status({ tier: 'pro', reward_views: 0, reward_max_views: 0 }))).toBe(false);
  });
});

describe('pickRewardedCopy', () => {
  // 광고를 다 본 상태 = reward_views 가 상한에 닿음.
  const ads = (views: number) => ({ reward_views: views, reward_max_views: 2 });

  // A: 잔량 0, 광고 남음 — 광고로 풀 수 있다
  it('A: 한도를 다 썼고 광고가 남았으면 광고를 권한다', () => {
    const c = pickRewardedCopy(status({ used: 50, limit: 50, bonus: 0, ...ads(0) }), null);
    expect(c).toEqual({
      titleKey: 'ads.rewardedTitle', bodyKey: 'ads.rewardedBody',
      cta: 'watch', icon: 'play-circle',
    });
  });

  // B: 잔량 0, 광고도 소진 — 제목은 잔량을 말하고 버튼은 Pro
  it('B: 한도와 광고를 모두 소진하면 Pro 로 보낸다', () => {
    const c = pickRewardedCopy(status({ used: 90, limit: 50, bonus: 40, ...ads(2) }), null);
    expect(c).toEqual({
      titleKey: 'ads.rewardedTitle', bodyKey: 'ads.rewardedExhausted',
      cta: 'pro', icon: 'sparkles',
    });
  });

  // C: 잔량 있음, 광고 남음 — 선제 안내
  it('C: 아직 여유가 있으면 혜택 안내를 보여준다', () => {
    const c = pickRewardedCopy(status({ used: 10, limit: 50, bonus: 0, ...ads(0) }), null);
    expect(c).toEqual({
      titleKey: 'ads.rewardedBenefitTitle', bodyKey: 'ads.rewardedBenefitBody',
      cta: 'watch', icon: 'play-circle',
    });
  });

  // D: 🔴 실제로 나갔던 버그 — 제목만 광고 소진을 못 봐서 "광고 보고 혜택 받기" 아래
  //    "광고를 다 봤어요" 본문과 Pro 버튼이 함께 나왔다.
  it('D: 광고를 다 봤지만 잔량이 남아 있으면 광고를 권하지 않는다', () => {
    const c = pickRewardedCopy(status({ used: 85, limit: 50, bonus: 40, ...ads(2) }), null);
    expect(c).toEqual({
      titleKey: 'ads.rewardedShortTitle', bodyKey: 'ads.rewardedExhausted',
      cta: 'pro', icon: 'sparkles',
    });
    expect(c.titleKey).not.toBe('ads.rewardedBenefitTitle');
  });

  it('보상 직후 화면이 모든 조합보다 우선한다', () => {
    const c = pickRewardedCopy(status({ used: 85, limit: 50, bonus: 40, ...ads(2) }), 20);
    expect(c.titleKey).toBe('ads.rewardedGrantedTitle');
    expect(c.cta).toBe('none');
  });

  // 광고를 1회 본 직후에는 남은 1회(+20단어)까지 말해야 한다 — 설정 화면에도 같은 구멍이
  // 있었다(features/quota/ad-benefit-copy.ts 주석). 지급 직후 status 는 refreshQuota 를
  // await 한 뒤라 최신이므로(useRewardedAd) reward_views 를 그대로 믿어도 된다.
  it('보상 직후 광고가 남았으면 한 번 더 볼 수 있다고 말한다', () => {
    expect(pickRewardedCopy(status({ ...ads(1) }), 20).bodyKey).toBe('ads.rewardedGrantedBodyMore');
    expect(pickRewardedCopy(status({ ...ads(2) }), 20).bodyKey).toBe('ads.rewardedGrantedBody');
    expect(pickRewardedCopy(status({ tier: 'guest', reward_views: 1, reward_max_views: 1 }), 10).bodyKey)
      .toBe('ads.rewardedGrantedBody');
  });

  // 🔑 hasRewardViewsRemaining 은 카운터가 없으면 true 를 준다(옛 응답을 막지 않으려고).
  //    성공 화면에서 그 true 를 쓰면 **못 받을 보상을 약속**하는 거짓이 된다.
  it('카운터가 없는 응답에는 한 번 더 볼 수 있다고 약속하지 않는다', () => {
    expect(pickRewardedCopy(status(), 20).bodyKey).toBe('ads.rewardedGrantedBody');
    expect(pickRewardedCopy(null, 20).bodyKey).toBe('ads.rewardedGrantedBody');
  });

  it('status 가 아직 없으면 광고 소진으로 오해하지 않는다', () => {
    expect(pickRewardedCopy(null, null).cta).toBe('watch');
    expect(pickRewardedCopy(undefined, null).titleKey).toBe('ads.rewardedBenefitTitle');
  });

  // 버튼이 Pro 로 가는 자리에서 제목이 광고 시청을 권하면 안 된다 —
  // 세 요소가 서로 모순되던 것이 이 버그의 본체였다.
  it('Pro 로 보내는 조합의 제목은 광고 시청을 권하지 않는다', () => {
    for (const used of [85, 90]) {
      const c = pickRewardedCopy(status({ used, limit: 50, bonus: 40, ...ads(2) }), null);
      expect(c.cta).toBe('pro');
      expect(c.titleKey).not.toBe('ads.rewardedBenefitTitle');
    }
  });

  it('쓰는 키가 ko/en/es 에 모두 있다', () => {
    const combos: [number, number][] = [[50, 0], [90, 2], [10, 0], [85, 2]];
    const keys = new Set<string>();
    for (const [used, views] of combos) {
      const c = pickRewardedCopy(status({ used, limit: 50, bonus: 40, ...ads(views) }), null);
      keys.add(c.titleKey); keys.add(c.bodyKey);
    }
    keys.add(pickRewardedCopy(status(), 20).titleKey);
    const get = (o: unknown, p: string) =>
      p.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown>)?.[k], o);
    for (const key of keys) {
      for (const [name, dict] of [['ko', ko], ['en', en], ['es', es]] as const) {
        expect(`${name}:${key}=${get(dict, key) ?? 'MISSING'}`).not.toContain('MISSING');
      }
    }
  });
});
