// «단어·번역 오류 알리기»가 문의 표에 싣는 덱 칸 — 판단만 잡는다.
// 화면(오른쪽 위 버튼·제목 내려감·알림창)과 서버 조회 필터는 기기·원격에서 확인한다.

import {
  themeColumns,
  themeMailLines,
  THEME_ID_MAX,
  THEME_TITLE_MAX,
} from '@/features/support/deck-error';

describe('themeColumns', () => {
  test('덱이 없으면 키 자체가 없다 — 칸이 없는 서버에서도 평소 문의가 나간다', () => {
    expect(themeColumns(null)).toEqual({});
    expect(themeColumns(undefined)).toEqual({});
    expect('theme_id' in themeColumns(null)).toBe(false);
    expect('theme_title' in themeColumns(undefined)).toBe(false);
  });

  test('id·제목이 둘 다 있어야 싣는다 — 서버의 짝 제약과 같다', () => {
    expect(themeColumns({ id: 'curated-ngsl-1', title: '   ' })).toEqual({});
    expect(themeColumns({ id: ' ', title: '기초 영어 필수 1000' })).toEqual({});
  });

  test('앞뒤 공백을 걷어 싣는다', () => {
    expect(themeColumns({ id: ' curated-ngsl-1 ', title: ' 기초 영어 필수 1000 ' })).toEqual({
      theme_id: 'curated-ngsl-1',
      theme_title: '기초 영어 필수 1000',
    });
  });

  test('서버 칸의 상한에서 자른다 — 넘기면 insert 가 check 제약에 걸려 제보가 실패한다', () => {
    const cols = themeColumns({ id: 'x'.repeat(THEME_ID_MAX + 10), title: '가'.repeat(THEME_TITLE_MAX + 10) });
    expect(cols.theme_id).toHaveLength(THEME_ID_MAX);
    expect(cols.theme_title).toHaveLength(THEME_TITLE_MAX);
  });
});

describe('themeMailLines', () => {
  test('덱이 없으면 아무 줄도 붙지 않는다 — 문의하기의 메일 폴백은 그대로', () => {
    expect(themeMailLines(null)).toEqual([]);
  });

  test('덱이 있으면 한국어 표지 한 줄 + 빈 줄 — 읽는 사람이 운영자다', () => {
    expect(themeMailLines({ id: 'curated-ngsl-1', title: '기초 영어 필수 1000' })).toEqual([
      '[단어장] 기초 영어 필수 1000 (curated-ngsl-1)',
      '',
    ]);
  });
});
