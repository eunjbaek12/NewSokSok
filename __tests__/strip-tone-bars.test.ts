import { stripToneBars } from '@/lib/phonetic';

describe('stripToneBars', () => {
  it('베트남어 성조 막대 5종(U+02E5–U+02E9)을 전부 제거한다', () => {
    expect(stripToneBars('ɗi˧˧')).toBe('ɗi'); // ngang — "ㅓㅓ"처럼 보이던 케이스
    expect(stripToneBars('caw˨˩')).toBe('caw'); // huyền
    expect(stripToneBars('ma˧˥')).toBe('ma'); // sắc
    expect(stripToneBars('la˥la˦la˩')).toBe('lalala');
  });

  it('다음절어는 음절 사이 막대도 제거하고 공백은 유지한다', () => {
    expect(stripToneBars('sin˧˧ caw˨˩')).toBe('sin caw');
  });

  it('영어 IPA 강세 기호 ˈ(U+02C8)·ˌ(U+02CC)는 보존한다', () => {
    expect(stripToneBars('prəˈnʌnsiˌeɪʃən')).toBe('prəˈnʌnsiˌeɪʃən');
    expect(stripToneBars('ˈɡɾasjas')).toBe('ˈɡɾasjas');
  });

  it('막대 없는 표기·빈 문자열은 그대로', () => {
    expect(stripToneBars('annyeong')).toBe('annyeong');
    expect(stripToneBars('nǐ hǎo')).toBe('nǐ hǎo');
    expect(stripToneBars('')).toBe('');
  });

  it('막대만 있으면 빈 문자열(트림 포함)', () => {
    expect(stripToneBars('˧˧')).toBe('');
    expect(stripToneBars(' ˨˩ ')).toBe('');
  });
});
