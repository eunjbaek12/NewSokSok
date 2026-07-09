import { computeStreak, computeLongestStreak, sumStudied, sumMemorized, type StudyDay } from '../features/stats/streak';
import {
  toLocalDateStr,
  todayStr,
  dateStrToEpochDay,
  epochDayToDateStr,
  addDaysStr,
  startOfWeekStr,
  monthPrefix,
  addMonths,
  monthGridDates,
  weekdayIndexMon0,
} from '../features/stats/date';
import { pickDailyQuote, getQuotes } from '../features/stats/quotes';

const day = (date: string, studiedCount = 1, memorizedCount = 0): StudyDay => ({ date, studiedCount, memorizedCount });

// ─── date utils ────────────────────────────────────────────────────────────

describe('date utils', () => {
  test('toLocalDateStr → zero-padded YYYY-MM-DD', () => {
    expect(toLocalDateStr(new Date(2026, 0, 5))).toBe('2026-01-05'); // Jan=0
    expect(toLocalDateStr(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  test('dateStrToEpochDay: 인접한 날짜는 정확히 1 차이', () => {
    expect(dateStrToEpochDay('2026-03-02') - dateStrToEpochDay('2026-03-01')).toBe(1);
  });

  test('월 경계도 1 차이', () => {
    expect(dateStrToEpochDay('2026-02-01') - dateStrToEpochDay('2026-01-31')).toBe(1);
  });

  test('epochDayToDateStr는 dateStrToEpochDay의 역함수', () => {
    for (const s of ['2026-01-01', '2026-07-08', '2025-12-31', '2024-02-29']) {
      expect(epochDayToDateStr(dateStrToEpochDay(s))).toBe(s);
    }
  });

  test('addDaysStr는 경계를 넘어 정확히 이동', () => {
    expect(addDaysStr('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysStr('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysStr('2026-07-08', 0)).toBe('2026-07-08');
  });

  test('startOfWeekStr: 월요일 시작', () => {
    // 2026-07-08은 수요일 → 그 주 월요일 2026-07-06
    expect(startOfWeekStr(new Date(2026, 6, 8))).toBe('2026-07-06');
    // 월요일이면 그대로
    expect(startOfWeekStr(new Date(2026, 6, 6))).toBe('2026-07-06');
    // 일요일이면 직전 월요일
    expect(startOfWeekStr(new Date(2026, 6, 12))).toBe('2026-07-06');
  });

  test('monthPrefix → YYYY-MM', () => {
    expect(monthPrefix(new Date(2026, 6, 8))).toBe('2026-07');
  });

  test('todayStr는 기본값으로 오늘을 반환(크래시 없음)', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── computeStreak ───────────────────────────────────────────────────────────

describe('computeStreak', () => {
  test('빈 목록 → 0', () => {
    expect(computeStreak([], '2026-07-08')).toBe(0);
  });

  test('오늘 포함 연속 3일 → 3', () => {
    const days = [day('2026-07-06'), day('2026-07-07'), day('2026-07-08')];
    expect(computeStreak(days, '2026-07-08')).toBe(3);
  });

  test('오늘 학습 없어도 어제까지 이어졌으면 유지', () => {
    const days = [day('2026-07-06'), day('2026-07-07')];
    expect(computeStreak(days, '2026-07-08')).toBe(2);
  });

  test('오늘도 어제도 없으면(이틀 공백) 0으로 끊김', () => {
    const days = [day('2026-07-05'), day('2026-07-06')];
    expect(computeStreak(days, '2026-07-08')).toBe(0);
  });

  test('중간에 하루 비면 오늘 쪽 연속만 카운트', () => {
    const days = [day('2026-07-04'), day('2026-07-06'), day('2026-07-07'), day('2026-07-08')];
    expect(computeStreak(days, '2026-07-08')).toBe(3);
  });

  test('오늘만 학습 → 1', () => {
    expect(computeStreak([day('2026-07-08')], '2026-07-08')).toBe(1);
  });

  test('중복 날짜는 하루로 취급', () => {
    const days = [day('2026-07-08'), day('2026-07-08'), day('2026-07-07')];
    expect(computeStreak(days, '2026-07-08')).toBe(2);
  });

  test('월 경계를 넘는 연속', () => {
    const days = [day('2026-01-31'), day('2026-02-01'), day('2026-02-02')];
    expect(computeStreak(days, '2026-02-02')).toBe(3);
  });
});

// ─── computeLongestStreak ──────────────────────────────────────────────────

describe('computeLongestStreak', () => {
  test('빈 목록 → 0', () => {
    expect(computeLongestStreak([])).toBe(0);
  });

  test('여러 구간 중 가장 긴 구간 반환', () => {
    const days = [
      day('2026-07-01'), day('2026-07-02'),               // 2
      day('2026-07-05'), day('2026-07-06'), day('2026-07-07'), day('2026-07-08'), // 4
      day('2026-07-20'),                                    // 1
    ];
    expect(computeLongestStreak(days)).toBe(4);
  });

  test('단일 날짜 → 1', () => {
    expect(computeLongestStreak([day('2026-07-08')])).toBe(1);
  });

  test('전부 연속이면 전체 길이', () => {
    const days = [day('2026-07-06'), day('2026-07-07'), day('2026-07-08')];
    expect(computeLongestStreak(days)).toBe(3);
  });
});

// ─── sumStudied ──────────────────────────────────────────────────────────────

describe('sumStudied', () => {
  const days = [day('2026-07-06', 10), day('2026-07-07', 5), day('2026-06-30', 8)];

  test('주간 필터(>= weekStart) 합', () => {
    expect(sumStudied(days, d => d >= '2026-07-06')).toBe(15);
  });

  test('월간 필터(startsWith) 합', () => {
    expect(sumStudied(days, d => d.startsWith('2026-07'))).toBe(15);
    expect(sumStudied(days, d => d.startsWith('2026-06'))).toBe(8);
  });

  test('빈 목록 → 0', () => {
    expect(sumStudied([], () => true)).toBe(0);
  });
});

// ─── sumMemorized ────────────────────────────────────────────────────────────

describe('sumMemorized', () => {
  const days = [day('2026-07-06', 10, 3), day('2026-07-07', 5, 2), day('2026-06-30', 8, 7)];

  test('주간 필터(>= weekStart) 합', () => {
    expect(sumMemorized(days, d => d >= '2026-07-06')).toBe(5);
  });

  test('단일 날짜 필터 → 그날 외운 수', () => {
    expect(sumMemorized(days, d => d === '2026-07-07')).toBe(2);
  });

  test('빈 목록 → 0', () => {
    expect(sumMemorized([], () => true)).toBe(0);
  });
});

// ─── addMonths ───────────────────────────────────────────────────────────────

describe('addMonths', () => {
  test('같은 해 안에서 이동', () => {
    expect(addMonths('2026-07', -1)).toBe('2026-06');
    expect(addMonths('2026-07', 1)).toBe('2026-08');
  });

  test('연 경계를 넘는 이동', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-07', -12)).toBe('2025-07');
  });

  test('delta 0 → 그대로', () => {
    expect(addMonths('2026-07', 0)).toBe('2026-07');
  });
});

// ─── monthGridDates ──────────────────────────────────────────────────────────

describe('monthGridDates', () => {
  test('2026-07: 1일은 수요일 → 앞 패딩 2칸(월·화), 31일', () => {
    const grid = monthGridDates('2026-07');
    expect(grid[0]).toBeNull();
    expect(grid[1]).toBeNull();
    expect(grid[2]).toBe('2026-07-01');
    expect(grid.filter(Boolean)).toHaveLength(31);
    expect(grid[2 + 30]).toBe('2026-07-31');
  });

  test('길이는 항상 7의 배수', () => {
    for (const m of ['2026-07', '2026-02', '2024-02', '2026-11']) {
      expect(monthGridDates(m).length % 7).toBe(0);
    }
  });

  test('요일 열 정렬: 날짜의 셀 인덱스 % 7 == 월요일 기준 요일 인덱스', () => {
    const grid = monthGridDates('2026-07');
    // 2026-07-06은 월요일 → 인덱스 % 7 == 0
    expect(grid.indexOf('2026-07-06') % 7).toBe(0);
    // 2026-07-08은 수요일 → 인덱스 % 7 == 2
    expect(grid.indexOf('2026-07-08') % 7).toBe(2);
    // 2026-07-12는 일요일 → 인덱스 % 7 == 6
    expect(grid.indexOf('2026-07-12') % 7).toBe(6);
  });

  test('윤년 2월(2024-02): 29일', () => {
    expect(monthGridDates('2024-02').filter(Boolean)).toHaveLength(29);
  });

  test('평년 2월(2026-02): 28일', () => {
    expect(monthGridDates('2026-02').filter(Boolean)).toHaveLength(28);
  });

  test('월요일로 시작하는 달은 앞 패딩 없음', () => {
    // 2026-06-01은 월요일
    expect(monthGridDates('2026-06')[0]).toBe('2026-06-01');
  });
});

// ─── weekdayIndexMon0 ────────────────────────────────────────────────────────

describe('weekdayIndexMon0', () => {
  test('월=0 … 일=6', () => {
    expect(weekdayIndexMon0('2026-07-06')).toBe(0); // 월
    expect(weekdayIndexMon0('2026-07-08')).toBe(2); // 수
    expect(weekdayIndexMon0('2026-07-11')).toBe(5); // 토
    expect(weekdayIndexMon0('2026-07-12')).toBe(6); // 일
  });

  test('epoch day 0(1970-01-01)은 목요일 → 3', () => {
    expect(weekdayIndexMon0('1970-01-01')).toBe(3);
  });
});

// ─── quotes ──────────────────────────────────────────────────────────────────

describe('pickDailyQuote', () => {
  test('같은 날짜·언어면 항상 같은 명언', () => {
    expect(pickDailyQuote('2026-07-08', 'ko')).toEqual(pickDailyQuote('2026-07-08', 'ko'));
  });

  test('다음 날은 다른(순환된) 명언 — 목록 크기보다 작은 범위에선 인덱스가 1 증가', () => {
    const a = pickDailyQuote('2026-07-08', 'ko');
    const b = pickDailyQuote('2026-07-09', 'ko');
    expect(a).not.toEqual(b);
  });

  test('언어에 맞는 목록에서 선택', () => {
    const ko = getQuotes('ko');
    const en = getQuotes('en');
    expect(ko).toContainEqual(pickDailyQuote('2026-07-08', 'ko'));
    expect(en).toContainEqual(pickDailyQuote('2026-07-08', 'en'));
  });

  test('ko-KR 같은 지역 태그도 한국어로 인식', () => {
    expect(getQuotes('ko-KR')).toBe(getQuotes('ko'));
  });

  test('명언 목록은 비어있지 않음', () => {
    expect(getQuotes('ko').length).toBeGreaterThan(0);
    expect(getQuotes('en').length).toBeGreaterThan(0);
  });

  test('항상 유효한 명언 반환(1년치 순회, 크래시 없음)', () => {
    let cur = '2026-01-01';
    for (let i = 0; i < 365; i++) {
      const q = pickDailyQuote(cur, i % 2 ? 'ko' : 'en');
      expect(typeof q.text).toBe('string');
      expect(q.text.length).toBeGreaterThan(0);
      cur = addDaysStr(cur, 1);
    }
  });
});
