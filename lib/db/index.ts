import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { SCHEMA_VERSION, INIT_QUERIES } from './schema';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let isInitialized = false;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Initialize the database with schema
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

            dbInstance = await SQLite.openDatabaseAsync('soksok_voca.db');

            // Set journal mode to WAL for better performance
            await dbInstance.execAsync('PRAGMA journal_mode = WAL;');
            await dbInstance.execAsync('PRAGMA foreign_keys = ON;');

            // Check version and run migrations setup
            const result = await dbInstance.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
            let currentVersion = result?.user_version ?? 0;

            if (currentVersion < SCHEMA_VERSION) {
                console.log(`Migrating DB from version ${currentVersion} to ${SCHEMA_VERSION}`);

                await dbInstance.withTransactionAsync(async () => {
                    // Version 0 to 1
                    if (currentVersion === 0) {
                        for (const query of INIT_QUERIES) {
                            await dbInstance!.execAsync(query);
                        }
                        currentVersion = 1;
                    }

                    // Version 1 to 2
                    if (currentVersion === 1) {
                        try {
                            await dbInstance!.execAsync('ALTER TABLE words ADD COLUMN tags TEXT;');
                        } catch (e) {
                            console.log('Column tags might already exist or DB fresh init handled it.');
                        }
                        currentVersion = 2;
                    }

                    // Version 2 to 3
                    if (currentVersion === 2) {
                        try {
                            await dbInstance!.execAsync('ALTER TABLE words ADD COLUMN exampleKr TEXT;');
                            await dbInstance!.execAsync('ALTER TABLE words ADD COLUMN isStarred INTEGER DEFAULT 0;');
                        } catch (e) {
                            console.log('Columns exampleKr or isStarred might already exist.', e);
                        }
                        currentVersion = 3;
                    }

                    // Version 3 to 4
                    if (currentVersion === 3) {
                        try {
                            await dbInstance!.execAsync('ALTER TABLE words ADD COLUMN position INTEGER DEFAULT 0;');
                            await dbInstance!.execAsync('ALTER TABLE words ADD COLUMN createdAt INTEGER DEFAULT 0;');
                            await dbInstance!.execAsync('ALTER TABLE words ADD COLUMN updatedAt INTEGER DEFAULT 0;');
                        } catch (e) {
                            console.log('Columns position/createdAt/updatedAt might already exist.', e);
                        }
                        currentVersion = 4;
                    }

                    // Version 4 to 5
                    if (currentVersion === 4) {
                        try {
                            await dbInstance!.execAsync('ALTER TABLE words ADD COLUMN phonetic TEXT;');
                            await dbInstance!.execAsync('ALTER TABLE words ADD COLUMN pos TEXT;');
                        } catch (e) {
                            console.log('Columns phonetic or pos might already exist.', e);
                        }
                        currentVersion = 5;
                    }

                    // Version 5 to 6
                    if (currentVersion === 5) {
                        try {
                            await dbInstance!.execAsync('ALTER TABLE lists ADD COLUMN position INTEGER DEFAULT 0;');
                            // Initialize position with lastStudiedAt to preserve current order
                            await dbInstance!.execAsync('UPDATE lists SET position = lastStudiedAt;');
                        } catch (e) {
                            console.log('Column position might already exist.', e);
                        }
                        currentVersion = 6;
                    }

                    // Version 6 to 7
                    if (currentVersion === 6) {
                        try {
                            await dbInstance!.execAsync('ALTER TABLE words ADD COLUMN wrongCount INTEGER DEFAULT 0;');
                        } catch (e) {
                            console.log('Column wrongCount might already exist.', e);
                        }
                        currentVersion = 7;
                    }

                    // Version 7 to 8
                    if (currentVersion === 7) {
                        try {
                            await dbInstance!.execAsync('ALTER TABLE lists ADD COLUMN planTotalDays INTEGER DEFAULT 0;');
                            await dbInstance!.execAsync('ALTER TABLE lists ADD COLUMN planCurrentDay INTEGER DEFAULT 1;');
                            await dbInstance!.execAsync('ALTER TABLE lists ADD COLUMN planWordsPerDay INTEGER DEFAULT 10;');
                            await dbInstance!.execAsync('ALTER TABLE lists ADD COLUMN planStartedAt INTEGER;');
                            await dbInstance!.execAsync('ALTER TABLE lists ADD COLUMN planUpdatedAt INTEGER;');
                            await dbInstance!.execAsync('ALTER TABLE words ADD COLUMN assignedDay INTEGER;');
                        } catch (e) {
                            console.log('Plan columns might already exist.', e);
                        }
                        currentVersion = 8;
                    }

                    await dbInstance!.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
                });
            }

            isInitialized = true;
            return dbInstance;
        } finally {
            initPromise = null;
        }
    })();

    return initPromise;
}

// Ensure close
export async function closeDb() {
    if (dbInstance) {
        await dbInstance.closeAsync();
        dbInstance = null;
        isInitialized = false;
    }
}
