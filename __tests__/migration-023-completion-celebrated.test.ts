/**
 * 완주 축하 팝업이 «한 계획에 한 번»인지를 **실제 SQLite 엔진** 위에서 검증한다.
 *
 * 판정이 전부 SQL 한 덩어리라 순수 함수로는 테스트할 수 없다. 그리고 틀렸을 때의 모습이
 * 조용하다 — 같은 Day 를 다시 학습할 때마다 상장이 튀어나오거나, 반대로 진짜 완주에 아무
 * 일도 안 일어난다. 둘 다 코드를 읽어서는 안 보이고 실기에서만 드러나므로 엔진을 직접 돌린다.
 *
 * node:sqlite 는 Node 22.5+ 내장(실험적). 없는 런타임에서는 스킵한다
 * (`migration-018-review-seed.test.ts` 와 같은 패턴).
 */
import { MIGRATIONS, SCHEMA_VERSION, assertContiguous } from '../lib/db/migrations';
import {
  COMPLETION_RECORD_SQL,
  COMPLETION_BACKFILL_SQL,
  COMPLETION_PENDING_SQL,
  COMPLETION_CELEBRATE_SQL,
} from '../features/stats/completion';

// 018 테스트의 셰임은 exec/run 둘뿐인데, 019(큐레이션 언어 교정)부터 getAllAsync 를 쓴다.
// 사다리를 023까지 재생하려면 세 개가 다 필요하다.
type Db = {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, ...p: any[]) => Promise<void>;
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
    getAllAsync: async (sql: string, ...params: any[]) => {
      const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      return raw.prepare(sql).all(...flat);
    },
  };
  const all = (sql: string, ...p: any[]) => raw.prepare(sql).all(...p) as any[];
  return { db, all };
}

async function migrateTo(db: Db, to: number, from = 0) {
  for (const m of MIGRATIONS.filter(m => m.version > from && m.version <= to)) {
    await m.up(db as any);
  }
}

const DAY = 86400000;
const NOW = 1757203200000; // 2026-09-07
const S1 = NOW - 12 * DAY; // 첫 계획 시작
const S2 = NOW - 1 * DAY;  // 다시 세운 계획 시작

