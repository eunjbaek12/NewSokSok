import type { Migration } from './types';

const migration: Migration = {
  version: 10,
  description: 'words.sourceLang / words.targetLang (default en→ko)',
  up: async (db) => {
    await db.execAsync(`ALTER TABLE words ADD COLUMN sourceLang TEXT DEFAULT 'en';`);
    await db.execAsync(`ALTER TABLE words ADD COLUMN targetLang TEXT DEFAULT 'ko';`);
  },
};

export default migration;
