/**
 * 복습 사다리의 **입구**를 지킨다: 암기가 켜지는 모든 경로는 lastReviewedAt을 함께 남겨야 한다.
 *
 * 왜 이 테스트가 있는가: 엔진은 `lastReviewedAt = NULL`을 "학습 이력 없음"으로 읽어 due에서
 * 제외한다(engine.isWordDue). 이건 클라우드 복원 직후 서재 전체가 due로 쏟아지는 P1 위반을
 * 막으려는 의도된 규칙이다. 그 대가로, 암기를 켜면서 이 시각을 안 적는 경로가 하나라도 있으면
 * 그 단어는 **영영 복습에 안 걸린다** — 앱은 멀쩡히 동작해 보이고, 기능만 조용히 사라진다.
 *
 * 실제로 toggleMemorized가 그랬다. migration 018이 기존 암기 단어를 시드해 주기 때문에
 * 업데이트 직후엔 정상으로 보이고, 그 뒤 손으로 체크한 단어만 소리 없이 빠졌다.
 *
 * 순수 함수로는 잡을 수 없다(SQL 한 덩어리가 전부다). 그래서 node:sqlite 위에 expo-sqlite
 * 표면만 흉내내 **진짜 db.ts를 그대로 돌린다** — migration-018-review-seed.test.ts와 같은 수법.
 */
import { isWordDue } from '../features/study/review/engine';
import type { Word } from '../lib/types';

let DatabaseSync: any;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  DatabaseSync = null;
}

const describeIfSqlite = DatabaseSync ? describe : describe.skip;

// node:sqlite는 모듈 팩토리 안에서 열어야 한다 — jest.mock은 import보다 먼저 끌어올려진다.
jest.mock('expo-sqlite', () => {
  const { DatabaseSync: DS } = require('node:sqlite');
  const raw = new DS(':memory:');
  const flatten = (params: any[]) =>
    params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  // expo-sqlite는 boolean·undefined를 받아주지만 node:sqlite는 거부한다.
  const coerce = (p: any[]) => p.map(v => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v));
  const db = {
    execAsync: async (sql: string) => { raw.exec(sql); },
    runAsync: async (sql: string, ...params: any[]) => {
      raw.prepare(sql).run(...coerce(flatten(params)));
    },
    getAllAsync: async (sql: string, ...params: any[]) => raw.prepare(sql).all(...coerce(flatten(params))),
    getFirstAsync: async (sql: string, ...params: any[]) =>
      raw.prepare(sql).all(...coerce(flatten(params)))[0] ?? null,
    // 실제 구현은 BEGIN..COMMIT을 쓰지만, 여기서는 중첩 없이 순차 실행이라 콜백으로 충분하다.
    withTransactionAsync: async (cb: any) => { await cb(); },
    closeAsync: async () => { raw.close(); },
  };
  return { openDatabaseAsync: async () => db };
});

