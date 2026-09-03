/**
 * 「지금 몇 개가 되는가」 — 시트의 숫자와 갈래.
 *
 * 🔴 이 파일이 존재하는 이유는 **실기에서 이미 한 번 틀렸기 때문**이다(2026-09-03):
 * 예문 없는 단어가 **0개인 사람에게 「광고 보고 +20단어」를 권했다.** 판정이
 * BareWordsSheet 안 파생값이라 물어볼 손잡이가 없었고, 코드 검토·타입·1,565건이
 * 전부 지나쳤다.
 *
 * 🔑 이 파일이 지키는 문장은 하나다 — **`fillable` 이 0 인 이유는 둘이고 처방이 정반대다.**
 */

import { planFill } from '../features/bare-words/fill-plan';

const plan = (bareCount: number, quotaLeft: number | null, unlimited = false) =>
  planFill({ bareCount, quotaLeft, unlimited });

describe('planFill — 0 의 두 가지 이유', () => {
  it('🔴 다 채웠으면 광고를 권하지 않는다 — 대상 0 · 잔량 5', () => {
    // 실기 결함 그 자체. fillable 은 min(5, 0) = 0 이지만 「못 채운다」가 아니라 「할 일이 없다」다.
    expect(plan(0, 5)).toEqual({ fillable: 0, leftover: 0, canFill: true, quotaUnknown: false });
  });

  it('🔴 대상도 0 이고 잔량도 0 이어도 광고를 권하지 않는다', () => {
    // 한도까지 소진한 사람이 마침 다 채운 경우. 수만 보면 ②와 구별되지 않는 자리다.
    expect(plan(0, 0).canFill).toBe(true);
  });

  it('한도가 막았을 때만 ② 얼굴로 간다 — 대상 30 · 잔량 0', () => {
    expect(plan(30, 0)).toEqual({ fillable: 0, leftover: 30, canFill: false, quotaUnknown: false });
  });
});

describe('planFill — 숫자', () => {
  it('잔량이 모자라면 잔량만큼만 채우고 나머지를 남긴다 — 대상 12 · 잔량 5', () => {
    // 주 버튼에 12 가 아니라 5 가 찍혀야 한다(「174개 채우기」를 눌렀는데 50에서 멈추면 속았다고 느낀다).
    expect(plan(12, 5)).toEqual({ fillable: 5, leftover: 7, canFill: true, quotaUnknown: false });
  });

  it('잔량이 넉넉하면 전부 채우고 남는 것은 없다 — leftover 는 음수가 되지 않는다', () => {
    expect(plan(3, 50)).toEqual({ fillable: 3, leftover: 0, canFill: true, quotaUnknown: false });
  });

  it('대상과 잔량이 같으면 딱 맞는다', () => {
    expect(plan(7, 7)).toEqual({ fillable: 7, leftover: 0, canFill: true, quotaUnknown: false });
  });
});

describe('planFill — 잔량을 아직 모를 때(null)는 막지 않는다', () => {
  it('모르는 것을 «없다»로 읽지 않는다 — 네트워크 지연이 광고 권유가 되면 안 된다', () => {
    expect(plan(12, null)).toEqual({ fillable: 12, leftover: 0, canFill: true, quotaUnknown: true });
  });

  it('quotaUnknown 이면 개수 자리에 「—」를 적게 한다', () => {
    expect(plan(12, null).quotaUnknown).toBe(true);
    expect(plan(12, 5).quotaUnknown).toBe(false);
  });
});

describe('planFill — BYOK(unlimited)', () => {
  it('잔량을 아예 보지 않는다 — 0 이어도 전부 채운다', () => {
    expect(plan(40, 0, true)).toEqual({ fillable: 40, leftover: 0, canFill: true, quotaUnknown: false });
  });

  it('잔량이 null 이어도 「모른다」가 아니다 — 볼 필요가 없는 값이다', () => {
    expect(plan(40, null, true).quotaUnknown).toBe(false);
  });

  it('BYOK 라도 대상이 0 이면 채울 것이 없다', () => {
    expect(plan(0, null, true)).toEqual({ fillable: 0, leftover: 0, canFill: true, quotaUnknown: false });
  });
});
