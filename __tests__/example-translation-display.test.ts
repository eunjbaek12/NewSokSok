import { shouldShowExampleTranslation } from '@/constants/languages';

describe('shouldShowExampleTranslation', () => {
  it('정상 번역은 표시', () => {
    expect(shouldShowExampleTranslation('하늘에서 눈이 내린다.', 'Snow is falling from the sky.')).toBe(true);
  });

  it('예문과 동일 문장(같은 언어쌍 no-op 번역)은 숨김 — 기존 저장 중복 데이터 정리', () => {
    expect(shouldShowExampleTranslation('하얀 눈이 소복이 쌓였다.', '하얀 눈이 소복이 쌓였다.')).toBe(false);
    expect(shouldShowExampleTranslation('하얀 눈이 소복이 쌓였다. ', ' 하얀 눈이 소복이 쌓였다.')).toBe(false); // 공백 차이 무시
  });

  it('빈 값·undefined는 숨김', () => {
    expect(shouldShowExampleTranslation('example', '')).toBe(false);
    expect(shouldShowExampleTranslation('example', '   ')).toBe(false);
    expect(shouldShowExampleTranslation('example', undefined)).toBe(false);
    expect(shouldShowExampleTranslation(undefined, undefined)).toBe(false);
  });

  it('예문이 없어도 번역만 있으면 표시(수동 입력 존중)', () => {
    expect(shouldShowExampleTranslation('', '번역만 있음')).toBe(true);
    expect(shouldShowExampleTranslation(undefined, '번역만 있음')).toBe(true);
  });
});
