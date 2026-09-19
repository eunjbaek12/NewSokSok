/**
 * 위젯 치수와 «뜻을 몇 줄 보여 줄까» 계산 — 순수 모듈(jest 로 검증한다).
 *
 * 화면(`WordWidget.tsx`)은 네이티브 모듈을 불러서 테스트에서 못 읽는다. 그래서 숫자는 여기 두고
 * 화면은 이 값을 가져다 쓴다 — 두 곳에 같은 숫자를 적어 두면 한쪽만 바뀐다.
 *
 * ## 뜻을 연 모습의 높이 (위에서부터)
 *
 *   여백 10 · 칩 줄 20 · 6 · 단어 26 · 4 · **뜻 (남는 높이)** · 6 · 판정 버튼 48 · 여백 10
 *
 * 은정님 폰의 2×2 는 146×167dp 라 뜻에 37dp → **두 줄**, 지금 놓인 자리(146×261)면 일곱 줄이다(9/19 실측).
 * 🔑 처음엔 한 줄이었다. 뜻 칸을 한 줄 높이로 잡고 같은 줄에 «1 / 10»을 둬서 여섯 글자에서 잘렸다.
 * 두 번째 줄 18dp 는 위아래 여백(12→10)과 단어–뜻 간격(6→4)에서 가져왔다 — 판정 버튼 48 은 그대로다.
 */

export const WIDGET_PAD_V = 10;
export const WIDGET_PAD_H = 12;
export const CHIP_ROW_H = 20;
export const WORD_H = 26;
export const BUTTON_H = 48;
export const GAP = 6;
/** 단어와 그 뜻은 한 덩어리라 다른 간격보다 좁다. */
export const GAP_WORD_MEANING = 4;
export const MEANING_LINE_H = 18;
export const COUNT_ROW_H = 15;

/** 뜻 칸을 뺀 나머지가 차지하는 높이. */
const FIXED_REVEALED =
  WIDGET_PAD_V * 2 + CHIP_ROW_H + GAP + WORD_H + GAP_WORD_MEANING + GAP + BUTTON_H;

/**
 * 뜻을 몇 줄까지 보여 줄 수 있나.
 *
 * `height` 는 위젯이 알려 주는 실제 높이(dp). 런처는 선언한 크기를 그대로 주지 않고
 * 사용자가 늘릴 수도 있어서, 고정값이 아니라 이 값으로 센다.
 * 🔴 높이를 못 받으면(0) 두 줄로 본다 — 2×2 가 두 줄이라 가장 흔한 경우에 맞춘다.
 * `fontScale` 은 폰의 글자 크기 설정. 크게 해 두면 한 줄이 길어지므로 줄 수를 줄인다.
 */
export function meaningLines(height: number, fontScale = 1): number {
  if (!(height > 0)) return 2;
  const lineH = MEANING_LINE_H * (fontScale > 0 ? fontScale : 1);
  const lines = Math.floor((height - FIXED_REVEALED) / lineH);
  return Math.max(1, Math.min(lines, 10));
}
