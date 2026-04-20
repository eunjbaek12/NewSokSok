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
