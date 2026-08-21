/*
 * 예문 카드의 문장 크기 단계.
 *
 * 왜 있나(2026-08-21 실기, Galaxy S22 · 수능 필수 어휘 500 45문항):
 *   문장이 여섯 줄이 되면 카드가 `flexShrink`로 줄어드는데 **안의 내용은 줄지 않아**
 *   스피커 버튼이 카드 테두리 밖으로 밀려나 반쯤 잘린 채 그려졌다(45문항 중 7문항, 15.6%).
 *   RN의 기본값이 `overflow: 'visible'`이라 넘친 자식이 그대로 보인다.
 *   선택지 쪽은 손대지 않는다 — `choicesArea`의 `flexShrink: 0`은 "선택지가 자리를 먼저
 *   확보한다"는 이전 회귀의 처방이다. 그래서 부족분은 문장이 흡수해야 한다.
 *
 * 🔴 `adjustsFontSizeToFit`을 쓰지 않는 이유가 둘이다:
 *   ⑴ **Android는 `minimumFontScale`을 무시한다** — 같은 날 카드 뒷면 뜻을 재 보니
 *      하한(19.2dp)을 지나 4dp까지 줄어들었다. 문제 문장에 그런 일이 나면 못 읽는다.
 *   ⑵ 빈칸은 `<Text>` 안의 **인라인 View**라 글자와 함께 줄지 않는다. 자동 축소를 걸면
 *      글자만 작아지고 `?` 박스만 커 보인다. 그래서 박스 치수도 이 표에 같이 둔다.
 *
 * 마지막 단계까지 가야 하는 길이: 번들 65덱의 예문을 병기(①②③) 단위로 쪼개 재면
 * 중앙값 32자 · p99 122자 · 최대 171자다(15,542개). 120자 초과가 192개, 150자 초과는 1개.
 */
export const SENTENCE_SIZES = [
  { fontSize: 24, lineHeight: 34, blankW: 40, blankH: 34, blankFont: 16, blankTop: 6 },
  { fontSize: 21, lineHeight: 30, blankW: 36, blankH: 30, blankFont: 15, blankTop: 5 },
  { fontSize: 18, lineHeight: 26, blankW: 32, blankH: 26, blankFont: 13, blankTop: 5 },
  { fontSize: 16, lineHeight: 23, blankW: 29, blankH: 23, blankFont: 12, blankTop: 4 },
  { fontSize: 14, lineHeight: 20, blankW: 26, blankH: 20, blankFont: 11, blankTop: 4 },
] as const;

export type SentenceSize = (typeof SENTENCE_SIZES)[number];

/** 반올림 여유. 딱 맞는 문장에서 괜히 한 단계 내려가지 않게 한다. */
const SLACK_PX = 1;

/**
 * 지금 단계로 문장이 자기 영역을 넘치면 다음 단계를 돌려준다. 아니면 그대로 둔다.
 *
 * 🔑 줄 수가 아니라 **높이**로 판정한다 — "몇 줄까지 되는가"는 기기마다 다르고(화면이
 *    짧으면 카드도 짧다) 배너 광고 유무로도 달라진다. 실제로 허용된 높이를 재서 쓴다.
 * 🔑 재료 둘 중 하나라도 아직 0이면(측정 전) 판단하지 않는다 — 콜백 순서는 보장되지 않아
 *    둘 다 도착한 뒤에 다시 부르는 쪽으로 만든다.
 * 인덱스는 단조 증가하고 표는 유한하므로 되돌이표가 생기지 않는다. 마지막 단계에서도
 * 넘치면 그대로 두고 문장 영역이 잘라 낸다(카드 밖으로 나가는 것보다 낫다).
 */
export function nextSentenceStep(step: number, lines: number, availableHeight: number): number {
  if (!lines || !availableHeight) return step;
  if (step >= SENTENCE_SIZES.length - 1) return step;
  const needed = lines * SENTENCE_SIZES[step].lineHeight;
  return needed > availableHeight + SLACK_PX ? step + 1 : step;
}
