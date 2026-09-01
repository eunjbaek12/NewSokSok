import type { Migration } from './types';
// 배럴(@/features/sync)이 아니라 store 를 직접 집는다 — 배럴은 engine.ts 를 함께 끌어오고,
// engine 은 @/lib/db 를(즉 이 레지스트리를) 도로 import 해서 순환이 된다. store.ts 는
// zustand + AsyncStorage 뿐이라 안전하다. 019 도 같은 이유로 같은 형태다.
// eslint-disable-next-line no-restricted-imports
import { useSyncStore } from '@/features/sync/store';

/**
 * 로컬에 남아 있는 굴절형 원형(`baseForm`/`inflection`)을 클라우드로 한 번 올려보낸다.
 *
 * 020이 컬럼을 만들었지만 **동기화 양쪽이 그 컬럼을 몰랐다.**
 *   - push: `rowToWord`(features/sync/engine.ts)가 두 필드를 안 담아 `wordToCloudRow`가
 *     늘 null을 올렸다. 실측(2026-09-01) `cloud_words` 44,376행 중 `base_form` 0행.
 *   - pull: `INSERT OR REPLACE INTO words`의 컬럼 목록에도 없어서, 서버를 한 바퀴 돈
 *     단어는 **로컬 값까지 NULL로 초기화**됐다(REPLACE는 행을 통째로 갈아끼운다).
 *     별표 하나만 눌러도 그 단어의 원형 표기가 다음 pull에서 사라졌다.
 * 두 곳은 이 마이그레이션과 함께 고쳤다.
 *
 * 왜 마이그레이션이 필요한가: 매퍼만 고치면 값은 그 단어를 **다음에 건드릴 때까지** 안
 * 올라간다. dirty 집합은 SQLite가 아니라 AsyncStorage라 SQL로는 손댈 수 없고, 그래서
 * 019와 같은 방식으로 여기서 직접 찍는다.
 *
 * 🔴 `markWordsDirty`가 아니라 `markWordsDirtyDurable`을 쓰는 이유는 019에 적어 뒀다 —
 * 마이그레이션은 `hydrateDirty()`보다 먼저 돌 수 있고, 그때 평소 경로를 쓰면 저장돼 있던
 * 기존 dirty를 통째로 덮어 지운다.
 *
 * ⚠️ 이미 pull에 지워진 값은 이 마이그레이션으로 돌아오지 않는다. 로컬에도 서버에도 없는
 * 값이라 복구할 원본이 없다 — 그 단어들은 다음 AI 보강 때 다시 채워진다.
 */
const migration: Migration = {
  version: 21,
  description: 'Push locally-surviving baseForm/inflection to the cloud (020 leaked both ways)',
  up: async (db) => {
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM words
        WHERE deletedAt IS NULL
          AND (baseForm IS NOT NULL OR inflection IS NOT NULL)`,
    );
    if (rows.length === 0) return;

    // 마킹 실패로 마이그레이션을 깨뜨리지 않는다(019와 같은 판단) — 앱이 아예 안 뜨는
    // 것보다, 로컬 값만 남고 서버가 비는 편이 낫다.
    try {
      await useSyncStore.getState().markWordsDirtyDurable(rows.map(r => r.id));
    } catch (e) {
      console.warn('[migration 021] dirty 마킹 실패 — 원형 표기가 서버에 안 올라감', e);
    }
  },
};

export default migration;
