import { STREAK_MILESTONES, pickMilestone } from '../features/stats/milestones';

describe('pickMilestone (평생 최고 기록 갱신 시에만 축하)', () => {
  it('첫 마일스톤(3) 미만은 null', () => {
    expect(pickMilestone(0, 0)).toBeNull();
    expect(pickMilestone(2, 0)).toBeNull();
  });

  it('정확히 도달한 날 해당 마일스톤 반환', () => {
    expect(pickMilestone(3, 0)).toBe(3);
    expect(pickMilestone(7, 0)).toBe(7);
    expect(pickMilestone(365, 0)).toBe(365);
  });

  it('도달한 것 중 최고 하나만 — 중도 이탈 소급·동기화 점프 공용 규칙', () => {
    expect(pickMilestone(9, 0)).toBe(7);
    expect(pickMilestone(40, 0)).toBe(30);
    expect(pickMilestone(400, 0)).toBe(365);
  });

  it('평생 최고와 같은 단계 재도달은 null — 같은 런 다음날도 동일', () => {
    expect(pickMilestone(7, 7)).toBeNull();
    expect(pickMilestone(8, 7)).toBeNull();
  });

  it('스트릭이 끊겼다 재도달해도 이미 받은 단계는 반복 없음 (핵심 결정)', () => {
    // 예전 런에서 20일(3·7 축하 완료, max=7) → 끊김 → 새 런.
    expect(pickMilestone(3, 7)).toBeNull();
    expect(pickMilestone(7, 7)).toBeNull();
    // 평생 처음 넘는 고지(30)에서만 다시 축하.
    expect(pickMilestone(30, 7)).toBe(30);
  });

  it('같은 런에서 다음 단계 도달 시엔 축하 (max를 넘어서므로)', () => {
    expect(pickMilestone(30, 7)).toBe(30);
    expect(pickMilestone(100, 30)).toBe(100);
  });

  it('상위 축하 후 하위 단계는 어떤 경로로도 다시 뜨지 않는다', () => {
    // max=30인 사용자: 새 런 3·7일, 소급 점프 어느 쪽도 null.
    expect(pickMilestone(3, 30)).toBeNull();
    expect(pickMilestone(9, 30)).toBeNull();
    expect(pickMilestone(35, 30)).toBeNull();
  });

  it('여러 단계를 한 번에 건너뛰어도 팝업은 최고 1개 — 다음 완주에도 안 몰림', () => {
    // 40일째 첫 완주: 3·7 건너뛰고 30 하나만.
    const first = pickMilestone(40, 0);
    expect(first).toBe(30);
    // 30을 마킹한 다음 완주(41일째): 아무것도 안 뜸.
    expect(pickMilestone(41, first!)).toBeNull();
  });
});

describe('STREAK_MILESTONES', () => {
  it('오름차순 — pickMilestone의 역순 순회 전제', () => {
    for (let i = 1; i < STREAK_MILESTONES.length; i++) {
      expect(STREAK_MILESTONES[i]).toBeGreaterThan(STREAK_MILESTONES[i - 1]);
    }
  });
});
