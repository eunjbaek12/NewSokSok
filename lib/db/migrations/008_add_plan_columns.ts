import type { Migration } from './types';

const migration: Migration = {
  version: 8,
  description: 'Study plan columns on lists + words.assignedDay',
  up: async (db) => {
    await db.execAsync(`ALTER TABLE lists ADD COLUMN planTotalDays INTEGER DEFAULT 0;`);
    await db.execAsync(`ALTER TABLE lists ADD COLUMN planCurrentDay INTEGER DEFAULT 1;`);
    await db.execAsync(`ALTER TABLE lists ADD COLUMN planWordsPerDay INTEGER DEFAULT 10;`);
    await db.execAsync(`ALTER TABLE lists ADD COLUMN planStartedAt INTEGER;`);
    await db.execAsync(`ALTER TABLE lists ADD COLUMN planUpdatedAt INTEGER;`);
    await db.execAsync(`ALTER TABLE words ADD COLUMN assignedDay INTEGER;`);
  },
};

export default migration;
