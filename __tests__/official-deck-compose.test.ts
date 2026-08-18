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
    const r = composeWord(deck, {
      senses: [
        { meaningKr: `apple ${long}`, definition: 'd1', exampleEn: 'e1', exampleKr: 'k1', pos: 'noun', phonetic: 'p' },
        { meaningKr: `apology ${long}`, definition: 'd2', exampleEn: 'e2', exampleKr: 'k2', pos: 'noun', phonetic: 'p' },
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
