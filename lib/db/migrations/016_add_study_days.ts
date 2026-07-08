import type { Migration } from './types';

/**
 * study_days — 하루당 1행의 학습 활동 로그. 연속 학습일(스트릭)과 주간/월간 통계의 원천.
 *
 * - `date`는 기기 로컬 시간대 기준 'YYYY-MM-DD' (하루 경계 = 기기 자정).
 * - `studiedCount`: 그날 학습 세션에서 복습한 단어 수 누적.
 * - `memorizedCount`: 그날 새로 외운(미암기→암기) 단어 수 누적.
 * - MVP는 로컬 전용. `updatedAt`은 향후 클라우드 병합(Phase 3) 대비 예약 컬럼.
 */
const migration: Migration = {
  version: 16,
  description: 'study_days — per-day study activity log for streak & stats (local-first)',
  up: async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS study_days (
        date            TEXT PRIMARY KEY NOT NULL,
        studiedCount    INTEGER NOT NULL DEFAULT 0,
        memorizedCount  INTEGER NOT NULL DEFAULT 0,
        updatedAt       INTEGER NOT NULL DEFAULT 0
      );
    `);
  },
};

export default migration;
