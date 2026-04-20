/**
 * Migration registry — single source of truth for the SQLite schema timeline.
 *
 * Each numbered file in this directory exports a `Migration` (default export).
 * The runner in `../index.ts` imports `MIGRATIONS` and walks them in order,
 * running each `up()` whose `version` is greater than the DB's `user_version`.
 *
 * Invariant (enforced by `assertContiguous()` below): the list is contiguous
 * starting at 1. To add a new migration, create `NNN_<slug>.ts`, add its
 * default export to the array below in ordinal position, and bump nothing
 * else — `SCHEMA_VERSION` is derived from `MIGRATIONS.length`.
 */
import type { Migration } from './types';
import migration_001 from './001_init';
import migration_002 from './002_add_word_tags';
import migration_003 from './003_add_word_exampleKr_starred';
import migration_004 from './004_add_word_position_timestamps';
import migration_005 from './005_add_word_phonetic_pos';
import migration_006 from './006_add_list_position';
import migration_007 from './007_add_word_wrong_count';
import migration_008 from './008_add_plan_columns';
import migration_009 from './009_add_list_languages';
import migration_010 from './010_add_word_languages';
import migration_011 from './011_add_list_last_result';
import migration_012 from './012_add_list_plan_filter';
import migration_013 from './013_add_soft_delete';

export const MIGRATIONS: readonly Migration[] = [
  migration_001,
  migration_002,
  migration_003,
  migration_004,
  migration_005,
  migration_006,
  migration_007,
  migration_008,
  migration_009,
  migration_010,
  migration_011,
  migration_012,
  migration_013,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export type { Migration } from './types';

/**
 * Whitelist sanity check: versions must be 1..N contiguous. Anything else is
 * a developer-authored mistake that would corrupt future upgrades.
 */
export function assertContiguous(): void {
  for (let i = 0; i < MIGRATIONS.length; i++) {
    const expected = i + 1;
    if (MIGRATIONS[i].version !== expected) {
      throw new Error(
        `Migration registry broken at index ${i}: expected version ${expected}, got ${MIGRATIONS[i].version} (${MIGRATIONS[i].description})`,
      );
    }
  }
}
