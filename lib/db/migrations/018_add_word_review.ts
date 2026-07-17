import type { Migration } from './types';

/**
 * Gentle SRS — 복습 스케줄에 필요한 단어별 상태 2개. 설계: docs/gentle-srs-design.md §6.
 *
 * - `lastReviewedAt`: due 판정의 기준점(epoch ms). "외운 후 경과"가 아니라 "마지막으로 본 후
 *   경과"여야 복습한 단어가 due에서 빠진다 — 이 갱신이 기능의 성패를 가른다(§4.3).
 * - `reviewSuccessCount`: "외웠어요" 누적. 간격 사다리(3/10/30/90일)의 위치를 결정한다(§4.2).
 *   명시적 `reviewStage` 컬럼 대신 카운트로 간격을 근사한다.
 *
 * 시드(§6): 업데이트 직후 기존 암기 단어가 한꺼번에 due로 쏟아지는 것을 막는다(P1).
 *   1. memorized_log(v017)에 기록이 있으면 그 시각 → 실제로 외운 날 기준으로 자연스럽게 분산.
 *   2. 기록이 없으면(로그 도입 이전에 외운 대부분) 마이그레이션 시각 → 첫 복습은 3일 뒤.
 * 미암기 단어는 NULL로 남는다 — 복습 후보가 아니므로(§4.3 D2) 시드할 것이 없다.
 */
const migration: Migration = {
  version: 18,
  description: 'words.lastReviewedAt / words.reviewSuccessCount (gentle SRS) + seed existing memorized words',
  up: async (db) => {
    await db.execAsync(`ALTER TABLE words ADD COLUMN lastReviewedAt INTEGER;`);
    await db.execAsync(`ALTER TABLE words ADD COLUMN reviewSuccessCount INTEGER DEFAULT 0;`);

    // 1) 외운 날 기록이 있는 단어 — 가장 최근 로그 시각으로.
    //    NULLIF(…, 0)은 createdAt DEFAULT 0으로 들어간 행이 1970년 = 즉시 due가 되는 것을 막는다.
    //    걸러진 행은 아래 2)의 NULL 채우기가 받는다.
    await db.execAsync(`
      UPDATE words
         SET lastReviewedAt = (
           SELECT NULLIF(MAX(l.createdAt), 0) FROM memorized_log l WHERE l.wordId = words.id
         )
       WHERE isMemorized = 1;
    `);

    // 2) 기록이 없는 나머지 암기 단어 — 마이그레이션 시각. 첫 복습은 3일 뒤로 밀린다.
    await db.runAsync(
      `UPDATE words SET lastReviewedAt = ? WHERE isMemorized = 1 AND lastReviewedAt IS NULL;`,
      Date.now(),
    );

    // 3) 이미 외운 단어 = "외웠어요" 1회 성공한 상태. 사다리 첫 칸(3일)에서 시작한다.
    await db.execAsync(`UPDATE words SET reviewSuccessCount = 1 WHERE isMemorized = 1;`);
  },
};

export default migration;
