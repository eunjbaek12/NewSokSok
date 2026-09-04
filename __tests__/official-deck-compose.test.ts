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
    // ⑤ 병기가 적용되고, 그 결과 쟁기까지 카드에 실린다.
    // 좁히지 않는 이유는 ⑤ 쪽 주석에 있다 — 좁히면 동음이의어 병기 기능이 사라진다.
    // 이 유형은 캐시 품질 문제라 사람이 봐야 한다.
    // ⚠️ 다만 **카드 첫 줄은 덱 뜻이다** — 틀린 뜻이 앞에 서지는 않는다.
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
    expect(r.word.meaningKr).toBe('① rice paddy ② plow (farming tool)');
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
    // ① 은 **덱이 가르치는 뜻 그대로**다. 캐시의 부연(`apple (the fruit)`)은 버린다 —
    // 덱 뜻을 캐시 표현으로 갈아치우면 겹치지 않은 덱 뜻이 사라지기 때문이다.
    expect(r.word.meaningKr).toBe('① apple ② apology');
    expect(r.word.definition).toContain('①');
    expect(r.word.definition).toContain('②');
    // 예문도 ① 은 덱 것이다. 덱 예문은 그 덱의 난이도에 맞춰 만든 것이다.
    expect(r.word.exampleEn).toBe('① 사과가 맛있다. ② 그는 진심으로 사과를 했다.');
    expect(r.word.exampleKr).toBe('① The apple is tasty. ② He gave a sincere apology.');
    expect(r.exampleChanged).toBe(true);
  });

  it('🔴 덱 뜻 중 캐시에 없는 것도 살아남는다 (`위` = stomach 소실 유형)', () => {
    // 2026-08-25 실측. 덱은 above·top·stomach 셋을 가르치는데 캐시는 앞의 둘만 안다.
    // 예전 규칙은 덱 meaningKr 을 캐시 병기본으로 통째 교체해 stomach 이 사라졌다.
    const deck = deckWord({ term: '위', meaningKr: 'above, top, stomach', definition: 'above, top, stomach' });
    const r = composeWord(deck, {
      senses: [
        { meaningKr: 'Above (location/position)', definition: '기준점보다 높은 곳.', exampleEn: 'x', exampleKr: 'y', pos: 'noun', phonetic: 'wi' },
        { meaningKr: 'On top of', definition: '어떤 사물의 윗면.', exampleEn: 'x', exampleKr: 'y', pos: 'noun', phonetic: 'wi' },
      ],
    });
    // 캐시가 아는 뜻이 전부 덱 뜻 안이라 병기할 것이 없다 — 덱 것을 그대로 둔다.
    expect(r.outcome).toBe('senses-covered');
    expect(r.word.meaningKr).toBe('above, top, stomach');
    expect(r.word.exampleEn).toBe('그의 행동은 옳지 않았다.');
    // 뜻이 한 줄이므로 뜻풀이에도 번호를 남기지 않는다.
    expect(r.word.definition).toBe('기준점보다 높은 곳. 어떤 사물의 윗면.');
    expect(r.definitionFixed).toBe(true);
  });

  it('🔴 덱 뜻이 캐시 ② 에 있어도 카드 첫 줄은 덱 뜻이다 (`시` = 詩 유형)', () => {
    // 예전 규칙은 캐시 순서를 그대로 따라 `① time ② poem` 이 됐다 — 덱이 詩를
    // 가르치는데 카드 첫 줄이 時였다.
    const deck = deckWord({ term: '시', meaningKr: 'poetry, poem', definition: 'poetry, poem', exampleEn: '시를 읽었다.', exampleKr: 'I read a poem.' });
    const r = composeWord(deck, {
      senses: [
        { meaningKr: 'time (unit of time)', definition: '하루를 24등분한 것의 하나.', exampleEn: '세 시에 만나자.', exampleKr: "Let's meet at three.", pos: 'noun', phonetic: 'si' },
        { meaningKr: 'poem', definition: '운율과 함축성을 살려 표현한 글.', exampleEn: '시를 썼다.', exampleKr: 'I wrote a poem.', pos: 'noun', phonetic: 'si' },
      ],
    });
    expect(r.outcome).toBe('senses-merged');
    expect(r.word.meaningKr).toBe('① poetry, poem ② time (unit of time)');
    expect(r.word.definition).toBe('① 운율과 함축성을 살려 표현한 글. ② 하루를 24등분한 것의 하나.');
    expect(r.word.exampleEn).toBe('① 시를 읽었다. ② 세 시에 만나자.');
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
    const long = 'x'.repeat(320);
    const deck = deckWord({ term: '사과', meaningKr: 'apple' });
    // 한도 검사에 도달하려면 겹치는 뜻(① 자리)과 겹치지 않는 뜻(② 자리)이 모두
    // 있어야 한다 — 전부 겹치면 병기할 것이 없어 senses-covered 로 끝난다.
    const r = composeWord(deck, {
      senses: [
        { meaningKr: 'apple', definition: 'd1', exampleEn: 'e1', exampleKr: 'k1', pos: 'noun', phonetic: 'p' },
        { meaningKr: `apology ${long}`, definition: 'd2', exampleEn: 'e2', exampleKr: 'k2', pos: 'noun', phonetic: 'p' },
      ],
    });
    expect(r.outcome).toBe('senses-skipped-limit');
    expect(r.word.meaningKr).toBe('apple');
  });

  it('캐시가 덱 뜻 밖의 뜻을 모르면 병기하지 않는다', () => {
    const deck = deckWord({ term: '사과', meaningKr: 'apple, apple fruit' });
    const r = composeWord(deck, {
      senses: [
        { meaningKr: 'apple', definition: 'd1', exampleEn: 'e1', exampleKr: 'k1', pos: 'noun', phonetic: 'p' },
        { meaningKr: 'apple (fruit)', definition: 'd2', exampleEn: 'e2', exampleKr: 'k2', pos: 'noun', phonetic: 'p' },
      ],
    });
    expect(r.outcome).toBe('senses-covered');
    expect(r.word.meaningKr).toBe('apple, apple fruit');
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

  // 🔴 CJK 는 낱말을 공백이 아니라 `、` `，` 로 나눈다. 이걸 정규화에서 지우지 않으면
  //    문장 전체가 한 토큰이 되어, 낱말이 분명히 겹치는데도 false 가 나온다.
  //    실제로 그래서 ko>ja 121장 · ko>zh 136장의 definition 이 교정되지 않았다.
  it('일본어 열거 구분자 `、` 로 나뉜 낱말도 겹침으로 센다', () => {
    const ja = [{ meaningKr: '言葉、言語', definition: '', exampleEn: '', exampleKr: '', pos: '', phonetic: '' }];
    expect(overlapsDeckMeaning('言葉、話', ja)).toBe(true);
    expect(overlapsDeckMeaning('料理、食事', ja)).toBe(false);
  });

  it('중국어 전각 쉼표 `，` 로 나뉜 낱말도 겹침으로 센다', () => {
    const zh = [{ meaningKr: '成为，变成，变得', definition: '', exampleEn: '', exampleKr: '', pos: '', phonetic: '' }];
    expect(overlapsDeckMeaning('成为, 变成', zh)).toBe(true);
    expect(overlapsDeckMeaning('学习, 练习', zh)).toBe(false);
  });

  // 🔴 반각 괄호와 달리 전각 괄호는 지우면 안 된다 — CJK 는 괄호 안이 뜻 자체다.
  //    `数詞（一つ）` 에서 괄호를 떼면 덱 뜻 `一つ` 와의 겹침이 사라진다.
  it('전각 괄호 안의 뜻은 살려 둔다', () => {
    const ja = [{ meaningKr: '数詞（一つ）', definition: '', exampleEn: '', exampleKr: '', pos: '', phonetic: '' }];
    expect(overlapsDeckMeaning('一つ', ja)).toBe(true);
  });
});

