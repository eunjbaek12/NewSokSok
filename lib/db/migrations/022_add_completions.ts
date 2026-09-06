import type { Migration } from './types';

/**
 * completions — "이 단어장을 다 외웠다"는 사건을 적어 두는 로그.
 *
 * 🔴 **완주는 지금까지 기록이 아니라 «상태»였다.** `computePlanStatus` 가 매 렌더
 * `planUpdatedAt != null && planCurrentDay > planTotalDays` 로 계산하는 파생 상태라,
 * `clearPlan`(「새 계획 세우기」·완주 카드의 ✕)이 그 세 값을 지우는 순간 **완주가 없던 일이
 * 된다.** 완주 기록 화면은 그 위에 세울 수 없어서 이 표가 먼저 필요하다.
 *
 * - **한 계획에 한 줄** — PK 가 (listId, startedAt) 다. `startedAt`(planStartedAt)이 계획
 *   인스턴스의 신원이라, 완주 뒤 그 계획을 더 학습해 `planUpdatedAt` 이 움직여도 줄이 늘지
 *   않는다. 「새 계획 세우기」로 다시 완주하면 `startedAt` 이 달라져 새 줄이 된다.
 * - **숫자는 스냅숏이다.** `memorized_log` 와 달리 참조만 두지 않는다 — 상장은 «그때» 무엇을
 *   외웠는지 말하는 물건이라, 나중에 단어를 50개 더 넣으면 지난 상장이 거짓말을 하게 된다.
 *   제목만은 살아 있는 단어장의 것을 우선 쓰고(이름은 바뀌어도 같은 단어장이다), 여기 둔
 *   `title` 은 단어장을 지운 뒤의 폴백이다.
 * - **로컬 전용.** study_days/memorized_log 처럼 클라우드 동기화는 뒤로 미룬다. 새 기기에서는
 *   아래 백필이 «지금 완주 상태인» 단어장을 다시 채워 주므로 대부분 복구된다(완주 뒤 계획을
 *   지운 것만 못 살린다).
 *
 * 백필은 이 자리에서 한 번 — 이미 완주해 둔 단어장들에 지금 값으로 줄을 만든다. 017 이전에
 * 외운 단어는 로그가 없어 studyDays=0 · lastTerm=NULL 이 되고, 상장은 그 줄들을 빼고 그린다.
 */
const migration: Migration = {
  version: 22,
  description: 'completions — append-only completion log (one row per plan run) + backfill',
  up: async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS completions (
        listId      TEXT NOT NULL,
        startedAt   INTEGER NOT NULL,
        completedAt INTEGER NOT NULL,
        title       TEXT NOT NULL,
        totalWords  INTEGER NOT NULL,
        studyDays   INTEGER NOT NULL DEFAULT 0,
        lastTerm    TEXT,
        PRIMARY KEY (listId, startedAt)
      );
    `);
    await db.execAsync(
      `CREATE INDEX IF NOT EXISTS idx_completions_completedAt ON completions(completedAt DESC);`
    );

    // 이미 완주해 둔 단어장 백필. 조건은 computePlanStatus 의 'completed' 와 같다.
    await db.execAsync(`
      INSERT OR IGNORE INTO completions
        (listId, startedAt, completedAt, title, totalWords, studyDays, lastTerm)
      SELECT
        l.id,
        l.planStartedAt,
        l.planUpdatedAt,
        l.title,
        (SELECT COUNT(*) FROM words w
          WHERE w.listId = l.id AND w.deletedAt IS NULL),
        (SELECT COUNT(DISTINCT ml.date) FROM memorized_log ml
           JOIN words w2 ON w2.id = ml.wordId
          WHERE w2.listId = l.id AND w2.deletedAt IS NULL),
        (SELECT w3.term FROM memorized_log ml2
           JOIN words w3 ON w3.id = ml2.wordId
          WHERE w3.listId = l.id AND w3.deletedAt IS NULL
          ORDER BY ml2.date DESC, ml2.createdAt DESC, w3.term ASC
          LIMIT 1)
      FROM lists l
      WHERE l.deletedAt IS NULL
        AND l.planStartedAt IS NOT NULL
        AND l.planUpdatedAt IS NOT NULL
        AND l.planTotalDays > 0
        AND l.planCurrentDay > l.planTotalDays;
    `);
  },
};

export default migration;
