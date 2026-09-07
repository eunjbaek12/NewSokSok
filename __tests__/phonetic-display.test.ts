import { formatPhonetic } from '@/constants/languages';

describe('formatPhonetic', () => {
  it('슬래시가 없는 값은 한 겹으로 감싼다 (AI가 채운 형태)', () => {
    expect(formatPhonetic('suˈsʌrəs')).toBe('/suˈsʌrəs/');
    expect(formatPhonetic('ˈbæθɒs')).toBe('/ˈbæθɒs/');
  });

  it('이미 슬래시가 든 값을 겹쳐 감싸지 않는다 — 옛 데이터가 //wɔːk// 로 보이던 결함', () => {
    expect(formatPhonetic('/wɔːk/')).toBe('/wɔːk/');
    expect(formatPhonetic('//wɔːk//')).toBe('/wɔːk/');
  });

  it('앞뒤 공백과 한쪽만 있는 슬래시도 정리한다', () => {
    expect(formatPhonetic('  /wɔːk/  ')).toBe('/wɔːk/');
    expect(formatPhonetic('/wɔːk')).toBe('/wɔːk/');
    expect(formatPhonetic('wɔːk/')).toBe('/wɔːk/');
  });

  it('빈 값은 빈 문자열 — 슬래시만 남지 않게', () => {
    expect(formatPhonetic('')).toBe('');
    expect(formatPhonetic('   ')).toBe('');
    expect(formatPhonetic(undefined)).toBe('');
    expect(formatPhonetic('//')).toBe('');
  });

  it('영어가 아닌 표기도 그대로 감싼다 (가나·병음·로마자)', () => {
    expect(formatPhonetic('かいぎ')).toBe('/かいぎ/');
    expect(formatPhonetic('nǐ hǎo')).toBe('/nǐ hǎo/');
    expect(formatPhonetic('annyeong')).toBe('/annyeong/');
  });

  it('가운데 슬래시는 건드리지 않는다 (이형 표기 구분자)', () => {
    expect(formatPhonetic('ˈeɪ/ˈɑː')).toBe('/ˈeɪ/ˈɑː/');
  });
});