describe('사람 판정(decision) — 겹침 판정이 틀리는 자리', () => {
  // 배경: `overlapsDeckMeaning` 은 영어 문자열을 비교하므로 같은 단어를 다른 낱말로 쓴
  // 경우(감독 = supervision vs Director)와 진짜 동음이의(개 = dog vs 접두사 '개-')를
  // 형태로 가르지 못한다. 사다리 4덱의 72건은 사람이 한 번 갈랐다(2026-08-19).
  const 감독 = deckWord({
    term: '감독',
    definition: 'direction, supervision, management',
    meaningKr: 'direction, supervision, management',
  });
  const 감독캐시: CachedEnrich = {
    definition: '① 영화, 연극, 스포츠 따위에서 전체를 총지휘하는 사람. ② 어떤 일을 책임지고 이끌어가는 사람.',
    senses: [
      { meaningKr: 'Director', definition: '전체를 총지휘하는 사람.' },
      { meaningKr: 'Manager', definition: '책임지고 이끌어가는 사람.' },
    ],
  };

  it('판정이 없으면 지금 규칙 그대로 — 겹치지 않는 병기본은 버린다', () => {
    const r = composeWord(감독, 감독캐시);
    expect(r.word.definition).toBe('direction, supervision, management'); // 복사본이 그대로 남는다
    expect(r.definitionFixed).toBe(false);
  });

  it("fill 판정은 겹침 실패를 덮고 캐시 뜻풀이를 넣는다", () => {
    const r = composeWord(감독, 감독캐시, 'fill');
    expect(r.word.definition).toBe(감독캐시.definition);
    expect(r.definitionFixed).toBe(true);
  });

  it('blank 판정은 meaningKr 복사본을 비운다 — 카드에 영어가 두 번 뜨는 것을 막는다', () => {
    const 개 = deckWord({ term: '개', definition: 'dog', meaningKr: 'dog' });
    const r = composeWord(개, {
      definition: "① 명사 앞에 붙어 '야생의' 뜻을 더하는 접두사. ② 동물을 세는 단위.",
      senses: [
        { meaningKr: 'wild-', definition: "'야생의' 뜻을 더하는 접두사." },
        { meaningKr: 'counter', definition: '동물을 세는 단위.' },
      ],
    }, 'blank');
    expect(r.outcome).toBe('definition-cleared');
    expect(r.word.definition).toBe('');
    // 나머지 칸은 그대로 — 비우는 것은 definition 한 칸뿐이다
    expect(r.word.meaningKr).toBe('dog');
    expect(r.word.exampleEn).toBe('그의 행동은 옳지 않았다.');
  });

  it('blank 판정이어도 이미 빈칸이면 아무 일도 하지 않는다', () => {
    const 천 = deckWord({ term: '천', definition: '', meaningKr: 'cloth, fabric' });
    const r = composeWord(천, { definition: '① 하늘. ② 1000.' }, 'blank');
    expect(r.outcome).toBe('unchanged');
    expect(r.word.definition).toBe('');
  });

  it('🔴 blank 판정은 병기도 막는다 — 남의 뜻이 meaningKr 로 들어오면 안 된다', () => {
    const 대기 = deckWord({ term: '대기', definition: 'atmosphere, air', meaningKr: 'atmosphere, air' });
    const r = composeWord(대기, {
      definition: '① 어떤 일이 일어나기를 기다림. ② 준비하고 기다림.',
      senses: [
        { meaningKr: 'standby', definition: '어떤 일이 일어나기를 기다림.' },
        { meaningKr: 'waiting', definition: '준비하고 기다림.' },
      ],
    }, 'blank');
    expect(r.word.meaningKr).toBe('atmosphere, air');
    expect(r.word.definition).toBe('');
  });
});

