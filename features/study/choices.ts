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

import { Word } from '@/lib/types';
import { stripSenseMarkers } from '@/lib/senses';

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
 * 정답 1개 + 오답 (count-1)개를 섞어 돌려준다.
 *
 * - 정답과 **표시가 같은** 단어는 오답에서 뺀다(같은 버튼이 두 개 보이는 것 방지).
 * - 오답끼리 표시가 겹치는 것도 뺀다 — 어느 쪽을 눌러도 하나는 틀리는 선택지가 된다.
 * - 라벨이 빈 단어는 뺀다(빈 버튼이 된다).
 * - 후보가 모자라면 있는 만큼만. 정답은 언제나 포함된다.
 */
export function buildChoices(
  pool: readonly Word[],
  answer: Word,
  labelOf: (w: Word) => string,
  count = 4,
): Word[] {
  const used = new Set<string>([normalizeChoiceLabel(labelOf(answer))]);
  const distractors: Word[] = [];

  for (const w of shuffleArray(pool)) {
    if (distractors.length >= count - 1) break;
    if (w.id === answer.id) continue;
    const label = normalizeChoiceLabel(labelOf(w));
    if (!label || used.has(label)) continue;
    used.add(label);
    distractors.push(w);
  }

  return shuffleArray([answer, ...distractors]);
}
