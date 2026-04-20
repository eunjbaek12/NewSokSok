import type { Migration } from './types';

const migration: Migration = {
  version: 12,
  description: 'lists.planFilter — remembered filter tab for plan screen',
  up: async (db) => {
    await db.execAsync(`ALTER TABLE lists ADD COLUMN planFilter TEXT DEFAULT 'all';`);
  },
};

export default migration;
