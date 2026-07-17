import {
  REVIEW_INTERVAL_DAYS,
  REVIEW_DAILY_CAP,
  REVIEW_GRADUATE_AT,
  reviewIntervalDays,
  isReviewRetired,
  isWordDue,
  selectDueWords,
  selectReviewWords,
  countReviewWords,
} from '../features/study/review/engine';
import type { Word, VocaList } from '../lib/types';

// 로컬 자정 기준 시각. due는 날짜 단위라 시각(hour)이 판정을 바꾸면 안 된다.
const at = (y: number, m: number, d: number, hour = 12): number =>
  new Date(y, m - 1, d, hour).getTime();

const word = (over: Partial<Word> = {}): Word => ({
  id: 'w1',
  term: 'apple',
  definition: '',
  exampleEn: '',
  meaningKr: '사과',
  isMemorized: true,
  isStarred: false,
  tags: [],
  wrongCount: 0,
  lastReviewedAt: at(2026, 7, 1),
  reviewSuccessCount: 1,
  ...over,
});

const list = (words: Word[], over: Partial<VocaList> = {}): VocaList => ({
  id: 'l1',
  title: '단어장',
  words,
  isVisible: true,
  createdAt: 0,
  ...over,
});

// ─── 간격 사다리 (§4.2) ─────────────────────────────────────────────────────

describe('reviewIntervalDays — 숨은 간격 사다리', () => {
  test('사다리는 3 → 10 → 30 → 90 → 180 → 365일', () => {
    expect(REVIEW_INTERVAL_DAYS).toEqual([3, 10, 30, 90, 180, 365]);
  });

  test('처음 외운 단어(1회 성공)의 첫 간격은 3일', () => {
    expect(reviewIntervalDays(1)).toBe(3);
  });

  test('성공이 쌓이면 한 칸씩 느려진다', () => {
    expect(reviewIntervalDays(2)).toBe(10);
    expect(reviewIntervalDays(3)).toBe(30);
    expect(reviewIntervalDays(4)).toBe(90);
    expect(reviewIntervalDays(5)).toBe(180);
    expect(reviewIntervalDays(6)).toBe(365);
  });

  test('count=0(사다리 밖)도 첫 칸으로 안전하게 취급', () => {
    expect(reviewIntervalDays(0)).toBe(3);
  });

  test('마지막 칸이 365일이라 대용량 서재도 하루 상한 안에 들어온다', () => {
    // 정상 상태의 하루 발생량 ≈ 외운 단어 수 ÷ 마지막 칸. 90일이 끝이면 1,800개가 천장인데
    // 번들 큐레이션만 12,874단어라 실제로 닿았다.
    const lastRung = REVIEW_INTERVAL_DAYS[REVIEW_INTERVAL_DAYS.length - 1];
    expect(REVIEW_DAILY_CAP * lastRung).toBeGreaterThanOrEqual(7000);
  });
});

describe('isReviewRetired — 진짜 졸업(은퇴)', () => {
  test('마지막 칸까지 성공하면 은퇴 — 3·13·43·133·313·678일에 걸쳐 6번 맞힌 단어', () => {
    expect(REVIEW_GRADUATE_AT).toBe(REVIEW_INTERVAL_DAYS.length + 1);
    expect(isReviewRetired(6)).toBe(false); // 아직 365일 칸에 앉아 있음
    expect(isReviewRetired(7)).toBe(true);  // 그 365일 복습까지 성공 → 은퇴
  });

  test('은퇴한 단어는 아무리 오래 지나도 다시 뜨지 않는다', () => {
    const w = word({ reviewSuccessCount: REVIEW_GRADUATE_AT, lastReviewedAt: at(2020, 1, 1) });
    expect(isWordDue(w, at(2026, 7, 4))).toBe(false);
  });

  test('은퇴는 영구 추방이 아니다 — 카운트가 리셋되면 사다리 첫 칸으로 복귀', () => {
    // "다시 볼게요"가 reviewSuccessCount를 0으로 되돌린 뒤의 상태(§4.5).
    const w = word({ reviewSuccessCount: 0, lastReviewedAt: at(2026, 7, 1) });
    expect(isReviewRetired(0)).toBe(false);
    expect(isWordDue(w, at(2026, 7, 4))).toBe(true);
  });
});

// ─── due 판정 (§4.3) ────────────────────────────────────────────────────────

