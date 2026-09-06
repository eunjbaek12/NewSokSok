/**
 * 완주 상장이 «무엇을 어떻게» 보여줄지에 대한 판단만 모은 순수 모듈.
 *
 * RN·expo 를 import 하지 않는다 — 그래야 카드(CompletionShareCard)와 조회(db.ts)가
 * 같은 값을 쓰면서도 이 판단들을 노드에서 그대로 테스트할 수 있다. 상장의 «치수»는
 * 여기 없다: 그건 1080² 로 실제 렌더해 눈으로 맞춘 것이라 테스트가 지킬 수 없고,
 * 테스트가 지킬 수 있는 건 판단뿐이다.
 */

/** 카드 폭(dp). share.ts 가 1080×1080 으로 캡처하므로 실제 배율은 1080/340 = 3.18배다. */
export const CARD = 340;
/** 좌우 여백을 뺀 본문 폭. 덱 이름이 한 줄에 들어가는지 재는 기준. */
export const CONTENT_W = CARD - 29 * 2;

/**
 * 문자열의 대략적인 폭을 em 단위로 어림한다. 한글·한자·가나는 전각(1em), 나머지
 * (로마자·숫자·공백)는 0.55em 으로 본다. RN 에는 동기 텍스트 측정이 없어 글자 크기를
 * 고르려면 이 어림이 필요하다.
 *
 * 로마자 쪽은 실제보다 넓게 잡히는데, 그 방향이 안전하다 — 넘칠 것 같으면 작게 가고,
 * 작게 간 상장은 멀쩡하지만 넘친 상장은 서명란을 밀어낸다.
 */
export function estimateEm(s: string): number {
  let em = 0;
  for (const ch of s) {
    em += /[\u1100-\u11FF\u3000-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF]/.test(ch) ? 1 : 0.55;
  }
  return em;
}

export interface TypeSize { fontSize: number; lineHeight: number }

/**
 * 덱 이름 크기. 한 줄에 들어가면 크게 간다 — 상장의 무게는 이름 한 줄이 진다.
 * 두 줄짜리를 큰 크기 그대로 두면 본문이 서명란을 밀어내 종이가 깨진다.
 */
export function deckType(title: string): TypeSize {
  return estimateEm(title) * 35.5 <= CONTENT_W * 0.97
    ? { fontSize: 35.5, lineHeight: 42 }
    : { fontSize: 25, lineHeight: 30 };
}

/**
 * 도장 글자 크기. 도장은 두 글자(완주) 기준으로 짜여 있어, 글자 수가 늘어나는 로마자
 * 로케일(en "DONE", es "FIN")을 그대로 두면 원을 넘친다.
 */
export function sealType(word: string): TypeSize & { letterSpacing: number; paddingLeft: number } {
  return word.length <= 2
    ? { fontSize: 15.5, lineHeight: 18.6, letterSpacing: 1.2, paddingLeft: 1.2 }
    : { fontSize: 10.5, lineHeight: 13, letterSpacing: 0.8, paddingLeft: 0.8 };
}

export interface Segment { text: string; strong: boolean }

/**
 * `*강조*` 구간을 갈라낸다. 상장 본문에서 숫자가 장식이 아니라 문장의 일부가 되게
 * 하려면 문장 안에서 굵기가 갈려야 하는데, 어느 자리에 오는지는 언어마다 다르다
 * (ko "2,800개를", en "all 2,800 words"). 그래서 번역문 자체가 강조 위치를 들고 있다.
 *
 * 별표가 홀수 개면 마지막 조각은 강조하지 않는다 — 번역이 한쪽을 빠뜨려도 문장은
 * 그대로 읽혀야 한다.
 */
export function splitEmphasis(text: string): Segment[] {
  const parts = text.split('*');
  const odd = parts.length % 2 === 0; // 짝수 조각 = 별표가 홀수 개 = 짝이 안 맞는다
  return parts
    .map((part, i) => ({
      text: part,
      strong: i % 2 === 1 && !(odd && i === parts.length - 1),
    }))
    .filter(seg => seg.text.length > 0);
}

/**
 * 「마지막으로 외운 단어」가 빠지는 건 017(2026-07-09) 이전에 완주한 단어장뿐인데,
 * 그 한 줄이 없으면 본문과 서명란 사이가 구멍처럼 벌어진다. 빠진 만큼을 위아래로
 * 나눠 가운데가 다시 차게 한다.
 */
export function deckGap(hasLastWord: boolean): number {
  return hasLastWord ? 31.9 : 31.9 + 14;
}

/**
 * 실제로 «편 날»의 수. 달력 일수(planStartedAt→planUpdatedAt)가 아니다 — 그쪽은 쉰 날이
 * 다 포함돼 "42일 걸림"처럼 노력이 아니라 방치를 자랑하게 된다.
 */
export const COMPLETION_DAYS_SQL =
  `SELECT COUNT(DISTINCT l.date) as n
     FROM memorized_log l JOIN words w ON w.id = l.wordId
    WHERE w.listId = ? AND w.deletedAt IS NULL`;

