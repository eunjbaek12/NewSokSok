// 객관식 선택지 만들기 — 예문 학습·퀴즈가 공유한다.
//
// 두 화면이 각자 복제해 갖고 있던 로직이었고, 양쪽 다 오답을 `w.id !== answer.id`로만
// 걸러서 **화면에 똑같이 보이는 선택지**가 섞였다. 채점은 id로 하므로, 사용자가 화면상
// 정답인 버튼을 눌러도 오답 처리된다.
//
// 실측(2026-07-26): 같은 단어장 안에서 표기가 겹치는 단어 25행(12그룹),
// **뜻이 겹치는 단어 275행(132그룹·26개 단어장)**. 퀴즈는 방향에 따라 선택지에 뜻을
// 표시하므로(quizType) 뜻 중복 쪽이 11배 흔하다. 그래서 중복 판정은 고정 필드가 아니라
// **그 화면이 실제로 보여주는 라벨**을 기준으로 한다 — labelOf를 받는 이유다.
//
// ── 다중정답 방지(2026-08-21, docs/example-choices-multi-answer-spec.md) ──
// 위 필터는 "표시가 다른가"만 본다. 예문 빈칸 문제에서 정작 필요한 것은 **"빈칸에 넣으면
// 틀리는가"** 다. 제보로 확인된 실제 사례: "___ 먹을까요?" 의 정답이 "국수"인데 선택지에
// "라면"이 함께 떠서, 문장상 맞는 답을 골라도 오답 처리됐다.
//
// 그래서 예문 화면만 `ctx`를 넘겨 두 겹을 더 건다(퀴즈는 안 넘기므로 동작이 그대로다):
//   A. 문형이 정답과 같은 후보를 뺀다  — 서버 전수에서 확정 다중정답 185문항이 잡힌다
//   B. 단어장 안에서 가까운 후보를 뺀다 — 덱이 주제 블록으로 정렬돼 있어서 통한다
//      (TOPIK I 350의 62~87이 통째로 음식이다. 국수 68, 라면 69.)
// 둘은 서로 다른 것을 잡는다 — 문형이 같은 쌍 205개 중 거리 20 이내는 32.2%뿐이고
// 중앙값 거리는 54다("___ 주세요"의 영수증·비빔밥·입장권은 서로 멀리 있다).

import { Word } from '@/lib/types';
import { stripSenseMarkers } from '@/lib/senses';

/**
 * 같은 주제로 보는 단어장 내 거리. 350개 덱에서 최대 40개(11%)가 후보에서 빠진다 —
 * 후보가 349→309이라 난이도 체감은 없고, 같은 주제 블록의 중심부가 걸러진다.
 * 더 넓히면(±35) "된장과 김치를 구별하는 문제"까지 못 내게 되어 과하다.
 */
export const SAME_TOPIC_DISTANCE = 20;

/** 예문 화면이 넘기는 판정 재료. 넘기지 않으면 아래 두 필터는 아예 돌지 않는다. */
export interface ChoiceContext {
  /** 이 단어의 예문에서 빈칸을 뺀 나머지("문형"). 예문이 없거나 빈칸을 못 만들면 null. */
  frameOf: (w: Word) => string | null;
  /** 단어장 안에서의 순서. 화면에 보이는 배열의 인덱스이며, 모르면 -1. */
  indexOf: (w: Word) => number;
  /** 이 거리 이내는 같은 주제로 보고 오답에서 뺀다. */
  minDistance: number;
}

export function shuffleArray<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 선택지 중복 판정용 정규화 — 대소문자·앞뒤 공백·①② 병기 기호 차이는 같은 것으로 본다. */
export function normalizeChoiceLabel(label: string | null | undefined): string {
  if (!label) return '';
  return stripSenseMarkers(label).trim().toLowerCase();
}

/**
 * 오답을 모은다. `useFrame`/`useDistance`로 필터 세기를 조절한다 — 후보가 모자랄 때
 * 단계적으로 풀기 위해서다(buildChoices 참고).
 */
function collectDistractors(
  pool: readonly Word[],
  answer: Word,
  labelOf: (w: Word) => string,
  count: number,
  ctx: ChoiceContext | undefined,
  useFrame: boolean,
  useDistance: boolean,
): Word[] {
  const used = new Set<string>([normalizeChoiceLabel(labelOf(answer))]);
  const distractors: Word[] = [];

  // 빈 문형("")은 판정에 쓰지 않는다 — 예문이 표제어뿐인 단어들이 서로 같은 문형으로
  // 묶여 버린다. truthy 검사가 그 역할을 겸한다.
  const answerFrame = useFrame && ctx ? ctx.frameOf(answer) : null;
  const answerIndex = useDistance && ctx ? ctx.indexOf(answer) : -1;

  for (const w of shuffleArray(pool)) {
    if (distractors.length >= count - 1) break;
    if (w.id === answer.id) continue;
    const label = normalizeChoiceLabel(labelOf(w));
    if (!label || used.has(label)) continue;

    // A. 빈칸을 뺀 문장이 같으면 이 후보도 그 자리에 들어간다 — 확정 다중정답이다.
    if (answerFrame && ctx) {
      const frame = ctx.frameOf(w);
      if (frame && frame === answerFrame) continue;
    }
    // B. 같은 주제 블록에서는 오답을 뽑지 않는다.
    if (answerIndex >= 0 && ctx) {
      const index = ctx.indexOf(w);
      if (index >= 0 && Math.abs(index - answerIndex) <= ctx.minDistance) continue;
    }

    used.add(label);
    distractors.push(w);
  }

  return distractors;
}

/**
 * 정답 1개 + 오답 (count-1)개를 섞어 돌려준다.
 *
 * - 정답과 **표시가 같은** 단어는 오답에서 뺀다(같은 버튼이 두 개 보이는 것 방지).
 * - 오답끼리 표시가 겹치는 것도 뺀다 — 어느 쪽을 눌러도 하나는 틀리는 선택지가 된다.
 * - 라벨이 빈 단어는 뺀다(빈 버튼이 된다).
 * - `ctx`를 주면 빈칸에 넣어도 말이 되는 후보를 추가로 뺀다(파일 헤더 참고).
 * - 후보가 모자라면 있는 만큼만. 정답은 언제나 포함된다.
 *
 * ⚠️ `ctx` 때문에 선택지 수가 줄어선 안 된다 — 단어 5개짜리 단어장에서 거리 필터를
 *    그대로 걸면 오답이 0개가 된다. 그래서 목표 개수를 못 채우면 **B → A 순으로 풀고**
 *    마지막에는 ctx 없는 동작(=예전 그대로)으로 되돌아간다. B를 먼저 푸는 이유는 그쪽이
 *    "가까우면 아마 같은 주제"라는 근사이고, A는 "문장이 같으니 확실히 다중정답"이라
 *    근거가 더 단단하기 때문이다.
 */
export function buildChoices(
  pool: readonly Word[],
  answer: Word,
  labelOf: (w: Word) => string,
  count = 4,
  ctx?: ChoiceContext,
): Word[] {
  const target = count - 1;

  if (ctx) {
    const strict = collectDistractors(pool, answer, labelOf, count, ctx, true, true);
    if (strict.length >= target) return shuffleArray([answer, ...strict]);

    const frameOnly = collectDistractors(pool, answer, labelOf, count, ctx, true, false);
    if (frameOnly.length >= target) return shuffleArray([answer, ...frameOnly]);
  }

  return shuffleArray([answer, ...collectDistractors(pool, answer, labelOf, count, undefined, false, false)]);
}