describeIfSqlite('migration 023 — 완주 축하는 한 계획에 한 번', () => {
  test('레지스트리는 1..N 연속이고 023이 제자리에 있다', () => {
    expect(() => assertContiguous()).not.toThrow();
    expect(MIGRATIONS[22].version).toBe(23);
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(23);
  });

  /** 완주 상태인 단어장 하나. `computePlanStatus`의 'completed' 와 같은 모양으로 심는다. */
  async function seed(opts: { to?: number; startedAt?: number; completed?: boolean } = {}) {
    const { to = 23, startedAt = S1, completed = true } = opts;
    const { db, all } = open();
    await migrateTo(db, to);
    await db.runAsync(
      `INSERT INTO lists (id, title, isVisible, createdAt, lastStudiedAt,
                          planTotalDays, planCurrentDay, planWordsPerDay, planStartedAt, planUpdatedAt)
       VALUES ('l1', '토익 필수 800', 1, ?, ?, 5, ?, 10, ?, ?)`,
      S1, NOW, completed ? 6 : 3, startedAt, completed ? NOW : null,
    );
    // createdAt 을 벌려 둔다 — 같은 배치로 심으면 값이 같아 「마지막으로 외운 단어」가
    // date/createdAt 이 아니라 term ASC 로 갈린다(w1 이 나온다). 그러면 이 픽스처는
    // 순서 규칙에 대해 아무것도 말하지 못한다.
    let at = NOW - 3000;
    for (const id of ['w1', 'w2', 'w3']) {
      await db.runAsync(
        `INSERT INTO words (id, listId, term, definition, exampleEn, meaningKr, isMemorized)
         VALUES (?, 'l1', ?, '', '', '뜻', 1)`,
        id, id,
      );
      await db.runAsync(
        `INSERT INTO memorized_log (date, wordId, createdAt) VALUES ('2026-09-07', ?, ?)`, id, at,
      );
      at += 1000;
    }
    const pending = () => all(COMPLETION_PENDING_SQL, 'l1');
    const rows = () => all(`SELECT startedAt, celebratedAt FROM completions WHERE listId = 'l1'`);
    return { db, all, pending, rows };
  }

  test('사다리 001→023이 실제 SQLite에서 끝까지 실행되고 열이 생긴다', async () => {
    const { db, all } = open();
    await expect(migrateTo(db, 23)).resolves.toBeUndefined();
    expect(all(`PRAGMA table_info(completions)`).map(c => c.name)).toContain('celebratedAt');
  });

  test('022 시절에 이미 적힌 완주는 «이미 축하한 것»이 된다 — 업데이트 직후 옛 완주가 튀어나오지 않는다', async () => {
    // 022까지만 올려 이 열이 없던 시절의 완주 줄을 만든 뒤, 023을 얹는다.
    // 🔴 오늘의 COMPLETION_RECORD_SQL 로는 못 심는다 — 그 상수는 celebratedAt 을 이미 알고 있다.
    //    022 시절의 열 목록으로 직접 넣어야 «업데이트 전 사용자»가 재현된다.
    const { db, all } = await seed({ to: 22 });
    await db.runAsync(
      `INSERT INTO completions (listId, startedAt, completedAt, title, totalWords, studyDays, lastTerm)
       VALUES ('l1', ?, ?, '토익 필수 800', 3, 1, 'w3')`,
      S1, NOW,
    );
    expect(all(`SELECT COUNT(*) n FROM completions`)[0].n).toBe(1);

    await migrateTo(db, 23, 22);
    const row = all(`SELECT completedAt, celebratedAt FROM completions`)[0];
    expect(row.celebratedAt).toBe(row.completedAt);
    expect(all(COMPLETION_PENDING_SQL, 'l1')).toHaveLength(0);
  });

  test('지금 막 일어난 완주만 축하 대상이다 — 상장에 새길 값이 다 실려 나온다', async () => {
    const { db, pending } = await seed();
    await db.runAsync(COMPLETION_RECORD_SQL, 'l1');

    const [row] = pending();
    expect(row).toBeDefined();
    expect(row.startedAt).toBe(S1);
    expect(row.title).toBe('토익 필수 800');
    expect(row.totalWords).toBe(3);
    expect(row.studyDays).toBe(1);
    expect(row.lastTerm).toBe('w3');
  });

  test('🔴 축하한 뒤 같은 Day 를 다시 학습해도 두 번 뜨지 않는다', async () => {
    const { db, pending, rows } = await seed();
    await db.runAsync(COMPLETION_RECORD_SQL, 'l1');
    await db.runAsync(COMPLETION_CELEBRATE_SQL, NOW, 'l1', S1);
    expect(pending()).toHaveLength(0);

    // 계획 화면에서 마지막 Day 를 다시 학습 → updatePlanProgress → recordCompletion 재실행.
    await db.runAsync(COMPLETION_RECORD_SQL, 'l1');
    expect(rows()).toHaveLength(1);          // PK 충돌로 무시 — 줄은 하나
    expect(rows()[0].celebratedAt).toBe(NOW); // 축하 표식이 덮이지 않는다
    expect(pending()).toHaveLength(0);
  });

  test('새 기기 복원 백필로 들어온 줄은 축하 대상이 아니다 — 몇 달 전 완주가 튀어나오지 않는다', async () => {
    const { db, pending, rows } = await seed();
    await db.runAsync(COMPLETION_BACKFILL_SQL);
    expect(rows()).toHaveLength(1);
    expect(rows()[0].celebratedAt).toBe(NOW); // planUpdatedAt = 완주한 그때
    expect(pending()).toHaveLength(0);
  });

  test('🔴 계획을 지우고 새로 세우면 옛 완주 줄이 새 계획에 걸리지 않는다', async () => {
    const { db, all, pending } = await seed();
    // 완주했지만 축하는 못 본 채(앱 종료 등) 완주 카드의 ✕ 를 눌렀다 → clearPlan 이
    // 안전망으로 줄을 남기고 계획을 지운다.
    await db.runAsync(COMPLETION_RECORD_SQL, 'l1');
    await db.runAsync(
      `UPDATE lists SET planTotalDays = 0, planCurrentDay = 1, planStartedAt = NULL, planUpdatedAt = NULL WHERE id = 'l1'`,
    );
    // 새 계획을 세워 첫날을 학습한다 — 완주가 아니다.
    await db.runAsync(
      `UPDATE lists SET planTotalDays = 5, planCurrentDay = 2, planWordsPerDay = 10,
                        planStartedAt = ?, planUpdatedAt = ? WHERE id = 'l1'`,
      S2, NOW,
    );

    // 줄은 아직 celebratedAt = NULL 로 남아 있다 — 걸러 낸 것이 JOIN 의
    // `planStartedAt = startedAt` 이라는 뜻이다(줄이 없어서 안 나오는 게 아니다).
    const stale = all(`SELECT celebratedAt FROM completions WHERE listId = 'l1' AND startedAt = ?`, S1);
    expect(stale).toHaveLength(1);
    expect(stale[0].celebratedAt).toBeNull();

    expect(pending()).toHaveLength(0);
  });

  test('같은 단어장을 다시 완주하면 새 계획으로 다시 축하한다', async () => {
    const { db, pending, rows } = await seed();
    await db.runAsync(COMPLETION_RECORD_SQL, 'l1');
    await db.runAsync(COMPLETION_CELEBRATE_SQL, NOW, 'l1', S1);

    // 새 계획(startedAt=S2)을 세워 다시 끝까지 갔다.
    await db.runAsync(
      `UPDATE lists SET planCurrentDay = 6, planStartedAt = ?, planUpdatedAt = ? WHERE id = 'l1'`,
      S2, NOW,
    );
    await db.runAsync(COMPLETION_RECORD_SQL, 'l1');

    expect(rows()).toHaveLength(2);
    const [row] = pending();
    expect(row.startedAt).toBe(S2);
  });

  test('완주가 아니면 아무 줄도 생기지 않는다', async () => {
    const { db, rows, pending } = await seed({ completed: false });
    await db.runAsync(COMPLETION_RECORD_SQL, 'l1');
    await db.runAsync(COMPLETION_BACKFILL_SQL);
    expect(rows()).toHaveLength(0);
    expect(pending()).toHaveLength(0);
  });
});
