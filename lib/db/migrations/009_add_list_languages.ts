import type { Migration } from './types';

const migration: Migration = {
  version: 9,
  description: 'lists.sourceLanguage / lists.targetLanguage (default en→ko)',
  up: async (db) => {
    await db.execAsync(`ALTER TABLE lists ADD COLUMN sourceLanguage TEXT DEFAULT 'en';`);
    await db.execAsync(`ALTER TABLE lists ADD COLUMN targetLanguage TEXT DEFAULT 'ko';`);
  },
};

export default migration;
