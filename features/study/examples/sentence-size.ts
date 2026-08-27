/*
 * 예문 카드의 문장 크기 단계.
 *
 * 왜 있나(2026-08-21 실기, Galaxy S22 · 수능 필수 어휘 500):
 *   문장이 길어지면 카드가 `flexShrink`로 줄어드는데 **안의 내용은 줄지 않아** 스피커 버튼이
 *   카드 테두리 밖으로 밀려나 반쯤 잘린 채 그려졌다(45문항 중 7문항). RN의 기본값이
 *   `overflow: 'visible'`이라 넘친 자식이 그대로 보인다.
 *   선택지 쪽은 손대지 않는다 — `choicesArea`의 `flexShrink: 0`은 "선택지가 자리를 먼저
 *   확보한다"는 이전 회귀의 처방이다. 그래서 부족분은 문장이 흡수해야 한다.
 *
 * 🔴 `adjustsFontSizeToFit`을 쓰지 않는 이유가 둘이다:
 *   ⑴ **Android는 `minimumFontScale`을 무시한다** — 같은 날 카드 뒷면 뜻을 재 보니
 *      하한(19.2dp)을 지나 4dp까지 줄어들었다. 문제 문장에 그런 일이 나면 못 읽는다.
 *   ⑵ 빈칸은 `<Text>` 안의 **인라인 View**라 글자와 함께 줄지 않는다. 자동 축소를 걸면
 *      글자만 작아지고 `?` 박스만 커 보인다. 그래서 박스 치수도 이 표에 같이 둔다.
 *
 * 🔑 **표는 16dp에서 끝난다. 그 아래는 줄이지 않고 스크롤이 받는다**(2026-08-22 결정).
 *   컨테이너에 맞추려 글자를 한없이 줄이는 것은 표준이 아니다 — Anki는 카드가 웹뷰라 스크롤이
 *   기본이고, Quizlet은 자동 축소 대신 사용자가 크기를 조절하며, WCAG 1.4.4/1.4.10은 텍스트
 *   크기를 지키고 한 방향 스크롤로 흘리는 쪽을 요구한다. 실측으로도 14dp는 번역(14dp)과 같아져
 *   **정답이 곁들이보다 작아 보이는 역전**이 생긴다(B3에서 지적된 그 증상이다).
 *
 * 어디까지 줄이면 되나(기기 DB 944장 실측, 카드 안쪽 폭 280dp 기준):
 *   문제를 푸는 동안(번역 없음)은 이 표로 **100%가 스크롤 없이 들어간다**. 답을 본 뒤에는
 *   85%가 들어가고, 나머지 15%는 밀어서 본다 — 그 15%에서도 **원문은 언제나 온전하고**
 *   밀리는 것은 번역 뒷부분(평균 2.3줄)이다.
 */
export const SENTENCE_SIZES = [
  { fontSize: 24, lineHeight: 34, blankW: 40, blankH: 34, blankFont: 16, blankTop: 6 },
  { fontSize: 21, lineHeight: 30, blankW: 36, blankH: 30, blankFont: 15, blankTop: 5 },
  { fontSize: 18, lineHeight: 26, blankW: 32, blankH: 26, blankFont: 13, blankTop: 5 },
  { fontSize: 16, lineHeight: 23, blankW: 29, blankH: 23, blankFont: 12, blankTop: 4 },
] as const;

export type SentenceSize = (typeof SENTENCE_SIZES)[number];

/** 반올림 여유. 딱 맞는 문장에서 괜히 한 단계 내려가지 않게 한다. */
const SLACK_DP = 1;

/**
 * 지금 단계로 내용이 보이는 영역을 넘치면 다음 단계를 돌려준다. 아니면 그대로 둔다.
 *
 * 두 값 모두 스크롤 영역이 직접 알려 준다 — `onLayout`이 보이는 높이(뷰포트),
 * `onContentSizeChange`가 실제 내용 높이다.
 *
 * 🔑 **줄 수를 세지 않는 것이 핵심이다.** 예전에는 `onTextLayout`의 줄 수로 판정했는데,
 *    글자 크기만 바뀌고 줄 수가 그대로면 그 콜백이 다시 오지 않아 한 단계에서 멈췄고
 *    (실측: 5줄 문장이 needed 130dp > avail 123dp 인데도 멈춰 마지막 줄이 잘렸다),
 *    억지로 다시 판정하게 하면 이번엔 옛 줄 수로 바닥까지 내려갔다. 내용 높이는 크기가
 *    바뀔 때마다 반드시 다시 오므로 그 왕복이 없다.
 * 🔑 번역·힌트가 같은 영역에 들어와도 따로 계산할 필요가 없다 — 내용 높이에 이미 포함된다.
 *
 * 인덱스는 단조 증가하고 표는 유한하므로 되돌이표가 생기지 않는다. 마지막 단계에서도 넘치면
 * 그대로 두고 스크롤이 받는다.
 */
/**
 * 힌트 상태별 단계. 힌트를 켜면 같은 영역에 한 줄이 더 들어와 글자가 한두 단계 작아지는데,
 * 단계는 하나뿐이고 되돌리는 지점이 문항 전환밖에 없어서 **힌트를 껐는데도 작은 글자가 그대로
 * 남았다**(E4). `nextSentenceStep`이 단조 증가만 하는 것은 진동 방지라는 의도이므로 그건 두고,
 * 상태를 둘로 나눠 각자 안에서 단조 증가하게 한다.
 */
export interface SentenceSteps {
  /** 힌트가 꺼진 상태에서 정착한 단계 */
  plain: number;
  /** 힌트가 켜진 상태에서 정착한 단계 */
  hint: number;
}

export const INITIAL_SENTENCE_STEPS: SentenceSteps = { plain: 0, hint: 0 };

/** 지금 그려야 할 단계. */
export function currentStep(steps: SentenceSteps, showHint: boolean): number {
  return showHint ? steps.hint : steps.plain;
}

/** 지금 상태의 단계만 바꾼다. 반대쪽은 그대로 둔다 — 그게 이 분리의 전부다. */
export function withStep(steps: SentenceSteps, showHint: boolean, step: number): SentenceSteps {
  return showHint ? { ...steps, hint: step } : { ...steps, plain: step };
}

/**
 * 힌트를 켤 때의 시작 단계를 맞춘다.
 *
 * 힌트는 내용을 **늘리기만** 하므로 힌트가 켜진 상태가 꺼진 상태보다 글자가 클 이유가 없다.
 * 처음 켜는 순간을 0(가장 큰 글자)에서 시작하면 24→21→18 계단이 눈에 보이므로, 꺼진 상태가
 * 이미 정착한 단계에서 출발한다. 두 번째부터는 저장된 값이 이미 그보다 크거나 같다.
 */
export function enterHint(steps: SentenceSteps): SentenceSteps {
  return { ...steps, hint: Math.max(steps.hint, steps.plain) };
}

export function nextSentenceStep(step: number, contentHeight: number, viewportHeight: number): number {
  if (!contentHeight || !viewportHeight) return step;
  if (step >= SENTENCE_SIZES.length - 1) return step;
  return contentHeight > viewportHeight + SLACK_DP ? step + 1 : step;
}
