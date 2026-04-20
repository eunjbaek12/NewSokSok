import type { Migration } from './types';

const migration: Migration = {
  version: 2,
  description: 'words.tags (JSON array of tag strings)',
  up: async (db) => {
    await db.execAsync(`ALTER TABLE words ADD COLUMN tags TEXT;`);
  },
};

export default migration;
