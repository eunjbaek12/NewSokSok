import { cleanJapanesePhonetic, cleanPhonetic } from '@/lib/phonetic';

// 케이스는 전부 실측값이다(ja>ko·ja>en 100건 표본, 2026-08-11).
describe('cleanJapanesePhonetic — 살릴 수 있으면 살린다', () => {
  it('괄호 병기를 떼고 후리가나만 남긴다', () => {
    expect(cleanJapanesePhonetic('ああ (아아)', '嗚呼')).toBe('ああ');
    expect(cleanJapanesePhonetic('システム (しすてむ)', 'システム')).toBe('システム');
    expect(cleanJapanesePhonetic('タイトル (title)', 'タイトル')).toBe('タイトル');
    expect(cleanJapanesePhonetic('エネルギー（えねるぎー）', 'エネルギー')).toBe('エネルギー');
  });

  it('표제어에 공백이 없으면 후리가나의 공백도 지운다', () => {
    expect(cleanJapanesePhonetic('ござ いま す', '御座います')).toBe('ございます');
    expect(cleanJapanesePhonetic('ところ が', '所が')).toBe('ところが');
  });

  it('복수 읽기 병기는 첫 번째만 취한다', () => {
    expect(cleanJapanesePhonetic('よい / いい', '良い')).toBe('よい');
  });
});

describe('cleanJapanesePhonetic — 되살릴 수 없으면 버린다', () => {
  it('한글 전사는 통째로 버린다', () => {
    expect(cleanJapanesePhonetic('와인', 'ワイン')).toBe('');
    expect(cleanJapanesePhonetic('토라부루', 'トラブル')).toBe('');
    expect(cleanJapanesePhonetic('코코', 'ここ')).toBe('');
    expect(cleanJapanesePhonetic('데모', 'でも')).toBe('');
  });

  it('한글과 가나가 섞인 것도 버린다 — 부분 복구는 위험하다', () => {
    expect(cleanJapanesePhonetic('ござ이마스', '御座います')).toBe('');
    expect(cleanJapanesePhonetic('코ー너', 'コーナー')).toBe('');
    expect(cleanJapanesePhonetic('레-스', 'レース')).toBe('');
  });

  it('가나가 하나도 없으면 후리가나가 아니다', () => {
    expect(cleanJapanesePhonetic('wain', 'ワイン')).toBe('');
    expect(cleanJapanesePhonetic('校', '校')).toBe('');
    expect(cleanJapanesePhonetic('', '私')).toBe('');
  });
});

describe('cleanJapanesePhonetic — 멀쩡한 것은 건드리지 않는다', () => {
  it('한자 → 가나 변환은 그대로 통과', () => {
    expect(cleanJapanesePhonetic('かいぎ', '会議')).toBe('かいぎ');
    expect(cleanJapanesePhonetic('わたし', '私')).toBe('わたし');
    expect(cleanJapanesePhonetic('どう', '胴')).toBe('どう');
    expect(cleanJapanesePhonetic('コウ', '校')).toBe('コウ');
  });

  it('가나 전용 표제어의 동일 반복이 정답이다', () => {
    expect(cleanJapanesePhonetic('ワイン', 'ワイン')).toBe('ワイン');
    expect(cleanJapanesePhonetic('ここ', 'ここ')).toBe('ここ');
    expect(cleanJapanesePhonetic('ありがとう', 'ありがとう')).toBe('ありがとう');
  });

  it('표제어에 공백이 있으면 후리가나의 공백은 남긴다', () => {
    expect(cleanJapanesePhonetic('ほん を よむ', '本 を 読む')).toBe('ほん を よむ');
  });
});

describe('cleanPhonetic — 언어별 분기', () => {
  it('ja 는 일본어 규칙을 탄다', () => {
    expect(cleanPhonetic('와인', 'ja', 'ワイン')).toBe('');
    expect(cleanPhonetic('ああ (아아)', 'ja', '嗚呼')).toBe('ああ');
  });

  it('ja 가 아니면 성조 막대만 떼고 나머지는 보존한다', () => {
    expect(cleanPhonetic('ɗi˧˧', 'vi', 'đi')).toBe('ɗi');
    expect(cleanPhonetic('prəˈnʌnsiˌeɪʃən', 'en', 'pronunciation')).toBe('prəˈnʌnsiˌeɪʃən');
    expect(cleanPhonetic('annyeong', 'ko', '안녕')).toBe('annyeong');
    expect(cleanPhonetic('nǐ hǎo', 'zh', '你好')).toBe('nǐ hǎo');
  });

  it('한국어 로마자는 ja 규칙에 걸리지 않는다 — 출발어로만 갈라야 하는 이유', () => {
    expect(cleanPhonetic('annyeong', 'ko', '안녕')).not.toBe('');
  });
});
