import type { Migration } from './types';

const migration: Migration = {
  version: 7,
  description: 'words.wrongCount (quiz mistake tally)',
  up: async (db) => {
    await db.execAsync(`ALTER TABLE words ADD COLUMN wrongCount INTEGER DEFAULT 0;`);
  },
};

export default migration;
