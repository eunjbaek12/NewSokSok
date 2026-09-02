/**
 * AI 결과 중 **실제로 쓸 칸**을 고른다 — 순수 함수.
 *
 * 왜 화면·훅에서 빼냈나: 같은 저장소가 이미 한 번 겪었다. 배너 얼굴 판정을
 * 컴포넌트 안 클로저로 두었더니 어느 조합이 어느 얼굴이 되는지 눈으로 확인하는
 * 수밖에 없었고, 그 눈이 두 번 다 놓쳤다(`face.ts` 머리말). 이 판정도 조건이 두
 * 겹이라 같은 함정이다 — 값이 왔는가 × 그 칸이 비었는가.
 *
 * 규칙은 둘뿐이다.
 *   ① 값이 실제로 왔는가 — 빈 문자열로 덮으면 있던 값을 지운다.
 *   ② 그 칸이 지금 비었는가 — 손으로 적어 둔 것을 AI 값으로 갈아치우면 "채웠다"가
 *      아니라 "바꿨다"가 된다.
 *
 * 🔴 ②가 없던 동안의 실제 범위는 좁았다(2026-09-02 실측: 채우기 대상 1,212행 중
 * 품사·예문 해석이 이미 있어 덮일 수 있는 행 4). `isBareWord` 가 세 칸(발음·예문·정의)만
 * 보고 `pos`·`exampleKr` 은 안 보기 때문에 그 둘로만 샜다. 좁다고 둘 수 없는 이유는
 * **대상을 넓히는 순간 커지기 때문**이다 — 예문 학습에서 "예문 없는 단어"를 대상으로
 * 삼으면 발음·정의를 손으로 적어 둔 단어가 통째로 들어온다(그런 행이 460개다).
 *
 * ⚠️ 뜻(`meaningKr`)은 아예 목록에 없다. 채우려는 칸이 아니고, 대상 판정이 이미
 * "뜻은 있다"를 전제한다.
 */

import { hasText } from './detect';
import type { AutoFillResult, Word } from '@/lib/types';

/** AI 결과가 채울 수 있는 칸. 뜻은 일부러 빠져 있다. */
const FILLABLE = ['phonetic', 'exampleEn', 'exampleKr', 'definition', 'pos'] as const;

type FillableKey = (typeof FILLABLE)[number];

/** 대상 단어의 빈 칸 중 AI 결과가 채울 수 있는 것만 골라 낸다. */
export function fillableUpdates(
  target: Pick<Word, FillableKey>,
  result: Pick<AutoFillResult, FillableKey>,
): Partial<Word> {
  const updates: Partial<Word> = {};
  for (const key of FILLABLE) {
    const incoming = result[key];
    if (hasText(incoming) && !hasText(target[key])) {
      updates[key] = incoming as string;
    }
  }
  return updates;
}
