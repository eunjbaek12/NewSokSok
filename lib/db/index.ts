import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { MIGRATIONS, SCHEMA_VERSION, assertContiguous } from './migrations';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let isInitialized = false;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Get (or lazily open) the app's SQLite database. On first call we:
 *   1. open `soksok_voca.db`
 *   2. set WAL + foreign_keys
 *   3. read `PRAGMA user_version` and run any pending migrations in order
 *
 * Step 11 moved the v0→v13 ladder out of this file into `./migrations/NNN_*.ts`.
 * The ladder runs inside a single transaction so a crash mid-upgrade leaves
 * `user_version` pointing at the last committed version, not a partial one.
 */
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
    if (dbInstance && isInitialized) {
        return dbInstance;
    }

    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        try {
            if (Platform.OS === 'web') {
                console.warn('Expo SQLite is not supported on the web platform without WASM configuration. Using Mock DB.');
                const mockDb = {
                    getAllAsync: async () => [],
                    getFirstAsync: async () => null,
                    runAsync: async () => { },
                    execAsync: async () => { },
                    withTransactionAsync: async (cb: any) => await cb(),
                    closeAsync: async () => { }
                } as unknown as SQLite.SQLiteDatabase;
                dbInstance = mockDb;
                isInitialized = true;
                return mockDb;
            }

            assertContiguous();

            dbInstance = await SQLite.openDatabaseAsync('soksok_voca.db');

            await dbInstance.execAsync('PRAGMA journal_mode = WAL;');
            await dbInstance.execAsync('PRAGMA foreign_keys = ON;');

            const result = await dbInstance.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
            const currentVersion = result?.user_version ?? 0;

            if (currentVersion < SCHEMA_VERSION) {
                console.log(`Migrating DB from version ${currentVersion} to ${SCHEMA_VERSION}`);

                const pending = MIGRATIONS.filter(m => m.version > currentVersion);

                await dbInstance.withTransactionAsync(async () => {
                    for (const migration of pending) {
                        await migration.up(dbInstance!);
                    }
                    await dbInstance!.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
                });
            } else if (currentVersion > SCHEMA_VERSION) {
                // DB is newer than the code (downgrade). Abort rather than guess.
                throw new Error(
                    `DB user_version (${currentVersion}) is ahead of code SCHEMA_VERSION (${SCHEMA_VERSION}). Downgrade is not supported.`,
                );
            }

            isInitialized = true;
            return dbInstance;
        } finally {
            initPromise = null;
        }
    })();

    return initPromise;
}

export async function closeDb() {
    if (dbInstance) {
        await dbInstance.closeAsync();
        dbInstance = null;
        isInitialized = false;
    }
}

// Serialization chain for write transactions. See runInTransaction below.
let txnChain: Promise<unknown> = Promise.resolve();

/**
 * Run a write transaction, serialized against every other transaction on the
 * shared connection.
 *
 * expo-sqlite's `withTransactionAsync` issues `BEGIN … COMMIT` on the single
 * app connection and is explicitly *not* exclusive (see its JSDoc). Two
 * overlapping calls — e.g. the user rapidly tapping the memorize/star toggles
 * (fired un-awaited from onPress), or a background sync `pullChanges` landing
 * mid-edit — start a second `BEGIN` before the first `COMMIT`, which SQLite
 * rejects with "cannot start a transaction within a transaction".
 *
 * Chaining each transaction onto the previous one guarantees one BEGIN..COMMIT
 * fully completes before the next begins. getDb() is resolved *inside* the
 * chained continuation so the read-and-advance of `txnChain` stays synchronous
 * (no await between), which keeps concurrent callers from both chaining onto a
 * stale tail. A failed task is isolated from the chain before re-throwing to
 * its own caller.
 */
export async function runInTransaction(task: () => Promise<void>): Promise<void> {
    const run = txnChain.then(async () => {
        const db = await getDb();
        return db.withTransactionAsync(task);
    });
    txnChain = run.then(() => undefined, () => undefined);
    return run;
}
