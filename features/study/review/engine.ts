/**
 * Gentle SRS 엔진 — 오늘 복습할 단어를 고른다. 설계: docs/gentle-srs-design.md §4.
 *
 * 순수 모듈(SQLite·RN import 없음). 입력은 이미 조립된 `Word[]` / `VocaList[]` 스냅샷이고,
 * 홈 배너와 복습 세션이 같은 함수로 같은 목록을 얻는다 — 배너에 12개라 써놓고 세션에서
 * 다른 단어가 나오는 일이 없도록.
 *
 * 사용자에게는 간격·카운트·상한 중 무엇도 노출하지 않는다(P3). 이 파일이 그 기계 전부다.
 */
import type { Word, VocaList } from '@/lib/types';

/**
 * 숨은 간격 사다리(§4.2). "외웠어요"가 쌓일수록 재등장이 느려진다.
 *
 * 첫 간격이 3일인 이유: 어제 외웠다고 한 단어를 오늘 또 묻는 건 gentle 위반.
 *
 * 뒤의 180·365는 두 가지를 동시에 푼다:
 *  1. **지겨움** — 90일이 끝이면 이미 아는 단어(예: apple)가 영원히 3달마다 돌아온다.
 *  2. **영구 적체** — 정상 상태에서 하루에 새로 due가 되는 양 ≈ 외운 단어 수 ÷ 마지막 칸.
 *     90일이 끝이면 1,800개(= 20×90)를 넘는 순간 하루 상한을 영구히 초과해 줄이 안 줄어든다.
 *     번들 큐레이션만 12,874단어라 실제로 닿는 천장이었다. 365일이면 7,300개까지 감당한다.
 *     ⚠️ 상한(20)을 올리는 건 해법이 아니다 — 50으로 올려도 4,500개일 뿐이고 "하루 50개"라는
 *     벽이 생겨 P1을 정면으로 위반한다. 레버는 상한이 아니라 이 배열이다.
 */
export const REVIEW_INTERVAL_DAYS = [3, 10, 30, 90, 180, 365] as const;

/** 하루에 노출할 복습 상한(§4.4 P1). 며칠 빠져도 백로그 벽이 생기지 않게 하는 장치. */
export const REVIEW_DAILY_CAP = 20;

/**
 * 은퇴(진짜 졸업) 기준 — 마지막 칸(365일) 복습까지 성공하면 더는 묻지 않는다.
 *
 * 여기 닿으려면 3·13·43·133·313·678일에 걸쳐 **6번 연속** 맞혀야 한다(약 2년).
 * WaniKani가 4개월이면 "Burned"로 영구 제거하는 것에 비하면 한참 보수적이다.
 *
 * 은퇴는 되돌릴 수 있다: 나중에 그 단어를 일반 학습에서 "다시 볼게요"로 틀리면
 * 카운트가 0으로 리셋되어(§4.5) 사다리 첫 칸부터 다시 시작한다. 진짜로 잊었다면
 * 다시 잡아준다는 뜻 — 은퇴가 영구 추방이 아닌 이유.
 */
export const REVIEW_GRADUATE_AT = REVIEW_INTERVAL_DAYS.length + 1;

/**
 * 기기 로컬 시간대의 "epoch day"(자정 기준 일 수).
 *
 * due를 시각이 아니라 **날짜 단위**로 재는 이유: 3일 간격 단어를 밤 11시에 외웠다면
 * ms 기준으로는 3일 뒤 밤 11시에야 due가 되어, 저녁 8시 알림(§8.1)도 그날 낮의 학습도
 * 모두 그 단어를 놓친다. 날짜로 세면 due가 된 날 하루 종일 due다.
 *
 * (features/stats/date.ts의 toLocalDateStr → dateStrToEpochDay와 같은 환산이지만,
 *  cross-feature import는 barrel 경유만 허용되고 그 barrel은 RN 컴포넌트를 끌고 온다.
 *  순수 모듈로 남기려고 4줄을 따로 둔다.)
 */
