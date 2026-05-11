// Save-side ("strict") schema validation tests.
//
// These mirror the DB CHECK constraints applied to the curated and cloud
// tables in group A. A regression here either lets bad data reach Supabase
// (where the DB error becomes user-visible) or rejects valid input (UX
// break). Boundary values are exercised explicitly because the limits are
// policy decisions that drift without test pressure.

import { WordSaveSchema, CurationShareSchema, NicknameSchema } from '@shared/contracts';

function repeat(ch: string, n: number): string {
  return ch.repeat(n);
}

describe('WordSaveSchema — term (required, 1..50, no ctrl)', () => {
  test('accepts a typical word', () => {
    expect(WordSaveSchema.safeParse({ term: 'serendipity' }).success).toBe(true);
  });

  test('accepts exactly 50 chars (boundary)', () => {
    expect(WordSaveSchema.safeParse({ term: repeat('a', 50) }).success).toBe(true);
  });

  test('rejects 51 chars (over max)', () => {
    expect(WordSaveSchema.safeParse({ term: repeat('a', 51) }).success).toBe(false);
  });

  test('rejects empty string (under min)', () => {
    expect(WordSaveSchema.safeParse({ term: '' }).success).toBe(false);
  });

  test.each([
    ['NUL', '\x00'],
    ['LF', '\n'],
    ['CR', '\r'],
    ['TAB', '\t'],
    ['DEL', '\x7F'],
    ['C1 (U+0085)', '\x85'],
  ])('rejects control character %s', (_label, ch) => {
    expect(WordSaveSchema.safeParse({ term: `hello${ch}world` }).success).toBe(false);
  });
});

describe('WordSaveSchema — definition (optional, max 500)', () => {
  test('accepts missing field (defaults to empty)', () => {
    const parsed = WordSaveSchema.parse({ term: 'word' });
    expect(parsed.definition).toBe('');
  });

  test('accepts exactly 500 chars', () => {
    expect(WordSaveSchema.safeParse({ term: 'word', definition: repeat('a', 500) }).success).toBe(true);
  });

  test('rejects 501 chars', () => {
    expect(WordSaveSchema.safeParse({ term: 'word', definition: repeat('a', 501) }).success).toBe(false);
  });
});

describe('WordSaveSchema — meaningKr / exampleEn / exampleKr / phonetic / pos', () => {
  test('exampleEn at boundary (300 ok, 301 reject)', () => {
    expect(WordSaveSchema.safeParse({ term: 'w', exampleEn: repeat('a', 300) }).success).toBe(true);
    expect(WordSaveSchema.safeParse({ term: 'w', exampleEn: repeat('a', 301) }).success).toBe(false);
  });

  test('phonetic at boundary (80 ok, 81 reject)', () => {
    expect(WordSaveSchema.safeParse({ term: 'w', phonetic: repeat('a', 80) }).success).toBe(true);
    expect(WordSaveSchema.safeParse({ term: 'w', phonetic: repeat('a', 81) }).success).toBe(false);
  });

  test('pos at boundary (60 ok, 61 reject)', () => {
    expect(WordSaveSchema.safeParse({ term: 'w', pos: repeat('a', 60) }).success).toBe(true);
    expect(WordSaveSchema.safeParse({ term: 'w', pos: repeat('a', 61) }).success).toBe(false);
  });

  test('rejects control char in any field', () => {
    expect(WordSaveSchema.safeParse({ term: 'w', meaningKr: 'a\nb' }).success).toBe(false);
    expect(WordSaveSchema.safeParse({ term: 'w', exampleEn: 'a\x00b' }).success).toBe(false);
  });
});

describe('CurationShareSchema', () => {
  test('accepts valid input', () => {
    expect(CurationShareSchema.safeParse({
      title: 'TOEIC Words',
      description: 'High-frequency TOEIC vocabulary',
      creatorName: 'kim',
    }).success).toBe(true);
  });

  test('title at boundary (1 / 80 ok, 0 / 81 reject)', () => {
    expect(CurationShareSchema.safeParse({ title: 'a', creatorName: 'k' }).success).toBe(true);
    expect(CurationShareSchema.safeParse({ title: repeat('a', 80), creatorName: 'k' }).success).toBe(true);
    expect(CurationShareSchema.safeParse({ title: '', creatorName: 'k' }).success).toBe(false);
    expect(CurationShareSchema.safeParse({ title: repeat('a', 81), creatorName: 'k' }).success).toBe(false);
  });

  test('creatorName at boundary (1 / 20 ok, 0 / 21 reject)', () => {
    expect(CurationShareSchema.safeParse({ title: 't', creatorName: 'a' }).success).toBe(true);
    expect(CurationShareSchema.safeParse({ title: 't', creatorName: repeat('a', 20) }).success).toBe(true);
    expect(CurationShareSchema.safeParse({ title: 't', creatorName: '' }).success).toBe(false);
    expect(CurationShareSchema.safeParse({ title: 't', creatorName: repeat('a', 21) }).success).toBe(false);
  });

  test('description at boundary (300 ok, 301 reject)', () => {
    expect(CurationShareSchema.safeParse({ title: 't', creatorName: 'k', description: repeat('a', 300) }).success).toBe(true);
    expect(CurationShareSchema.safeParse({ title: 't', creatorName: 'k', description: repeat('a', 301) }).success).toBe(false);
  });

  test('description optional', () => {
    expect(CurationShareSchema.safeParse({ title: 't', creatorName: 'k' }).success).toBe(true);
  });

  test('rejects control characters anywhere', () => {
    expect(CurationShareSchema.safeParse({ title: 'a\nb', creatorName: 'k' }).success).toBe(false);
    expect(CurationShareSchema.safeParse({ title: 't', creatorName: 'k\tim' }).success).toBe(false);
    expect(CurationShareSchema.safeParse({ title: 't', creatorName: 'k', description: 'a\x00b' }).success).toBe(false);
  });
});

describe('NicknameSchema', () => {
  test('accepts empty string (nickname is optional)', () => {
    expect(NicknameSchema.safeParse('').success).toBe(true);
  });

  test('accepts up to 20 chars', () => {
    expect(NicknameSchema.safeParse(repeat('a', 20)).success).toBe(true);
  });

  test('rejects 21 chars', () => {
    expect(NicknameSchema.safeParse(repeat('a', 21)).success).toBe(false);
  });

  test('rejects control characters', () => {
    expect(NicknameSchema.safeParse('kim\nlee').success).toBe(false);
    expect(NicknameSchema.safeParse('kim\x00').success).toBe(false);
  });
});
