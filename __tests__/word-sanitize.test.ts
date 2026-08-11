// 저장 경계 정제(utils/word-sanitize) 테스트.
//
// 회귀 방지 대상: AI 보강/생성 결과가 저장 한도(WordSaveSchema)를 넘겨 addWord/
// addBatchWords가 throw하던 "단어 저장 중 문제가 발생했습니다" 버그. 정제 후에는
// 어떤 입력이든 WordSaveSchema.parse를 통과해야 한다. CAPS가 스키마와 어긋나면
// 정제가 여전히 초과 문자열을 남겨 저장이 깨지므로, 둘의 일치를 여기서 못박는다.
//
// 소스에 리터럴 제어문자를 두지 않도록 이스케이프(\n,\t)·String.fromCharCode로 표기한다.

import { WordSaveSchema } from '@shared/contracts';
import {
  WORD_SAVE_CAPS,
  sanitizeWordField,
  sanitizeWordForSave,
  stripControlChars,
} from '../utils/word-sanitize';

function repeat(ch: string, n: number): string {
  return ch.repeat(n);
}

// 공용 캐시 시딩(scripts/seed-cache.ts)이 이 함수에 기대는 계약. 길이를 자르거나 앞뒤
// 공백을 없애면 캐시에 원본과 다른 값이 굳으므로, 제어문자만 건드려야 한다.
describe('stripControlChars — 제어문자만, 길이·공백은 그대로', () => {
  const NUL = String.fromCharCode(0);

  it('U+0000 을 공백으로 바꾼다 — Postgres jsonb 가 거부하는 그 문자', () => {
    expect(stripControlChars(`음성${NUL}, 문자${NUL}`)).toBe('음성 , 문자 ');
    expect(stripControlChars(NUL)).toBe(' ');
  });

  it('제어문자 전 구간(U+0000–001F, U+007F–009F)을 덮는다', () => {
    expect(stripControlChars(`a${String.fromCharCode(0x1f)}b`)).toBe('a b');
    expect(stripControlChars(`a${String.fromCharCode(0x7f)}b`)).toBe('a b');
    expect(stripControlChars(`a${String.fromCharCode(0x9f)}b`)).toBe('a b');
  });

  it('앞뒤 공백을 남긴다 — sanitizeWordField 와 갈리는 지점', () => {
    expect(stripControlChars('  가운데  ')).toBe('  가운데  ');
    expect(sanitizeWordField('  가운데  ', 100)).toBe('가운데');
  });

  it('길이를 자르지 않는다', () => {
    const long = repeat('가', 5000);
    expect(stripControlChars(long)).toHaveLength(5000);
  });

  it('멀쩡한 문자열·이모지·빈 문자열은 그대로', () => {
    expect(stripControlChars('ございます')).toBe('ございます');
    expect(stripControlChars('🥑 avocado')).toBe('🥑 avocado');
    expect(stripControlChars('')).toBe('');
  });
});

describe('sanitizeWordField', () => {
  test('C0 control chars (LF/Tab/NUL) become spaces', () => {
    expect(sanitizeWordField('a\nb\tc' + String.fromCharCode(0) + 'd', 100)).toBe('a b c d');
  });

  test('C1 control chars (U+007F DEL, U+0085 NEL) become spaces', () => {
    expect(sanitizeWordField('a' + String.fromCharCode(0x85) + 'b' + String.fromCharCode(0x7f) + 'c', 100)).toBe('a b c');
  });

  test('trims surrounding whitespace', () => {
    expect(sanitizeWordField('  hello  ', 100)).toBe('hello');
  });

  test('clamps to cap', () => {
    expect(sanitizeWordField(repeat('x', 400), 300)).toHaveLength(300);
  });

  test('preserves visible spaces', () => {
    expect(sanitizeWordField('to be or not to be', 100)).toBe('to be or not to be');
  });

  test('handles emoji/multibyte by code point', () => {
    expect(sanitizeWordField('사과 🍎 apple', 100)).toBe('사과 🍎 apple');
  });
});

describe('sanitizeWordForSave', () => {
  test('sanitizes and clamps the 7 text fields', () => {
    const out = sanitizeWordForSave({
      term: repeat('t', 60),
      meaningKr: '뜻\n에\t개행',
      definition: repeat('d', 600),
      exampleEn: 'a b',
      phonetic: repeat('p', 100),
      pos: 'noun',
    });
    expect(out.term).toHaveLength(WORD_SAVE_CAPS.term);
    expect(out.meaningKr).toBe('뜻 에 개행');
    expect(out.definition).toHaveLength(WORD_SAVE_CAPS.definition);
    expect(out.exampleEn).toBe('a b');
    expect(out.phonetic).toHaveLength(WORD_SAVE_CAPS.phonetic);
    expect(out.pos).toBe('noun');
  });

  test('leaves non-schema fields (sourceLang/tags/isStarred) untouched', () => {
    const out = sanitizeWordForSave({
      term: 'apple',
      meaningKr: '사과',
      sourceLang: 'en',
      targetLang: 'ko',
      isStarred: true,
      tags: ['fruit', 'food'],
    });
    expect(out.sourceLang).toBe('en');
    expect(out.targetLang).toBe('ko');
    expect(out.isStarred).toBe(true);
    expect(out.tags).toEqual(['fruit', 'food']);
  });

  test('does not add absent fields (safe for partial updates)', () => {
    const out = sanitizeWordForSave({ meaningKr: '뜻' });
    expect('term' in out).toBe(false);
    expect('definition' in out).toBe(false);
  });

  test('does not mutate the input (returns a new object)', () => {
    const input = { term: '  spaced  ' };
    const out = sanitizeWordForSave(input);
    expect(input.term).toBe('  spaced  ');
    expect(out.term).toBe('spaced');
  });
});

describe('sanitized output always passes WordSaveSchema (bug regression)', () => {
  test('over-limit + control-char AI result passes after sanitize', () => {
    // 보강이 관대한 수신 스키마로 받아들이던 대표적 악성 케이스.
    const aiResult = {
      term: repeat('w', 150),
      meaningKr: repeat('뜻', 900),
      definition: repeat('d', 1500),
      exampleEn: 'He said,\n"Hello."\t' + repeat('x', 900),
      exampleKr: repeat('예', 900),
      phonetic: repeat('ˈ', 240),
      pos: repeat('n', 60),
    };
    // 정제 전에는 저장 스키마가 거부(버그 재현).
    expect(WordSaveSchema.safeParse(aiResult).success).toBe(false);
    // 정제 후에는 반드시 통과.
    expect(WordSaveSchema.safeParse(sanitizeWordForSave(aiResult)).success).toBe(true);
  });
});

describe('WORD_SAVE_CAPS matches WordSaveSchema limits', () => {
  // cap 길이는 통과하고 cap+1은 거부돼야 CAPS가 스키마와 정확히 일치한다.
  const fields: (keyof typeof WORD_SAVE_CAPS)[] = [
    'term', 'definition', 'meaningKr', 'exampleEn', 'exampleKr', 'phonetic', 'pos',
  ];
  for (const field of fields) {
    test(`${field}: cap(${WORD_SAVE_CAPS[field]}) passes, cap+1 rejected`, () => {
      const cap = WORD_SAVE_CAPS[field];
      const base = { term: 'ok', meaningKr: 'ok' };
      expect(WordSaveSchema.safeParse({ ...base, [field]: repeat('a', cap) }).success).toBe(true);
      expect(WordSaveSchema.safeParse({ ...base, [field]: repeat('a', cap + 1) }).success).toBe(false);
    });
  }
});