describe('판정 목록 자체', () => {
  it('채움 125 · 비움 71 — 사다리 82건 + 실사용 덱 100건 + 주제·상황 7덱 14건', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { decisionCounts, definitionDecision } = require('../scripts/lib/definition-decisions');
    // 2026-09-03: ko>en 주제·상황 7덱을 서버에 심고 되읽어 판정한 14건이 더해졌다
    // (채움 +6 · 비움 +8). 캐시가 맞는 뜻을 가졌는데 표현만 달라 겹침이 실패한 것은
    // 채움, 다른 한자어를 설명하거나 순환 정의인 것은 비움이다 — [[ko-topic-decks]].
    expect(decisionCounts()).toEqual({ fill: 125, blank: 71 });
    // 같은 자리의 두 갈래가 실제로 갈리는지 — 증상이 똑같아서(둘 다 definition 에 영어가
    // 남는다) 캐시를 열어 보지 않으면 못 가른다.
    expect(definitionDecision('curated-ceremony-ko-1', '문상')).toBe('fill');   // 캐시가 맞는 뜻
    expect(definitionDecision('curated-ceremony-ko-1', '상주')).toBe('blank');  // 캐시는 尙州·常住
    // 덱이 다르면 같은 표제어라도 판정이 갈릴 수 있어야 한다
    expect(definitionDecision('curated-ko-basic-1', '물')).toBe('fill');
    expect(definitionDecision('curated-ko-advanced-1', '물')).toBeUndefined();
    // 뜻풀이가 깨져 잠시 blank 였던 넷 — 캐시를 고친 뒤 fill 로 돌아왔다(2026-08-20)
    for (const [deck, term] of [
      ['curated-ko-basic-1', '셋'],
      ['curated-ko-intermediate-2', '장'],
      ['curated-ko-advanced-1', '별도'],
      ['curated-ko-advanced-1', '도덕'],
    ]) {
      expect(definitionDecision(deck, term)).toBe('fill');
    }
  });

  // 2026-08-20: 사다리 밖 실사용 덱까지 넓혔다. 같은 덱 안에서 fill 과 blank 가
  // 갈리는지, 그리고 사다리 항목이 그대로 남았는지를 함께 고정한다.
  it('실사용 덱 판정 — 같은 덱 안에서도 표제어마다 갈린다', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { definitionDecision } = require('../scripts/lib/definition-decisions');
    // 사극: 캐시가 그 벼슬을 아는 것과 다른 한자어를 설명하는 것
    expect(definitionDecision('curated-saguk-ko-1', '전하')).toBe('fill');
    expect(definitionDecision('curated-saguk-ko-1', '기생')).toBe('blank');
    // 수능은 빈칸이던 41개 중 38개를 채운다 — 캐시 뜻이 동음이의가 아니라 다의어다
    expect(definitionDecision('curated-suneung-1', 'complex')).toBe('fill');
    expect(definitionDecision('curated-suneung-1', 'pitch')).toBe('fill');
    // 🔴 나머지 3개는 **품사가 어긋나** 덱이 가르치는 뜻이 캐시에 없다.
    //    bar 덱="막다"(동사) ↔ 캐시는 막대기/바 카운터/술집(명사). 채우면 딴소리가 된다.
    for (const term of ['reverse', 'bar', 'object']) {
      expect(definitionDecision('curated-suneung-1', term)).toBe('blank');
    }
    // 판정 목록에 없어 조용히 빈칸이던 사다리 2건
    expect(definitionDecision('curated-ko-advanced-1', '공식')).toBe('blank');
    expect(definitionDecision('curated-ko-intermediate-2', '젓다')).toBe('blank');
    // 목록에 없는 덱·표제어는 여전히 규칙대로 간다
    expect(definitionDecision('curated-ngsl-1', 'bar')).toBeUndefined();
    // 캐시가 맞는데도 blank 인 셋 — 뜻이 전부 sense-drops 에 걸려 캐시를 못 쓴다.
    // fill 로 두면 아무 일도 안 일어나고 복사본만 남는다.
    expect(definitionDecision('curated-ko-intermediate-1', '삼다')).toBe('blank');
    expect(definitionDecision('curated-kpop-ko-1', '단콘')).toBe('blank');
    expect(definitionDecision('curated-krslang-ko-1', '만반잘부')).toBe('blank');
  });
});

