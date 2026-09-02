/**
 * 예문 학습이 「예문 없는 단어」를 채울 때의 세 판정 — 대상·세는 법·광고 개수.
 *
 * 셋 다 **틀려도 화면은 멀쩡해 보인다**는 공통점이 있다:
 *   - 대상: 「12개」라고 알린 뒤 4개만 채워진다(두 집합이 28% 어긋난다).
 *   - 세는 법: 발음만 채워진 단어를 1로 세면 「12개를 채웠어요」가 거짓이 된다.
 *   - 광고 개수: 남은 한도 + 보상을 넘는 수를 약속하면 **못 받을 보상을 약속**한 것이다.
 *     이 저장소는 이미 한 번 그렇게 틀렸다(hasRewardViewsRemaining 로 횟수를 말한 건).
 *
 * 설계는 docs/example-study-consent-spec.md.
 */
import { isBareWord, needsExample, splitFillTargets } from '@/features/bare-words/detect';
import { fillableUpdates, countsExampleFilled } from '@/features/bare-words/merge';
import { pickAdFillOffer } from '@/features/bare-words/ad-offer';
import type { Word } from '@/lib/types';

const word = (over: Partial<Word>): Word => ({
  id: over.term ?? 'id',
  term: 'x',
  meaningKr: '뜻',
  createdAt: 0,
  ...over,
} as Word);

describe('needsExample — 예문 학습이 채워야 하는 대상', () => {
  it('예문만 없으면 대상이다 — 발음·정의가 있어도', () => {
    const w = word({ term: 'frugal', phonetic: 'ˈfruːɡ(ə)l', definition: 'sparing' });
    expect(needsExample(w)).toBe(true);
    // 🔴 여기가 갈라지는 자리다. 기존 채우기는 이 단어를 대상으로 보지 않는다(조건이 AND).
    // 실측 460행(예문 없는 단어 1,672 중 28%)이 이 모양이라, 그대로 쓰면 개수가 거짓이 된다.
    expect(isBareWord(w)).toBe(false);
  });

  it('예문이 있으면 대상이 아니다 — 나머지가 비어 있어도', () => {
    expect(needsExample(word({ term: 'apple', exampleEn: 'She ate an apple.' }))).toBe(false);
  });

  it('공백뿐인 예문은 없는 것으로 본다', () => {
    expect(needsExample(word({ term: 'blank', exampleEn: '   ' }))).toBe(true);
  });

  it('뜻이 없어도 대상이다 — 예문 학습이 묻는 것은 예문 하나다', () => {
    expect(needsExample(word({ term: 'raw', meaningKr: '' }))).toBe(true);
  });
});

describe('splitFillTargets — 대상만 갈아 끼우고 나머지 규칙은 한 벌', () => {
  const words = [
    word({ id: 'a', term: 'old-missing', createdAt: 1 }),
    word({ id: 'b', term: 'has-example', createdAt: 2, exampleEn: 'He is here.' }),
    word({ id: 'c', term: 'new-missing', createdAt: 3, phonetic: 'x' }),
    word({ id: 'd', term: 'unknown', createdAt: 0 }),
  ];

  it('오래 담아둔 것부터 돌려준다', () => {
    const out = splitFillTargets(words, new Set(), needsExample);
    expect(out.fillable.map(w => w.id)).toEqual(['d', 'a', 'c']);
  });

  it('AI 가 못 찾은 단어는 대상에서 빠진다 — 안 빼면 맨 앞을 영구히 차지한다', () => {
    const out = splitFillTargets(words, new Set(['d']), needsExample);
    expect(out.fillable.map(w => w.id)).toEqual(['a', 'c']);
    expect(out.unfillable.map(w => w.id)).toEqual(['d']);
  });

  it('선택자를 안 주면 기존 대상(뜻만 있는 단어)이다', () => {
    // c 는 발음이 있어 isBareWord 가 아니다 — 기본 선택자로는 안 잡힌다.
    expect(splitFillTargets(words, new Set()).fillable.map(w => w.id)).toEqual(['d', 'a']);
  });
});

describe('countsExampleFilled — 예문이 채워진 것만 센다', () => {
  const AI = {
    phonetic: 'ˈæpəl',
    exampleEn: 'She ate an apple.',
    exampleKr: '그녀는 사과를 먹었다.',
    definition: 'a round fruit',
    pos: 'noun',
  };

  it('예문이 왔으면 1이다', () => {
    const target = { phonetic: '', exampleEn: '', exampleKr: '', definition: '', pos: '' };
    expect(countsExampleFilled(fillableUpdates(target, AI))).toBe(true);
  });

  it('🔴 발음·정의만 채워졌으면 0이다 — 「12개를 채웠어요」가 거짓이 되면 안 된다', () => {
    const target = { phonetic: '', exampleEn: '', exampleKr: '', definition: '', pos: '' };
    const updates = fillableUpdates(target, { ...AI, exampleEn: '', exampleKr: '' });
    // 발음·정의는 실제로 채운다 — 한도는 이미 그 단어에 쓰였고 값어치는 챙긴다.
    expect(updates.phonetic).toBe(AI.phonetic);
    expect(updates.definition).toBe(AI.definition);
    // 그래도 세지는 않는다.
    expect(countsExampleFilled(updates)).toBe(false);
  });

  it('아무것도 못 채웠으면 0이다', () => {
    expect(countsExampleFilled({})).toBe(false);
  });
});

describe('pickAdFillOffer — 남은 한도 + 보상을 넘는 수를 약속하지 않는다', () => {
  const base = { rewardAmount: 20, canWatchAd: true, unlimited: false };

  it('대상 12 · 잔량 5 → 5+20=25 ≥ 12 이므로 「12개 다 채우기」', () => {
    expect(pickAdFillOffer({ ...base, target: 12, fillable: 5 })).toEqual({ count: 12, coversAll: true });
  });

  it('🔴 대상 30 · 잔량 5 → 25개까지만 약속한다', () => {
    expect(pickAdFillOffer({ ...base, target: 30, fillable: 5 })).toEqual({ count: 25, coversAll: false });
  });

  it('잔량 0 은 이 제안의 자리가 아니다 — 기존 「광고가 주 버튼」 얼굴이 맡는다', () => {
    expect(pickAdFillOffer({ ...base, target: 12, fillable: 0 })).toBeNull();
  });

  it('지금 다 채울 수 있으면 광고를 팔지 않는다', () => {
    expect(pickAdFillOffer({ ...base, target: 12, fillable: 12 })).toBeNull();
  });

  it('오늘 광고를 다 봤으면 버튼을 아예 내지 않는다 — 판정은 canWatchAd 하나로', () => {
    expect(pickAdFillOffer({ ...base, target: 12, fillable: 5, canWatchAd: false })).toBeNull();
  });

  it('BYOK 는 앱 차원의 한도가 없으므로 광고로 얻을 것도 없다', () => {
    expect(pickAdFillOffer({ ...base, target: 12, fillable: 5, unlimited: true })).toBeNull();
  });

  it('보상이 0 이면 약속할 것이 없다', () => {
    expect(pickAdFillOffer({ ...base, target: 12, fillable: 5, rewardAmount: 0 })).toBeNull();
  });
});
