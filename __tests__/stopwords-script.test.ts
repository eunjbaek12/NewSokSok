import { matchesSourceScript, filterExtractedWords } from '../lib/stopwords';
// Edge Function 복사본 — jest moduleNameMapper가 .ts 상대 import를 무확장자로
// 매핑하므로 그대로 import 가능. 두 구현의 드리프트를 패리티 테스트로 검출한다.
import { matchesSourceScript as edgeMatchesSourceScript } from '../supabase/functions/_shared/script-filter';

describe('matchesSourceScript — 출발어 문자 체계 판정', () => {
  test('ko: 한글 포함이면 통과, 라틴/한자 전용은 탈락', () => {
    expect(matchesSourceScript('사과', 'ko')).toBe(true);
    expect(matchesSourceScript('사이클', 'ko')).toBe(true); // 한글 표기 외래어
    expect(matchesSourceScript('IT기업', 'ko')).toBe(true); // 혼합 — 한글 포함
    expect(matchesSourceScript('Cycle', 'ko')).toBe(false);
    expect(matchesSourceScript('apple', 'ko')).toBe(false);
    expect(matchesSourceScript('林檎', 'ko')).toBe(false); // 한자만
  });

  test('ja: 가나 또는 한자 포함이면 통과, 라틴/한글 전용은 탈락', () => {
    expect(matchesSourceScript('猫', 'ja')).toBe(true);
    expect(matchesSourceScript('たべる', 'ja')).toBe(true);
    expect(matchesSourceScript('食べる', 'ja')).toBe(true); // 가나+한자
    expect(matchesSourceScript('apple', 'ja')).toBe(false);
    expect(matchesSourceScript('사과', 'ja')).toBe(false);
  });

  test('zh: 한자 포함이되 가나·한글은 불포함이어야 통과', () => {
    expect(matchesSourceScript('苹果', 'zh')).toBe(true);
    expect(matchesSourceScript('水果', 'zh')).toBe(true);
    expect(matchesSourceScript('たべる', 'zh')).toBe(false); // 가나
    expect(matchesSourceScript('食べる', 'zh')).toBe(false); // 한자+가나 → 일본어
    expect(matchesSourceScript('apple', 'zh')).toBe(false);
    expect(matchesSourceScript('사과', 'zh')).toBe(false);
  });

  test('en/es/vi: 라틴 포함이되 CJK·한글은 불포함이어야 통과', () => {
    expect(matchesSourceScript('apple', 'en')).toBe(true);
    expect(matchesSourceScript('escuela', 'es')).toBe(true);
    expect(matchesSourceScript('canción', 'es')).toBe(true); // 악센트
    expect(matchesSourceScript('trường', 'vi')).toBe(true); // 성조 문자
    expect(matchesSourceScript('사과', 'en')).toBe(false);
    expect(matchesSourceScript('猫', 'es')).toBe(false);
    expect(matchesSourceScript('林檎', 'vi')).toBe(false);
  });

  test('미지원 언어는 판정 불가 — 무조건 통과', () => {
    expect(matchesSourceScript('anything', 'fr')).toBe(true);
    expect(matchesSourceScript('무엇이든', 'th')).toBe(true);
  });
});

describe('filterExtractedWords — 스크립트 필터 통합', () => {
  test('ko 사진(한국어+영어 혼재): 영어 전용 토큰만 탈락, 한글/혼합은 유지', () => {
    const raw = ['사과', 'Cycle', 'apple', '학교', 'IT기업', '사이클'];
    const out = filterExtractedWords(raw, 'ko');
    expect(out).toEqual(['사과', '학교', 'IT기업', '사이클']);
  });

  test('ja 사진: 영어 혼입 탈락, 가나·한자 유지', () => {
    const raw = ['猫', 'cat', '魚', 'fish', '食べる'];
    const out = filterExtractedWords(raw, 'ja');
    expect(out).toEqual(['猫', '魚', '食べる']);
  });

  test('en 사진: 한글·한자 혼입 탈락, 영어 유지', () => {
    const raw = ['apple', '사과', 'fruit', '水果'];
    const out = filterExtractedWords(raw, 'en');
    expect(out).toEqual(['apple', 'fruit']);
  });
});

describe('패리티 — lib/stopwords와 Edge script-filter 복사본 동일 결과', () => {
  const corpus = [
    '사과', 'Cycle', 'apple', '학교', 'IT기업', '사이클', '林檎',
    '猫', 'たべる', '食べる', '苹果', '水果',
    'escuela', 'canción', 'trường', '무엇이든', '123', '',
  ];
  const langs = ['ko', 'ja', 'zh', 'en', 'es', 'vi', 'fr'];

  test.each(langs)('lang=%s에서 두 구현의 판정이 일치', (lang) => {
    for (const term of corpus) {
      expect(edgeMatchesSourceScript(term, lang)).toBe(matchesSourceScript(term, lang));
    }
  });
});
