import {
  generatePlan,
  rechunkPlan,
  computePlanStatus,
  suggestWordsPerDay,
  computeCurrentDay,
  computeDayStudyStatus,
  groupWordsByDay,
} from '../features/study/plan/engine';
import type { Word, VocaList } from '../lib/types';

// ─── Factories ─────────────────────────────────────────────────────────���──────

function makeWord(overrides: Partial<Word> = {}): Word {
  return {
    id: Math.random().toString(36).slice(2),
    term: 'word',
    definition: 'def',
    exampleEn: '',
    meaningKr: '뜻',
    isMemorized: false,
    isStarred: false,
    tags: [],
    assignedDay: null,
    ...overrides,
  };
}

function makeWords(count: number, overrides: Partial<Word> = {}): Word[] {
  return Array.from({ length: count }, (_, i) =>
    makeWord({ id: `w${i + 1}`, ...overrides })
  );
}

const DAY = 86400000;
const NOW = new Date('2026-04-04T12:00:00').getTime();

function makeList(overrides: Partial<VocaList> = {}): VocaList {
  return {
    id: 'list1',
    title: '테스트 단어장',
    words: [],
    isVisible: true,
    createdAt: NOW - DAY * 10,
    ...overrides,
  };
}

// ─── generatePlan ─────────────────────────────────────────────────────────────

describe('generatePlan', () => {
  test('빈 단어 배열 → 빈 결과', () => {
    expect(generatePlan([], 10)).toEqual({ assignments: [], totalDays: 0 });
  });

  test('wordsPerDay 0 이하 → 빈 결과', () => {
    expect(generatePlan(makeWords(5), 0)).toEqual({ assignments: [], totalDays: 0 });
    expect(generatePlan(makeWords(5), -1)).toEqual({ assignments: [], totalDays: 0 });
  });

  test('30단어 15개/일 → 2일, 각 Day에 15개씩', () => {
    const words = makeWords(30);
    const { assignments, totalDays } = generatePlan(words, 15);
    expect(totalDays).toBe(2);
    const day1 = assignments.filter(a => a.day === 1);
    const day2 = assignments.filter(a => a.day === 2);
    expect(day1).toHaveLength(15);
    expect(day2).toHaveLength(15);
  });

  test('10단어 3개/일 → 4일 (올림)', () => {
    const { totalDays } = generatePlan(makeWords(10), 3);
    expect(totalDays).toBe(4);
  });

  test('단어 순서대로 Day 배정', () => {
    const words = makeWords(4);
    const { assignments } = generatePlan(words, 2);
    expect(assignments[0]).toEqual({ wordId: 'w1', day: 1 });
    expect(assignments[1]).toEqual({ wordId: 'w2', day: 1 });
    expect(assignments[2]).toEqual({ wordId: 'w3', day: 2 });
    expect(assignments[3]).toEqual({ wordId: 'w4', day: 2 });
  });

  test('단어 1개 → 1일', () => {
    const { totalDays, assignments } = generatePlan(makeWords(1), 10);
    expect(totalDays).toBe(1);
    expect(assignments[0].day).toBe(1);
  });
});

// ─── rechunkPlan ──────────────────────────────────────────────────────────────

describe('rechunkPlan', () => {
  test('미암기 단어만 재배정', () => {
    const words = [
      makeWord({ id: 'w1', isMemorized: true }),
      makeWord({ id: 'w2', isMemorized: false }),
      makeWord({ id: 'w3', isMemorized: false }),
      makeWord({ id: 'w4', isMemorized: true }),
    ];
    const { assignments, totalDays } = rechunkPlan(words, 2);
    expect(totalDays).toBe(1);
    expect(assignments.map(a => a.wordId)).toEqual(['w2', 'w3']);
  });

  test('모두 암기됨 → 빈 결과', () => {
    const words = makeWords(5, { isMemorized: true });
    expect(rechunkPlan(words, 3)).toEqual({ assignments: [], totalDays: 0 });
  });
});

// ─── computePlanStatus ────────────────────────────────────────────────────────

