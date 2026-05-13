import type { Migration } from './types';

const migration: Migration = {
  version: 14,
  description: 'UNIQUE index on (listId, LOWER(TRIM(term))) for non-deleted words — prevents duplicate term storage',
  up: async (db) => {
    // 기존 중복 행 제거: 같은 listId + normalized term 중 rowid 최솟값(가장 먼저 저장된 것)만 유지
    await db.execAsync(`
      DELETE FROM words
      WHERE deletedAt IS NULL
        AND rowid NOT IN (
          SELECT MIN(rowid)
          FROM words
          WHERE deletedAt IS NULL
          GROUP BY listId, LOWER(TRIM(term))
        );
    `);
    // partial index: deletedAt IS NULL인 행만 대상으로 unique 강제
    // 소프트 삭제된 단어와 같은 term 재추가 허용
    await db.execAsync(`
      CREATE UNIQUE INDEX idx_words_listId_term_unique
      ON words(listId, LOWER(TRIM(term)))
      WHERE deletedAt IS NULL;
    `);
  },
};

export default migration;
