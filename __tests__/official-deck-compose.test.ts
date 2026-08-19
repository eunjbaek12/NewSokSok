import { composeWord, overlapsDeckMeaning, type CachedEnrich } from '../scripts/lib/official-deck-compose';
import type { Word } from '@/lib/types';

// 공식 덱 시딩의 합성 규칙(scripts/lib/official-deck-compose.ts)을 고정한다.
// 케이스는 전부 2026-08-17 에 실제 덱·캐시에서 실측한 것이다.

const deckWord = (over: Partial<Word> = {}): Word => ({
  id: 'w1',
  term: '행동',
  definition: 'action, behavior',
  meaningKr: 'action, behavior',
  exampleEn: '그의 행동은 옳지 않았다.',
  exampleKr: 'His behavior was not right.',
  phonetic: 'haengdong',
  pos: 'noun',
  isMemorized: false,
  isStarred: false,
  tags: [],
  ...over,
});

describe('④ definition 결함', () => {
  it('빈 definition 을 캐시 뜻풀이로 채운다', () => {
    const r = composeWord(deckWord({ definition: '' }), {
      definition: '사람이나 동물이 하는 모든 행위나 움직임.',
    });
    expect(r.outcome).toBe('definition-filled');
    expect(r.word.definition).toBe('사람이나 동물이 하는 모든 행위나 움직임.');
    // 뜻·예문은 건드리지 않는다
    expect(r.word.meaningKr).toBe('action, behavior');
    expect(r.word.exampleEn).toBe('그의 행동은 옳지 않았다.');
  });

  it('meaningKr 복사본인 definition 을 뜻풀이로 바로잡는다 (ko>en 2,800건 유형)', () => {
    const r = composeWord(deckWord(), { definition: '사람이나 동물이 하는 모든 행위나 움직임.' });
    expect(r.outcome).toBe('definition-fixed');
    expect(r.word.definition).toBe('사람이나 동물이 하는 모든 행위나 움직임.');
  });

  it('제대로 된 definition 은 캐시가 있어도 유지한다', () => {
    const deck = deckWord({ definition: 'The way in which one acts or conducts oneself.' });
    const r = composeWord(deck, { definition: '다른 뜻풀이' });
    expect(r.outcome).toBe('unchanged');
    expect(r.word.definition).toBe('The way in which one acts or conducts oneself.');
  });

  it('캐시가 없으면 아무것도 바꾸지 않는다', () => {
    const deck = deckWord({ definition: '' });
    const r = composeWord(deck, undefined);
    expect(r.outcome).toBe('unchanged');
    expect(r.word).toEqual(deck);
  });

  it('🔴 겹치는 뜻이 하나라도 있으면 병기가 이어받아 나머지도 따라온다 (알려진 한계)', () => {
    // 실측 케이스: 표제어 `논`. 캐시 ①은 쟁기 — 논이 아니다. ②가 덱 뜻과 겹치므로
    // ⑤ 병기가 적용되고, 그 결과 ①까지 카드에 실린다.
    // 좁히지 않는 이유는 ⑤ 쪽 주석에 있다 — 좁히면 동음이의어 병기 기능이 사라진다.
    // 이 유형은 캐시 품질 문제라 사람이 봐야 한다.
    const deck = deckWord({ term: '논', meaningKr: 'rice paddy', definition: 'rice paddy' });
    const r = composeWord(deck, {
      definition: '① 경작할 수 있도록 소나 말이 끄는 농기구. ② 벼를 심어 가꾸는 논밭.',
      senses: [
        { meaningKr: 'plow (farming tool)', definition: '경작할 수 있도록 소나 말이 끄는 농기구.', exampleEn: 'x', exampleKr: 'y', pos: 'noun', phonetic: 'non' },
        { meaningKr: 'rice paddy', definition: '벼를 심어 가꾸는 논밭.', exampleEn: 'x', exampleKr: 'y', pos: 'noun', phonetic: 'non' },
      ],
    });
    expect(r.outcome).toBe('senses-merged');
    expect(r.word.definition).toContain('농기구');
  });

  it('🔴 뜻이 같아도 어휘가 다르면 못 알아본다 (알려진 한계)', () => {
    // 겹침 판정은 의미가 아니라 낱말로 한다. 덱 "others" 와 캐시 "someone else" 는
    // 같은 뜻이지만 공통 낱말이 없어 매칭에 실패하고, definition 은 영어 복사본으로
    // 남는다(실측 473건). 영어가 중복되는 것이 **다른 단어의 뜻풀이가 실리는 것보다는
    // 낫다**고 보고 이쪽을 택했다. 이 기대값을 바꾸려면 그 교환을 다시 따져 볼 것.
    const deck = deckWord({ term: '남', meaningKr: 'others, other people', definition: 'others, other people' });
    const r = composeWord(deck, {
      definition: '① 다른 사람을 낮잡아 이르는 말 ② 짐승의 새끼 ③ 남쪽',
      senses: [
        { meaningKr: 'someone else (derogatory)', definition: '다른 사람을 낮잡아 이르는 말', exampleEn: 'x', exampleKr: 'y', pos: 'noun', phonetic: 'nam' },
        { meaningKr: 'south', definition: '남쪽', exampleEn: 'x', exampleKr: 'y', pos: 'noun', phonetic: 'nam' },
      ],
    });
    expect(r.word.definition).toBe('others, other people');
    expect(r.word.definition).not.toContain('짐승의 새끼');
  });

  it('🔴 겹치는 뜻이 하나도 없으면 definition 을 손대지 않는다', () => {
    // 실측 케이스: 표제어 `미`. 덱은 beauty 를 가르치는데 캐시는 보풀·실·미숫가루를
    // 안다 — 통째로 다른 단어다. 고치기 전에는 이 뜻풀이가 그대로 카드에 실렸다.
    const deck = deckWord({ term: '미', meaningKr: 'beauty, beautifulness', definition: 'beauty, beautifulness' });
    const r = composeWord(deck, {
      definition: '① 털이나 보풀이 엉기어 뭉친 덩어리. ② 솜이나 털을 뽑아내어 꼬아 만든 실. ③ 쌀이나 보리 따위를 쪄서 말린 뒤에 찧어 만든 가루.',
      senses: [
        { meaningKr: 'lint, fuzz, flock', definition: '털이나 보풀이 엉기어 뭉친 덩어리.', exampleEn: 'x', exampleKr: 'y', pos: 'noun', phonetic: 'mi' },
        { meaningKr: 'spun thread', definition: '솜이나 털을 뽑아내어 꼬아 만든 실.', exampleEn: 'x', exampleKr: 'y', pos: 'noun', phonetic: 'mi' },
      ],
    });
    expect(r.definitionFixed).toBe(false);
    expect(r.word.definition).toBe('beauty, beautifulness');
    expect(r.word.definition).not.toContain('보풀');
  });
});

