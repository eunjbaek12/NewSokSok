/**
 * pull 이 단어장 행을 갈아끼울 때 **로컬 컬럼을 지우지 않는지** 실제 SQLite 로 확인한다.
 *
 * `INSERT OR REPLACE` 는 행을 지우고 다시 넣는다 — 컬럼 목록에 없는 값은 보존되지 않고
 * DEFAULT(NULL)로 초기화된다. 단어 쪽에서 이미 두 번 겪었다(복습 진도, 굴절형 원형 b92e763 —
 * 별표 한 번에 원형 표기가 사라졌다). 앱은 멀쩡해 보이고 값만 조용히 없어진다.
 *
 * 단어장에는 서버에 없는 **로컬 전용** 컬럼이 생겼다(024: sourceThemeId·savedAt — 담아온
 * 공유물의 출처). 서버 값이 없으니 «목록에 넣고 올려 보내기»는 못 쓰고, REPLACE 가 옛 행을
 * 지우기 전에 서브쿼리로 되읽어 넣는다. 그게 실제로 되는지는 엔진을 돌려야 안다.
 *
 * 두 겹으로 지킨다:
 *  1. 스키마의 **모든** lists 컬럼이 pull 컬럼 목록에 있다 — 다음에 컬럼이 붙으면 여기서 깨진다.
 *  2. engine.ts 의 SQL 을 그대로 떼어 돌려, 로컬 전용 값이 pull 한 번에 살아남는다.
 *
 * engine.ts 는 supabase→react-native 를 끌고 와서 import 하지 않고 소스를 읽는다
 * (review-sync-columns.test.ts 와 같은 이유).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { MIGRATIONS } from '../lib/db/migrations';

let DatabaseSync: any;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  DatabaseSync = null;
}
const describeIfSqlite = DatabaseSync ? describe : describe.skip;

const ENGINE_SRC = readFileSync(join(__dirname, '..', 'features/sync/engine.ts'), 'utf8');

/** engine.ts 에서 lists 를 갈아끼우는 SQL 문장 하나를 그대로 떼어 온다. */
function pullListSql(): string {
  const matches = [...ENGINE_SRC.matchAll(/`(INSERT OR REPLACE INTO lists \([\s\S]*?)`/g)];
  expect(matches).toHaveLength(1);
  return matches[0][1];
}

function pullListColumns(): string[] {
  const m = pullListSql().match(/INTO lists \(([^)]*)\)/);
  return m![1].split(',').map(c => c.trim()).filter(Boolean);
}

/** 001→최신 사다리를 실제 엔진에서 재생한 빈 DB. */
async function freshDb() {
  const raw = new DatabaseSync(':memory:');
  const db = {
    execAsync: async (sql: string) => { raw.exec(sql); },
    runAsync: async (sql: string, ...params: any[]) => {
      const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      raw.prepare(sql).run(...flat);
    },
    getAllAsync: async (sql: string, ...params: any[]) => {
      const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      return raw.prepare(sql).all(...flat);
    },
  };
  for (const m of MIGRATIONS) await m.up(db as any);
  return raw;
}

/**
 * pull 이 넘기는 21개 서버 값 + 서브쿼리용 id 둘 — engine.ts 의 파라미터 순서와 같다.
 * lastStudiedAt 은 0(«학습 기록 없음», createCuratedList 와 같은 값)이다 — NOT NULL 에 기본값이
 * 없어서 null 을 넣으면 REPLACE 도 ABORT 한다.
 */
function pullParams(id: string, title: string): any[] {
  return [
    id, title, 1, 1000, 0,
    0, 1, '✨',
    0, 1, 10,
    null, null, 'all',
    'en', 'ko',
    0, 0, 0,
    2000, null,
    id, id,
  ];
}

describeIfSqlite('pull 이 단어장 행을 갈아끼워도 로컬 컬럼이 남는다', () => {
  test('스키마의 모든 lists 컬럼이 pull 컬럼 목록에 있다', async () => {
    const raw = await freshDb();
    const schemaCols: string[] = raw.prepare('PRAGMA table_info(lists)').all().map((c: any) => c.name);
    const pullCols = pullListColumns();
    expect(schemaCols.filter(c => !pullCols.includes(c))).toEqual([]);
  });

  test('담아온 출처(sourceThemeId·savedAt)가 pull 한 번에 지워지지 않는다', async () => {
    const raw = await freshDb();
    raw.prepare(
      'INSERT INTO lists (id, title, isVisible, createdAt, lastStudiedAt, sourceThemeId, savedAt) VALUES (?, ?, 1, 1000, 0, ?, ?)',
    ).run('L1', '토익 빈출 300', 'theme-abc', 1755000000000);

    const sql = pullListSql();
    const params = pullParams('L1', '토익 빈출 300 — 서버에서 바뀐 제목');
    expect(sql.match(/\?/g)).toHaveLength(params.length);
    raw.prepare(sql).run(...params);

    const row = raw.prepare('SELECT title, sourceThemeId, savedAt FROM lists WHERE id = ?').get('L1');
    expect(row.title).toBe('토익 빈출 300 — 서버에서 바뀐 제목'); // 서버 값은 들어왔다
    expect(row.sourceThemeId).toBe('theme-abc');
    expect(row.savedAt).toBe(1755000000000);
  });

  test('로컬에 없던 단어장은 출처 없이 들어온다', async () => {
    const raw = await freshDb();
    raw.prepare(pullListSql()).run(...pullParams('NEW', '새 단어장'));
    const row = raw.prepare('SELECT title, sourceThemeId, savedAt FROM lists WHERE id = ?').get('NEW');
    expect(row.title).toBe('새 단어장');
    expect(row.sourceThemeId).toBeNull();
    expect(row.savedAt).toBeNull();
  });
});
