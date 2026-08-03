import { serializeCsv, parseCsv, CsvWordRow } from '../utils/csv';
import { WordSaveSchema } from '../shared/contracts';

// CSV 가져오기의 실질 계약: parseCsv 출력이 "그대로" WordSaveSchema(실제 저장
// 검증)를 통과해야 한다. utils/csv.ts의 CAPS·제어문자 sanitize가 스키마와
// 어긋나면 가져오기가 저장 단계에서 throw — 이 테스트가 그 동기화를 지킨다.

const validateAll = (rows: CsvWordRow[]) => {
  for (const r of rows) {
    // addBatchWords 경로가 넘기는 필드 형태 그대로 검증
    WordSaveSchema.parse({
      term: r.term,
      definition: r.definition,
      meaningKr: r.meaningKr,
      exampleEn: r.exampleEn,
      exampleKr: r.exampleKr,
      phonetic: r.phonetic,
      pos: r.pos,
    });
  }
};

describe('CSV 가져오기 → WordSaveSchema 호환', () => {
  it('비영어·특수문자 단어장이 왕복 후 전부 저장 스키마를 통과한다', () => {
    const rows: CsvWordRow[] = [
      { term: 'đi', meaningKr: '가다', phonetic: 'ɗi', pos: 'verb', definition: 'di chuyển', exampleEn: 'Tôi đi học.', exampleKr: '나는 학교에 간다.', tags: ['기초'] },
      { term: 'chào', meaningKr: '인사하다', phonetic: 'caw', pos: 'verb', definition: '', exampleEn: 'Chào bạn!', exampleKr: '안녕!', tags: [] },
      { term: '눈', meaningKr: '① eye ② snow', phonetic: 'nun', pos: 'noun', definition: '① 시각 기관 ② 하늘에서 내리는 얼음 결정', exampleEn: '① 눈이 아프다 ② 눈이 온다', exampleKr: '① My eyes hurt ② It snows', tags: ['동음이의어'] },
      { term: 'piñata', meaningKr: '피냐타', phonetic: 'piˈɲata', pos: 'noun', definition: 'juguete de fiesta', exampleEn: 'Rompimos la piñata, ¡qué divertido!', exampleKr: '피냐타를 깼다', tags: ['es'] },
      { term: 'quote, comma', meaningKr: '그는 "안녕, 잘 가"라고 말했다', phonetic: '', pos: '', definition: 'a "quoted, thing"', exampleEn: 'She said "hi, there".', exampleKr: '', tags: ['a;b'.replace(';', '')] },
    ];
    const { rows: parsed, skipped } = parseCsv(serializeCsv(rows, 'ko'));
    expect(skipped).toBe(0);
    expect(parsed.map(r => r.term)).toEqual(rows.map(r => r.term));
    expect(parsed[2].meaningKr).toBe('① eye ② snow'); // 동음이의어 병기 마커 보존
    validateAll(parsed);
  });

  it('외부 CSV의 제어문자·개행은 공백으로 정리돼 NO_CONTROL을 통과한다', () => {
    // 따옴표 안 개행(RFC4180) + 탭·NUL 제어문자가 섞인 손제작 파일
    const handMade = '단어,뜻,예문\r\ncat,"고양\t이","first line\nsecond line"\r\n';
    const { rows } = parseCsv(handMade);
    expect(rows[0].meaningKr).toBe('고양 이');
    expect(rows[0].exampleEn).toBe('first line second line');
    validateAll(rows);
  });

  it('길이 초과 필드는 스키마 상한으로 잘려 통과한다 (CAPS=WordSaveSchema 동기화)', () => {
    const long = (n: number) => 'x'.repeat(n + 100);
    const csv = ['단어,뜻,발음,품사,정의,예문,예문뜻',
      `${long(50)},${long(300)},${long(80)},${long(60)},${long(500)},${long(300)},${long(300)}`].join('\r\n');
    const { rows } = parseCsv(csv);
    expect(rows[0].term).toHaveLength(50);
    expect(rows[0].meaningKr).toHaveLength(300);
    expect(rows[0].phonetic).toHaveLength(80);
    expect(rows[0].pos).toHaveLength(60);
    expect(rows[0].definition).toHaveLength(500);
    expect(rows[0].exampleEn).toHaveLength(300);
    expect(rows[0].exampleKr).toHaveLength(300);
    validateAll(rows);
  });

  it('영어 헤더 별칭으로 만든 외부 파일도 매핑된다', () => {
    const csv = 'word,meaning,pronunciation,pos,definition,example,example translation,tags\r\nrun,달리다,rʌn,verb,to move fast,I run.,나는 달린다.,verb;basic\r\n';
    const { rows } = parseCsv(csv);
    expect(rows[0]).toMatchObject({ term: 'run', meaningKr: '달리다', phonetic: 'rʌn' });
    expect(rows[0].tags).toEqual(['verb', 'basic']);
    validateAll(rows);
  });
});

describe('엑셀(한글 Windows) 호환 바이트 검증', () => {
  it('UTF-8 인코딩 시 파일이 BOM(EF BB BF)으로 시작하고 CRLF를 쓴다', () => {
    const csv = serializeCsv([{ term: 'apple', meaningKr: '사과' }], 'ko');
    const bytes = Buffer.from(csv, 'utf8');
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]); // 엑셀 한글 깨짐 방지
    expect(csv).toContain('\r\n'); // RFC 4180 줄끝
    expect(csv.split('\r\n')[0]).toBe('﻿단어,뜻,발음,품사,정의,예문,예문뜻,태그');
  });
});
