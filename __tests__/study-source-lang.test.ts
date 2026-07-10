import { getStudySourceLang, getTtsLang } from '@/constants/languages';

describe('getStudySourceLang', () => {
  it('리스트 언어가 있으면 리스트 우선 — 구버전 오염 덱(단어=en 오스탬프, 리스트=vi 정확) 보호', () => {
    expect(getStudySourceLang({ sourceLang: 'en' }, { sourceLanguage: 'vi' })).toBe('vi');
  });

  it('개인 단어장(리스트 언어 NULL)은 단어 자체 언어로 폴백', () => {
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
