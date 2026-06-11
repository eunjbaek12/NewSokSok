import { serializeCsv, parseCsv, CsvWordRow } from '../utils/csv';

// addBatchWords(features/vocab/db.ts)의 정규화·dedup 로직을 그대로 복제해
// "내보내기 → 파일 텍스트 → 가져오기 → 저장 시 중복 제거"의 end-to-end 결과를 검증한다.
const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function simulateAddBatch(existing: { term: string }[], incoming: CsvWordRow[]) {
  const existingTerms = new Set(existing.map((w) => normalize(w.term)));
  const seen = new Set<string>();
  const added = incoming.filter((w) => {
    const key = normalize(w.term);
    if (existingTerms.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { added, dup: incoming.length - added.length };
}

describe('내보내기 → 가져오기 → 저장 end-to-end', () => {
  // 실제 단어처럼 콤마·따옴표·태그·예문이 든 단어장
  const sourceList: CsvWordRow[] = [
    { term: 'apple', meaningKr: '사과, 사과나무', phonetic: 'ˈæpəl', pos: 'noun', definition: 'a round fruit', exampleEn: 'He ate an apple, then left.', exampleKr: '그는 사과를 먹고 떠났다.', tags: ['과일', '기초'] },
    { term: 'bank', meaningKr: '은행', phonetic: 'bæŋk', pos: 'noun', definition: 'a financial institution', exampleEn: 'She said "hi" at the bank.', exampleKr: '그녀는 은행에서 "안녕"이라고 했다.', tags: ['금융'] },
    { term: 'run', meaningKr: '달리다', phonetic: 'rʌn', pos: 'verb', definition: 'to move fast', exampleEn: 'I run daily.', exampleKr: '나는 매일 달린다.', tags: [] },
  ];

  it('손실 없이 왕복하고 모든 필드가 보존된다', () => {
    const csv = serializeCsv(sourceList);
    const { rows, skipped } = parseCsv(csv);
    expect(skipped).toBe(0);
    expect(rows).toEqual(sourceList);
  });

  it('대상 단어장에 일부 중복이 있으면 그 단어만 제외하고 추가된다', () => {
    const csv = serializeCsv(sourceList);
    const { rows } = parseCsv(csv);

    // 대상 단어장에 'Apple'(대소문자 다름)과 'run'이 이미 있다고 가정
    const targetExisting = [{ term: 'Apple' }, { term: 'run' }];
    const { added, dup } = simulateAddBatch(targetExisting, rows);

    expect(added.map((w) => w.term)).toEqual(['bank']);
    expect(dup).toBe(2);
  });

  it('빈 단어장으로 가져오면 전부 추가된다', () => {
    const csv = serializeCsv(sourceList);
    const { rows } = parseCsv(csv);
    const { added, dup } = simulateAddBatch([], rows);
    expect(added).toHaveLength(3);
    expect(dup).toBe(0);
  });

  it('파일에 단어/뜻 누락 행이 섞여 있으면 가져오기 단계에서 걸러진다', () => {
    // 외부에서 손으로 만든 CSV(헤더 + 일부 불량 행)
    const handMade = [
      '단어,뜻,예문',
      'cat,고양이,A cat sleeps.',
      ',뜻만있고단어없음,',      // 단어 없음 → 제외
      'dog,,A dog barks.',        // 뜻 없음 → 제외
      'fish,물고기,',
    ].join('\r\n');

    const { rows, skipped } = parseCsv(handMade);
    expect(rows.map((r) => r.term)).toEqual(['cat', 'fish']);
    expect(skipped).toBe(2);

    const { added } = simulateAddBatch([], rows);
    expect(added).toHaveLength(2);
  });
});
