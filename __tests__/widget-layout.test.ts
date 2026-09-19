/**
 * 위젯 뜻 줄 수 — 은정님 폰에서 잰 크기로 검증한다(9/19).
 *
 * 줄 수를 틀리게 세면 둘 중 하나가 난다: 모자라게 세면 빈 자리가 남은 채 «…»로 잘리고,
 * 넘치게 세면 마지막 줄이 반쯤 걸쳐 그려지거나 판정 버튼을 밀어낸다. 실기에서는 위젯 크기를
 * 바꿔 가며 보기가 번거로워 여기서 잡는다.
 */
import { meaningLines } from '../features/widget/layout';

describe('뜻 줄 수', () => {
  it('2×2(146×167dp)에서 두 줄 — 9/19 결정', () => {
    expect(meaningLines(167)).toBe(2);
  });

  it('크게 놓으면 들어가는 만큼 — 지금 자리(146×261dp)에서 일곱 줄', () => {
    expect(meaningLines(261)).toBe(7);
  });

  it('작은 런처에서도 최소 한 줄', () => {
    expect(meaningLines(120)).toBe(1);
  });

  it('높이를 못 받으면(0) 두 줄로 본다 — 가장 흔한 2×2 에 맞춘다', () => {
    expect(meaningLines(0)).toBe(2);
    expect(meaningLines(Number.NaN)).toBe(2);
  });

  it('글자를 크게 해 두면 줄 수를 줄인다 — 넘친 줄이 버튼을 밀지 않게', () => {
    expect(meaningLines(167, 1.3)).toBe(1);
    expect(meaningLines(261, 1.3)).toBe(5);
  });

  it('아무리 커도 열 줄까지', () => {
    expect(meaningLines(2000)).toBe(10);
  });
});
