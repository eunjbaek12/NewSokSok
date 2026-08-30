// "뜻만 있는 단어" 판정과 배너 재등장 규칙 테스트.
//
// 회귀 방지 대상 둘:
//
// 1) 판정이 AND 여야 한다. OR 로 새면 "예문만 없는 정상 단어"까지 대상이 되어 174개가
//    수천 개가 되고, 채워도 안 채워지는 칸을 계속 두드리게 된다.
//
// 2) 🔴 reconcileCount 를 빼면 배너가 **영영 안 돌아온다** — 174에서 닫고, 채우고,
//    다시 174가 돼도 `174 > 174`가 거짓이기 때문이다. 이 회귀는 화면으로 보이지 않는다
//    (며칠 뒤 "왜 안 뜨지"가 될 뿐이다). 그래서 docs/fill-bare-words-spec.md §6 표를
//    그대로 시나리오로 옮겨 못박는다.

import type { Word } from '../lib/types';
import { isBareWord, bareWordsOldestFirst, countBareWords, splitBareWords } from '../features/bare-words/detect';
import {
  shouldShowBanner,
  reconcileCount,
  afterDismiss,
  afterSnooze,
  consumeSnooze,
  type BareNoticeEntry,
} from '../features/bare-words/notice';

function word(partial: Partial<Word> & { term: string }): Word {
  return {
    id: partial.term,
    definition: '',
    exampleEn: '',
    meaningKr: '뜻',
    isMemorized: false,
    isStarred: false,
    tags: [],
    ...partial,
  };
}

describe('isBareWord — 뜻은 있고 나머지 셋이 모두 빈 것만', () => {
  it('한도 소진으로 뜻만 채워진 단어를 잡는다', () => {
    expect(isBareWord(word({ term: 'bewildering', meaningKr: '당혹스러운' }))).toBe(true);
  });

  it('발음만 있어도 대상이 아니다 — 조건은 AND 다', () => {
    expect(isBareWord(word({ term: 'candid', phonetic: 'ˈkændɪd' }))).toBe(false);
  });

  it('예문만 있어도 대상이 아니다', () => {
    expect(isBareWord(word({ term: 'frugal', exampleEn: 'He is frugal.' }))).toBe(false);
  });

  it('영영뜻만 있어도 대상이 아니다', () => {
    expect(isBareWord(word({ term: 'hamper', definition: 'to hinder' }))).toBe(false);
  });

  it('뜻조차 없으면 대상이 아니다 — 채우다 만 것이 아니라 아직 아무것도 아닌 것', () => {
    expect(isBareWord(word({ term: 'empty', meaningKr: '' }))).toBe(false);
  });

  it('공백뿐인 칸은 빈 것으로 본다', () => {
    expect(isBareWord(word({ term: 'spaces', meaningKr: '뜻', phonetic: '   ' }))).toBe(true);
    expect(isBareWord(word({ term: 'blank', meaningKr: '  ' }))).toBe(false);
  });

  it('undefined 인 선택 필드를 빈 것으로 다룬다', () => {
    const w = word({ term: 'x', meaningKr: '뜻' });
    delete (w as Partial<Word>).phonetic;
    expect(isBareWord(w)).toBe(true);
  });
});

describe('bareWordsOldestFirst — 오래 담아둔 것부터', () => {
  // 🔑 순서가 규칙의 일부다. 방금 담은 것부터 채우면 한도가 매번 새 단어에 쓰여
  // 먼저 밀린 것들이 영영 뒤로 간다.
  it('createdAt 오름차순으로 돌려주고 대상 아닌 것은 뺀다', () => {
    const words = [
      word({ term: 'new', meaningKr: '새', createdAt: 300 }),
      word({ term: 'full', meaningKr: '완', phonetic: 'f', exampleEn: 'e', definition: 'd', createdAt: 200 }),
      word({ term: 'old', meaningKr: '옛', createdAt: 100 }),
    ];
    expect(bareWordsOldestFirst(words).map(w => w.term)).toEqual(['old', 'new']);
  });

  it('createdAt 이 없는 옛 단어가 맨 앞에 선다', () => {
    const words = [
      word({ term: 'dated', meaningKr: '뜻', createdAt: 100 }),
      word({ term: 'undated', meaningKr: '뜻' }),
    ];
    expect(bareWordsOldestFirst(words).map(w => w.term)).toEqual(['undated', 'dated']);
  });

  it('countBareWords 는 같은 판정을 센다', () => {
    const words = [
      word({ term: 'a', meaningKr: '뜻' }),
      word({ term: 'b', meaningKr: '뜻', phonetic: 'p' }),
      word({ term: 'c', meaningKr: '뜻' }),
    ];
    expect(countBareWords(words)).toBe(2);
  });
});

