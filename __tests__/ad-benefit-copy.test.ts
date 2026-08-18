// 설정 화면의 "광고 보고 혜택 받기" 줄.
//
// 🔴 이 줄은 제목과 부제가 **각자 `ad_free_until` 한 축만** 보고 있었다. 그래서 광고를
// 1회만 본 사용자에게는 "광고 없이 학습 중 / ~까지"만 뜨고 남은 1회(+20단어)가 어디에도
// 안 보였다 — 받을 수 있는 것을 모른 채 지나간다. 같은 화면의 다른 판정 복제가 어떤
// 화면을 내보냈는지는 rewarded-copy.ts 주석에 있다.
//
// 여기서 고정하는 것: 두 축(배너 상태 × 남은 횟수)의 네 조합이 각각 무엇을 말하는지,
// 그리고 **횟수를 말하는 문구는 횟수를 알 때만 나간다**는 것.

import { pickAdBenefitCopy } from '@/features/quota/ad-benefit-copy';
import { hasRewardViewsRemaining } from '@/features/quota/reward-eligibility';
import type { QuotaStatus } from '@/features/quota/store';
import ko from '@/i18n/locales/ko.json';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';

const NOW = Date.parse('2026-08-18T05:00:00Z');
const LATER = new Date(NOW + 20 * 3600_000).toISOString();
const EARLIER = new Date(NOW - 3600_000).toISOString();

const status = (overrides: Partial<QuotaStatus> = {}): QuotaStatus => ({
  tier: 'free', used: 30, limit: 50, bonus: 0,
  trial_ends_at: null, pro_until: null, reset_at: new Date(NOW).toISOString(),
  reward_views: 0, reward_max_views: 2,
  ...overrides,
});

