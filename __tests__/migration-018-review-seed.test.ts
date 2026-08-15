/**
 * migration 018(gentle SRS) 시드를 **실제 SQLite 엔진** 위에서 검증한다.
 *
 * 마이그레이션 레지스트리는 expo-sqlite를 타입으로만 참조하므로(`import type`) 런타임
 * import 없이 그대로 불러와 001→018 사다리를 전부 재생할 수 있다. 시드는 SQL 한 덩어리라
 * 순수 함수로 테스트할 수 없고, 틀리면 "업데이트 직후 서재 전체가 due로 쏟아진다"는
 * 되돌리기 어려운 사고가 된다 — 그래서 엔진을 직접 돌린다.
 *
 * node:sqlite는 Node 22.5+ 내장(실험적). 없는 런타임에서는 스킵한다.
 */
import { MIGRATIONS, SCHEMA_VERSION, assertContiguous } from '../lib/db/migrations';

type Db = { execAsync: (sql: string) => Promise<void>; runAsync: (sql: string, ...p: any[]) => Promise<void> };

let DatabaseSync: any;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  DatabaseSync = null;
}

const describeIfSqlite = DatabaseSync ? describe : describe.skip;

/** expo-sqlite가 쓰는 표면(execAsync/runAsync)만 node:sqlite 위에 얇게 흉내낸다. */
function open() {
  const raw = new DatabaseSync(':memory:');
  const db: Db = {
    execAsync: async (sql: string) => { raw.exec(sql); },
    runAsync: async (sql: string, ...params: any[]) => {
      const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      raw.prepare(sql).run(...flat);
    },
  };
  const all = (sql: string, ...p: any[]) => raw.prepare(sql).all(...p) as any[];
  return { db, all, raw };
}

/** 실제 러너와 같은 규칙: user_version 초과분만 순서대로. `from`은 이미 적용된 버전. */
async function migrateTo(db: Db, to: number, from = 0) {
  for (const m of MIGRATIONS.filter(m => m.version > from && m.version <= to)) {
    await m.up(db as any);
  }
}

const DAY = 86400000;

describeIfSqlite('migration 018 — gentle SRS 시드', () => {
  // SCHEMA_VERSION 을 정확한 값으로 못 박지 않는다 — 마이그레이션을 하나 추가할 때마다
  // 이 테스트가 깨지는데, 그 실패는 018 에 대해 아무것도 말해 주지 않는다(019 를 넣을 때
  // 실제로 깨졌다). 연속성은 assertContiguous 가, 값은 MIGRATIONS.length 가 보장한다.
  test('레지스트리는 1..N 연속이고 018이 제자리에 있다', () => {
    expect(() => assertContiguous()).not.toThrow();
    expect(MIGRATIONS[17].version).toBe(18);
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(18);
  });

  test('사다리 001→018이 실제 SQLite에서 끝까지 실행된다', async () => {
    const { db, all } = open();
    await expect(migrateTo(db, 18)).resolves.toBeUndefined();
    const cols = all(`PRAGMA table_info(words)`).map(c => c.name);
    expect(cols).toContain('lastReviewedAt');
    expect(cols).toContain('reviewSuccessCount');
  });

  describe('기존 데이터 위에 018을 얹었을 때', () => {
    const NOW = Date.now();
    const LOGGED_AT = NOW - 5 * DAY;

    async function seedFixture() {
      const { db, all } = open();
      // 017까지 올린 뒤 "업데이트 전 사용자"의 데이터를 심는다.
      await migrateTo(db, 17);
      await db.runAsync(
        `INSERT INTO lists (id, title, isVisible, createdAt, lastStudiedAt) VALUES ('l1', '단어장', 1, 0, 0)`,
      );
      const w = (id: string, memorized: number) =>
        db.runAsync(
          `INSERT INTO words (id, listId, term, definition, exampleEn, meaningKr, isMemorized)
           VALUES (?, 'l1', ?, '', '', '뜻', ?)`,
          id, id, memorized,
        );
      await w('logged', 1);      // 외운 기록이 있는 암기 단어
      await w('unlogged', 1);    // 로그 도입 이전에 외운 암기 단어
      await w('zerolog', 1);     // createdAt=0인 깨진 로그 행을 가진 암기 단어
      await w('learning', 0);    // 미암기
      await db.runAsync(
        `INSERT INTO memorized_log (date, wordId, createdAt) VALUES ('2026-07-12', 'logged', ?)`, LOGGED_AT,
      );
      await db.runAsync(
        `INSERT INTO memorized_log (date, wordId, createdAt) VALUES ('2026-07-12', 'zerolog', 0)`,
      );
      await migrateTo(db, 18, 17);
      const rows = all(`SELECT id, lastReviewedAt, reviewSuccessCount FROM words`);
      return Object.fromEntries(rows.map(r => [r.id, r]));
    }

    test('외운 기록이 있으면 그날 시각으로 시드 — 실제로 외운 날 기준으로 분산된다', async () => {
      const rows = await seedFixture();
      expect(rows.logged.lastReviewedAt).toBe(LOGGED_AT);
    });

    test('기록이 없는 암기 단어는 마이그레이션 시각 — 첫 복습은 3일 뒤 (P1)', async () => {
      const rows = await seedFixture();
      expect(rows.unlogged.lastReviewedAt).toBeGreaterThanOrEqual(NOW);
      // 즉시 due가 되지 않는다는 것이 이 시드의 존재 이유.
      expect(rows.unlogged.lastReviewedAt).toBeGreaterThan(NOW - DAY);
    });

    test('createdAt=0인 깨진 로그는 1970년(=즉시 due)이 아니라 마이그레이션 시각으로 떨어진다', async () => {
      const rows = await seedFixture();
      expect(rows.zerolog.lastReviewedAt).toBeGreaterThan(NOW - DAY);
    });

    test('미암기 단어는 손대지 않는다 — 복습 후보가 아니다 (D2)', async () => {
      const rows = await seedFixture();
      expect(rows.learning.lastReviewedAt).toBeNull();
      expect(rows.learning.reviewSuccessCount).toBe(0);
    });

    test('암기 단어는 성공 1회 = 사다리 첫 칸(3일)에서 시작', async () => {
      const rows = await seedFixture();
      expect(rows.logged.reviewSuccessCount).toBe(1);
      expect(rows.unlogged.reviewSuccessCount).toBe(1);
    });
  });

  test('신규 설치(001→018 일괄)에서도 시드가 안전하게 no-op', async () => {
    const { db, all } = open();
    await migrateTo(db, 18);
    expect(all(`SELECT COUNT(*) as n FROM words`)[0].n).toBe(0);
  });
});