describe('배너 재등장 — docs/fill-bare-words-spec.md §6 표 그대로', () => {
  const TODAY = '2026-08-29';
  const TOMORROW = '2026-08-30';

  it('저장값이 없으면 뜬다 (처음)', () => {
    expect(shouldShowBanner(undefined, 174, TODAY)).toBe(true);
  });

  it('대상이 0이면 저장값과 무관하게 안 뜬다', () => {
    expect(shouldShowBanner(undefined, 0, TODAY)).toBe(false);
    expect(shouldShowBanner({ count: 5 }, 0, TODAY)).toBe(false);
    expect(shouldShowBanner({ count: 5, snoozeUntil: TODAY }, 0, TODAY)).toBe(false);
  });

  it('174개일 때 ✕ → 안 뜸', () => {
    const entry = afterDismiss(174);
    expect(entry).toEqual({ count: 174 });
    expect(shouldShowBanner(entry, 174, TODAY)).toBe(false);
  });

  it('50개를 채움 → count 가 124로 낮아지고 여전히 안 뜸', () => {
    const dismissed = afterDismiss(174);
    const reconciled = reconcileCount(dismissed, 124);
    expect(reconciled).toEqual({ count: 124 });
    expect(shouldShowBanner(reconciled, 124, TODAY)).toBe(false);
  });

  it('한도 끝에서 "내일 이어서" → 오늘은 안 뜨고 내일 뜬다 (단어가 안 늘어도)', () => {
    const snoozed = afterSnooze(124, TOMORROW);
    expect(shouldShowBanner(snoozed, 124, TODAY)).toBe(false);
    expect(shouldShowBanner(snoozed, 124, TOMORROW)).toBe(true);
  });

  it('그 배너에서 ✕ → 스누즈가 지워지고 개수 규칙으로 복귀', () => {
    const snoozed = afterSnooze(124, TOMORROW);
    const dismissed = afterDismiss(124);
    expect(dismissed.snoozeUntil).toBeUndefined();
    expect(shouldShowBanner(snoozed, 124, TOMORROW)).toBe(true);
    expect(shouldShowBanner(dismissed, 124, TOMORROW)).toBe(false);
  });

  it('또 한도를 넘겨 담음(124 → 210) → 뜬다', () => {
    expect(shouldShowBanner({ count: 124 }, 210, TODAY)).toBe(true);
  });

  it('전부 채움 → 안 뜬다', () => {
    expect(shouldShowBanner(reconcileCount({ count: 124 }, 0), 0, TODAY)).toBe(false);
  });
});

