import type { Migration } from './types';

/**
 * memorized_log — "그날 외운 단어" 참조 로그. 내 학습 달력의 날짜 탭 상세가 읽는다.
 *
 * - 단어 내용은 복사하지 않는다. (date, wordId) 참조만 저장하고 표시 시점에
 *   words와 조인한다. 단어 편집은 목록에 즉시 반영되고, 삭제된 단어는 조회에서 제외.
 * - 기록은 불변(append-only): 나중에 미암기로 되돌려도 이날의 행은 남는다.
 *   현재 상태는 words.isMemorized가 진실이고, 목록에선 "미암기" 배지로만 구분한다.
 * - PRIMARY KEY (date, wordId): 같은 날 재토글은 1행. 다른 날 재암기는 그날의 새 행.
 * - study_days처럼 로컬 전용. 클라우드 동기화는 Phase 3.
 */
const migration: Migration = {
  version: 17,
  description: 'memorized_log — per-day memorized word references for calendar day detail (local-only)',
  up: async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS memorized_log (
        date      TEXT NOT NULL,
        wordId    TEXT NOT NULL,
        createdAt INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (date, wordId)
      );
    `);
  },
};

export default migration;
