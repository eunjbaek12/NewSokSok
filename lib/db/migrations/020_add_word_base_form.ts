import type { Migration } from './types';

/**
 * 굴절형 표제어의 원형(`baseForm`)과 형태 코드(`inflection`). 설계·근거: `lib/inflection.ts`.
 *
 * 컬럼을 로컬에 만드는 것이 이 기능의 전제다. 서버에만 필드를 두면 **가져오는 순간 버려진다** —
 * `official_words.senses` 가 지금 정확히 그 상태다(서버엔 jsonb 로 들어 있는데 로컬 `words` 에
 * 대응 컬럼이 없어 큐레이션 담기에서 통째로 사라진다).
 *
 * 시드는 하지 않는다. 기존 행의 값은 서버 캐시 소급(scripts/backfill-base-form.ts)이 채운
 * 뒤 동기화로 내려오고, 게스트는 그 단어를 다시 조회할 때 채워진다. 로컬에서 규칙으로
 * 추정하는 길은 막아 뒀다 — `-er/-est` 로 끝나는 표제어 1,220개의 앞 40개에 비교급이 하나도
 * 없었고(answer·anger·after…), `analysis → analysi` 같은 오탐이 확실하다.
 */
const migration: Migration = {
  version: 20,
  description: 'words.baseForm / words.inflection (굴절형 원형 표기)',
  up: async (db) => {
    await db.execAsync(`ALTER TABLE words ADD COLUMN baseForm TEXT;`);
    await db.execAsync(`ALTER TABLE words ADD COLUMN inflection TEXT;`);
  },
};

export default migration;
