import { isStopword, filterExtractedWords } from '../lib/stopwords';

describe('Spanish stopwords', () => {
  test('common function words are stopwords', () => {
    expect(isStopword('de', 'es')).toBe(true);
    expect(isStopword('la', 'es')).toBe(true);
    expect(isStopword('que', 'es')).toBe(true);
    expect(isStopword('y', 'es')).toBe(true);
    expect(isStopword('en', 'es')).toBe(true);
    expect(isStopword('no', 'es')).toBe(true);
    expect(isStopword('es', 'es')).toBe(true);
  });

  test('content words are not stopwords', () => {
    expect(isStopword('casa', 'es')).toBe(false);
    expect(isStopword('libro', 'es')).toBe(false);
    expect(isStopword('escuela', 'es')).toBe(false);
  });

  test('filterExtractedWords drops es function words but keeps content', () => {
    const out = filterExtractedWords(
      ['de', 'la', 'casa', 'y', 'el', 'libro', 'que', 'escuela'],
      'es',
    );
    expect(out).toEqual(['casa', 'libro', 'escuela']);
  });
});
