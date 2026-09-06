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
    ORDER BY l.date DESC, l.createdAt DESC
    LIMIT 1`;
