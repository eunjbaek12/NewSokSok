import { deriveDisplayLanguages } from '@/constants/languages';

// 헬퍼: 언어만 담은 최소 단어.
const w = (sourceLang?: string, targetLang?: string) => ({ sourceLang, targetLang });

describe('deriveDisplayLanguages', () => {
  it('단어가 없으면 list 메타를 쓴다', () => {
    expect(deriveDisplayLanguages([], { sourceLanguage: 'vi', targetLanguage: 'ko' }))
      .toEqual({ source: 'vi', target: 'ko' });
  });

  it('단어도 list 메타도 없으면 en→ko로 폴백한다', () => {
    expect(deriveDisplayLanguages([])).toEqual({ source: 'en', target: 'ko' });
  });

  it('단일 언어 단어장은 그 언어를 반환한다', () => {
    const words = [w('vi', 'ko'), w('vi', 'ko'), w('vi', 'ko')];
    expect(deriveDisplayLanguages(words)).toEqual({ source: 'vi', target: 'ko' });
  });

  it('언어가 섞이면 최빈 언어를 택한다', () => {
    // source: vi×3, en×1 → vi. target: ko×3, en×1 → ko.
    const words = [w('vi', 'ko'), w('vi', 'ko'), w('vi', 'ko'), w('en', 'en')];
    expect(deriveDisplayLanguages(words)).toEqual({ source: 'vi', target: 'ko' });
  });

  it('단어의 언어가 list 메타보다 우선한다', () => {
    // 단어들은 es지만 list 메타는 낡은 en→ko. 사용자가 "단어마다"를 택했으므로 단어 기준.
    const words = [w('es', 'ko'), w('es', 'ko')];
    expect(deriveDisplayLanguages(words, { sourceLanguage: 'en', targetLanguage: 'ko' }))
      .toEqual({ source: 'es', target: 'ko' });
  });

  it('언어 필드가 비어 있으면 list 메타로, 그것도 없으면 폴백', () => {
    const words = [w(undefined, undefined), w(undefined, undefined)];
    expect(deriveDisplayLanguages(words, { sourceLanguage: 'ja' }))
      .toEqual({ source: 'ja', target: 'ko' });
  });

  it('source와 target을 독립적으로 계산한다(ko→en 덱)', () => {
    const words = [w('ko', 'en'), w('ko', 'en')];
    expect(deriveDisplayLanguages(words)).toEqual({ source: 'ko', target: 'en' });
  });
});
