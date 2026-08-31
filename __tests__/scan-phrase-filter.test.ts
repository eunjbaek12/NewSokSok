import { isLikelyPhrase, filterExtractedWords } from '../lib/stopwords';
// Edge 복사본 — moduleNameMapper가 .ts 상대 import를 무확장자로 매핑해 그대로 import.
import { isLikelyPhrase as edgeIsLikelyPhrase } from '../supabase/functions/_shared/script-filter';

describe('isLikelyPhrase — 문장·구 판정', () => {
  test('ko: 종결어미가 붙은 문장 덩어리는 true', () => {
    expect(isLikelyPhrase('하는중입니다', 'ko')).toBe(true); // 니다
    expect(isLikelyPhrase('학교에 갑니다', 'ko')).toBe(true); // 니다
    expect(isLikelyPhrase('맛있어요', 'ko')).toBe(true); // 어요
    expect(isLikelyPhrase('안녕하세요', 'ko')).toBe(true); // 세요
    expect(isLikelyPhrase('갔었어요', 'ko')).toBe(true); // 었어요
  });

  test('ko: 기본형 표제어·명사는 false (제외 금지)', () => {
    expect(isLikelyPhrase('하다', 'ko')).toBe(false); // 기본형 ~다
    expect(isLikelyPhrase('예쁘다', 'ko')).toBe(false);
    expect(isLikelyPhrase('먹다', 'ko')).toBe(false);
    expect(isLikelyPhrase('학교', 'ko')).toBe(false);
    expect(isLikelyPhrase('사과', 'ko')).toBe(false);
    expect(isLikelyPhrase('사이클', 'ko')).toBe(false); // 외래어
  });

  test('공통: 3덩어리+ 다어절과 과도한 길이는 true', () => {
    expect(isLikelyPhrase('학교에서 공부를 합니다', 'ko')).toBe(true); // 니다이기도 하고 3덩어리
    expect(isLikelyPhrase('the quick brown fox', 'en')).toBe(true); // 4덩어리
    expect(isLikelyPhrase('a'.repeat(25), 'en')).toBe(true); // 길이 상한
  });

  test('공통: 1공백 다어절 용어는 false (생존)', () => {
    expect(isLikelyPhrase('sinh viên', 'vi')).toBe(false);
    expect(isLikelyPhrase('ice cream', 'en')).toBe(false);
  });

  test('ja: 정중·과거 종결은 true, 辞書形은 false', () => {
    expect(isLikelyPhrase('食べます', 'ja')).toBe(true);
    expect(isLikelyPhrase('行きました', 'ja')).toBe(true);
    expect(isLikelyPhrase('食べる', 'ja')).toBe(false); // 辞書形
    expect(isLikelyPhrase('猫', 'ja')).toBe(false);
  });

  test('en/es/zh 단일 단어는 false', () => {
    expect(isLikelyPhrase('apple', 'en')).toBe(false);
    expect(isLikelyPhrase('escuela', 'es')).toBe(false);
    expect(isLikelyPhrase('学校', 'zh')).toBe(false);
  });
});

describe('🔴 구두점이 붙어도 문장을 잡는다 (2026-06-10 회귀)', () => {
  // 종결어미 검사가 `니다$`(문자열 끝)라, OCR 결과처럼 구두점이 붙어 오면
  // 매치가 깨져 거르개가 통째로 헛돌았다. 판정 직전에만 구두점을 뗀다.
  test('ko: 마침표·물음표·느낌표가 붙은 종결형', () => {
    expect(isLikelyPhrase('걸렸습니다.', 'ko')).toBe(true);
    expect(isLikelyPhrase('맛있어요!', 'ko')).toBe(true);
    expect(isLikelyPhrase('안녕하세요.', 'ko')).toBe(true);
    expect(isLikelyPhrase('데워 드릴까요?', 'ko')).toBe(true);
  });

  test('ja: 구두점이 붙은 정중형', () => {
    expect(isLikelyPhrase('食べます。', 'ja')).toBe(true);
    expect(isLikelyPhrase('行きました！', 'ja')).toBe(true);
  });

  test('기본형은 구두점이 붙어도 통과한다', () => {
    expect(isLikelyPhrase('예쁘다.', 'ko')).toBe(false);
    expect(isLikelyPhrase('食べる。', 'ja')).toBe(false);
    expect(isLikelyPhrase('apple.', 'en')).toBe(false);
    expect(isLikelyPhrase('학교.', 'ko')).toBe(false);
  });

  test('구두점만 있는 토큰은 빈 문자열로 취급', () => {
    expect(isLikelyPhrase('...', 'ko')).toBe(false);
  });
});

describe('filterExtractedWords — 문장 백스톱 통합', () => {
  test('ko 사진: 문장 덩어리 제외, 기본형·명사 유지', () => {
    const raw = ['하는중입니다', '학교', '사과', '맛있어요', '예쁘다'];
    const out = filterExtractedWords(raw, 'ko');
    expect(out).toEqual(['학교', '사과', '예쁘다']);
  });
});

describe('패리티 — lib/stopwords와 Edge script-filter isLikelyPhrase 일치', () => {
  const corpus = [
    '하는중입니다', '학교에 갑니다', '맛있어요', '안녕하세요', '갔었어요',
    '하다', '예쁘다', '먹다', '학교', '사과', '사이클',
    '학교에서 공부를 합니다', 'the quick brown fox', 'a'.repeat(25),
    'sinh viên', 'ice cream', '食べます', '行きました', '食べる', '猫',
    'apple', 'escuela', '学校', '',
    // 구두점 회귀(6/10) — 두 구현이 함께 갱신됐는지 검증
    '걸렸습니다.', '맛있어요!', '안녕하세요.', '데워 드릴까요?',
    '食べます。', '行きました！', '예쁘다.', '食べる。', 'apple.', '학교.', '...',
  ];
  const langs = ['ko', 'ja', 'zh', 'en', 'es', 'vi', 'fr'];

  test.each(langs)('lang=%s에서 두 구현의 판정이 일치', (lang) => {
    for (const term of corpus) {
      expect(edgeIsLikelyPhrase(term, lang)).toBe(isLikelyPhrase(term, lang));
    }
  });
});
