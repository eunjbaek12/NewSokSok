// 자동완성이 뜻만 채워 왔을 때(enrichment_level: 'basic') 단어 추가 화면에 뜨는 안내.
//
// 이 배너는 탭하면 보상형 광고 모달로 이어진다 — 즉 같은 상태를 두 함수가 각각 문구로
// 옮긴다. 예전에 그 모달 안에서 제목·본문·버튼이 판정을 따로 계산하다 서로 모순되는
// 화면이 나갔으므로(rewarded-copy.ts 주석), 여기서는 배너와 모달의 정합을 교차로 고정한다.

import { pickBasicNoticeCopy } from '@/features/quota/basic-notice-copy';
import { pickRewardedCopy } from '@/features/quota/rewarded-copy';
import type { QuotaStatus } from '@/features/quota/store';
import ko from '@/i18n/locales/ko.json';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';

const status = (overrides: Partial<QuotaStatus> = {}): QuotaStatus => ({
  tier: 'free', used: 50, limit: 50, bonus: 0,
  trial_ends_at: null, pro_until: null, reset_at: new Date().toISOString(),
  reward_views: 0, reward_max_views: 2,
  ...overrides,
});

describe('pickBasicNoticeCopy', () => {
  it('광고가 남았으면 광고를 권한다', () => {
    expect(pickBasicNoticeCopy(status({ reward_views: 1 }))).toEqual({
      textKey: 'addWord.basicQuotaExceeded',
      actionKey: 'addWord.basicWatchAdAction',
      action: 'watchAd',
    });
  });

  it('광고를 다 봤으면 Pro 로 보낸다', () => {
    expect(pickBasicNoticeCopy(status({ reward_views: 2 }))).toEqual({
      textKey: 'addWord.basicQuotaExceeded',
      actionKey: 'addWord.basicProAction',
      action: 'pro',
    });
  });

  it('게스트도 자기 상한(1회)을 기준으로 갈린다', () => {
    const guest = (views: number) => status({ tier: 'guest', limit: 10, used: 10, reward_views: views, reward_max_views: 1 });
    expect(pickBasicNoticeCopy(guest(0)).action).toBe('watchAd');
    expect(pickBasicNoticeCopy(guest(1)).action).toBe('pro');
  });

  // 🔴 Pro 는 일일 제한이 없다(day_limit = month_limit = 3,000). 여기 온 Pro 는 월 풀을
  //    비운 것이라 "오늘"이라고 쓰면 거짓이고, 광고로 풀 방법도 없어 누를 것을 주지 않는다.
  it('Pro 는 이번 달 문구를 쓰고 누를 것을 주지 않는다', () => {
    const c = pickBasicNoticeCopy(status({ tier: 'pro', used: 0, limit: 3000, month_used: 3000, month_limit: 3000 }));
    expect(c).toEqual({
      textKey: 'addWord.basicQuotaExceededPro',
      actionKey: null,
      action: null,
    });
    expect(c.textKey).not.toBe('addWord.basicQuotaExceeded');
  });

  it('status 가 아직 없으면 광고 소진으로 오해하지 않는다', () => {
    expect(pickBasicNoticeCopy(null).action).toBe('watchAd');
    expect(pickBasicNoticeCopy(undefined).action).toBe('watchAd');
  });

  // 배너가 "광고 보고"라고 말했는데 탭해서 뜬 모달의 버튼이 Pro 면(또는 그 반대면)
  // 사용자는 자기가 뭘 눌렀는지 알 수 없다. 두 함수는 같은 축으로 갈려야 한다.
  it('배너의 액션과 뒤이어 뜨는 모달의 버튼이 어긋나지 않는다', () => {
    for (const views of [0, 1, 2]) {
      const s = status({ reward_views: views, reward_max_views: 2 });
      const banner = pickBasicNoticeCopy(s);
      const modal = pickRewardedCopy(s, null);
      expect(`views=${views} banner=${banner.action}`).toBe(`views=${views} banner=${modal.cta === 'watch' ? 'watchAd' : 'pro'}`);
    }
  });

  it('쓰는 키가 ko/en/es 에 모두 있다', () => {
    const keys = new Set<string>();
    for (const s of [status({ reward_views: 0 }), status({ reward_views: 2 }), status({ tier: 'pro' })]) {
      const c = pickBasicNoticeCopy(s);
      keys.add(c.textKey);
      if (c.actionKey) keys.add(c.actionKey);
    }
    const get = (o: unknown, p: string) =>
      p.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown>)?.[k], o);
    for (const key of keys) {
      for (const [name, dict] of [['ko', ko], ['en', en], ['es', es]] as const) {
        expect(`${name}:${key}=${get(dict, key) ?? 'MISSING'}`).not.toContain('MISSING');
      }
    }
  });

  it('없앤 옛 키가 어디에도 남아 있지 않다', () => {
    for (const dict of [ko, en, es]) {
      const addWord = (dict as { addWord: Record<string, unknown> }).addWord;
      expect(addWord.basicMeaningLoaded).toBeUndefined();
      expect(addWord.enrichWithAi).toBeUndefined();
    }
  });
});