describe('isWordDue — 후보 선정', () => {
  test('외운 뒤 3일이 지나면 due', () => {
    const w = word({ lastReviewedAt: at(2026, 7, 1) });
    expect(isWordDue(w, at(2026, 7, 4))).toBe(true);
  });

  test('2일째는 아직 아니다 — 어제 외운 걸 오늘 묻지 않는다', () => {
    const w = word({ lastReviewedAt: at(2026, 7, 1) });
    expect(isWordDue(w, at(2026, 7, 2))).toBe(false);
    expect(isWordDue(w, at(2026, 7, 3))).toBe(false);
  });

  test('due는 날짜 단위 — 밤 11시에 외워도 3일째 아침이면 due', () => {
    const w = word({ lastReviewedAt: at(2026, 7, 1, 23) });
    // ms 기준이면 4일 09시는 아직 3×24h 미만이라 놓친다.
    expect(isWordDue(w, at(2026, 7, 4, 9))).toBe(true);
  });

  test('그날 하루 종일 due로 유지된다 — 저녁 알림이 놓치지 않게', () => {
    const w = word({ lastReviewedAt: at(2026, 7, 1, 23) });
    expect(isWordDue(w, at(2026, 7, 4, 0))).toBe(true);
    expect(isWordDue(w, at(2026, 7, 4, 20))).toBe(true);
  });

  test('미암기 단어는 복습 후보가 아니다 (D2)', () => {
    const w = word({ isMemorized: false, lastReviewedAt: at(2026, 1, 1) });
    expect(isWordDue(w, at(2026, 7, 4))).toBe(false);
  });

  test('lastReviewedAt이 null이면 due가 아니다 — 클라우드 복원 후 쏟아짐 방지', () => {
    const w = word({ lastReviewedAt: null });
    expect(isWordDue(w, at(2026, 7, 4))).toBe(false);
  });

  test('간격이 길어진 단어는 그만큼 더 기다린다', () => {
    const w = word({ lastReviewedAt: at(2026, 7, 1), reviewSuccessCount: 2 }); // 10일
    expect(isWordDue(w, at(2026, 7, 4))).toBe(false);
    expect(isWordDue(w, at(2026, 7, 11))).toBe(true);
  });

  test('오래 밀린 단어도 그냥 due일 뿐 — 결석은 처벌하지 않는다 (P2)', () => {
    const w = word({ lastReviewedAt: at(2026, 1, 1) });
    expect(isWordDue(w, at(2026, 7, 4))).toBe(true);
  });

  test('미래 시각(기기 시계 되돌림)은 due가 아니다', () => {
    const w = word({ lastReviewedAt: at(2026, 8, 1) });
    expect(isWordDue(w, at(2026, 7, 4))).toBe(false);
  });
});

// ─── 정렬·상한 (§4.3, §4.4) ─────────────────────────────────────────────────

describe('selectDueWords — 위험순 정렬과 상한', () => {
  const now = at(2026, 7, 20);

  test('제 간격을 많이 초과한 단어가 먼저', () => {
    // 둘 다 3일 간격: 19일 지남(6.3배) vs 10일 지남(3.3배).
    const worse = word({ id: 'worse', lastReviewedAt: at(2026, 7, 1) });
    const better = word({ id: 'better', lastReviewedAt: at(2026, 7, 10) });
    expect(selectDueWords([better, worse], now).map(w => w.id)).toEqual(['worse', 'better']);
  });

  test('베테랑이 새 단어를 밀어내지 않는다 — 정렬 기준은 경과일이 아니라 초과 배수', () => {
    // 베테랑: 90일 간격을 91일 지남 = 1.01배 (이제 막 예정일)
    const veteran = word({
      id: 'veteran', reviewSuccessCount: 4, lastReviewedAt: at(2026, 4, 20),
    });
    // 새 단어: 3일 간격을 10일 지남 = 3.3배 (잊기 직전)
    const fragile = word({ id: 'fragile', reviewSuccessCount: 1, lastReviewedAt: at(2026, 7, 10) });

    expect(isWordDue(veteran, now)).toBe(true);
    expect(isWordDue(fragile, now)).toBe(true);
    // 경과일로 줄 세우면 91일 > 10일이라 veteran이 이긴다 — 그게 고치려던 버그다.
    expect(selectDueWords([veteran, fragile], now).map(w => w.id)).toEqual(['fragile', 'veteran']);
  });

  test('하루 상한을 넘길 때 베테랑이 자리를 독차지하지 않는다', () => {
    // 이제 막 예정일이 된 90일짜리 베테랑 30개 + 3배 초과한 3일짜리 새 단어 5개.
    const veterans = Array.from({ length: 30 }, (_, i) =>
      word({ id: `vet${i}`, reviewSuccessCount: 4, lastReviewedAt: at(2026, 4, 20) }),
    );
    const fragile = Array.from({ length: 5 }, (_, i) =>
      word({ id: `frag${i}`, reviewSuccessCount: 1, lastReviewedAt: at(2026, 7, 10) }),
    );
    const picked = selectDueWords([...veterans, ...fragile], now).map(w => w.id);
    // 위태로운 5개가 전부 상한(20) 안에 들어와야 한다.
    for (const f of fragile) expect(picked).toContain(f.id);
  });

  test('초과 배수가 같으면 많이 틀린 단어가 먼저', () => {
    const a = word({ id: 'a', wrongCount: 1 });
    const b = word({ id: 'b', wrongCount: 5 });
    expect(selectDueWords([a, b], now).map(w => w.id)).toEqual(['b', 'a']);
  });

  test('오답까지 같으면 별표가 먼저', () => {
    const plain = word({ id: 'plain', isStarred: false });
    const starred = word({ id: 'starred', isStarred: true });
    expect(selectDueWords([plain, starred], now).map(w => w.id)).toEqual(['starred', 'plain']);
  });

  test('하루 상한 20개까지만 — 백로그 벽 금지 (P1)', () => {
    const many = Array.from({ length: 100 }, (_, i) =>
      word({ id: `w${String(i).padStart(3, '0')}`, lastReviewedAt: at(2026, 1, 1) }),
    );
    expect(selectDueWords(many, now)).toHaveLength(REVIEW_DAILY_CAP);
  });

  test('입력 배열을 건드리지 않는다', () => {
    const a = word({ id: 'a', lastReviewedAt: at(2026, 7, 10) });
    const b = word({ id: 'b', lastReviewedAt: at(2026, 7, 1) });
    const input = [a, b];
    selectDueWords(input, now);
    expect(input.map(w => w.id)).toEqual(['a', 'b']);
  });

  test('due가 없으면 빈 배열', () => {
    const w = word({ lastReviewedAt: at(2026, 7, 19) });
    expect(selectDueWords([w], now)).toEqual([]);
  });
});

