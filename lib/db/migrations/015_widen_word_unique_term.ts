import type { Migration } from './types';

const migration: Migration = {
  version: 15,
  description: 'Widen word unique index to (listId, term, sourceLang, targetLang) so that the same term can be saved with a different target language',
  up: async (db) => {
    // 014가 만든 partial unique index 제거 → 키에 sourceLang/targetLang 포함해 재생성.
    // 014의 "동일 listId+term"으로 묶인 행들은 (sourceLang, targetLang) 조합이 모두
    // 같았으므로(014가 dedup했음) 새 키에서도 그대로 유효하다. 별도 dedup 불필요.
    //
    // 010 마이그레이션 default값(sourceLang='en', targetLang='ko')으로 빈 컬럼은 모두 채워져 있어,
    // 새 인덱스 생성 시 NULL로 인한 unique 우회 가능성 없음. 방어로 COALESCE까지 넣을 수도 있지만
    // 010이 보장하므로 생략.
    await db.execAsync(`DROP INDEX IF EXISTS idx_words_listId_term_unique;`);
    await db.execAsync(`
      CREATE UNIQUE INDEX idx_words_listId_term_lang_unique
      ON words(listId, LOWER(TRIM(term)), sourceLang, targetLang)
      WHERE deletedAt IS NULL;
    `);
  },
};

export default migration;
