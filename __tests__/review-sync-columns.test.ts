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

// 클라우드에서 단어를 복원하는 경로는 pull 하나뿐이다. 첫 로그인 "클라우드 선택"도
// features/sync/first-login.ts가 clearAllData 후 pullChanges를 부르는 방식이라 결국 이
// INSERT를 탄다. (한때 db.ts에 mergeCloudData/replaceLocalWithCloudData가 있었으나
// contexts→features 리팩터 때 호출자를 잃은 죽은 코드였고 삭제했다.)
const RESTORE_PATHS: { path: string; expected: number; label: string }[] = [
  { path: 'features/sync/engine.ts', expected: 1, label: 'pull (INSERT OR REPLACE — 행 전체 교체)' },
];

/** 이 값들이 빠지면 복습 기능이 조용히 죽는다. */
const REVIEW_COLUMNS = ['lastReviewedAt', 'reviewSuccessCount'];

/**
 * 복원 INSERT가 실어야 하지만 **새 단어를 만들 때도 쓰이는** 컬럼.
 *
 * REVIEW_COLUMNS 와 갈라 두는 이유: 복습 컬럼은 새 단어에 있으면 안 되지만(미암기로
 * 시작해야 하므로 NULL/0이 정답), 원형 표기는 저장하는 순간부터 값이 있다 — 아래
 * "새 단어 INSERT는 싣지 않는다" 음성 테스트에 같이 넣으면 잘못 잡는다.
 *
 * 2026-09-01: 020이 이 두 컬럼을 만들었는데 pull INSERT 목록에 넣지 않아, 서버를 한 바퀴
 * 돈 단어는 로컬 값까지 NULL로 초기화됐다(`INSERT OR REPLACE`는 행을 통째로 갈아끼운다).
 * 별표 하나만 눌러도 그 단어의 원형 표기가 사라졌다.
 */
const CARRIED_COLUMNS = ['baseForm', 'inflection'];

describe('복습 컬럼이 클라우드 복원 경로에서 새지 않는다', () => {
  for (const { path, expected, label } of RESTORE_PATHS) {
    describe(`${path} — ${label}`, () => {
      const lists = restoreInsertColumnLists(path);

      test(`복원 INSERT를 ${expected}개 찾는다 (마커 가정이 유효한지 확인)`, () => {
        expect(lists).toHaveLength(expected);
      });

      test.each([...REVIEW_COLUMNS, ...CARRIED_COLUMNS])('모든 복원 INSERT가 %s 를 싣는다', col => {
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

/**
 * push 방향의 같은 사고를 이름 목록 없이 막는다.
 *
 * `words` 행을 도메인 Word 로 옮기는 매퍼가 **두 벌** 있다. `features/vocab/db.ts` 는 화면이
 * 읽는 쪽, `features/sync/engine.ts` 는 클라우드로 올리는 쪽이다. 컬럼을 추가할 때 앞쪽만
 * 고치면 화면에는 값이 보이고 서버에는 안 올라간다 — 눈으로는 정상이라 조용히 샌다.
 * 2026-09-01 `cloud_words` 44,376행의 `base_form` 이 전부 NULL 이었던 것이 그 결과다.
 *
 * 그래서 컬럼 이름을 여기 다시 적지 않고 **두 매퍼의 키 집합을 맞대 본다.** 다음에 누가
 * db.ts 매퍼에 필드를 더하면 engine.ts 를 고칠 때까지 이 테스트가 실패한다.
 */
describe('push 매퍼가 읽기 매퍼의 필드를 하나도 흘리지 않는다', () => {
  /** `function rowToWord(...)` 본문에서 객체 리터럴의 키를 뽑는다(주석은 걷어낸다). */
  function mapperKeys(relPath: string): string[] {
    const src = readFileSync(join(ROOT, relPath), 'utf8');
    const start = src.indexOf('function rowToWord(');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('\n}', start);
    expect(end).toBeGreaterThan(start);
    // 주석 안의 `word: …` 같은 산문이 키로 잡히면 가짜 통과·가짜 실패가 난다.
    const body = src
      .slice(start, end)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    return [...body.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map(m => m[1]);
  }

  const readKeys = mapperKeys('features/vocab/db.ts');
  const pushKeys = mapperKeys('features/sync/engine.ts');

  test('매퍼를 둘 다 찾았고 필드가 비어 있지 않다 (파싱 가정 확인)', () => {
    expect(readKeys.length).toBeGreaterThan(15);
    expect(pushKeys.length).toBeGreaterThan(15);
  });

  test('읽기 매퍼의 모든 필드가 push 매퍼에도 있다', () => {
    expect(pushKeys.sort()).toEqual(expect.arrayContaining(readKeys.sort()));
  });
});
