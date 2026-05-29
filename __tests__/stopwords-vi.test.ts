import { isStopword, filterExtractedWords } from '../lib/stopwords';

describe('Vietnamese stopwords', () => {
  test('common function words are stopwords', () => {
    expect(isStopword('của', 'vi')).toBe(true);
    expect(isStopword('là', 'vi')).toBe(true);
    expect(isStopword('và', 'vi')).toBe(true);
    expect(isStopword('rất', 'vi')).toBe(true);
  });

  test('content words are not stopwords', () => {
    expect(isStopword('học', 'vi')).toBe(false);
    expect(isStopword('trường', 'vi')).toBe(false);
    expect(isStopword('sinh viên', 'vi')).toBe(false);
  });

  test('filterExtractedWords drops vi function words but keeps content', () => {
    const out = filterExtractedWords(
      ['của', 'là', 'sinh viên', 'học', 'và', 'trường', 'rất'],
      'vi',
    );
    expect(out).toEqual(['sinh viên', 'học', 'trường']);
  });
});
