/**
 * 기기 로컬 시간대 기준 날짜 유틸. 스트릭·통계의 "하루" 경계는 기기 자정.
 *
 * 날짜는 'YYYY-MM-DD' 문자열로 다룬다(사전식 비교가 곧 시간순 비교라 범위 필터가 단순).
 * 연속성(스트릭) 계산에는 각 날짜를 "epoch day"(UTC 자정 기준 일 수)로 환산해
 * 인접 여부를 정수 ±1로 판정한다 — DST/서머타임 영향 없음.
 */

/** Date → 'YYYY-MM-DD' (기기 로컬). */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 오늘 (기기 로컬) 'YYYY-MM-DD'. */
export function todayStr(now: Date = new Date()): string {
  return toLocalDateStr(now);
}

/** 'YYYY-MM-DD' → epoch day(정수). 인접한 두 날짜는 정확히 1 차이. */
export function dateStrToEpochDay(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/** epoch day(정수) → 'YYYY-MM-DD'. */
export function epochDayToDateStr(n: number): string {
  const d = new Date(n * 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 날짜 문자열에 n일을 더한 날짜 문자열. */
export function addDaysStr(dateStr: string, n: number): string {
  return epochDayToDateStr(dateStrToEpochDay(dateStr) + n);
}

/** 이번 주 월요일 (기기 로컬) 'YYYY-MM-DD'. 주 시작 = 월요일. */
export function startOfWeekStr(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - dow);
  return toLocalDateStr(d);
}

/** 이번 달 접두사 'YYYY-MM'. `date.startsWith(prefix)`로 월간 필터. */
export function monthPrefix(now: Date = new Date()): string {
  return toLocalDateStr(now).slice(0, 7);
}

/** 'YYYY-MM' 접두사에 delta개월을 더한 접두사. 연 경계를 넘어도 정확. */
export function addMonths(prefix: string, delta: number): string {
  const [y, m] = prefix.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/**
 * 월 달력 그리드(월요일 시작). 앞뒤 패딩 칸은 null, 나머지는 'YYYY-MM-DD'.
 * 길이는 항상 7의 배수 — 7개씩 끊으면 주 단위 행이 된다.
 */
export function monthGridDates(prefix: string): (string | null)[] {
  const [y, m] = prefix.split('-').map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${prefix}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** 'YYYY-MM-DD'의 요일 인덱스(월=0 … 일=6). epoch day 0(1970-01-01)은 목요일. */
export function weekdayIndexMon0(dateStr: string): number {
  return (dateStrToEpochDay(dateStr) + 3) % 7;
}
