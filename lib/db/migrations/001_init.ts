import type { Migration } from './types';

const migration: Migration = {
  version: 1,
  description: 'Initial schema — lists, words, base indexes',
  up: async (db) => {
    await db.execAsync(`
      CREATE TABLE lists (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        isVisible INTEGER DEFAULT 1,
        createdAt INTEGER NOT NULL,
        lastStudiedAt INTEGER NOT NULL,
        isCurated INTEGER DEFAULT 0,
        icon TEXT
      );
    `);
    await db.execAsync(`
      CREATE TABLE words (
        id TEXT PRIMARY KEY NOT NULL,
        listId TEXT NOT NULL,
        term TEXT NOT NULL,
        definition TEXT NOT NULL,
        exampleEn TEXT NOT NULL,
        meaningKr TEXT NOT NULL,
        isMemorized INTEGER DEFAULT 0,
        FOREIGN KEY (listId) REFERENCES lists(id) ON DELETE CASCADE
      );
    `);
    await db.execAsync(`CREATE INDEX idx_words_listId ON words(listId);`);
    await db.execAsync(`CREATE INDEX idx_lists_lastStudiedAt ON lists(lastStudiedAt DESC);`);
  },
};

export default migration;
