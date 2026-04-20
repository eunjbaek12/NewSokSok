import type { Migration } from './types';

const migration: Migration = {
  version: 4,
  description: 'words.position (order within list) + createdAt/updatedAt timestamps',
  up: async (db) => {
    await db.execAsync(`ALTER TABLE words ADD COLUMN position INTEGER DEFAULT 0;`);
    await db.execAsync(`ALTER TABLE words ADD COLUMN createdAt INTEGER DEFAULT 0;`);
    await db.execAsync(`ALTER TABLE words ADD COLUMN updatedAt INTEGER DEFAULT 0;`);
  },
};

export default migration;