describe('⑤ 동음이의어 병기', () => {
  const 사과캐시: CachedEnrich = {
    definition: '① 장미과 과수의 열매. ② 잘못을 빌다.',
    meaningKr: '① apple (the fruit) ② apology',
    exampleEn: '사과를 한 개 먹었다.',
    exampleKr: 'I ate an apple.',
    pos: 'noun',
    phonetic: 'sagwa',
    senses: [
      {
        meaningKr: 'apple (the fruit)',
        definition: '장미과에 속하는 과수의 둥근 열매.',
        exampleEn: '사과를 한 개 먹었다.',
        exampleKr: 'I ate an apple.',
        pos: 'noun',
        phonetic: 'sagwa',
      },
      {
        meaningKr: 'apology',
        definition: '자신의 잘못을 인정하고 용서를 구하는 말.',
        exampleEn: '그는 진심으로 사과를 했다.',
        exampleKr: 'He gave a sincere apology.',
        pos: 'noun',
        phonetic: 'sagwa',
      },
    ],
  };

  it('뜻·정의·예문·예문번역을 ①② 로 병기한다', () => {
    const deck = deckWord({ term: '사과', meaningKr: 'apple', definition: 'apple', exampleEn: '사과가 맛있다.', exampleKr: 'The apple is tasty.' });
    const r = composeWord(deck, 사과캐시);

    expect(r.outcome).toBe('senses-merged');
    expect(r.word.meaningKr).toBe('① apple (the fruit) ② apology');
    expect(r.word.definition).toContain('①');
    expect(r.word.definition).toContain('②');
    expect(r.word.exampleEn).toBe('① 사과를 한 개 먹었다. ② 그는 진심으로 사과를 했다.');
    expect(r.word.exampleKr).toBe('① I ate an apple. ② He gave a sincere apology.');
    expect(r.exampleChanged).toBe(true);
  });

  it('발음과 품사는 덱 것을 지킨다', () => {
    const deck = deckWord({ term: '사과', meaningKr: 'apple', phonetic: '덱-발음', pos: '덱-품사' });
    const r = composeWord(deck, 사과캐시);
    expect(r.word.phonetic).toBe('덱-발음');
    expect(r.word.pos).toBe('덱-품사');
  });

  it('senses 원본 배열도 함께 돌려준다 (서버 컬럼용)', () => {
    const deck = deckWord({ term: '사과', meaningKr: 'apple' });
    const r = composeWord(deck, 사과캐시);
    expect(r.senses).toHaveLength(2);
  });

  it('🔴 덱 뜻이 캐시 뜻에 없으면 손대지 않는다 ("困" 유형)', () => {
    const deck = deckWord({ term: '困', meaningKr: '졸리다', definition: '졸리다' });
    const r = composeWord(deck, {
      definition: '① 곤란하게 하다 ② 지치게 하다',
      meaningKr: '① 곤란하게 하다 ② 지치게 하다',
      senses: [
        { meaningKr: '곤란하게 하다, 괴롭히다', definition: 'a', exampleEn: 'x', exampleKr: 'y', pos: 'verb', phonetic: 'kùn' },
        { meaningKr: '지치게 하다, 피곤하게 하다', definition: 'b', exampleEn: 'x', exampleKr: 'y', pos: 'verb', phonetic: 'kùn' },
      ],
    });
    expect(r.outcome).toBe('senses-skipped-nooverlap');
    expect(r.word.meaningKr).toBe('졸리다');
    expect(r.exampleChanged).toBe(false);
  });

  it('🔴 병기가 보류돼도 definition 은 고친다', () => {
    // 병기를 먼저 시도하고 보류 시 곧장 반환하면 definition 규칙에 도달하지 못해
    // 결함이 그대로 남는다. dry-run 에서 교정 건수가 4,907 → 2,496 으로 줄어 발견했다.
    const deck = deckWord({ term: '困', meaningKr: '졸리다', definition: '졸리다' });
    const r = composeWord(deck, {
      definition: '피곤하여 잠이 오는 느낌이 있다.',
      senses: [
        { meaningKr: '곤란하게 하다', definition: 'a', exampleEn: 'x', exampleKr: 'y', pos: 'verb', phonetic: 'kùn' },
        { meaningKr: '지치게 하다', definition: 'b', exampleEn: 'x', exampleKr: 'y', pos: 'verb', phonetic: 'kùn' },
      ],
    });
    expect(r.outcome).toBe('senses-skipped-nooverlap');
    expect(r.definitionFixed).toBe(true);
    expect(r.word.definition).toBe('피곤하여 잠이 오는 느낌이 있다.');
    // 뜻과 예문은 그대로여야 한다
    expect(r.word.meaningKr).toBe('졸리다');
    expect(r.word.exampleEn).toBe('그의 행동은 옳지 않았다.');
  });

  it('뜻이 하나만 남을 만큼 길면 병기하지 않는다 (덱 뜻만 사라지는 것을 막는다)', () => {
    const long = 'x'.repeat(280);
    const deck = deckWord({ term: '사과', meaningKr: 'apple' });
    // 두 뜻 모두 덱 뜻(apple)과 겹쳐야 병기 대상이 되고, 그래야 한도 검사에 도달한다.
    const r = composeWord(deck, {
      senses: [
        { meaningKr: `apple ${long}`, definition: 'd1', exampleEn: 'e1', exampleKr: 'k1', pos: 'noun', phonetic: 'p' },
        { meaningKr: `apple pie ${long}`, definition: 'd2', exampleEn: 'e2', exampleKr: 'k2', pos: 'noun', phonetic: 'p' },
      ],
    });
    expect(r.outcome).toBe('senses-skipped-limit');
    expect(r.word.meaningKr).toBe('apple');
  });

  it('senses 가 1개뿐이면 병기 대상이 아니다 (definition 규칙으로 넘어간다)', () => {
    const deck = deckWord({ definition: '' });
    const r = composeWord(deck, {
      definition: '사람이나 동물이 하는 모든 행위나 움직임.',
      senses: [{ meaningKr: 'action', definition: 'd', exampleEn: 'e', exampleKr: 'k', pos: 'noun', phonetic: 'p' }],
    });
    expect(r.outcome).toBe('definition-filled');
  });
});

describe('뜻 겹침 판정', () => {
  const senses = [
    { meaningKr: 'area, region, district', definition: '', exampleEn: '', exampleKr: '', pos: '', phonetic: '' },
    { meaningKr: 'zone, territory', definition: '', exampleEn: '', exampleKr: '', pos: '', phonetic: '' },
  ];

  it('낱말이 하나라도 겹치면 통과', () => {
    expect(overlapsDeckMeaning('region, area, district', senses)).toBe(true);
    expect(overlapsDeckMeaning('territory', senses)).toBe(true);
  });

  it('괄호 주석은 무시하고 비교한다', () => {
    expect(overlapsDeckMeaning('area (administrative)', senses)).toBe(true);
  });

  it('전혀 다른 뜻이면 거른다', () => {
    expect(overlapsDeckMeaning('졸리다', senses)).toBe(false);
    expect(overlapsDeckMeaning('', senses)).toBe(false);
  });

  it('한 글자 낱말은 우연 일치를 막기 위해 세지 않는다', () => {
    const s = [{ meaningKr: 'a b', definition: '', exampleEn: '', exampleKr: '', pos: '', phonetic: '' }];
    expect(overlapsDeckMeaning('a c', s)).toBe(false);
  });
});
