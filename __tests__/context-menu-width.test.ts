/**
 * ⋯ 메뉴가 「뜻만 있는 단어 채우기」를 한 줄로 담는가 — 폭을 **값으로** 지킨다.
 *
 * 이 항목은 오른쪽에 개수를 함께 놓는 유일한 메뉴 항목이라, 폭이 처음으로 모자란 자리가 됐다.
 * 폭이 모자라면 낱말 경계에서 「뜻만 있는 단어 / 채우기」로 갈린다(lineBreakStrategyIOS 덕에
 * 낱말 한가운데서 갈리지는 않는다 — 그래서 **깨져 보이지 않고 그냥 두 줄이 된다**).
 *
 * 🔴 그래서 실기로도 놓치기 쉽다. 2026-09-03 Android 검증은 "한 줄 ✅" 로 통과했는데,
 *    그 단어장의 개수가 **한 자리**였을 뿐이다(그때 여유는 0.1~2.6px). 다음 날 iOS 에서
 *    개수가 두 자리인 단어장을 열자 두 줄이 됐다. **플랫폼이 아니라 자릿수였다.**
 *
 * 아래 숫자는 추정이 아니라 폰트에서 잰 값이다 — assets/fonts/Pretendard-Medium.otf 의
 * hmtx advance width 를 fontSize 14 로 환산했다(unitsPerEm 2048).
 * 그렇게 재기 전에는 이 문구를 "약 148px" 로 어림했는데 실제는 119.2px 이라, 정작
 * 넓혀야 할 값(토큰)은 안 넓히고 엉뚱한 상수만 240 으로 올린 채 끝났다(27eec16).
 */

import { PopupTokens } from '../constants/popup';

/** Pretendard-Medium · fontSize 14 실측(px). */
const TEXT = {
  koMenuItem: 119.2,   // 「뜻만 있는 단어 채우기」
  count1: 6.3,         // "1"   — 한 자리
  count2: 14.6,        // "12"  — 두 자리
  count3: 23.3,        // "123" — 세 자리
};

/** ListContextMenu 의 menuItem 스타일에서 온 고정 소모분. */
const CHROME =
  14 * 2 +   // paddingHorizontal
  16 +       // 아이콘(Ionicons size)
  10 * 2;    // gap × (자식 3개 사이 2칸)

/** 개수가 이만큼일 때 라벨에 남는 폭. */
const labelRoom = (width: number, countWidth: number) => width - CHROME - countWidth;

describe('⋯ 메뉴 폭 — 「뜻만 있는 단어 채우기」가 한 줄로 선다', () => {
  it('개수가 세 자리여도 한 줄에 들어간다', () => {
    const room = labelRoom(PopupTokens.maxWidth.contextMenu, TEXT.count3);
    expect(room).toBeGreaterThanOrEqual(TEXT.koMenuItem);
  });

  it('글자 크기를 1.3배로 키워도 한 줄에 들어간다 — Dynamic Type 은 fontSize 를 늘린다', () => {
    const scale = 1.3;
    const room = labelRoom(PopupTokens.maxWidth.contextMenu, TEXT.count2 * scale);
    expect(room).toBeGreaterThanOrEqual(TEXT.koMenuItem * scale);
  });

  it('🔴 옛 값 192 는 개수가 두 자리인 순간 넘쳤다 — 이 테스트가 잡았어야 할 값', () => {
    expect(labelRoom(192, TEXT.count1)).toBeGreaterThanOrEqual(TEXT.koMenuItem);   // 한 자리는 통과했다
    expect(labelRoom(192, TEXT.count2)).toBeLessThan(TEXT.koMenuItem);             // 두 자리에서 갈렸다
  });
});
