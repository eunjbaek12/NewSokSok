import type { Migration } from './types';

/**
 * lists.sourceThemeId / lists.savedAt — 「이 단어장은 어느 공유물에서 왔고, 언제 담았는가」.
 *
 * 지금은 담아온 단어장에 출처가 **아무것도 남지 않는다**. 「저장됨」 판정이 제목으로만
 * 이뤄져(`features/curation/saved-match.ts`) 「토익」 덱이 「토익-1」을 담은 사람에게도
 * 저장됨으로 뜨고, 같은 주소를 두 번 열면 「제목-2」가 조용히 쌓인다
 * (docs/share-to-friend-spec.md §4.3·§6.2).
 *
 * 두 값은 **비어 있을 수 있다** — 이 열이 없던 시절에 담은 단어장이 그렇다. 그래서
 * 백필하지 않는다: 옛 단어장의 출처는 알 방법이 없고, 추측으로 채우면 「8월 12일에 이미
 * 담았어요」가 거짓이 된다. 값이 없으면 날짜 없이 「이미 담았어요」로만 말한다.
 *
 * 동기화에는 올리지 않는다. `features/sync/mapping.ts` 는 필드를 하나씩 적어 옮기므로
 * 여기 추가해도 push 페이로드는 그대로다 — cloud_lists 에 없는 컬럼을 보내면 그 뒤
 * 모든 push 가 영구 실패한다.
 */
const migration: Migration = {
  version: 24,
  description: 'lists.sourceThemeId / lists.savedAt — where a saved copy came from',
  up: async (db) => {
    await db.execAsync(`ALTER TABLE lists ADD COLUMN sourceThemeId TEXT;`);
    await db.execAsync(`ALTER TABLE lists ADD COLUMN savedAt INTEGER;`);
  },
};

export default migration;
