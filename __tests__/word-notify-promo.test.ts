/**
 * 홈 «단어 알림» 권유 카드 — 띄울지 말지(docs/word-notifications-design.md §10).
 *
 * 이 규칙은 화면에 안 보이는 조합이 많아(거절한 사람·다 외운 사람) 실기로는 잘 안 밟힌다.
 */
import type { VocaList, Word } from '../lib/types';
import {
  shouldShowWordNotifyPromo,
  declinedReviewPrompt,
  countSendableWords,
  WORD_NOTIF_PROMO_MIN_WORDS,
} from '@/features/study/word-notifications/promo';
import { WordNotificationSettingsSchema } from '../shared/contracts';

function word(id: string, extra: Partial<Word> = {}): Word {
  return {
    id,
    term: id,
    definition: '',
    exampleEn: '',
    meaningKr: `뜻-${id}`,
    isMemorized: false,
    isStarred: false,
    tags: [],
    ...extra,
  };
}

function list(id: string, words: Word[], extra: Partial<VocaList> = {}): VocaList {
  return { id, title: id, words, isVisible: true, createdAt: 0, ...extra };
}

const words = (n: number, prefix: string, extra: Partial<Word> = {}) =>
  Array.from({ length: n }, (_, i) => word(`${prefix}${i}`, extra));

const learning = WordNotificationSettingsSchema.parse({});

const wordNotifOff = { enabled: false, promoDismissed: false };
/** 복습 권유를 아직 안 본 사람 — 학습을 한 번도 안 한 사람이 여기 있다. */
const reviewUnasked = { softAsked: false, enabled: false };
const reviewAccepted = { softAsked: true, enabled: true };
/** «나중에» 또는 시스템 창 거절 — 둘 다 같은 모양이 된다. */
const reviewDeclined = { softAsked: true, enabled: false };

const enough = WORD_NOTIF_PROMO_MIN_WORDS;

describe('countSendableWords — 앱 전체에서 센다', () => {
  it('여러 단어장에 흩어져 있어도 합쳐서 센다', () => {
    // 실기(2026-09-18)에서 나온 모양 그대로: 마지막에 공부한 단어장은 1개뿐인데
    // 앱 전체로는 17개였다. 단어장 하나로 세면 카드가 영영 안 뜬다.
    const lists = [
      list('샘플', [...words(2, 's', { isMemorized: true }), word('s2')]),
      list('의료', [...words(25, 'm', { isMemorized: true }), ...words(5, 'u')]),
      list('맞춤법', words(4, 'k')),
      list('스페인어', words(7, 'e')),
    ];
    expect(countSendableWords(lists, learning)).toBe(1 + 5 + 4 + 7);
  });

  it('숨긴 단어장은 빼고 센다 — 알림이 애초에 거기서 보내지 않는다', () => {
    const lists = [
      list('보임', words(6, 'a')),
      list('숨김', words(30, 'b'), { isVisible: false }),
    ];
    expect(countSendableWords(lists, learning)).toBe(6);
  });

  it('조건을 따른다 — 다 외운 단어장은 «미암기»로 0이다', () => {
    const lists = [list('다외움', words(40, 'z', { isMemorized: true }))];
    expect(countSendableWords(lists, learning)).toBe(0);
    expect(countSendableWords(lists, { ...learning, wordFilter: 'memorized' })).toBe(40);
  });

  it('단어장이 없으면 0', () => {
    expect(countSendableWords([], learning)).toBe(0);
  });
});

describe('declinedReviewPrompt', () => {
  it('아직 안 물어본 사람은 거절이 아니다', () => {
    expect(declinedReviewPrompt(reviewUnasked)).toBe(false);
  });

  it('켠 사람은 거절이 아니다', () => {
    expect(declinedReviewPrompt(reviewAccepted)).toBe(false);
  });

  it('물어봤는데 안 켜진 상태가 거절이다', () => {
    expect(declinedReviewPrompt(reviewDeclined)).toBe(true);
  });
});

describe('shouldShowWordNotifyPromo', () => {
  it('아직 안 켰고 · 안 닫았고 · 거절한 적 없고 · 단어가 넉넉하면 띄운다', () => {
    expect(
      shouldShowWordNotifyPromo({ wordNotif: wordNotifOff, review: reviewUnasked, sendableCount: enough }),
    ).toBe(true);
  });

  it('복습 알림을 켠 사람에게도 띄운다 — 다른 기능이다', () => {
    expect(
      shouldShowWordNotifyPromo({ wordNotif: wordNotifOff, review: reviewAccepted, sendableCount: enough }),
    ).toBe(true);
  });

  it('이미 단어 알림을 켠 사람에게는 안 띄운다', () => {
    expect(
      shouldShowWordNotifyPromo({
        wordNotif: { enabled: true, promoDismissed: false },
        review: reviewUnasked,
        sendableCount: enough,
      }),
    ).toBe(false);
  });

  it('한 번 닫으면 다시 안 띄운다', () => {
    expect(
      shouldShowWordNotifyPromo({
        wordNotif: { enabled: false, promoDismissed: true },
        review: reviewUnasked,
        sendableCount: enough,
      }),
    ).toBe(false);
  });

  it('복습 알림 권유를 거절한 사람에게는 안 띄운다 — 조르지 않는다', () => {
    expect(
      shouldShowWordNotifyPromo({ wordNotif: wordNotifOff, review: reviewDeclined, sendableCount: enough }),
    ).toBe(false);
  });

  it('보낼 단어가 상한에 하나 모자라면 안 띄운다', () => {
    expect(
      shouldShowWordNotifyPromo({ wordNotif: wordNotifOff, review: reviewUnasked, sendableCount: enough - 1 }),
    ).toBe(false);
  });

  it('보낼 단어가 0이면 안 띄운다 — 500개를 다 외운 사람이 여기 온다', () => {
    expect(
      shouldShowWordNotifyPromo({ wordNotif: wordNotifOff, review: reviewUnasked, sendableCount: 0 }),
    ).toBe(false);
  });

  it('닫힌 조건이 여럿 겹쳐도 안 띄운다', () => {
    expect(
      shouldShowWordNotifyPromo({
        wordNotif: { enabled: true, promoDismissed: true },
        review: reviewDeclined,
        sendableCount: 0,
      }),
    ).toBe(false);
  });
});