describe('지어낸 뜻 제외(dropSenses)', () => {
  // 실측 케이스: `교사`. 캐시 ②가 "낡은 것을 새것으로 고침"(예문 "낡은 가구를 교사했다").
  // 한국어에 없는 뜻인데 병기가 이것을 카드 앞면까지 올린다.
  const 교사 = deckWord({ term: '교사', definition: '', meaningKr: 'teacher, instructor' });
  const 교사캐시: CachedEnrich = {
    definition: '① 학생을 가르치는 사람. ② 낡은 것을 새것으로 고침.',
    senses: [
      { meaningKr: 'teacher', definition: '학생을 가르치는 사람.', exampleEn: '그는 고등학교 교사예요.', exampleKr: 'He is a high school teacher.' },
      { meaningKr: 'repair', definition: '낡은 것을 새것으로 고침.', exampleEn: '낡은 가구를 교사했다.', exampleKr: 'I repaired the old furniture.' },
    ],
  };

  it('제외한 뜻은 병기에 실리지 않는다', () => {
    const r = composeWord(교사, 교사캐시, undefined, [2]);
    expect(r.word.meaningKr).not.toMatch(/repair/i);
    expect(r.word.definition).not.toMatch(/낡은 것을 새것으로/);
  });

  it('🔴 최상위 definition 도 남은 뜻으로 다시 짠다 — 병기본을 그대로 쓰면 제외가 새어 들어온다', () => {
    const r = composeWord(교사, 교사캐시, undefined, [2]);
    expect(r.word.definition).toBe('학생을 가르치는 사람.');
  });

  it('제외 목록이 없으면 지금 동작 그대로', () => {
    const r = composeWord(교사, 교사캐시);
    expect(r.word.definition).toContain('낡은 것을 새것으로');
  });

  it('뜻이 하나도 안 남으면 캐시를 통째로 쓰지 않는다 — 최상위도 그 뜻들로 짠 것이라 못 쓴다', () => {
    const deck = deckWord({ term: '교사', definition: '기존 뜻풀이', meaningKr: 'teacher' });
    const r = composeWord(deck, 교사캐시, undefined, [1, 2]);
    expect(r.outcome).toBe('senses-all-dropped');
    expect(r.word).toEqual(deck);
  });

  it('목록 규모가 측정치와 맞는다', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { dropCounts, dropCountsByLang, droppedSenses } = require('../scripts/lib/sense-drops');
    // 2026-09-03: 주제·상황 7덱 시딩 검증에서 ko>en 10항목·12뜻이 더해졌다.
    expect(dropCounts()).toEqual({ terms: 1370, senses: 1562 });
    // 여섯 출발어를 모두 덮는다 — ko 만 있던 때로 되돌아가면 여기서 걸린다.
    expect(dropCountsByLang()).toEqual({ ko: 942, zh: 202, ja: 186, vi: 117, en: 110, es: 5 });
    expect(droppedSenses('ko', 'en', '잘되다')).toEqual([2]);  // "to fail" — 정반대 뜻
    // 🔴 병기는 카드 **앞면**까지 올라간다 — 초급 덱에 실을 수 없는 뜻을 사람이 뺐다.
    expect(droppedSenses('ko', 'en', '고추')).toEqual([2]);   // ② 유아어·속어
    expect(droppedSenses('ko', 'en', '호박')).toEqual([2]);   // ② 외모 비하
    expect(droppedSenses('ko', 'en', '역사')).toEqual([1, 2]); // ①② 둘 다 덱 뜻 history 와 같은 말
    expect(droppedSenses('ko', 'en', '학교')).toEqual([]);  // 판정에 안 걸린 낱말
  });

  it('🔴 키에 출발어가 들어간다 — ja 와 zh 는 같은 표제어를 48개 공유한다', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { droppedSenses } = require('../scripts/lib/sense-drops');
    // 도착어(ko)만으로 키를 잡으면 일본어 판정이 중국어 카드에 적용된다.
    const ja = droppedSenses('ja', 'ko', '米');
    const zh = droppedSenses('zh', 'ko', '米');
    expect(ja).not.toEqual(zh);
  });
});

