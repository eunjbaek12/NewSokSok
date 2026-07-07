import {
  posCategoriesOf,
  matchesPosFilter,
  presentPosCategories,
  POS_ALL,
  POS_OTHER,
} from '@/lib/pos';

describe('posCategoriesOf', () => {
  it('단순 내용어를 정확히 매핑한다', () => {
    expect(posCategoriesOf('noun')).toEqual(['noun']);
    expect(posCategoriesOf('verb')).toEqual(['verb']);
    expect(posCategoriesOf('adjective')).toEqual(['adjective']);
    expect(posCategoriesOf('adverb')).toEqual(['adverb']);
  });

  it('다중값("noun, verb")은 두 카테고리 모두 매칭한다', () => {
    expect(posCategoriesOf('noun, verb')).toEqual(['noun', 'verb']);
    expect(posCategoriesOf('verb, noun')).toEqual(['noun', 'verb']); // 순서는 카테고리 정의순
  });

  it('복합어("dependent noun")는 내용어 토큰으로 매핑한다', () => {
    expect(posCategoriesOf('dependent noun')).toEqual(['noun']);
    expect(posCategoriesOf('noun, adjective')).toEqual(['noun', 'adjective']);
  });

  it('"pronoun"이 "noun"에 오분류되지 않는다(토큰 startsWith 가드)', () => {
    expect(posCategoriesOf('pronoun')).toEqual([]);
  });

  it('"adverb"가 "verb"에 오분류되지 않는다', () => {
    expect(posCategoriesOf('adverb')).toEqual(['adverb']);
    expect(posCategoriesOf('proverb')).toEqual([]);
  });

  it('구/관용구/표현은 phrase로 모은다', () => {
    expect(posCategoriesOf('phrase')).toEqual(['phrase']);
    expect(posCategoriesOf('idiom')).toEqual(['phrase']);
    expect(posCategoriesOf('expression')).toEqual(['phrase']);
  });

  it('빈값·기능어·비표준 pos는 어떤 카테고리에도 안 걸린다(→기타 대상)', () => {
    expect(posCategoriesOf('')).toEqual([]);
    expect(posCategoriesOf(undefined)).toEqual([]);
    expect(posCategoriesOf('preposition')).toEqual([]);
    expect(posCategoriesOf('conjunction')).toEqual([]);
    expect(posCategoriesOf('determiner')).toEqual([]);
    expect(posCategoriesOf('classifier')).toEqual([]);
    expect(posCategoriesOf('Other (V-N)')).toEqual([]);
  });

  it('대소문자·공백에 무관하게 매핑한다', () => {
    expect(posCategoriesOf('Noun')).toEqual(['noun']);
    expect(posCategoriesOf('  VERB ')).toEqual(['verb']);
  });
});

describe('matchesPosFilter', () => {
  it("'all'은 항상 통과", () => {
    expect(matchesPosFilter('verb', POS_ALL)).toBe(true);
    expect(matchesPosFilter(undefined, POS_ALL)).toBe(true);
    expect(matchesPosFilter('', POS_ALL)).toBe(true);
  });

  it('특정 카테고리는 해당 품사만 통과(다중값 포함)', () => {
    expect(matchesPosFilter('verb', 'verb')).toBe(true);
    expect(matchesPosFilter('noun, verb', 'verb')).toBe(true);
    expect(matchesPosFilter('noun', 'verb')).toBe(false);
    expect(matchesPosFilter('dependent noun', 'noun')).toBe(true);
  });

  it("'other'는 어떤 카테고리에도 안 걸리는 단어(빈값·기능어)만 통과", () => {
    expect(matchesPosFilter(undefined, POS_OTHER)).toBe(true);
    expect(matchesPosFilter('', POS_OTHER)).toBe(true);
    expect(matchesPosFilter('preposition', POS_OTHER)).toBe(true);
    expect(matchesPosFilter('pronoun', POS_OTHER)).toBe(true);
    expect(matchesPosFilter('verb', POS_OTHER)).toBe(false);
    expect(matchesPosFilter('noun, verb', POS_OTHER)).toBe(false);
  });
});

describe('presentPosCategories', () => {
  it('실제 존재하는 카테고리만 정의순으로 추리고 hasOther를 표시한다', () => {
    const words = [
      { pos: 'verb' },
      { pos: 'noun, verb' },
      { pos: 'adjective' },
      { pos: 'preposition' }, // → other
      { pos: '' },            // → other
      { pos: undefined },     // → other
    ];
    const { keys, hasOther } = presentPosCategories(words);
    expect(keys).toEqual(['noun', 'verb', 'adjective']); // POS_FILTER_KEYS 정의순
    expect(hasOther).toBe(true);
  });

  it('기능어/빈값이 없으면 hasOther=false', () => {
    const { keys, hasOther } = presentPosCategories([{ pos: 'noun' }, { pos: 'verb' }]);
    expect(keys).toEqual(['noun', 'verb']);
    expect(hasOther).toBe(false);
  });

  it('전부 미분류면 keys는 비고 hasOther=true', () => {
    const { keys, hasOther } = presentPosCategories([{ pos: 'pronoun' }, { pos: '' }]);
    expect(keys).toEqual([]);
    expect(hasOther).toBe(true);
  });

  it('빈 배열은 아무 것도 없음', () => {
    const { keys, hasOther } = presentPosCategories([]);
    expect(keys).toEqual([]);
    expect(hasOther).toBe(false);
  });
});
