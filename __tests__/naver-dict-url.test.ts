import { getNaverDictUrl } from '@/constants/languages';

// 헬퍼: base 부분만 비교하기 쉽게 추출.
const base = (src?: string, tgt?: string) =>
  getNaverDictUrl(src, tgt, 'word').replace('/#/search?query=word', '');

describe('getNaverDictUrl', () => {
  describe('한국어가 낀 쌍 → 한국 로케일 사전 (양방향 동일)', () => {
    it.each([
      ['en', 'https://en.dict.naver.com'],
      ['ja', 'https://ja.dict.naver.com'],
      ['zh', 'https://zh.dict.naver.com'],
      ['vi', 'https://dict.naver.com/vikodict'],
      ['es', 'https://dict.naver.com/eskodict'],
    ])('%s↔ko', (lang, expected) => {
      expect(base(lang, 'ko')).toBe(expected);
      expect(base('ko', lang)).toBe(expected);
    });

    it('ko→ko는 국어사전', () => {
      expect(base('ko', 'ko')).toBe('https://ko.dict.naver.com');
    });
  });

  describe('영어가 낀 쌍 → 글로벌 사전 (양방향 동일)', () => {
    it.each([
      ['ja', 'https://english.dict.naver.com/english-japanese-dictionary'],
      ['zh', 'https://english.dict.naver.com/english-chinese-dictionary'],
      ['vi', 'https://english.dict.naver.com/english-vietnamese-dictionary'],
      ['es', 'https://english.dict.naver.com/english-spanish-dictionary'],
    ])('en↔%s', (lang, expected) => {
      expect(base('en', lang)).toBe(expected);
      expect(base(lang, 'en')).toBe(expected);
    });

    it('en→en은 영영사전', () => {
      expect(base('en', 'en')).toBe('https://english.dict.naver.com/english-dictionary');
    });
  });

  describe('비영어·비한국어 쌍 → en↔출발어 글로벌 사전 폴백', () => {
    it.each([
      ['ja', 'zh', 'https://english.dict.naver.com/english-japanese-dictionary'],
      ['zh', 'vi', 'https://english.dict.naver.com/english-chinese-dictionary'],
      ['es', 'vi', 'https://english.dict.naver.com/english-spanish-dictionary'],
      ['vi', 'es', 'https://english.dict.naver.com/english-vietnamese-dictionary'],
      // 동일 언어 쌍도 출발어 기준.
      ['ja', 'ja', 'https://english.dict.naver.com/english-japanese-dictionary'],
    ])('%s→%s', (src, tgt, expected) => {
      expect(base(src, tgt)).toBe(expected);
    });
  });

  describe('결측·미지원 언어 방어', () => {
    it('언어 누락 시 en→ko(영한사전)로 폴백한다 (legacy 단어)', () => {
      expect(base(undefined, undefined)).toBe('https://en.dict.naver.com');
    });

    it('미지원 출발어는 영한사전으로 폴백한다', () => {
      expect(base('fr', 'ko')).toBe('https://en.dict.naver.com');
      expect(base('fr', 'ja')).toBe('https://en.dict.naver.com');
    });

    it('출발어가 ko인데 도착어가 미지원이면 국어사전으로 폴백한다', () => {
      expect(base('ko', 'fr')).toBe('https://ko.dict.naver.com');
    });
  });

  describe('검색어 처리', () => {
    it('검색어를 URL 인코딩하고 공백을 다듬는다', () => {
      expect(getNaverDictUrl('vi', 'ko', '  xin chào  '))
        .toBe('https://dict.naver.com/vikodict/#/search?query=xin%20ch%C3%A0o');
    });

    it('한글·특수문자를 인코딩한다', () => {
      expect(getNaverDictUrl('ko', 'en', '사과&배'))
        .toBe('https://en.dict.naver.com/#/search?query=%EC%82%AC%EA%B3%BC%26%EB%B0%B0');
    });
  });
});
