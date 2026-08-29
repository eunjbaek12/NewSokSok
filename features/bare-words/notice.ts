/**
 * "뜻만 있는 단어 N개" 배너를 언제 다시 보여줄지 정하는 규칙 — 순수 함수.
 * 저장은 notice-store.ts, 화면은 BareWordsBanner.
 *
 * features/whats-new/use-whats-new.ts 가 "이 버전 소식은 봤다"를 저장하듯,
 * **닫을 때의 개수**를 저장해 그 수가 늘 때만 다시 부른다. 상시 배너는 무시당하고,
 * 영영 사라지는 배너는 174개를 잊게 만든다.
 *
 * 🔑 닫는 이유가 둘이라 문도 둘이다:
 *   ✕            — 관심이 없다.       개수가 늘 때까지 안 부른다.
 *   "내일 이어서" — 오늘 한도가 끝났다. 내일 한 번 더 부른다(단어가 안 늘어도).
 */

/** 단어장 하나의 배너 표시 상태. 기기별 표시 상태라 동기화하지 않는다. */
export interface BareNoticeEntry {
  /** 마지막으로 닫았을 때의 반쪽 개수. */
  count: number;
  /** 'YYYY-MM-DD'. 이 날짜가 되면 개수와 무관하게 한 번 뜬다. */
  snoozeUntil?: string;
}

export type BareNoticeMap = Record<string, BareNoticeEntry>;

/**
 * 지금 배너를 띄울 것인가.
 *
 * 대상이 0이면 무조건 안 띄운다 — 채울 것이 없는데 부를 이유가 없다.
 * 저장값이 없으면(처음) 띄운다.
 */
export function shouldShowBanner(
  entry: BareNoticeEntry | undefined,
  currentCount: number,
  today: string,
): boolean {
  if (currentCount <= 0) return false;
  if (!entry) return true;
  if (entry.snoozeUntil && today >= entry.snoozeUntil) return true;
  return currentCount > entry.count;
}

/**
 * 🔴 **이 한 줄이 규칙의 전부다.** 화면을 열 때마다 저장값을 현재값까지 낮춘다.
 *
 * 없으면: 174에서 닫고 → 채우고 → 다시 174가 돼도 `174 > 174`가 거짓이라
 * 배너가 **영영 돌아오지 않는다.** 그리고 이 회귀는 화면으로 안 보인다 —
 * 며칠 뒤 "왜 안 뜨지"가 될 뿐이다.
 *
 * 바꿀 것이 없으면 같은 객체를 그대로 돌려준다(저장 호출을 아끼려고).
 */
export function reconcileCount(
  entry: BareNoticeEntry | undefined,
  currentCount: number,
): BareNoticeEntry | undefined {
  if (!entry) return undefined;
  if (entry.count <= currentCount) return entry;
  return { ...entry, count: currentCount };
}

/** ✕ 를 눌렀다 — 지금 개수를 기억하고 스누즈 약속은 지운다(개수 규칙으로 복귀). */
export function afterDismiss(currentCount: number): BareNoticeEntry {
  return { count: currentCount };
}

/**
 * "내일 이어서"를 눌렀다 — 개수는 기억하되 내일 한 번 더 부른다.
 * 🔴 알림이 아니다. 내일 이 단어장에 **들어왔을 때** 배너가 뜰 뿐이다.
 */
export function afterSnooze(currentCount: number, tomorrow: string): BareNoticeEntry {
  return { count: currentCount, snoozeUntil: tomorrow };
}

/**
 * 스누즈로 뜬 배너를 실제로 보여준 뒤 그 약속을 소비한다.
 *
 * 🔑 소비하지 않으면 snoozeUntil 이 과거로 남아 **매번** 뜬다 — "내일 한 번"이
 * "그날부터 영영"이 된다. 스누즈는 저절로 반복되지 않는다: 다시 미루려면
 * 사용자가 "내일 이어서"를 또 눌러야 한다.
 */
export function consumeSnooze(entry: BareNoticeEntry | undefined): BareNoticeEntry | undefined {
  if (!entry?.snoozeUntil) return entry;
  const { snoozeUntil: _dropped, ...rest } = entry;
  return rest;
}