describe('pickAdBenefitCopy', () => {
  // A — 아직 안 봤다. 무엇을 받는지만 말하면 된다.
  it('A: 시청 전에는 받을 혜택을 말하고 누를 수 있다', () => {
    expect(pickAdBenefitCopy(status({ reward_views: 0 }), NOW)).toEqual({
      titleKey: 'settings.adBenefitTitle',
      subtitleKeys: ['settings.adBenefitDesc'],
      pressable: true,
    });
  });

  // B — 🔴 원래 깨져 있던 자리. 배너가 사라진 상태만 말하고 남은 1회를 덮었다.
  it('B: 1회 보고 1회 남았으면 남은 혜택까지 말한다', () => {
    const c = pickAdBenefitCopy(status({ ad_free_until: LATER, reward_views: 1 }), NOW)!;
    expect(c).toEqual({
      titleKey: 'settings.adBenefitActive',
      subtitleKeys: ['settings.adBenefitUntil', 'settings.adBenefitMore'],
      pressable: true,
    });
    // 이 조합에서 부제가 시각 하나로 끝나면 예전 버그로 되돌아간 것이다.
    expect(c.subtitleKeys).toHaveLength(2);
  });

  // C — 배너는 없지만 더 받을 것도 없다. 눌러도 소용없으니 누를 것을 주지 않는다.
  it('C: 다 봤으면 오늘 혜택이 끝났다고 말하고 누를 수 없다', () => {
    expect(pickAdBenefitCopy(status({ ad_free_until: LATER, reward_views: 2 }), NOW)).toEqual({
      titleKey: 'settings.adBenefitActive',
      subtitleKeys: ['settings.adBenefitUntil', 'settings.adBenefitDone'],
      pressable: false,
    });
  });

  // D — 정상 경로로는 오지 않는다(자정 초기화가 24h 만료보다 먼저다). 그래도 비워 두면
  //     A 로 떨어져 "광고 보고 혜택 받기"라고 써 놓고 눌리지 않는 화면이 된다.
  it('D: 배너 제거가 없는데 광고도 소진이면 제목이 거짓말하지 않는다', () => {
    const c = pickAdBenefitCopy(status({ reward_views: 2 }), NOW);
    expect(c).toEqual({
      titleKey: 'settings.adBenefitAllUsed',
      subtitleKeys: ['settings.adBenefitResets'],
      pressable: false,
    });
    expect(c!.titleKey).not.toBe('settings.adBenefitTitle');
  });

  it('만료된 ad_free_until 은 배너가 없는 쪽으로 센다', () => {
    expect(pickAdBenefitCopy(status({ ad_free_until: EARLIER, reward_views: 1 }), NOW)!.titleKey)
      .toBe('settings.adBenefitTitle');
    expect(pickAdBenefitCopy(status({ ad_free_until: null, reward_views: 1 }), NOW)!.titleKey)
      .toBe('settings.adBenefitTitle');
  });

  it('게스트도 자기 상한(1회)을 기준으로 갈린다', () => {
    const guest = (views: number) =>
      status({ tier: 'guest', limit: 10, reward_amount: 10, reward_views: views, reward_max_views: 1, ad_free_until: LATER });
    expect(pickAdBenefitCopy(guest(0), NOW)!.pressable).toBe(true);
    expect(pickAdBenefitCopy(guest(1), NOW)).toEqual({
      titleKey: 'settings.adBenefitActive',
      subtitleKeys: ['settings.adBenefitUntil', 'settings.adBenefitDone'],
      pressable: false,
    });
  });

  it('Pro 와 status 없음에는 이 줄 자체가 없다', () => {
    expect(pickAdBenefitCopy(status({ tier: 'pro' }), NOW)).toBeNull();
    expect(pickAdBenefitCopy(null, NOW)).toBeNull();
    expect(pickAdBenefitCopy(undefined, NOW)).toBeNull();
  });

  // 🔑 "한 번 더"는 정확히 1회 남았다고 **알 때만** 쓴다. 카운터가 안 온 옛 응답에
  //    hasRewardViewsRemaining 은 true 를 주는데, 그 true 를 "한 번 남았다"로 읽으면
  //    못 받을 보상을 약속하게 된다.
  it('카운터가 없는 응답에는 횟수를 말하지 않는다', () => {
    const legacy = status({ ad_free_until: LATER, reward_views: undefined, reward_max_views: undefined });
    const c = pickAdBenefitCopy(legacy, NOW)!;
    expect(c.pressable).toBe(true);
    expect(c.subtitleKeys).not.toContain('settings.adBenefitMore');
  });

  // 상한은 서버가 정한다. 2회를 앱에 박아 두면 서버가 3회로 늘리는 날 문구가 거짓이 된다.
  it('2회 넘게 남으면 "한 번 더"라고 하지 않는다', () => {
    const c = pickAdBenefitCopy(
      status({ ad_free_until: LATER, reward_views: 1, reward_max_views: 3 }),
      NOW,
    )!;
    expect(c.subtitleKeys).not.toContain('settings.adBenefitMore');
    expect(c.pressable).toBe(true);
  });

  // 누를 수 있다 = 오늘 볼 광고가 남았다. 이 줄은 탭하면 보상형 광고 모달을 여는데,
  // 광고가 없는데 열리면 모달이 곧장 "다 봤어요 / Pro" 화면으로 떨어진다.
  it('누를 수 있는지가 남은 광고 횟수와 어긋나지 않는다', () => {
    for (const views of [0, 1, 2]) {
      for (const adFree of [null, LATER]) {
        const s = status({ reward_views: views, ad_free_until: adFree });
        const c = pickAdBenefitCopy(s, NOW)!;
        expect(`views=${views} adFree=${!!adFree} pressable=${c.pressable}`)
          .toBe(`views=${views} adFree=${!!adFree} pressable=${hasRewardViewsRemaining(s)}`);
      }
    }
  });

  it('쓰는 키가 ko/en/es 에 모두 있다', () => {
    const keys = new Set<string>();
    for (const views of [0, 1, 2]) {
      for (const adFree of [null, LATER]) {
        const c = pickAdBenefitCopy(status({ reward_views: views, ad_free_until: adFree }), NOW)!;
        keys.add(c.titleKey);
        c.subtitleKeys.forEach((k) => keys.add(k));
      }
    }
    expect(keys.size).toBeGreaterThanOrEqual(6);
    const get = (o: unknown, p: string) =>
      p.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown>)?.[k], o);
    for (const key of keys) {
      for (const [name, dict] of [['ko', ko], ['en', en], ['es', es]] as const) {
        expect(`${name}:${key}=${get(dict, key) ?? 'MISSING'}`).not.toContain('MISSING');
      }
    }
  });

  // 부제 조각은 화면에서 ' · ' 로 이어 한 줄이 된다. 시각이 들어가는 조각과 혜택 조각의
  // 자리가 바뀌면 "한 번 더 보면 +20단어 · 내일 오후 2:20까지"가 되어 읽는 순서가 깨진다.
  it('시각 조각이 항상 앞에 온다', () => {
    for (const views of [0, 1, 2]) {
      const c = pickAdBenefitCopy(status({ reward_views: views, ad_free_until: LATER }), NOW)!;
      expect(c.subtitleKeys[0]).toBe('settings.adBenefitUntil');
    }
  });
});