// ─── 단어의 일생 (§4.6) ─────────────────────────────────────────────────────

describe('단어의 일생 — 매번 due에 맞히기만 하는 이상적 사용자', () => {
  const dayMs = (d: number) => new Date(2026, 0, 1 + d, 12).getTime();

  /** D0에 외운 단어를, due가 될 때마다 성공시키며 은퇴까지 돌린다. 복습한 날들을 반환. */
  function lifecycleDueDays(): number[] {
    let w: Word = word({ reviewSuccessCount: 1, lastReviewedAt: dayMs(0) });
    const days: number[] = [];
    for (let d = 1; d <= 1500; d++) {
      if (isReviewRetired(w.reviewSuccessCount ?? 0)) break;
      if (!isWordDue(w, dayMs(d))) continue;
      days.push(d);
      w = { ...w, reviewSuccessCount: (w.reviewSuccessCount ?? 0) + 1, lastReviewedAt: dayMs(d) };
    }
    return days;
  }

  test('3 → 13 → 43 → 133 → 313 → 678일에 만나고 그 뒤 은퇴한다', () => {
    expect(lifecycleDueDays()).toEqual([3, 13, 43, 133, 313, 678]);
  });

  test('은퇴까지 6번 맞히면 되고, 마지막 1년은 딱 한 번만 묻는다', () => {
    const days = lifecycleDueDays();
    expect(days).toHaveLength(REVIEW_GRADUATE_AT - 1);
    // 1년차(313일) 이후로는 678일 한 번뿐 — "3달마다 계속"이 아니다.
    expect(days.filter(d => d > 365)).toEqual([678]);
  });
});

// ─── 리스트 단위 진입점 (§5.2, §5.3) ────────────────────────────────────────

describe('selectReviewWords / countReviewWords — 홈 배너', () => {
  const now = at(2026, 7, 20);

  test('숨긴 단어장은 복습으로 다시 불러내지 않는다', () => {
    const hidden = list([word({ id: 'h' })], { id: 'l2', isVisible: false });
    const shown = list([word({ id: 's' })]);
    expect(selectReviewWords([hidden, shown], now).map(w => w.id)).toEqual(['s']);
  });

  test('여러 단어장을 가로질러 모은다', () => {
    const l1 = list([word({ id: 'a', lastReviewedAt: at(2026, 7, 5) })]);
    const l2 = list([word({ id: 'b', lastReviewedAt: at(2026, 7, 1) })], { id: 'l2' });
    expect(selectReviewWords([l1, l2], now).map(w => w.id)).toEqual(['b', 'a']);
  });

  test('배너 개수는 상한이 적용된 수 — 총량을 노출하지 않는다 (P1)', () => {
    const many = Array.from({ length: 543 }, (_, i) =>
      word({ id: `w${i}`, lastReviewedAt: at(2026, 1, 1) }),
    );
    expect(countReviewWords([list(many)], now)).toBe(REVIEW_DAILY_CAP);
  });

  test('복습할 게 없으면 0 — 홈은 배너를 아예 렌더하지 않는다 (§5.3)', () => {
    expect(countReviewWords([list([word({ lastReviewedAt: at(2026, 7, 19) })])], now)).toBe(0);
    expect(countReviewWords([], now)).toBe(0);
  });

  test('배너 개수와 세션 목록 길이는 항상 일치한다', () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      word({ id: `w${i}`, lastReviewedAt: at(2026, 1, 1) }),
    );
    const lists = [list(many)];
    expect(countReviewWords(lists, now)).toBe(selectReviewWords(lists, now).length);
  });
});
