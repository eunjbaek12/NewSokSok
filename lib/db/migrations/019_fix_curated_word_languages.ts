import type { Migration } from './types';
import { useSyncStore } from '@/features/sync/store';

/**
 * 큐레이션 덱 단어에 찍힌 언어쌍을 리스트 값으로 되돌린다.
 *
 * 원인: `createCuratedList`(features/vocab/db.ts)가 단어 언어를 리스트 언어가 아니라
 * `'en'`/`'ko'` 하드코딩으로 스탬프하고 있었다. **PR #43(2026-07-09 머지)에서 이미
 * 고쳤고 신규 저장은 정상**이다 — 남은 것은 그 이전에 저장된 데이터뿐이라 이 마이그레이션은
 * 한 번만 일한다.
 *
 * 클라우드 실측(2026-08-14): 8,275행 · 21개 리스트 · 사용자 11명. 찍힌 값이 예외 없이
 * `en>ko` 라 하드코딩 흔적과 정확히 일치했다.
 *   ko>en 6,065 · zh>ko 1,491 · ja>ko 497 · es>ko 122 · ko>ko 99
 *
 * 왜 서버 UPDATE 가 아니라 로컬 마이그레이션인가:
 *   - 게스트는 서버에 행이 없다. 로컬을 고쳐야 게스트도 고쳐진다.
 *   - 서버에서 직접 UPDATE 하면 `cloud_words.updated_at` 이 인위로 올라가
 *     운영 지표가 왜곡된다(docs/ops-analytics-queries.md Q1 이 그 컬럼으로 "오늘
 *     활동한 사람"을 판정한다).
 *
 * ⚠️ 사용자가 직접 만든 리스트(`isCurated = 0`)는 건드리지 않는다. 거기에도 일본어·한자가
 * `en>ko` 로 들어 있지만, 리스트 자체가 `en>ko` 라 무엇이 맞는지 기계적으로 알 수 없다 —
 * 사용자가 리스트 언어를 잘못 고른 것일 수도 있다.
 *
 * 🔑 dirty 마킹이 이 마이그레이션의 절반이다. dirty 집합은 SQLite 가 아니라 AsyncStorage
 * 기반 Zustand store 라, SQL 로 고치기만 하면 **로컬만 바뀌고 서버는 영영 그대로**다.
 * `hydrateDirty()` 가 저장된 값과 합집합을 취하므로(features/sync/store.ts) 여기서 먼저
 * 마킹해도 나중 hydrate 가 지우지 않는다.
 */
const migration: Migration = {
  version: 19,
  description: 'Restore curated-deck word languages stamped as en>ko before PR #43',
  up: async (db) => {
    // NULL 안전 비교로 `IS NOT` 을 쓴다 — `!=` 는 한쪽이 NULL 이면 결과가 NULL 이라
    // 조건에 걸리지 않는다(두 컬럼 다 DEFAULT 가 있지만 예전 행은 NULL 일 수 있다).
    const WHERE = `
      l.isCurated = 1
      AND w.deletedAt IS NULL
      AND l.deletedAt IS NULL
      AND (w.sourceLang IS NOT l.sourceLanguage OR w.targetLang IS NOT l.targetLanguage)
    `;

    // 고칠 id 를 먼저 모은다 — UPDATE 뒤에는 조건이 더 이상 맞지 않아 찾을 수 없다.
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT w.id FROM words w JOIN lists l ON l.id = w.listId WHERE ${WHERE}`,
    );
    if (rows.length === 0) return;

    await db.execAsync(`
      UPDATE words SET
        sourceLang = (SELECT l.sourceLanguage FROM lists l WHERE l.id = words.listId),
        targetLang = (SELECT l.targetLanguage FROM lists l WHERE l.id = words.listId)
      WHERE id IN (
        SELECT w.id FROM words w JOIN lists l ON l.id = w.listId WHERE ${WHERE}
      );
    `);

    // 마킹 실패가 마이그레이션을 깨뜨리면 앱이 아예 뜨지 않는다. 데이터는 이미 고쳐졌고
    // 이 마이그레이션은 다시 돌지 않으므로, 최악의 경우 로컬만 고쳐지고 서버가 남는다 —
    // 앱이 안 뜨는 것보다 낫다.
    try {
      useSyncStore.getState().markWordsDirty(rows.map(r => r.id));
    } catch (e) {
      console.warn('[migration 019] dirty 마킹 실패 — 로컬만 정정됨', e);
    }
  },
};

export default migration;
