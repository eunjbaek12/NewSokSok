import type { Migration } from './types';

/**
 * completions.celebratedAt — 「이 완주를 축하 팝업으로 알렸는가」.
 *
 * 🔴 **완주 행의 존재만으로는 «방금 완주했다»를 알 수 없다.** `COMPLETION_RECORD_SQL` 은
 * `INSERT OR IGNORE` 라 같은 계획을 몇 번 지나가도 줄이 하나이고 `completedAt` 도 처음 값
 * 그대로다 — 완주한 계획의 Day 를 계획 화면에서 다시 학습하면 학습 결과 화면이 매번
 * 「완주했습니다」라고 축하하게 된다. 축하 여부를 따로 적어야 한 계획에 한 번이 된다.
 *
 * 자리가 여기인 이유: 축하했는가는 그 **사건의 속성**이고, 022 의 PK 가 이미
 * (listId, startedAt) = 계획 인스턴스라 한 줄에 한 번이 그대로 보장된다. 별도 저장소
 * (AsyncStorage)로 빼면 기록과 축하 여부가 갈라져 022 백필과 따로 관리해야 한다.
 *
 * 기존 행은 전부 `completedAt` 으로 채워 **이미 지난 일**로 친다 — 이 열이 없던 시절에
 * 완주한 것들이라, 비워 두면 업데이트 직후 아무 단어장이나 학습할 때 옛 완주가 튀어나온다.
 * 앞으로 들어오는 줄은 경로마다 값이 갈린다(`features/stats/completion.ts`):
 * 실제로 지금 일어난 완주(RECORD)만 NULL 이고, 새 기기 복원 백필(BACKFILL)은 지난 일이다.
 */
const migration: Migration = {
  version: 23,
  description: 'completions.celebratedAt — mark which completions were already celebrated',
  up: async (db) => {
    await db.execAsync(`ALTER TABLE completions ADD COLUMN celebratedAt INTEGER;`);
    await db.execAsync(`UPDATE completions SET celebratedAt = completedAt;`);
  },
};

export default migration;
