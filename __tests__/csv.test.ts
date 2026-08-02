import { UI_LOCALE_CODES } from '../shared/contracts';
import { serializeCsv, parseCsv, csvHeaders, CsvParseError, CsvWordRow } from '../utils/csv';

/**
 * 내보내기 헤더는 UI 언어를 따르는데, 가져오기는 헤더 **이름**으로 컬럼을 찾는다.
 * 그래서 새 언어의 헤더 라벨이 HEADER_ALIASES에 없으면 "내보낸 파일을 다시 가져올 수
 * 없는" 상태가 조용히 만들어진다 — 언어를 추가할 때 가장 놓치기 쉬운 지점이라 전
 * 로케일을 훑는다.
 */
describe('내보내기 헤더는 모든 UI 언어에서 다시 가져올 수 있다', () => {
  const rows: CsvWordRow[] = [
    { term: 'apple', meaningKr: '사과', phonetic: 'ˈæpəl', pos: 'noun', definition: 'a fruit', exampleEn: 'I ate an apple.', exampleKr: '나는 사과를 먹었다.', tags: ['과일', '기초'] },
  ];

  it.each(UI_LOCALE_CODES)('%s 헤더로 내보낸 파일이 손실 없이 왕복한다', (locale) => {
    const { rows: parsed, skipped } = parseCsv(serializeCsv(rows, locale));
    expect(skipped).toBe(0);
    expect(parsed).toEqual(rows);
  });

  it.each(UI_LOCALE_CODES)('%s 헤더는 컬럼 수가 맞고 빈 라벨이 없다', (locale) => {
    const headers = csvHeaders(locale);
    expect(headers).toHaveLength(8);
    expect(headers.every((h) => h.trim().length > 0)).toBe(true);
  });

  it('지원하지 않는 언어는 폴백 로케일의 헤더를 쓴다', () => {
    expect(csvHeaders('ja')).toEqual(csvHeaders('en'));
  });
});

describe('serializeCsv / parseCsv 왕복', () => {
  it('기본 행을 직렬화 후 파싱하면 동일하게 복원된다', () => {
    const rows: CsvWordRow[] = [
      { term: 'apple', meaningKr: '사과', phonetic: 'ˈæpəl', pos: 'noun', definition: 'a fruit', exampleEn: 'I ate an apple.', exampleKr: '나는 사과를 먹었다.', tags: ['과일', '기초'] },
    ];
    const csv = serializeCsv(rows, 'ko');
    const { rows: parsed, skipped } = parseCsv(csv);
    expect(skipped).toBe(0);
    expect(parsed).toEqual(rows);
  });

  it('콤마·따옴표가 든 필드를 손실 없이 왕복한다', () => {
    const rows: CsvWordRow[] = [
      { term: 'bank', meaningKr: '은행, 둑', phonetic: '', pos: '', definition: '', exampleEn: 'He said "hello", then left.', exampleKr: '', tags: [] },
    ];
    const csv = serializeCsv(rows, 'ko');
    const { rows: parsed } = parseCsv(csv);
    expect(parsed[0].meaningKr).toBe('은행, 둑');
    expect(parsed[0].exampleEn).toBe('He said "hello", then left.');
  });

  it('내보낸 파일은 BOM으로 시작하고 파싱 시 BOM이 제거된다', () => {
    const csv = serializeCsv([{ term: 'a', meaningKr: '에이' }], 'ko');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const { rows } = parseCsv(csv);
    expect(rows[0].term).toBe('a');
  });
});

describe('parseCsv 검증·정제', () => {
  it('단어/뜻 컬럼이 없으면 missingColumns 에러', () => {
    expect(() => parseCsv('이름,설명\na,b')).toThrow(CsvParseError);
    try { parseCsv('이름,설명\na,b'); } catch (e) { expect((e as CsvParseError).code).toBe('missingColumns'); }
  });

  it('단어 또는 뜻이 빈 행은 제외하고 skipped로 카운트', () => {
    const csv = '단어,뜻\napple,사과\n,뜻없는단어아님\nbanana,\ncherry,체리';
    const { rows, skipped } = parseCsv(csv);
    expect(rows.map((r) => r.term)).toEqual(['apple', 'cherry']);
    expect(skipped).toBe(2);
  });

  it('유효 행이 0개면 noValidRows 에러', () => {
    try { parseCsv('단어,뜻\n,\n,'); } catch (e) { expect((e as CsvParseError).code).toBe('noValidRows'); }
  });

  it('헤더 별칭(영어)과 컬럼 순서 변경을 인식한다', () => {
    const csv = 'meaning,word\n사과,apple';
    const { rows } = parseCsv(csv);
    expect(rows[0]).toMatchObject({ term: 'apple', meaningKr: '사과' });
  });

  it('제어문자(개행·탭)는 공백으로 정제된다', () => {
    const csv = '단어,뜻\napple,"사과\t사과나무"';
    const { rows } = parseCsv(csv);
    expect(rows[0].meaningKr).toBe('사과 사과나무');
  });

  it('term이 50자를 넘으면 잘린다', () => {
    const long = 'a'.repeat(80);
    const { rows } = parseCsv(`단어,뜻\n${long},뜻`);
    expect(rows[0].term.length).toBe(50);
  });

  it('태그는 세미콜론으로 분리된다', () => {
    const { rows } = parseCsv('단어,뜻,태그\napple,사과,과일;기초;음식');
    expect(rows[0].tags).toEqual(['과일', '기초', '음식']);
  });

  it('빈 줄은 무시된다', () => {
    const { rows } = parseCsv('단어,뜻\n\napple,사과\n\n');
    expect(rows).toHaveLength(1);
  });

  it('LF 전용 개행도 처리한다', () => {
    const { rows } = parseCsv('단어,뜻\napple,사과\nbanana,바나나');
    expect(rows).toHaveLength(2);
  });
});