// lib/db가 Platform.OS만 쓴다. react-native 본체는 jest(node)에서 파싱되지 않는다.
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
// 통계 기록은 이 테스트의 관심사가 아니고, 배럴이 RN 컴포넌트를 끌고 온다.
jest.mock('@/features/stats', () => ({ recordMemorizedWords: jest.fn(async () => {}) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${Math.random().toString(36).slice(2)}` }));

const { getDb } = require('../lib/db');
const { toggleMemorized } = require('../features/vocab/db');

const DAY = 86400000;

/** 엔진이 실제로 이 행을 due로 볼 것인가 — 컬럼값이 아니라 사용자에게 보이는 결과를 묻는다. */
function dueAfter(row: any, days: number): boolean {
  const word = {
    id: row.id,
    isMemorized: row.isMemorized === 1,
    lastReviewedAt: row.lastReviewedAt,
    reviewSuccessCount: row.reviewSuccessCount,
  } as Word;
  return isWordDue(word, Date.now() + days * DAY);
}

describeIfSqlite('복습 입구 — 손으로 켠 암기도 사다리에 올라탄다', () => {
  let db: any;

  beforeAll(async () => {
    db = await getDb(); // 001→018 사다리를 실제로 실행한다.
    await db.runAsync(
      `INSERT INTO lists (id, title, isVisible, createdAt, lastStudiedAt) VALUES ('l1', '단어장', 1, 0, 0)`,
    );
  });

  async function makeWord(id: string, isMemorized = 0) {
    await db.runAsync(
      `INSERT INTO words (id, listId, term, definition, exampleEn, meaningKr, isMemorized)
       VALUES (?, 'l1', ?, '', '', '뜻', ?)`,
      id, id, isMemorized,
    );
  }

  const read = async (id: string) =>
    await db.getFirstAsync(`SELECT id, isMemorized, lastReviewedAt, reviewSuccessCount FROM words WHERE id = ?`, id);

  test('토글로 암기를 켜면 lastReviewedAt이 찍히고 사다리 첫 칸에서 시작한다', async () => {
    await makeWord('toggled');
    await toggleMemorized('l1', 'toggled');

    const row = await read('toggled');
    expect(row.isMemorized).toBe(1);
    expect(row.lastReviewedAt).toBeGreaterThan(Date.now() - DAY);
    expect(row.reviewSuccessCount).toBe(1);
  });

  test('그 단어는 3일 뒤 실제로 복습에 걸린다 (이 테스트의 존재 이유)', async () => {
    await makeWord('shows-up');
    await toggleMemorized('l1', 'shows-up');
    const row = await read('shows-up');

    // 첫 칸은 3일 — 어제 외운 걸 오늘 묻지 않는다(gentle).
    expect(dueAfter(row, 1)).toBe(false);
    expect(dueAfter(row, 3)).toBe(true);
  });

  test('forceStatus=true로 켜도 같다', async () => {
    await makeWord('forced');
    await toggleMemorized('l1', 'forced', true);

    const row = await read('forced');
    expect(row.lastReviewedAt).toBeGreaterThan(Date.now() - DAY);
    expect(dueAfter(row, 3)).toBe(true);
  });

  test('암기를 끄는 토글은 복습 상태를 건드리지 않는다 — 후보가 아니라 적을 것이 없다', async () => {
    await makeWord('turned-off', 1);
    await db.runAsync(`UPDATE words SET lastReviewedAt = ?, reviewSuccessCount = 4 WHERE id = 'turned-off'`, 12345);
    await toggleMemorized('l1', 'turned-off', false);

    const row = await read('turned-off');
    expect(row.isMemorized).toBe(0);
    expect(row.lastReviewedAt).toBe(12345);
    expect(row.reviewSuccessCount).toBe(4);
    expect(dueAfter(row, 999)).toBe(false); // 미암기는 어떤 잔여값이 있어도 due가 아니다(D2)
  });

  test('껐다 켜면 사다리가 첫 칸으로 되돌아간다 — 잔여 카운트 위에 얹히지 않는다', async () => {
    // 이걸 += 1로 하면 4 → 5가 되어 3일이 아니라 180일에서 재시작한다.
    await makeWord('recycled', 1);
    await db.runAsync(`UPDATE words SET lastReviewedAt = ?, reviewSuccessCount = 4 WHERE id = 'recycled'`, 12345);
    await toggleMemorized('l1', 'recycled', false);
    await toggleMemorized('l1', 'recycled', true);

    const row = await read('recycled');
    expect(row.reviewSuccessCount).toBe(1);
    expect(dueAfter(row, 3)).toBe(true);
  });

  test('이미 암기인 단어에 forceStatus=true를 또 걸어도 시각을 밀지 않는다', async () => {
    // 밀어버리면 목록에서 토글을 만질 때마다 due가 뒤로 도망간다.
    await makeWord('already', 1);
    const long_ago = Date.now() - 30 * DAY;
    await db.runAsync(`UPDATE words SET lastReviewedAt = ?, reviewSuccessCount = 1 WHERE id = 'already'`, long_ago);
    await toggleMemorized('l1', 'already', true);

    const row = await read('already');
    expect(row.lastReviewedAt).toBe(long_ago);
    expect(row.reviewSuccessCount).toBe(1);
    expect(dueAfter(row, 0)).toBe(true); // 30일 방치된 3일짜리 — 여전히 due
  });
});
