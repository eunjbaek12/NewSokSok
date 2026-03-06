import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { SCHEMA_VERSION, INIT_QUERIES } from './schema';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let isInitialized = false;

// Initialize the database with schema
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
    if (dbInstance && isInitialized) {
        return dbInstance;
    }

    if (Platform.OS === 'web') {
        console.warn('Expo SQLite is not supported on the web platform without WASM configuration. Using Mock DB.');
        return {
            getAllAsync: async () => [],
            getFirstAsync: async () => null,
            runAsync: async () => { },
            execAsync: async () => { },
            withTransactionAsync: async (cb: any) => await cb(),
            closeAsync: async () => { }
        } as unknown as SQLite.SQLiteDatabase;
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
                // Ensure table exists (in case it's a fresh install where V1 wasn't run separately)
                // INIT_QUERIES might have already run in V0 if it's new
                // If V1 was existing, we add the column:
                try {
                    await dbInstance!.execAsync('ALTER TABLE words ADD COLUMN tags TEXT;');
                } catch (e) {
                    // Ignore if column already exists
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

            await dbInstance!.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
        });
    }

    isInitialized = true;
    return dbInstance;
}

// Ensure close
export async function closeDb() {
    if (dbInstance) {
        await dbInstance.closeAsync();
        dbInstance = null;
        isInitialized = false;
    }
}
