import { getStudySourceLang, getTtsLang } from '@/constants/languages';

describe('getStudySourceLang', () => {
  it('단어 자체 언어 우선 — 혼합 언어 덱(리스트=vi, 추가한 단어=en)에서 단어 언어로 읽음', () => {
    expect(getStudySourceLang({ sourceLang: 'en' }, { sourceLanguage: 'vi' })).toBe('en');
    expect(getStudySourceLang({ sourceLang: 'ja' }, { sourceLanguage: 'vi' })).toBe('ja');
  });

  it('단어 언어가 없으면 리스트 언어로 폴백(sourceLang 컬럼 이전 구버전 단어)', () => {
    expect(getStudySourceLang({}, { sourceLanguage: 'vi' })).toBe('vi');
    expect(getStudySourceLang({ sourceLang: undefined }, { sourceLanguage: 'zh' })).toBe('zh');
  });

  it('개인 단어장(리스트 언어 NULL)은 단어 자체 언어 사용', () => {
    expect(getStudySourceLang({ sourceLang: 'es' }, { sourceLanguage: undefined })).toBe('es');
    expect(getStudySourceLang({ sourceLang: 'es' }, undefined)).toBe('es');
  });

  it('둘 다 없으면 undefined → getTtsLang en-US 폴백', () => {
    expect(getStudySourceLang({}, undefined)).toBeUndefined();
    expect(getTtsLang(getStudySourceLang({}, undefined))).toBe('en-US');
  });

  it('개인 단어장 스페인어 단어의 TTS 태그는 es-ES', () => {
    expect(getTtsLang(getStudySourceLang({ sourceLang: 'es' }, {}))).toBe('es-ES');
  });
});
