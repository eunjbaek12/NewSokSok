/**
 * 위젯에서 누른 판정을 앱과 **같은 길로** 기록한다.
 *
 * 🔑 판정은 `commitSessionResults` 한 곳을 지난다 — 암기 상태·오답 수·복습 사다리·마지막 학습·
 * 학습량·연속 학습일까지 앱에서 공부한 것과 똑같이 남는다. 위젯만 쓴 날도 공부한 날이다.
 *
 * 그 함수가 **손대지 않는 것이 계획 Day** 하나뿐이라, 여기서 이어 붙인다(9/19 확정 ④):
 * 그 단어가 속한 Day 의 암기 비율이 `DAY_DONE_MEMORIZED_RATIO`(50%)를 넘으면 Day 를 넘긴다.
 * 앱의 학습 화면 넷은 «세션을 끝까지 마치고 그 세션 정답률 50% 이상»일 때 넘기는데, 위젯은
 * 세션이 없으므로 **세션 비율이 아니라 그 Day 의 암기 비율**로 본다 — 잠금(`deriveUnlockedDay`)이
 * 이미 쓰는 값이라 두 곳이 같은 기준을 보게 된다.
 */
import { commitSessionResults, DAY_DONE_MEMORIZED_RATIO } from '@/features/study';
import { updatePlanProgress } from '@/features/vocab';
import type { VocaList, Word } from '@/lib/types';

/**
 * 판정 하나를 기록하고, 계획 Day 를 넘겨야 하면 넘긴다.
 *
 * `list` 는 **판정 전** 스냅숏이다. 그래서 비율을 셀 때 방금 누른 단어의 결과를 직접 얹는다 —
 * DB 를 다시 읽어도 되지만, 한 번 더 읽는 만큼 위젯 탭이 느려진다.
 */
export async function commitWidgetJudgement(params: {
  list: VocaList;
  word: Word;
  gotIt: boolean;
}): Promise<void> {
  const { list, word, gotIt } = params;

  await commitSessionResults(list.id, [{ word, gotIt }]);

  const day = word.assignedDay;
  if (day == null || day <= 0) return;
  // 계획이 없거나 이미 마지막 Day 를 넘겼으면 건드리지 않는다.
  const total = list.planTotalDays ?? 0;
  if (total <= 0) return;
  const current = list.planCurrentDay ?? 1;
  if (day < current) return;

  const dayWords = list.words.filter(w => w.assignedDay === day);
  if (dayWords.length === 0) return;

  const memorized = dayWords.filter(w =>
    w.id === word.id ? gotIt : w.isMemorized,
  ).length;

  if (memorized / dayWords.length >= DAY_DONE_MEMORIZED_RATIO) {
    // MAX() 로만 오르므로(features/vocab/db.ts) 되돌아가는 일은 없다.
    await updatePlanProgress(list.id, day + 1);
  }
}