describe('제어문자 — 서버에 심기 전에 지운다', () => {
  // 왜: 캐시 뜻풀이에 AI 가 넣은 개행이 남아 있고(실측 51행), 그 덱을 담은 사용자의
  // cloud_words CHECK 에 걸려 동기화가 영구히 끊긴다. 기기에서 실제로 재현됐다.
  // 소스에 리터럴 제어문자를 두지 않도록 코드포인트로 만든다(word-sanitize.test.ts 와 같은 방식).
  const NL = String.fromCharCode(10);
  const TAB = String.fromCharCode(9);

  it('definition 의 개행을 공백으로 바꾼다', () => {
    const r = composeWord(deckWord({ definition: '' }), {
      definition: '① 첫째 뜻.' + NL + '② 둘째 뜻.',
    });
    expect(r.word.definition).toBe('① 첫째 뜻. ② 둘째 뜻.');
  });

  it('예문·senses 까지 함께 훑는다', () => {
    const r = composeWord(deckWord({ definition: '' }), {
      definition: '뜻풀이',
      exampleEn: '앞' + NL + '뒤',
      senses: [
        { meaningKr: 'A', definition: '가' + NL + '나', exampleEn: '예' + TAB + '문' },
        { meaningKr: 'B', definition: '다', exampleEn: '문장' },
      ],
    });
    expect(r.word.exampleEn.includes(NL)).toBe(false);
    expect(r.senses![0].definition).toBe('가 나');
    expect(r.senses![0].exampleEn).toBe('예 문');
  });

  it('길이는 자르지 않는다 — 문장이 잘리면 뜻이 사라진다', () => {
    const long = '가'.repeat(700);
    const r = composeWord(deckWord({ definition: '' }), { definition: long });
    expect(r.word.definition.length).toBe(700);
  });
});