function localEpochDay(ms: number): number {
  const d = new Date(ms);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

/** 이 단어가 은퇴했는가 — 사다리를 끝까지 오른 단어는 복습 후보에서 영구 제외. */
export function isReviewRetired(successCount: number): boolean {
  return successCount >= REVIEW_GRADUATE_AT;
}

/**
 * "외웠어요" 누적 횟수 → 현재 재등장 간격(일).
 *
 * 처음 외운 단어가 count=1이라 사다리 첫 칸(3일)에서 시작한다. 이후 **due였을 때**
 * 맞히면 한 칸씩 — Hard/Good/Easy 같은 차등 채점은 없다(§4.2 D4).
 *
 * count=0(사다리 밖)도 첫 칸으로 취급한다 — 마이그레이션이 놓친 행이 있어도 안전하게.
 */
export function reviewIntervalDays(successCount: number): number {
  const rung = Math.min(Math.max(successCount - 1, 0), REVIEW_INTERVAL_DAYS.length - 1);
  return REVIEW_INTERVAL_DAYS[rung];
}

/** 마지막으로 본 뒤 지난 날 수(로컬 날짜 기준). lastReviewedAt이 없으면 null. */
function elapsedDays(word: Word, now: number): number | null {
  if (word.lastReviewedAt == null) return null;
  return localEpochDay(now) - localEpochDay(word.lastReviewedAt);
}

/**
 * 이 단어가 오늘 복습 대상인가(§4.3).
 *
 * 후보 = 외운 단어(D2) 중 은퇴하지 않았고, 마지막으로 **본** 뒤 제 간격만큼 지난 것.
 * "외운 뒤"가 아니라 "본 뒤"인 게 핵심 — 그래야 복습한 단어가 due에서 빠진다.
 *
 * `lastReviewedAt = null`은 due가 아니다. 학습 이력이 없다는 뜻이지 "오래 됐다"는 뜻이
 * 아니고, due로 치면 클라우드 복원 직후(아직 이 컬럼을 동기화하지 않는다) 서재 전체가
 * 한꺼번에 due로 쏟아진다(P1 위반). SYNC 단계(§7)에서 컬럼이 실려 오면 사라지는 구멍.
 */
export function isWordDue(word: Word, now: number): boolean {
  if (!word.isMemorized) return false;
  const count = word.reviewSuccessCount ?? 0;
  if (isReviewRetired(count)) return false;
  const elapsed = elapsedDays(word, now);
  if (elapsed == null) return false;
  return elapsed >= reviewIntervalDays(count);
}

/**
 * 제 간격 대비 몇 배나 지났는가. 클수록 잊었을 가능성이 높다 = 위험하다.
 *
 * "며칠이나 안 봤나"(경과일)로 줄 세우면 안 된다: 365일짜리 베테랑은 정의상 *365일이나*
 * 안 본 단어라 항상 앞줄을 차지하고, 정작 3일짜리인데 10일 방치된 위태로운 단어를
 * 하루 상한(20) 밖으로 밀어낸다 — 위험순으로 보여주려던 의도와 정확히 반대가 된다.
 *
 * 뺄셈(초과 일수)이 아니라 나눗셈인 이유: 3일짜리가 6일 지난 것과 90일짜리가 180일
 * 지난 것은 잊은 정도가 비슷한데(둘 다 2배), 뺄셈이면 3일 초과 vs 90일 초과가 되어
 * 또 베테랑이 이긴다. 망각은 간격에 비례해 진행되므로 배수가 맞다.
 */
function overdueRatio(word: Word, now: number): number {
  const elapsed = elapsedDays(word, now) ?? 0;
  return elapsed / reviewIntervalDays(word.reviewSuccessCount ?? 0);
}

/**
 * due 단어를 위험순으로 정렬해 상한까지 자른다. 입력 배열은 건드리지 않는다.
 * `cap <= 0`이면 상한 없음(테스트·진단용).
 *
 * 배수를 미리 계산해 두고 정렬한다(decorate-sort-undecorate) — 비교 함수 안에서 재계산하면
 * 단어 수만큼 × log n번 Date를 만들게 된다(번들 큐레이션만 12,874단어).
 */
export function selectDueWords(words: Word[], now: number, cap: number = REVIEW_DAILY_CAP): Word[] {
  const due = words
    .filter(w => isWordDue(w, now))
    .map(w => ({ word: w, ratio: overdueRatio(w, now) }));

  due.sort((a, b) => {
    if (a.ratio !== b.ratio) return b.ratio - a.ratio;           // 많이 초과한 것 우선
    const aw = a.word.wrongCount ?? 0;
    const bw = b.word.wrongCount ?? 0;
    if (aw !== bw) return bw - aw;                                // 많이 틀린 것 우선
    if (a.word.isStarred !== b.word.isStarred) return a.word.isStarred ? -1 : 1;
    // 상한에 걸려 잘릴 때 순서가 흔들리지 않게 하는 안정적 tiebreak.
    return a.word.id < b.word.id ? -1 : a.word.id > b.word.id ? 1 : 0;
  });

  const picked = cap > 0 ? due.slice(0, cap) : due;
  return picked.map(d => d.word);
}

/**
 * 오늘의 복습 목록 — 홈 배너와 복습 세션의 단일 진입점.
 *
 * 숨긴 단어장은 제외한다. 숨김은 "지금 이 단어장은 안 볼래"라는 뜻이므로 복습으로
 * 다시 불러내면 안 된다. (홈의 맞춤·오답·별표 퀵액션도 같은 기준으로 모은다.)
 */
export function selectReviewWords(
  lists: VocaList[],
  now: number,
  cap: number = REVIEW_DAILY_CAP,
): Word[] {
  const visible = lists.filter(l => l.isVisible).flatMap(l => l.words);
  return selectDueWords(visible, now, cap);
}

/**
 * 홈 배너에 쓸 개수. 상한이 적용된 수라 "543개" 같은 총량은 절대 나오지 않는다(P1).
 * 0이면 배너를 아예 렌더하지 않는다(§5.3).
 */
export function countReviewWords(lists: VocaList[], now: number, cap: number = REVIEW_DAILY_CAP): number {
  return selectReviewWords(lists, now, cap).length;
}
