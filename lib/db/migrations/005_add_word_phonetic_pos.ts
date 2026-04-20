import type { Migration } from './types';

const migration: Migration = {
  version: 5,
  description: 'words.phonetic (IPA) and words.pos (part of speech)',
  up: async (db) => {
    await db.execAsync(`ALTER TABLE words ADD COLUMN phonetic TEXT;`);
    await db.execAsync(`ALTER TABLE words ADD COLUMN pos TEXT;`);
  },
};

export default migration;
