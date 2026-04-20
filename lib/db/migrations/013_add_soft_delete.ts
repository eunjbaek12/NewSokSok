import type { Migration } from './types';

const migration: Migration = {
  version: 13,
  description: 'Soft-delete (lists.updatedAt + lists/words.deletedAt) and supporting indexes — sync prerequisite',
  up: async (db) => {
    await db.execAsync(`ALTER TABLE lists ADD COLUMN updatedAt INTEGER DEFAULT 0;`);
    await db.execAsync(`ALTER TABLE lists ADD COLUMN deletedAt INTEGER;`);
    await db.execAsync(`ALTER TABLE words ADD COLUMN deletedAt INTEGER;`);
    await db.execAsync(`CREATE INDEX idx_lists_deletedAt ON lists(deletedAt);`);
    await db.execAsync(`CREATE INDEX idx_words_deletedAt ON words(deletedAt);`);
  },
};

export default migration;
