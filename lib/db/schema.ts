export const SCHEMA_VERSION = 6;

export const INIT_QUERIES = [
  // 리스트(단어장) 보관 테이블
  `CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    isVisible INTEGER DEFAULT 1,
    createdAt INTEGER NOT NULL,
    lastStudiedAt INTEGER NOT NULL,
    isCurated INTEGER DEFAULT 0,
    icon TEXT,
    position INTEGER DEFAULT 0
  );`,

  // 단어 보관 테이블
  `CREATE TABLE IF NOT EXISTS words (
    id TEXT PRIMARY KEY NOT NULL,
    listId TEXT NOT NULL,
    term TEXT NOT NULL,
    definition TEXT NOT NULL,
    phonetic TEXT,
    pos TEXT,
    exampleEn TEXT NOT NULL,
    exampleKr TEXT,
    meaningKr TEXT NOT NULL,
    isMemorized INTEGER DEFAULT 0,
    isStarred INTEGER DEFAULT 0,
    tags TEXT,
    position INTEGER DEFAULT 0,
    createdAt INTEGER DEFAULT 0,
    updatedAt INTEGER DEFAULT 0,
    FOREIGN KEY (listId) REFERENCES lists(id) ON DELETE CASCADE
  );`,

  // 인덱스 생성
  `CREATE INDEX IF NOT EXISTS idx_words_listId ON words(listId);`,
  `CREATE INDEX IF NOT EXISTS idx_lists_position ON lists(position DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_lists_lastStudiedAt ON lists(lastStudiedAt DESC);`
];