describe('computePlanStatus', () => {
  test('planStartedAt 없음 → none', () => {
    const list = makeList();
    expect(computePlanStatus(list, [], NOW)).toBe('none');
  });

  test('planTotalDays 없음 → none', () => {
    const list = makeList({ planStartedAt: NOW - DAY });
    expect(computePlanStatus(list, [], NOW)).toBe('none');
  });

  test('planCurrentDay > planTotalDays AND planUpdatedAt 있음 → completed', () => {
    const list = makeList({
      planStartedAt: NOW - DAY * 5,
      planTotalDays: 2,
      planCurrentDay: 3,
      planUpdatedAt: NOW - DAY,
    });
    expect(computePlanStatus(list, [], NOW)).toBe('completed');
  });

  test('planUpdatedAt 없이 planCurrentDay > planTotalDays → completed 아님', () => {
    const list = makeList({
      planStartedAt: NOW - DAY * 5,
      planTotalDays: 2,
      planCurrentDay: 3,
      planUpdatedAt: undefined,
    });
    // planUpdatedAt이 없으면 completed 조건 불충족 → overdue/inactive 중 하나
    const status = computePlanStatus(list, [], NOW);
    expect(status).not.toBe('completed');
  });

  test('종료일 초과 + 방치 → overdue', () => {
    const list = makeList({
      planStartedAt: NOW - DAY * 10,
      planTotalDays: 3, // 종료일 = NOW - 7일
      planCurrentDay: 1,
    });
    expect(computePlanStatus(list, [], NOW)).toBe('overdue');
  });

  test('종료일 초과여도 최근 학습 활동 있으면 → in-progress (직접 진입 경로 자동 복구)', () => {
    const list = makeList({
      planStartedAt: NOW - DAY * 10,
      planTotalDays: 3, // 종료일 = NOW - 7일 (이미 지남)
      planCurrentDay: 2,
      planUpdatedAt: NOW - 1000 * 60 * 30, // 30분 전에 학습
    });
    expect(computePlanStatus(list, [], NOW)).toBe('in-progress');
  });

  test('7일 이상 비활동 → inactive', () => {
    const list = makeList({
      planStartedAt: NOW - DAY * 30,
      planTotalDays: 60,
      planCurrentDay: 1,
      planUpdatedAt: NOW - DAY * 7,
    });
    expect(computePlanStatus(list, [], NOW)).toBe('inactive');
  });

  test('6일 비활동 → in-progress (7일 미만)', () => {
    const list = makeList({
      planStartedAt: NOW - DAY * 10,
      planTotalDays: 30,
      planCurrentDay: 2,
      planUpdatedAt: NOW - DAY * 6,
    });
    expect(computePlanStatus(list, [], NOW)).toBe('in-progress');
  });

  test('정상 진행 중 → in-progress', () => {
    const list = makeList({
      planStartedAt: NOW - DAY * 2,
      planTotalDays: 7,
      planCurrentDay: 2,
      planUpdatedAt: NOW - DAY,
    });
    expect(computePlanStatus(list, [], NOW)).toBe('in-progress');
  });
});

// ─── suggestWordsPerDay ───────────────────────────────────────────────────────

describe('suggestWordsPerDay', () => {
  test('0 단어 → 1 (최솟값)', () => {
    expect(suggestWordsPerDay(0)).toBe(1);
  });

  test('14단어 → 1', () => {
    expect(suggestWordsPerDay(14)).toBe(1);
  });

  test('28단어 → 2', () => {
    expect(suggestWordsPerDay(28)).toBe(2);
  });

  test('30단어 → 3 (올림)', () => {
    expect(suggestWordsPerDay(30)).toBe(3);
  });
});

// ─── computeCurrentDay ───────────────────────────────────────────────────────

describe('computeCurrentDay', () => {
  test('배정 단어 없음 → 1', () => {
    expect(computeCurrentDay(makeWords(5))).toBe(1);
  });

  test('Day1에 미암기 단어 있음 → 1', () => {
    const words = [
      makeWord({ assignedDay: 1, isMemorized: false }),
      makeWord({ assignedDay: 2, isMemorized: false }),
    ];
    expect(computeCurrentDay(words)).toBe(1);
  });

  test('Day1 모두 암기, Day2 미암기 → 2', () => {
    const words = [
      makeWord({ assignedDay: 1, isMemorized: true }),
      makeWord({ assignedDay: 2, isMemorized: false }),
    ];
    expect(computeCurrentDay(words)).toBe(2);
  });

  test('모든 Day 암기 완료 → 1 (복습을 위해 첫날로)', () => {
    const words = [
      makeWord({ assignedDay: 1, isMemorized: true }),
      makeWord({ assignedDay: 2, isMemorized: true }),
    ];
    expect(computeCurrentDay(words)).toBe(1);
  });
});

