import type { Migration } from './types';

const migration: Migration = {
  version: 11,
  description: 'lists.lastResultMemorized / lastResultTotal / lastResultPercent — per-list study snapshot',
  up: async (db) => {
    await db.execAsync(`ALTER TABLE lists ADD COLUMN lastResultMemorized INTEGER DEFAULT 0;`);
    await db.execAsync(`ALTER TABLE lists ADD COLUMN lastResultTotal INTEGER DEFAULT 0;`);
    await db.execAsync(`ALTER TABLE lists ADD COLUMN lastResultPercent INTEGER DEFAULT 0;`);
  },
};

export default migration;
