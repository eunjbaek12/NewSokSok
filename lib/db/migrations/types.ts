import type * as SQLite from 'expo-sqlite';

/**
 * A single schema migration. Step 11 split the old monolithic v0→v13 ladder in
 * `lib/db/index.ts` into one file per version bump. Every migration is atomic,
 * named, and reviewable on its own; the runner in `./index.ts` walks them in
 * order.
 *
 * `version` must match the file's ordinal position in the registry (1-indexed,
 * contiguous) — the runner asserts this at startup.
 */
export interface Migration {
  version: number;
  description: string;
  up: (db: SQLite.SQLiteDatabase) => Promise<void>;
}
