/**
 * 「지금 몇 개가 되는가」 — 시트가 어느 얼굴로 갈지 정하는 산수 한 벌.
 *
 * 왜 함수로 빼는가: **이 자리에서 이미 한 번 틀렸다.** 「채울 것이 0 인데 「광고 보고
 * +20단어」를 권한 것」(2026-09-03 실기)이 그것인데, 코드 검토·타입·1,565건 테스트가
 * 하나도 못 잡았다. 판정이 컴포넌트 안 파생값이라 **테스트가 물어볼 손잡이가 없었기**
 * 때문이다 — 같은 시트의 형제 판정은 전부 순수 함수로 나가 있다(face.ts · chip.ts ·
 * ad-offer.ts · merge.ts). 이것 하나만 남아 있었고 결함은 정확히 거기서 났다.
 *
 * 🔴 **`fillable` 이 0 인 이유는 둘이고 처방이 정반대다.**
 *
 * | 대상 | 잔량 | fillable | 뜻            | 시트          |
 * |------|------|----------|---------------|---------------|
 * | 0    | 5    | 0        | **다 채웠다** | ① (할 일 없음)|
 * | 30   | 0    | 0        | 한도가 막았다 | ② (광고·내일) |
 *
 * 수만 보고 갈라서는 안 된다. 그래서 `canFill` 은 `bareCount === 0` 을 **먼저** 본다 —
 * 광고가 뜻을 갖는 것은 «채울 것은 있는데 잔량이 모자랄 때»뿐이다.
 *
 * 🔑 잔량을 아직 모르면(응답 대기) 막지 않는다. 화면은 ①로 그리고 실제 자르기는 실행부가
 *    한다 — 모르는 것을 «없다»로 읽으면 잠깐의 네트워크 지연이 광고 권유가 된다.
 */

export interface FillPlanInput {
  /** 채울 대상 수 — 뜻만 있는 단어 / 예문 없는 단어(variant 로 갈린다). */
  bareCount: number;
  /** 남은 AI 한도. **null = 아직 모른다**(응답 대기)이지 0 이 아니다. */
  quotaLeft: number | null;
  /** BYOK — 앱 차원의 한도가 없으므로 잔량을 보지 않는다. */
  unlimited: boolean;
}

export interface FillPlan {
  /** 지금 채울 수 있는 수. **주 버튼에 적히는 수가 이것이다.** */
  fillable: number;
  /** 이번에 못 채우고 남는 수 — 「나머지 N개는 내일」. */
  leftover: number;
  /** ① 얼굴(무료 경로가 주 버튼)로 갈 것인가. false 면 ②·③(광고 · 내일 · Pro). */
  canFill: boolean;
  /** 잔량을 아직 모른다 — 개수 자리에 「—」를 적는다. */
  quotaUnknown: boolean;
}

/** 대상·잔량으로 시트의 숫자와 갈래를 한 번에 정한다. */
export function planFill(s: FillPlanInput): FillPlan {
  const known = s.unlimited ? s.bareCount : s.quotaLeft;
  const quotaUnknown = known == null;
  const fillable = quotaUnknown ? s.bareCount : Math.min(known, s.bareCount);
  return {
    fillable,
    leftover: s.bareCount - fillable,
    // 🔴 순서가 뜻이다 — 「다 채웠다」를 먼저 걸러야 광고를 권하지 않는다.
    canFill: s.bareCount === 0 || quotaUnknown || fillable > 0,
    quotaUnknown,
  };
}
