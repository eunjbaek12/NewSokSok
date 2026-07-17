/**
 * 클라우드 복원 경로가 복습 컬럼을 흘리지 않는지 지키는 가드.
 *
 * 왜 소스를 읽는 테스트인가: 이 경로들은 `INSERT [OR REPLACE] INTO words (...)` 한 문장이
 * 전부라 단위 테스트로 감싸기 어렵고(engine.ts는 supabase→react-native를 끌고 온다),
 * 실패 방식이 **조용하다**. `INSERT OR REPLACE`는 행을 통째로 갈아끼우므로 컬럼 목록에서
 * 빠진 값은 보존되는 게 아니라 DEFAULT(NULL/0)로 초기화된다 — 즉 컬럼 하나를 빠뜨리면
 * pull이 돌 때마다 복습 진도가 지워지고, 클라이언트는 lastReviewedAt이 NULL인 암기 단어를
 * due로 치지 않으므로 그 단어는 **영영 복습에 안 걸린다.** 앱은 멀쩡히 동작해 보인다.
 *
 * 이 레포엔 전례가 있다: migration으로 컬럼을 추가하고 rowTo* 매퍼를 함께 고치지 않아
 * sourceLanguage가 새고 일본어 TTS가 무음이 됐다. 그때의 "매퍼도 같이 고칠 것"이라는
 * 구두 규칙을 여기서 자동화한다.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

/**
 * 단어를 클라우드에서 **복원**하는 INSERT만 고른다.
 *
 * `assignedDay`를 마커로 쓰는 이유: 새 단어를 만드는 경로(addWord·addBatchWords·
 * createCuratedList·copyWords·mergeLists·샘플 시드)는 플랜 배정일을 쓰지 않는다.
 * 반대로 기존 단어를 통째로 되살리는 경로만 이 컬럼을 싣는다. 아래에서 개수를 함께
 * 검증하므로, 이 가정이 깨지면 테스트가 조용히 통과하지 않고 실패한다.
 */
function restoreInsertColumnLists(relPath: string): string[][] {
  const src = readFileSync(join(ROOT, relPath), 'utf8');
  const re = /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+words\s*\(([^)]*)\)/gi;
  const found: string[][] = [];
  for (const m of src.matchAll(re)) {
    const cols = m[1].split(',').map(c => c.trim()).filter(Boolean);
    if (cols.includes('assignedDay')) found.push(cols);
  }
  return found;
}

const RESTORE_PATHS: { path: string; expected: number; label: string }[] = [
  { path: 'features/sync/engine.ts', expected: 1, label: 'pull (INSERT OR REPLACE — 행 전체 교체)' },
  { path: 'features/vocab/db.ts', expected: 2, label: 'mergeCloudData / replaceLocalWithCloudData (첫 로그인)' },
];

/** 이 값들이 빠지면 복습 기능이 조용히 죽는다. */
const REVIEW_COLUMNS = ['lastReviewedAt', 'reviewSuccessCount'];

describe('복습 컬럼이 클라우드 복원 경로에서 새지 않는다', () => {
  for (const { path, expected, label } of RESTORE_PATHS) {
    describe(`${path} — ${label}`, () => {
      const lists = restoreInsertColumnLists(path);

      test(`복원 INSERT를 ${expected}개 찾는다 (마커 가정이 유효한지 확인)`, () => {
        expect(lists).toHaveLength(expected);
      });

      test.each(REVIEW_COLUMNS)('모든 복원 INSERT가 %s 를 싣는다', col => {
        expect(lists.length).toBeGreaterThan(0);
        for (const cols of lists) expect(cols).toContain(col);
      });
    });
  }

  test('새 단어를 만드는 INSERT는 복습 컬럼을 싣지 않는다 (미암기로 시작 = NULL/0이 정답)', () => {
    const src = readFileSync(join(ROOT, 'features/vocab/db.ts'), 'utf8');
    const re = /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+words\s*\(([^)]*)\)/gi;
    const creators = [...src.matchAll(re)]
      .map(m => m[1].split(',').map(c => c.trim()).filter(Boolean))
      .filter(cols => !cols.includes('assignedDay'));
    expect(creators.length).toBeGreaterThan(0);
    for (const cols of creators) {
      for (const col of REVIEW_COLUMNS) expect(cols).not.toContain(col);
    }
  });
});