describe('reconcileCount — 이 한 줄이 없으면 배너가 영영 안 돌아온다', () => {
  it('현재값이 더 작으면 저장값을 낮춘다', () => {
    expect(reconcileCount({ count: 174 }, 124)).toEqual({ count: 124 });
  });

  it('현재값이 더 크면 그대로 둔다 — 늘어난 것은 "다시 부를 이유"지 새 기준이 아니다', () => {
    const entry: BareNoticeEntry = { count: 124 };
    expect(reconcileCount(entry, 210)).toBe(entry);
  });

  it('스누즈 약속은 낮추면서도 유지한다', () => {
    expect(reconcileCount({ count: 174, snoozeUntil: '2026-08-30' }, 124))
      .toEqual({ count: 124, snoozeUntil: '2026-08-30' });
  });

  it('저장값이 없으면 만들지 않는다 — 닫은 적 없는 단어장에 상태를 남길 이유가 없다', () => {
    expect(reconcileCount(undefined, 124)).toBeUndefined();
  });

  it('🔴 낮추지 않으면 채운 뒤 다시 늘어도 배너가 안 뜬다', () => {
    // 174에서 닫음 → 50개 채움(124) → 다시 50개를 한도 넘겨 담음(174).
    const dismissed = afterDismiss(174);

    // 낮추지 않은 경우: 174 > 174 가 거짓이라 안 뜬다.
    expect(shouldShowBanner(dismissed, 174, '2026-08-30')).toBe(false);

    // 낮춘 경우: 124 를 기준으로 174 가 늘어난 것이 되어 뜬다.
    const reconciled = reconcileCount(dismissed, 124);
    expect(shouldShowBanner(reconciled, 174, '2026-08-30')).toBe(true);
  });
});

describe('consumeSnooze — "내일 한 번"이 "그날부터 영영"이 되지 않게', () => {
  it('스누즈로 뜬 뒤 약속을 지운다', () => {
    const after = consumeSnooze({ count: 124, snoozeUntil: '2026-08-30' });
    expect(after).toEqual({ count: 124 });
  });

  it('소비하지 않으면 이튿날에도 계속 뜬다', () => {
    const snoozed = afterSnooze(124, '2026-08-30');
    expect(shouldShowBanner(snoozed, 124, '2026-08-31')).toBe(true);
    expect(shouldShowBanner(consumeSnooze(snoozed), 124, '2026-08-31')).toBe(false);
  });

  it('스누즈가 없으면 그대로 둔다', () => {
    const entry: BareNoticeEntry = { count: 124 };
    expect(consumeSnooze(entry)).toBe(entry);
    expect(consumeSnooze(undefined)).toBeUndefined();
  });
});

describe('splitBareWords — 못 찾은 단어는 대상에서 빠지고 순서는 유지된다', () => {
  // 🔴 안 빼면 순서가 오래된 것부터라 **매 배치의 맨 앞을 영구히 차지한다** — 잔량이
  // 5인데 앞의 5개가 그런 단어면 사용자는 누를 때마다 0개를 받는다.
  const words = [
    word({ term: 'old-bad', meaningKr: '뜻', createdAt: 100 }),
    word({ term: 'mid-ok', meaningKr: '뜻', createdAt: 200 }),
    word({ term: 'new-bad', meaningKr: '뜻', createdAt: 300 }),
    word({ term: 'new-ok', meaningKr: '뜻', createdAt: 400 }),
  ];
  const bad = new Set(['old-bad', 'new-bad']);

  it('채울 수 있는 것만, 오래된 것부터 돌려준다', () => {
    expect(splitBareWords(words, bad).fillable.map(w => w.term)).toEqual(['mid-ok', 'new-ok']);
  });

  it('못 찾은 것도 오래된 것부터 따로 돌려준다 — 화면이 아래에 모아 보여준다', () => {
    expect(splitBareWords(words, bad).unfillable.map(w => w.term)).toEqual(['old-bad', 'new-bad']);
  });

  it('🔴 가장 오래된 것이 못 찾은 단어여도 그 뒤가 앞으로 나온다', () => {
    // 이 규칙이 없으면 old-bad 가 영원히 1번 자리를 지켜 mid-ok 가 채워지지 않는다.
    expect(splitBareWords(words, bad).fillable[0].term).toBe('mid-ok');
  });

  it('표시가 없으면 전부 채울 수 있는 것으로 본다', () => {
    expect(splitBareWords(words, new Set()).fillable).toHaveLength(4);
    expect(splitBareWords(words, new Set()).unfillable).toHaveLength(0);
  });

  it('반쪽이 아닌 단어는 어느 쪽에도 안 들어간다', () => {
    const full = word({ term: 'full', meaningKr: '뜻', phonetic: 'p', exampleEn: 'e', definition: 'd' });
    const r = splitBareWords([...words, full], bad);
    expect([...r.fillable, ...r.unfillable].map(w => w.term)).not.toContain('full');
  });
});