/**
 * 마지막으로 외운 단어 하나. 날짜가 같으면 그날 안에서 나중에 찍힌 것이 마지막이다.
 * 정렬을 바꾸면(예: term 순) 카드가 "마지막"이라고 적어 놓고 아무 단어나 보여준다.
 */
export const COMPLETION_LAST_TERM_SQL =
  `SELECT w.term
     FROM memorized_log l JOIN words w ON w.id = l.wordId
    WHERE w.listId = ? AND w.deletedAt IS NULL
    ORDER BY l.date DESC, l.createdAt DESC, w.term ASC
    LIMIT 1`;

// ── 완주 기록(022 completions) ─────────────────────────────────────────────
//
// ⚠️ 아래 SQL 은 022 마이그레이션의 백필과 모양이 같지만 **일부러 나눠 둔다.**
// 마이그레이션은 «그때 실행된 것»이라 손대면 안 되는 역사이고, 이쪽은 앞으로 바뀔 수 있는
// 현재 규칙이다. 한 상수를 둘이 나눠 쓰면 규칙을 고치는 순간 과거까지 뜻이 달라진다.

/** 완주 판정 — `computePlanStatus` 의 'completed' 와 같은 조건을 SQL 로 옮긴 것. */
const COMPLETED_WHERE = `l.deletedAt IS NULL
        AND l.planStartedAt IS NOT NULL
        AND l.planUpdatedAt IS NOT NULL
        AND l.planTotalDays > 0
        AND l.planCurrentDay > l.planTotalDays`;

/** 완주 순간의 스냅숏. 나중에 단어를 더 넣어도 지난 상장이 거짓말하지 않게 «그때» 값을 굳힌다. */
const COMPLETION_SNAPSHOT = `l.id,
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
          LIMIT 1)`;

const COMPLETION_COLUMNS =
  `(listId, startedAt, completedAt, title, totalWords, studyDays, lastTerm)`;

/**
 * 단어장 하나가 지금 완주 상태면 기록한다. PK 가 (listId, startedAt) 이라 같은 계획을
 * 여러 번 넣어도 줄은 하나다 — 완주 뒤 더 학습해 planUpdatedAt 이 움직여도 늘지 않는다.
 */
export const COMPLETION_RECORD_SQL =
  `INSERT OR IGNORE INTO completions ${COMPLETION_COLUMNS}
     SELECT ${COMPLETION_SNAPSHOT}
       FROM lists l
      WHERE l.id = ? AND ${COMPLETED_WHERE}`;

/**
 * 지금 완주 상태인 단어장 전부를 훑어 빠진 줄을 채운다. 앱 시작마다 돌려도 되는 값이다.
 * 새 기기에서 클라우드로 단어장을 받아 온 경우가 이 경로다 — 022 백필은 그 전에 이미 돌았다.
 */
export const COMPLETION_BACKFILL_SQL =
  `INSERT OR IGNORE INTO completions ${COMPLETION_COLUMNS}
     SELECT ${COMPLETION_SNAPSHOT}
       FROM lists l
      WHERE ${COMPLETED_WHERE}`;

/**
 * 완주 기록 목록(최신순). 제목은 «살아 있는 단어장의 것»이 우선이다 — 이름을 바꿔도 같은
 * 단어장이기 때문이고, 단어장을 지운 뒤에는 기록에 굳혀 둔 이름으로 떨어진다.
 */
export const COMPLETION_LIST_SQL =
  `SELECT c.listId, c.startedAt, c.completedAt, c.totalWords, c.studyDays, c.lastTerm,
          COALESCE(l.title, c.title) AS title,
          (l.id IS NOT NULL) AS listAlive
     FROM completions c
     LEFT JOIN lists l ON l.id = c.listId AND l.deletedAt IS NULL
    ORDER BY c.completedAt DESC`;

/**
 * 지금 걸려 있는 계획의 완주 기록. 학습결과 시트의 상장이 이걸 쓴다.
 *
 * 🔴 살아 있는 단어 수로 상장을 그리면 «거짓말»이 된다: 완주한 뒤 단어를 5개 더 넣어도
 * `computePlanStatus` 는 계속 'completed' 라(planCurrentDay 가 이미 넘어가 있다) 시트가 열리는데,
 * 그때 카드는 "위 단어장의 단어 15개를 모두 외웠기에"라고 쓴다 — 10개만 외운 상태에서.
 * 완주는 «그때»의 사건이므로 그때 굳힌 값으로 그린다.
 */
export const COMPLETION_FOR_PLAN_SQL =
  `SELECT totalWords, studyDays, lastTerm, completedAt
     FROM completions WHERE listId = ? AND startedAt = ?`;

/** 내 학습의 진입 줄이 쓰는 한 줄 요약 — 「N권 · N단어」. */
export const COMPLETION_SUMMARY_SQL =
  `SELECT COUNT(*) as books,
          COALESCE(SUM(totalWords), 0) as words,
          COALESCE(SUM(studyDays), 0) as days
     FROM completions`;
