import type { Migration } from './types';

const migration: Migration = {
  version: 6,
  description: 'lists.position — seeded from lastStudiedAt to preserve current order',
  up: async (db) => {
    await db.execAsync(`ALTER TABLE lists ADD COLUMN position INTEGER DEFAULT 0;`);
    await db.execAsync(`UPDATE lists SET position = lastStudiedAt;`);
    await db.execAsync(`CREATE INDEX idx_lists_position ON lists(position DESC);`);
  },
};

export default migration;
