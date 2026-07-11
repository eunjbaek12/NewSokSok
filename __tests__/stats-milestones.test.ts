import {
  STREAK_MILESTONES,
  pickMilestone,
  markCelebrated,
  runStartDate,
  type CelebratedMap,
} from '../features/stats/milestones';

const TODAY = '2026-07-12';

describe('runStartDate', () => {
  it('스트릭 길이만큼 거슬러 올라간 시작일', () => {
    expect(runStartDate(1, TODAY)).toBe('2026-07-12');
    expect(runStartDate(3, TODAY)).toBe('2026-07-10');
    expect(runStartDate(7, TODAY)).toBe('2026-07-06');
  });

  it('월·연 경계를 넘어도 정확 (epoch day 산술)', () => {
    expect(runStartDate(12, TODAY)).toBe('2026-07-01');
    expect(runStartDate(365, '2026-12-31')).toBe('2026-01-01');
  });
});

describe('pickMilestone', () => {
  it('첫 마일스톤(3) 미만은 null', () => {
    expect(pickMilestone(0, {}, TODAY)).toBeNull();
    expect(pickMilestone(2, {}, TODAY)).toBeNull();
  });

  it('정확히 도달한 날 해당 마일스톤 반환', () => {
    expect(pickMilestone(3, {}, TODAY)).toBe(3);
    expect(pickMilestone(7, {}, TODAY)).toBe(7);
    expect(pickMilestone(365, {}, TODAY)).toBe(365);
  });

  it('도달한 것 중 최고 하나만 — 동기화 점프·소급 축하 공용 규칙', () => {
    expect(pickMilestone(9, {}, TODAY)).toBe(7);
    expect(pickMilestone(35, {}, TODAY)).toBe(30);
    expect(pickMilestone(400, {}, TODAY)).toBe(365);
  });

  it('같은 런에서 이미 축하한 마일스톤은 반복하지 않는다', () => {
    const celebrated = markCelebrated({}, 7, TODAY);
    expect(pickMilestone(7, celebrated, TODAY)).toBeNull();
    // 다음날(스트릭 8) — 런 시작일이 같으므로 여전히 null.
    expect(pickMilestone(8, celebrated, '2026-07-13')).toBeNull();
  });

  it('같은 런에서 다음 마일스톤 도달 시엔 다시 축하', () => {
    const celebrated = markCelebrated({}, 7, TODAY);
    // 23일 뒤 스트릭 30 (런 시작일 동일 2026-07-06).
    expect(pickMilestone(30, celebrated, '2026-08-04')).toBe(30);
  });

  it('스트릭이 끊겼다 재도달하면 새 런으로 재축하', () => {
    const celebrated = markCelebrated({}, 3, TODAY); // 런 시작 7/10
    // 끊긴 뒤 새 런(시작 8/01)에서 다시 3일 도달.
    expect(pickMilestone(3, celebrated, '2026-08-03')).toBe(3);
  });

  it('상위 축하 후 하위 마일스톤이 역행해 뜨지 않는다 (전체 마킹 덕분)', () => {
    // 스트릭 35에서 30 축하 — 3·7·30 전부 마킹됨.
    const celebrated = markCelebrated({}, 35, TODAY);
    expect(pickMilestone(36, celebrated, '2026-07-13')).toBeNull();
    expect(pickMilestone(40, celebrated, '2026-07-17')).toBeNull();
  });
});

describe('markCelebrated', () => {
  it('도달한 모든 마일스톤을 현재 런 시작일로 마킹', () => {
    const map = markCelebrated({}, 35, TODAY);
    const runStart = runStartDate(35, TODAY);
    expect(map['3']).toBe(runStart);
    expect(map['7']).toBe(runStart);
    expect(map['30']).toBe(runStart);
    expect(map['100']).toBeUndefined();
    expect(map['365']).toBeUndefined();
  });

  it('기존 맵을 변경하지 않고 새 맵 반환 (불변)', () => {
    const before: CelebratedMap = { '3': '2026-01-01' };
    const after = markCelebrated(before, 7, TODAY);
    expect(before).toEqual({ '3': '2026-01-01' });
    expect(after['3']).toBe(runStartDate(7, TODAY));
  });

  it('이전 런 기록은 덮어쓴다 — 새 런 재축하의 근거', () => {
    const old = markCelebrated({}, 3, '2026-01-03'); // 런 시작 1/01
    const renewed = markCelebrated(old, 3, TODAY); // 런 시작 7/10
    expect(renewed['3']).toBe('2026-07-10');
  });
});

describe('STREAK_MILESTONES', () => {
  it('오름차순 — pickMilestone의 역순 순회 전제', () => {
    for (let i = 1; i < STREAK_MILESTONES.length; i++) {
      expect(STREAK_MILESTONES[i]).toBeGreaterThan(STREAK_MILESTONES[i - 1]);
    }
  });
});