// ─── computeDayStudyStatus ───────────────────────────────────────────────────

describe('computeDayStudyStatus', () => {
  // 공통 설정
  const planStartedAt = NOW - DAY * 3;

  function makePlanList(overrides: Partial<VocaList> = {}): VocaList {
    return makeList({
      planStartedAt,
      planTotalDays: 2,
      planCurrentDay: 1,
      planUpdatedAt: undefined,
      ...overrides,
    });
  }

  // ── 신규 계획 (planCurrentDay=1, planUpdatedAt=null) ──────────────────────

  test('[신규계획] Day1 미암기 → Day1 needs-study', () => {
    const list = makePlanList();
    const words = [
      makeWord({ assignedDay: 1, isMemorized: false }),
      makeWord({ assignedDay: 2, isMemorized: false }),
    ];
    const result = computeDayStudyStatus(list, words, NOW);
    expect(result.displayDay).toBe(1);
    expect(result.state).toBe('needs-study');
  });

  test('[버그케이스] 신규계획인데 Day1이 자유학습으로 암기됨 → Day2가 아닌 Day1 표시', () => {
    // 이 케이스가 수정된 버그: cascade로 Day2가 표시되던 문제
    const list = makePlanList();
    const words = [
      makeWord({ assignedDay: 1, isMemorized: true }),
      makeWord({ assignedDay: 1, isMemorized: true }),
      makeWord({ assignedDay: 2, isMemorized: false }),
    ];
    const result = computeDayStudyStatus(list, words, NOW);
    expect(result.displayDay).toBe(1); // Day2가 아닌 Day1이어야 함
  });

  test('[신규계획] Day1 단어 일부가 자유학습으로 암기됨 → 여전히 needs-study (isMemorized 무시)', () => {
    // 신규 계획(planCurrentDay=1)은 isMemorized로 진척을 추론하지 않는다.
    // 자유학습으로 Day1 단어를 1/3 외운 상태여도 카드는 needs-study로 표시.
    const list = makePlanList();
    const words = [
      makeWord({ assignedDay: 1, isMemorized: true }),
      makeWord({ assignedDay: 1, isMemorized: false }),
      makeWord({ assignedDay: 1, isMemorized: false }),
      makeWord({ assignedDay: 2, isMemorized: false }),
    ];
    const result = computeDayStudyStatus(list, words, NOW);
    expect(result.displayDay).toBe(1);
    expect(result.state).toBe('needs-study');
    expect(result.dayMemorized).toBe(1);
    expect(result.dayTotal).toBe(3);
  });

  test('[신규계획] Day1 전체가 자유학습으로 암기됨 → 여전히 needs-study (isMemorized 무시)', () => {
    // 계획을 통해 학습한 적 없으면 isMemorized와 무관하게 Day1부터 시작.
    const list = makePlanList();
    const words = [
      makeWord({ assignedDay: 1, isMemorized: true }),
      makeWord({ assignedDay: 1, isMemorized: true }),
      makeWord({ assignedDay: 2, isMemorized: false }),
    ];
    const result = computeDayStudyStatus(list, words, NOW);
    expect(result.displayDay).toBe(1);
    expect(result.state).toBe('needs-study');
  });

  // ── 오늘 학습 완료 ────────────────────────────────────────────────────────

  test('[오늘학습완료] planCurrentDay=2, planUpdatedAt=오늘 → Day1 completed 표시', () => {
    const list = makePlanList({
      planCurrentDay: 2,
      planUpdatedAt: NOW - 1000 * 60 * 30, // 30분 전
    });
    const words = [
      makeWord({ assignedDay: 1, isMemorized: true }),
      makeWord({ assignedDay: 2, isMemorized: false }),
    ];
    const result = computeDayStudyStatus(list, words, NOW);
    expect(result.displayDay).toBe(1);
    expect(result.state).toBe('completed');
  });

  test('[오늘학습완료] 마지막 Day 완료 당일 → 마지막 Day completed 표시', () => {
    const list = makePlanList({
      planTotalDays: 2,
      planCurrentDay: 3, // planTotalDays + 1
      planUpdatedAt: NOW - 1000 * 60, // 1분 전
    });
    const words = [
      makeWord({ assignedDay: 1, isMemorized: true }),
      makeWord({ assignedDay: 2, isMemorized: true }),
    ];
    const result = computeDayStudyStatus(list, words, NOW);
    expect(result.displayDay).toBe(2); // 마지막 Day
    expect(result.state).toBe('completed');
  });

  // ── 이전에 학습했으나 오늘은 미학습 ────────────────────────────────���─────

  test('[이전학습] planCurrentDay=2, 어제 학습 → Day2 needs-study', () => {
    const list = makePlanList({
      planCurrentDay: 2,
      planUpdatedAt: NOW - DAY, // 어제
    });
    const words = [
      makeWord({ assignedDay: 1, isMemorized: true }),
      makeWord({ assignedDay: 2, isMemorized: false }),
    ];
    const result = computeDayStudyStatus(list, words, NOW);
    expect(result.displayDay).toBe(2);
    expect(result.state).toBe('needs-study');
  });

  test('[이전학습] planCurrentDay가 planTotalDays 초과 시 planTotalDays로 cap', () => {
    const list = makePlanList({
      planTotalDays: 3,
      planCurrentDay: 99,
      planUpdatedAt: NOW - DAY * 2,
    });
    const words = [
      makeWord({ assignedDay: 3, isMemorized: false }),
    ];
    const result = computeDayStudyStatus(list, words, NOW);
    expect(result.displayDay).toBe(3); // planTotalDays로 cap
  });

  // ── dayMemorized / dayTotal 카운트 ────────────────────────────────────────

  test('dayMemorized, dayTotal이 표시 Day의 단어 수를 정확히 반영', () => {
    const list = makePlanList({ planCurrentDay: 2, planUpdatedAt: NOW - DAY });
    const words = [
      makeWord({ assignedDay: 2, isMemorized: true }),
      makeWord({ assignedDay: 2, isMemorized: true }),
      makeWord({ assignedDay: 2, isMemorized: false }),
    ];
    const result = computeDayStudyStatus(list, words, NOW);
    expect(result.dayTotal).toBe(3);
    expect(result.dayMemorized).toBe(2);
  });
});

