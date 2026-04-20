import type { Migration } from './types';

const migration: Migration = {
  version: 3,
  description: 'words.exampleKr (Korean example sentence) and words.isStarred',
  up: async (db) => {
    await db.execAsync(`ALTER TABLE words ADD COLUMN exampleKr TEXT;`);
    await db.execAsync(`ALTER TABLE words ADD COLUMN isStarred INTEGER DEFAULT 0;`);
  },
};

export default migration;
