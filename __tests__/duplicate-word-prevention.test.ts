/**
 * 중복 단어 방지 로직 검증
 *
 * 테스트 대상:
 * 1. handleImport 중복 필터 — normalizeTerm 기반 dedup + skippedCount
 * 2. addBatchWords DB 레이어 — 기존 단어·배치 내 중복 모두 제거
 * 3. handleCreateNew (큐레이션 새 단어장) — AI 생성 결과 내부 중복 dedup
 */

// ── handleImport에서 추출한 순수 함수 ──────────────────────────────────────
const normalizeTerm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function handleImportDedup(
  incomingWords: { term: string }[],
  existingWords: { term: string }[],
): { wordsToAdd: { term: string }[]; skippedCount: number } {
  const existing = new Set(existingWords.map(w => normalizeTerm(w.term)));
  const wordsToAdd = incomingWords.filter(w => !existing.has(normalizeTerm(w.term)));
  const skippedCount = incomingWords.length - wordsToAdd.length;
  return { wordsToAdd, skippedCount };
}

// ── addBatchWords DB 레이어에서 추출한 순수 함수 ──────────────────────────
function addBatchDedup<T extends { term: string }>(
  incoming: T[],
  existingWords: { term: string }[],
): T[] {
  const existingTerms = new Set(existingWords.map(w => normalizeTerm(w.term)));
  const seen = new Set<string>();
  return incoming.filter(w => {
    const key = normalizeTerm(w.term);
    if (existingTerms.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('handleImport 중복 필터 (screen.tsx)', () => {
  test('중복 없음 — 전부 추가, skippedCount=0', () => {
    const incoming = [{ term: 'apple' }, { term: 'banana' }];
    const existing = [{ term: 'cherry' }];
    const { wordsToAdd, skippedCount } = handleImportDedup(incoming, existing);
    expect(wordsToAdd).toHaveLength(2);
    expect(skippedCount).toBe(0);
  });

  test('일부 중복 — 중복만 건너뜀, skippedCount 정확', () => {
    const incoming = [{ term: 'apple' }, { term: 'banana' }, { term: 'cherry' }];
    const existing = [{ term: 'apple' }, { term: 'cherry' }];
    const { wordsToAdd, skippedCount } = handleImportDedup(incoming, existing);
    expect(wordsToAdd.map(w => w.term)).toEqual(['banana']);
    expect(skippedCount).toBe(2);
  });

  test('전체 중복 — wordsToAdd 빈 배열, skippedCount=전체', () => {
    const incoming = [{ term: 'apple' }, { term: 'banana' }];
    const existing = [{ term: 'apple' }, { term: 'banana' }];
    const { wordsToAdd, skippedCount } = handleImportDedup(incoming, existing);
    expect(wordsToAdd).toHaveLength(0);
    expect(skippedCount).toBe(2);
  });

  test('대소문자 무시 — "Apple" vs "apple" 중복 처리', () => {
    const incoming = [{ term: 'Apple' }, { term: 'BANANA' }];
    const existing = [{ term: 'apple' }];
    const { wordsToAdd, skippedCount } = handleImportDedup(incoming, existing);
    expect(wordsToAdd.map(w => w.term)).toEqual(['BANANA']);
    expect(skippedCount).toBe(1);
  });

  test('앞뒤 공백 무시 — " apple " vs "apple" 중복 처리', () => {
    const incoming = [{ term: '  apple  ' }];
    const existing = [{ term: 'apple' }];
    const { wordsToAdd, skippedCount } = handleImportDedup(incoming, existing);
    expect(wordsToAdd).toHaveLength(0);
    expect(skippedCount).toBe(1);
  });

  test('언어 무관 — 기존 단어장 sourceLanguage 다를 때도 중복 체크', () => {
    // 이전 sameSourceLang 버그 재현: 언어가 달라도 같은 term은 중복 처리
    const incoming = [{ term: 'run' }, { term: 'jump' }];
    const existing = [{ term: 'run' }]; // 다른 언어 단어장에 이미 있음
    const { wordsToAdd, skippedCount } = handleImportDedup(incoming, existing);
    expect(wordsToAdd.map(w => w.term)).toEqual(['jump']);
    expect(skippedCount).toBe(1);
  });
});

describe('addBatchWords DB 레이어 dedup', () => {
  test('기존 단어와 중복 제거', () => {
    const incoming = [
      { term: 'apple', meaningKr: '사과' },
      { term: 'banana', meaningKr: '바나나' },
    ];
    const existing = [{ term: 'apple' }];
    const result = addBatchDedup(incoming, existing);
    expect(result).toHaveLength(1);
    expect(result[0].term).toBe('banana');
  });

  test('배치 내 자체 중복 제거 — AI가 같은 단어를 두 번 생성한 경우', () => {
    const incoming = [
      { term: 'apple', meaningKr: '사과' },
      { term: 'apple', meaningKr: '사과 (중복)' },
      { term: 'banana', meaningKr: '바나나' },
    ];
    const result = addBatchDedup(incoming, []);
    expect(result).toHaveLength(2);
    expect(result.map(w => w.term)).toEqual(['apple', 'banana']);
  });

  test('전부 중복 — 빈 배열 반환', () => {
    const incoming = [{ term: 'apple', meaningKr: '사과' }];
    const existing = [{ term: 'apple' }];
    const result = addBatchDedup(incoming, existing);
    expect(result).toHaveLength(0);
  });

  test('대소문자 + 공백 정규화 후 중복 제거', () => {
    const incoming = [
      { term: '  Apple  ', meaningKr: '사과' },
      { term: 'BANANA', meaningKr: '바나나' },
    ];
    const existing = [{ term: 'apple' }, { term: 'banana' }];
    const result = addBatchDedup(incoming, existing);
    expect(result).toHaveLength(0);
  });

  test('기존 없을 때 전부 통과', () => {
    const incoming = [
      { term: 'cat', meaningKr: '고양이' },
      { term: 'dog', meaningKr: '개' },
    ];
    const result = addBatchDedup(incoming, []);
    expect(result).toHaveLength(2);
  });
});

// ── handleCreateNew (큐레이션 새 단어장)에서 추출한 dedup ─────────────────
// AI가 생성한 결과 자체에 중복이 있을 때 createCuratedList의 UNIQUE 인덱스
// 위반을 방지. 새 단어장이므로 existingWords는 항상 빈 배열 — 입력 내부
// 중복만 거른다.
function handleCreateNewDedup<T extends { term: string }>(
  incoming: T[],
): { deduped: T[]; skippedCount: number } {
  const seen = new Set<string>();
  const deduped = incoming.filter(w => {
    const key = normalizeTerm(w.term ?? '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { deduped, skippedCount: incoming.length - deduped.length };
}

describe('handleCreateNew — AI 생성 결과 내부 dedup (screen.tsx)', () => {
  test('AI가 같은 lemma를 두 번 생성한 경우 — 첫 번째만 살아남고 skippedCount 보고', () => {
    const aiWords = [
      { term: 'run', meaningKr: '달리다' },
      { term: 'jump', meaningKr: '뛰다' },
      { term: 'run', meaningKr: '운영하다' },
    ];
    const { deduped, skippedCount } = handleCreateNewDedup(aiWords);
    expect(deduped.map(w => w.term)).toEqual(['run', 'jump']);
    expect(skippedCount).toBe(1);
  });

  test('AI가 대소문자만 다르게 생성한 경우 — Run/run을 같은 키로 인식', () => {
    const aiWords = [
      { term: 'Run', meaningKr: '달리다' },
      { term: 'run', meaningKr: '운영하다' },
    ];
    const { deduped, skippedCount } = handleCreateNewDedup(aiWords);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].term).toBe('Run');
    expect(skippedCount).toBe(1);
  });

  test('AI가 빈 string을 두 번 생성한 경우 — 둘 다 drop', () => {
    const aiWords = [
      { term: '', meaningKr: '' },
      { term: '   ', meaningKr: '' },
      { term: 'apple', meaningKr: '사과' },
    ];
    const { deduped, skippedCount } = handleCreateNewDedup(aiWords);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].term).toBe('apple');
    expect(skippedCount).toBe(2);
  });

  test('중복 없는 정상 케이스 — skippedCount=0', () => {
    const aiWords = [
      { term: 'apple', meaningKr: '사과' },
      { term: 'banana', meaningKr: '바나나' },
    ];
    const { deduped, skippedCount } = handleCreateNewDedup(aiWords);
    expect(deduped).toHaveLength(2);
    expect(skippedCount).toBe(0);
  });

  test('전부 동일한 단어 — deduped 1개만 남고 호출자가 단어장 안 만들 결정 가능', () => {
    const aiWords = [
      { term: 'apple', meaningKr: '사과 1' },
      { term: 'apple', meaningKr: '사과 2' },
      { term: 'APPLE', meaningKr: '사과 3' },
    ];
    const { deduped, skippedCount } = handleCreateNewDedup(aiWords);
    expect(deduped).toHaveLength(1);
    expect(skippedCount).toBe(2);
  });

  test('전부 빈 단어 — deduped 0개 (호출자가 "전부 중복" 분기 진입)', () => {
    const aiWords = [
      { term: '', meaningKr: '' },
      { term: '  ', meaningKr: '' },
    ];
    const { deduped, skippedCount } = handleCreateNewDedup(aiWords);
    expect(deduped).toHaveLength(0);
    expect(skippedCount).toBe(2);
  });
});