// ─── groupWordsByDay ──────────────────────────────────────────────────────────

describe('groupWordsByDay', () => {
  test('빈 배열 → 빈 섹션', () => {
    expect(groupWordsByDay([])).toEqual([]);
  });

  test('Day 순서대로 정렬된 섹션 반환', () => {
    const words = [
      makeWord({ id: 'w3', assignedDay: 3 }),
      makeWord({ id: 'w1', assignedDay: 1 }),
      makeWord({ id: 'w2', assignedDay: 2 }),
    ];
    const sections = groupWordsByDay(words);
    expect(sections.map(s => s.day)).toEqual([1, 2, 3]);
  });

  test('미배정 단어(assignedDay=null)는 day=0 섹션 맨 뒤에', () => {
    const words = [
      makeWord({ id: 'w1', assignedDay: 1 }),
      makeWord({ id: 'wu', assignedDay: null }),
    ];
    const sections = groupWordsByDay(words);
    expect(sections[0].day).toBe(1);
    expect(sections[1].day).toBe(0);
    expect(sections[1].data[0].id).toBe('wu');
  });

  test('같은 Day의 단어들이 하나의 섹션에 묶임', () => {
    const words = makeWords(3, { assignedDay: 1 });
    const sections = groupWordsByDay(words);
    expect(sections).toHaveLength(1);
    expect(sections[0].data).toHaveLength(3);
  });
});

// ─── 시나리오: 기간 만료 → 다시 학습 복구 ──────────────────────────────────────
// 사용자 보고 플로우를 엔진 함수로 재현한다. DB 계층이 바꾸는 컬럼을 그대로
// 모사한다:
//   restartPlanWindow:   planStartedAt = now, planUpdatedAt = null (진행도 보존)
//   updatePlanProgress:  planCurrentDay = max(cur, newDay), planUpdatedAt = now

