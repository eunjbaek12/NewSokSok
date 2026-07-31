import { buildChoices, normalizeChoiceLabel } from '../features/study/choices';
import { Word } from '../lib/types';

const w = (id: string, term: string, meaningKr = ''): Word =>
  ({ id, term, meaningKr } as Word);

const byTerm = (x: Word) => x.term;
const byMeaning = (x: Word) => x.meaningKr ?? '';

describe('normalizeChoiceLabel', () => {
  test('대소문자·공백·병기 기호를 무시한다', () => {
    expect(normalizeChoiceLabel(' Apple ')).toBe('apple');
    expect(normalizeChoiceLabel('① 사과 ② 사죄')).toBe('사과 사죄');
    expect(normalizeChoiceLabel(null)).toBe('');
    expect(normalizeChoiceLabel('')).toBe('');
  });
});

describe('buildChoices', () => {
  test('정답은 항상 포함된다', () => {
    const answer = w('1', 'apple');
    const pool = [answer, w('2', 'banana'), w('3', 'cherry'), w('4', 'date')];
    const choices = buildChoices(pool, answer, byTerm);
    expect(choices).toHaveLength(4);
    expect(choices.map(c => c.id)).toContain('1');
  });

  test('정답과 표기가 같은 단어는 오답으로 쓰지 않는다', () => {
    // 같은 단어장에 "사과"가 중복 저장된 상황 — 예전에는 정답을 눌러도 오답 처리됐다.
    const answer = w('1', '사과');
    const pool = [answer, w('2', '사과'), w('3', '바나나'), w('4', '체리')];
    const choices = buildChoices(pool, answer, byTerm);
    expect(choices.map(c => c.id)).not.toContain('2');
    expect(choices).toHaveLength(3);
  });

  test('오답끼리 표시가 겹쳐도 하나만 남긴다', () => {
    const answer = w('1', 'beautiful', '아름다운');
    const pool = [answer, w('2', 'pretty', '예쁜'), w('3', 'lovely', '예쁜'), w('4', 'ugly', '못생긴')];
    const choices = buildChoices(pool, answer, byMeaning);
    const labels = choices.map(c => normalizeChoiceLabel(byMeaning(c)));
    expect(new Set(labels).size).toBe(labels.length);
  });

  test('퀴즈 방향에 따라 중복 기준이 달라진다', () => {
    // 표기는 다르지만 뜻이 같은 두 단어 — term 기준에서는 둘 다 쓸 수 있고,
    // meaning 기준에서는 하나만 쓸 수 있어야 한다.
    const answer = w('1', 'joy', '기쁨');
    const pool = [answer, w('2', 'delight', '기쁨'), w('3', 'anger', '분노')];
    expect(buildChoices(pool, answer, byTerm)).toHaveLength(3);
    expect(buildChoices(pool, answer, byMeaning)).toHaveLength(2);
  });

  test('라벨이 빈 단어는 빈 버튼이 되므로 제외한다', () => {
    const answer = w('1', 'apple', '사과');
    const pool = [answer, w('2', 'banana', ''), w('3', 'cherry', '   '), w('4', 'date', '대추')];
    const choices = buildChoices(pool, answer, byMeaning);
    expect(choices.map(c => c.id).sort()).toEqual(['1', '4']);
  });

  test('후보가 모자라면 있는 만큼만 돌려준다', () => {
    const answer = w('1', 'apple');
    expect(buildChoices([answer], answer, byTerm)).toHaveLength(1);
    expect(buildChoices([answer, w('2', 'banana')], answer, byTerm)).toHaveLength(2);
  });

  test('count로 선택지 수를 조절할 수 있다', () => {
    const answer = w('1', 'a');
    const pool = [answer, w('2', 'b'), w('3', 'c'), w('4', 'd'), w('5', 'e')];
    expect(buildChoices(pool, answer, byTerm, 3)).toHaveLength(3);
  });
});
