/**
 * Regression: "cannot start a transaction within a transaction".
 *
 * expo-sqlite's `withTransactionAsync` runs BEGIN..COMMIT on the single shared
 * app connection and is NOT exclusive. Two overlapping calls (rapid memorize/
 * star toggles fired un-awaited from onPress, or a background sync pull landing
 * mid-edit) issue a second BEGIN before the first COMMIT and SQLite rejects it.
 *
 * `lib/db.runInTransaction` serializes transactions through a promise chain so
 * one BEGIN..COMMIT always completes before the next starts.
 *
 * The mock below faithfully reproduces SQLite's behaviour: a connection-level
 * `inTransaction` flag, and a BEGIN that throws the exact error if a
 * transaction is already open. So the "control" test proves the bug is real,
 * and the fix test proves `runInTransaction` prevents it.
 */
import { getDb, runInTransaction } from '@/lib/db';

// lib/db imports `{ Platform } from 'react-native'`. react-native's entry ships
// Flow syntax that this ts-jest setup (no .js/babel transform for node_modules)
// can't parse, so stub it. OS != 'web' keeps getDb on the native code path.
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

jest.mock('expo-sqlite', () => {
  // Pin user_version to the code's schema version so getDb() skips migrations
  // (no migration SQL runs against this fake connection).
  const { SCHEMA_VERSION } = require('@/lib/db/migrations');

  let inTransaction = false;

  const conn: any = {
    execAsync: async (sql: string) => {
      const s = sql.trim().toUpperCase();
      if (s === 'BEGIN' || s.startsWith('BEGIN ')) {
        if (inTransaction) {
          throw new Error('cannot start a transaction within a transaction');
        }
        inTransaction = true;
      } else if (s === 'COMMIT' || s === 'ROLLBACK') {
        inTransaction = false;
      }
      // PRAGMA and everything else: no-op.
    },
    runAsync: async () => ({ changes: 0, lastInsertRowId: 0 }),
    getAllAsync: async () => [],
    getFirstAsync: async (sql: string) => {
      if (sql.includes('user_version')) return { user_version: SCHEMA_VERSION };
      return null;
    },
    // Copy of expo-sqlite's real withTransactionAsync (non-exclusive).
    withTransactionAsync: async function (task: () => Promise<void>) {
      await this.execAsync('BEGIN');
      try {
        await task();
        await this.execAsync('COMMIT');
      } catch (e) {
        await this.execAsync('ROLLBACK');
        throw e;
      }
    },
    closeAsync: async () => {},
  };

  return { openDatabaseAsync: async () => conn };
});

const tick = (ms = 5) => new Promise<void>(resolve => setTimeout(resolve, ms));

describe('lib/db transaction serialization', () => {
  it('runInTransaction serializes overlapping transactions (no nested-tx crash)', async () => {
    await getDb();

    let active = 0;
    let maxActive = 0;
    const completed: number[] = [];

    const work = (i: number) =>
      runInTransaction(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await tick(); // hold the transaction open across async boundaries
        active -= 1;
        completed.push(i);
      });

    // 20 concurrent calls — mimics a user hammering the toggle buttons.
    await expect(
      Promise.all(Array.from({ length: 20 }, (_, i) => work(i))),
    ).resolves.toBeDefined();

    // No two transaction bodies were ever in-flight at once.
    expect(maxActive).toBe(1);
    // All ran, and in submission order (FIFO chain).
    expect(completed).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it('a failing transaction does not break the chain for later ones', async () => {
    const order: string[] = [];

    const ok1 = runInTransaction(async () => {
      await tick();
      order.push('ok1');
    });
    const bad = runInTransaction(async () => {
      await tick();
      order.push('bad');
      throw new Error('boom');
    });
    const ok2 = runInTransaction(async () => {
      await tick();
      order.push('ok2');
    });

    await expect(ok1).resolves.toBeUndefined();
    await expect(bad).rejects.toThrow('boom');
    await expect(ok2).resolves.toBeUndefined();
    expect(order).toEqual(['ok1', 'bad', 'ok2']);
  });

  it('control: raw concurrent withTransactionAsync reproduces the nested-tx error', async () => {
    const db = await getDb();
    await expect(
      Promise.all(
        Array.from({ length: 5 }, () =>
          db.withTransactionAsync(async () => {
            await tick();
          }),
        ),
      ),
    ).rejects.toThrow('cannot start a transaction within a transaction');
  });
});
