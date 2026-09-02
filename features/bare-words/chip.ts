/**
 * 배너가 칩이 될 때 무엇을 그릴 것인가 — 순수 함수.
 *
 * 예문 학습 화면에서 배너는 **카드의 몫을 먹는다.** 헤더가 커지면 body 가 밀리고, body 안에서
 * `cardArea` 만 flex:1 이라 손실을 전부 카드가 받는다(선택지는 flexShrink:0 으로 자리를 먼저
 * 확보한다 — 이전 회귀의 처방이라 건드릴 수 없다). 실측하면 카드가 내줄 수 있는 것은
 * **89dp뿐**인데(무배너 229dp → 바닥 CARD_MIN_HEIGHT 140dp) 배너의 가장 작은 얼굴이 82dp다.
 * 그래서 어느 얼굴이 떠도 문장 칸은 143 → **51dp** 바닥으로 떨어지고, 51dp 는 가장 작은
 * 글자(16dp)로도 두 줄(58dp)이 안 들어가 **모든 문장이 스크롤로 넘어간다** — 사용자 눈에는
 * 잘린 것으로 보인다. 크기 엔진은 잘못이 없다(sentence-size.ts 머리말).
 *
 * 그래서 규칙 하나를 세운다:
 *
 *   **예문 학습 화면에서 채우기 UI 는 카드의 몫을 건드리지 않는다.**
 *
 * 143dp 는 "문제 푸는 동안 100%가 스크롤 없이 들어간다"의 근거값이고, 채우기는 곁가지다.
 * 곁가지가 본체의 근거값을 깎으면 안 된다. 그래서 상태는 **이미 있는 진도 줄 안에서** 칩으로
 * 말하고, 말이 길어지는 것은 전부 시트가 받는다.
 *
 * 🔑 **아이콘이 뜻을 지고, 색은 무게를 진다.** 숫자만으로는 「7」이 무엇의 7인지 알 수 없다.
 * 🔑 색은 둘뿐이다 — 앱 토큰의 `success` 가 `primary` 와 같은 값이라(#2A7B78) 진행과 완료를
 *    색으로 가를 수 없다. 그래서 테두리(할 일) / 채움(도는 중) / 주황(기다림·봐야 할 것)
 *    세 겹으로 나누고, **주황 둘은 숫자 모양이 가른다** — `2/7` 꼴이면 곧 이어지는 429 대기고,
 *    `3` 이면 오늘은 끝이다.
 */

import type { BannerFace } from './face';

export type ChipTone =
  /** 아직 안 한 일 — 테두리만. */
  | 'ghost'
  /** 지금 움직이는 중이거나 방금 끝남 — 채운 색. */
  | 'solid'
  /** 내가 봐야 할 것 — 주황. */
  | 'warn';

export type ChipIcon = 'sparkles' | 'sync' | 'checkmark' | 'alert-circle' | 'time-outline';

export interface ChipView {
  icon: ChipIcon;
  /** 숫자 라벨. 진행 꼴(`2/7`)과 단수(`7`)가 상태를 한 번 더 가른다. */
  label: string;
  tone: ChipTone;
  /** 아이콘을 돌릴 것인가(도는 중에만). */
  spin: boolean;
}

/**
 * 얼굴 하나가 칩 하나로 접힌다. `null` 은 **그릴 것이 없다**(대상 0)는 뜻이다.
 *
 * 🔴 판정을 여기 한 벌로 두는 이유는 face.ts 와 같다 — 아이콘·숫자·색이 각자 판정하면
 * 하나가 분기를 빠뜨린다(rewarded-copy.ts 주석의 그 사고).
 */
export function pickChip(face: BannerFace): ChipView | null {
  switch (face.kind) {
    case 'idle':
      return face.count > 0
        ? { icon: 'sparkles', label: String(face.count), tone: 'ghost', spin: false }
        : null;

    case 'running':
      return { icon: 'sync', label: `${face.filled}/${face.total}`, tone: 'solid', spin: true };

    // 멈추는 중도 **아직 받는 중**이라 도는 얼굴을 쓴다. 다른 것은 시트가 말한다.
    case 'stopping':
      return { icon: 'sync', label: `${face.filled}/${face.total}`, tone: 'solid', spin: true };

    // 기다리는 중 — 주황이되 진행 꼴이라 «곧 이어진다»로 읽힌다.
    case 'waiting':
      return { icon: 'time-outline', label: `${face.filled}/${face.total}`, tone: 'warn', spin: false };

    case 'done':
      return { icon: 'checkmark', label: String(face.filled), tone: 'solid', spin: false };

    // 멈췄든 일부만 채웠든 **받은 것을 말한다.** 남은 수는 시트가 말한다 —
    // 칩이 남은 수로 돌아가면 방금 한 일이 화면에서 사라진다.
    case 'stopped':
    case 'partial':
      return { icon: 'checkmark', label: String(face.filled), tone: 'solid', spin: false };

    case 'notFound':
      return { icon: 'alert-circle', label: String(face.terms.length), tone: 'warn', spin: false };

    // 오늘 한도 — 남은 대상을 센다(오늘 못 하는 수). 단수라 429 대기와 갈린다.
    case 'quota':
      return { icon: 'time-outline', label: String(face.remaining), tone: 'warn', spin: false };
  }
}