describe('시나리오: 기간 만료 → 다시 학습 복구', () => {
  // 홈 카드의 액션 라벨 매핑(app/(tabs)/index.tsx:getStudyStateConfig와 동일)
  const actionLabelFor: Record<string, string> = {
    'needs-study': '학습하기',
    studying: '이어서 학습',
    completed: '추가학습',
  };

  // restartPlanWindow(=홈 "다시 학습")가 만지는 컬럼 모사
  function restartPlanWindow(list: VocaList, now: number): VocaList {
    return { ...list, planStartedAt: now, planUpdatedAt: undefined };
  }

  // updatePlanProgress(=학습 완료)가 만지는 컬럼 모사
  function updatePlanProgress(list: VocaList, newDay: number, now: number): VocaList {
    return {
      ...list,
      planCurrentDay: Math.max(list.planCurrentDay ?? 1, newDay),
      planUpdatedAt: now,
    };
  }

  // 14일 플랜인데 5일째까지 학습(planCurrentDay=5) 후 방치되어 종료일이 지난 상태
  function makeExpiredPlan(): VocaList {
    return makeList({
      planStartedAt: NOW - DAY * 20,   // 종료일 = NOW - 6일 (이미 지남)
      planTotalDays: 14,
      planCurrentDay: 5,               // Day4까지 학습, 다음은 Day5
      planWordsPerDay: 5,
      planUpdatedAt: NOW - DAY * 10,   // 10일 전 마지막 학습 → 방치
    });
  }

  const planWords = [
    makeWord({ assignedDay: 5, isMemorized: false }),
    makeWord({ assignedDay: 5, isMemorized: false }),
    makeWord({ assignedDay: 6, isMemorized: false }),
  ];

  test('① 초기: 방치 + 종료일 지남 → overdue (기간 만료)', () => {
    const list = makeExpiredPlan();
    expect(computePlanStatus(list, planWords, NOW)).toBe('overdue');
  });

  test('② 홈 "다시 학습" 탭(학습 전) → in-progress + Day5 "학습하기"', () => {
    let list = makeExpiredPlan();
    list = restartPlanWindow(list, NOW); // 재anchor, planCurrentDay=5 보존

    expect(computePlanStatus(list, planWords, NOW)).toBe('in-progress');

    const day = computeDayStudyStatus(list, planWords, NOW);
    expect(day.displayDay).toBe(5); // 기존 진행도 이어서
    expect(day.state).toBe('needs-study');
    expect(actionLabelFor[day.state]).toBe('학습하기');
  });

  test('③ Day5 학습 완료 → in-progress 유지 + "추가학습"(오늘 달성)', () => {
    let list = makeExpiredPlan();
    list = restartPlanWindow(list, NOW);
    list = updatePlanProgress(list, 6, NOW); // Day5 학습 끝 → 다음 Day6, 오늘 학습됨

    expect(computePlanStatus(list, planWords, NOW)).toBe('in-progress');

    const day = computeDayStudyStatus(list, planWords, NOW);
    expect(day.displayDay).toBe(5);       // 오늘 달성한 Day5 표시
    expect(day.state).toBe('completed');
    expect(actionLabelFor[day.state]).toBe('추가학습');
  });

  test('④ 직접 진입 경로: 만료 플랜을 다시 학습 없이 바로 학습 → 자동 in-progress 복구', () => {
    // restartPlanWindow를 거치지 않고(=플랜 화면 직접 진입) 학습만 한 경우.
    // 중앙 처리(computePlanStatus)가 planUpdatedAt=오늘을 보고 overdue를 해제한다.
    let list = makeExpiredPlan();
    expect(computePlanStatus(list, planWords, NOW)).toBe('overdue'); // 학습 전

    list = updatePlanProgress(list, 6, NOW); // planStartedAt 그대로, planUpdatedAt=오늘
    expect(computePlanStatus(list, planWords, NOW)).toBe('in-progress'); // 자동 복구
  });

  test('⑤ 다음 날 자정 이후, 학습 없이 열면 → "학습하기"로 자연 전환', () => {
    let list = makeExpiredPlan();
    list = restartPlanWindow(list, NOW);
    list = updatePlanProgress(list, 6, NOW); // 오늘 Day5 학습

    const TOMORROW = NOW + DAY; // 다음 날
    expect(computePlanStatus(list, planWords, TOMORROW)).toBe('in-progress'); // 아직 방치 아님

    const day = computeDayStudyStatus(list, planWords, TOMORROW);
    expect(day.displayDay).toBe(6); // 다음 학습 Day
    expect(day.state).toBe('needs-study');
    expect(actionLabelFor[day.state]).toBe('학습하기');
  });
});
