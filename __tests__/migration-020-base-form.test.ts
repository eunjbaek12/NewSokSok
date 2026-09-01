/**
 * migration 020(굴절형 원형 칸)을 **실제 SQLite 엔진** 위에서 검증한다.
 *
 * ALTER TABLE 두 줄이라 사소해 보이지만, 이 컬럼이 없으면 `features/vocab/db.ts` 의
 * INSERT 6곳이 **전부 런타임에 죽는다**(단어 추가·큐레이션 담기·CSV 가져오기·사진 저장·
 * 단어장 합치기·복사). 사다리를 001→020 으로 재생해 컬럼이 실제로 생기는지, 그리고
 * 그 컬럼에 쓰고 읽는 것이 되는지 확인한다.
 *
 * node:sqlite 는 Node 22.5+ 내장(실험적). 없는 런타임에서는 스킵한다 —
 * migration-018/019 테스트와 같은 방식이다.
 */
import { MIGRATIONS, SCHEMA_VERSION, assertContiguous } from '../lib/db/migrations';

type Db = {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, ...p: any[]) => Promise<void>;
  // 019 가 이 표면을 쓴다 — 어댑터에 빠뜨리면 020 을 검증하다 019 에서 죽는다.
  getAllAsync: <T>(sql: string, ...p: any[]) => Promise<T[]>;
};

let DatabaseSync: any;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  DatabaseSync = null;
}
const describeIfSqlite = DatabaseSync ? describe : describe.skip;

function open() {
  const raw = new DatabaseSync(':memory:');
  const db: Db = {
    execAsync: async (sql: string) => { raw.exec(sql); },
    runAsync: async (sql: string, ...params: any[]) => {
      const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      raw.prepare(sql).run(...flat);
    },
    getAllAsync: async <T>(sql: string, ...params: any[]) => {
      const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      return raw.prepare(sql).all(...flat) as T[];
    },
  };
  const all = (sql: string, ...p: any[]) => raw.prepare(sql).all(...p) as any[];
  return { db, all };
}

async function migrateAll(db: Db) {
  for (const m of MIGRATIONS) await m.up(db as any);
}

describeIfSqlite('migration 020 — words.baseForm / words.inflection', () => {
  // "020 이 마지막"으로 고정하지 않는다 — 뒤에 마이그레이션이 붙을 때마다 이 테스트가
  // 깨지고, 그러면 고치는 사람이 숫자만 올리게 된다. 확인할 것은 020 이 제자리에 등록돼
  // 있다는 것과 사다리가 연속이라는 것뿐이다.
  it('레지스트리가 연속이고 020 이 제자리에 있다', () => {
    expect(() => assertContiguous()).not.toThrow();
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(20);
    expect(MIGRATIONS[19].version).toBe(20);
  });

  it('001→020 사다리를 재생하면 두 컬럼이 생긴다', async () => {
    const { db, all } = open();
    await migrateAll(db);
    const cols = all(`PRAGMA table_info(words)`).map((c: any) => c.name);
    expect(cols).toContain('baseForm');
    expect(cols).toContain('inflection');
  });

  it('새 컬럼에 쓰고 읽을 수 있다 — INSERT 6곳이 이 컬럼을 참조한다', async () => {
    const { db, all } = open();
    await migrateAll(db);
    await db.runAsync(
      `INSERT INTO lists (id, title, isVisible, createdAt, lastStudiedAt, isCurated)
       VALUES ('L1', '목록', 1, 0, 0, 0)`,
    );
    await db.runAsync(
      `INSERT INTO words (id, listId, term, definition, exampleEn, meaningKr, isMemorized, baseForm, inflection)
       VALUES ('W1', 'L1', 'abandoned', '', '', '버려진', 0, 'abandon', 'past_participle')`,
    );
    const rows = all(`SELECT term, baseForm, inflection FROM words WHERE id = 'W1'`);
    expect(rows[0]).toMatchObject({
      term: 'abandoned', baseForm: 'abandon', inflection: 'past_participle',
    });
  });

  it('값을 넣지 않으면 NULL 이다 — 굴절형이 아닌 단어가 대부분이다', async () => {
    const { db, all } = open();
    await migrateAll(db);
    await db.runAsync(
      `INSERT INTO lists (id, title, isVisible, createdAt, lastStudiedAt, isCurated)
       VALUES ('L1', '목록', 1, 0, 0, 0)`,
    );
    await db.runAsync(
      `INSERT INTO words (id, listId, term, definition, exampleEn, meaningKr, isMemorized)
       VALUES ('W1', 'L1', 'apple', '', '', '사과', 0)`,
    );
    const rows = all(`SELECT baseForm, inflection FROM words WHERE id = 'W1'`);
    expect(rows[0].baseForm).toBeNull();
    expect(rows[0].inflection).toBeNull();
  });

  it('기존 행이 있는 DB 에 얹어도 살아남는다 — 019 까지 쓰던 사용자가 업데이트하는 경로', async () => {
    const { db, all } = open();
    // 019 까지만 올린 뒤 데이터를 넣고, 그 위에 020 을 얹는다.
    for (const m of MIGRATIONS.filter(m => m.version <= 19)) await m.up(db as any);
    await db.runAsync(
      `INSERT INTO lists (id, title, isVisible, createdAt, lastStudiedAt, isCurated)
       VALUES ('L1', '목록', 1, 0, 0, 0)`,
    );
    await db.runAsync(
      `INSERT INTO words (id, listId, term, definition, exampleEn, meaningKr, isMemorized)
       VALUES ('W1', 'L1', 'went', '', '', '갔다', 1)`,
    );
    await MIGRATIONS.find(m => m.version === 20)!.up(db as any);

    const rows = all(`SELECT term, meaningKr, isMemorized, baseForm FROM words WHERE id = 'W1'`);
    // 기존 값은 그대로, 새 칸만 비어 있어야 한다.
    expect(rows[0]).toMatchObject({ term: 'went', meaningKr: '갔다', isMemorized: 1 });
    expect(rows[0].baseForm).toBeNull();
  });
});
