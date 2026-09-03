import React from 'react';
import { G, Path, Ellipse } from 'react-native-svg';
import type { CharacterAccessory as AccessoryType } from '@/features/theme';

/**
 * 아보카도는 viewBox(0 0 250 250) 한가운데가 아니라 x=113.4에 서 있다
 * (머리 꼭짓점 `m113.4 37.7`, 두 눈 90.09·136.7의 중점 = 113.4).
 * 액세서리는 읽기 쉽게 125 기준으로 그려 두고 이 차이만큼 통째로 민다.
 * 보정이 없던 동안 모자·리본이 11.6단위(56dp에서 화면 2.6px) 오른쪽으로 튀어나와 있었다.
 */
const ACCESSORY_CENTER_OFFSET_X = 113.4 - 125;

/**
 * 캐릭터와 같은 250 viewBox를 쓰므로 `CharacterSvg`의 <Svg> 안에 마지막 자식으로 얹는다.
 * 별도 <Svg>를 절대배치로 겹치지 않는 이유: 그러려면 호출부마다 크기를 맞춘 View로
 * 감싸야 했고, 캐릭터를 그리는 8곳 중 5곳이 그 조립을 빠뜨려 액세서리가 홈에서만 보였다.
 */
export function CharacterAccessoryPaths({ accessory }: { accessory: AccessoryType }) {
  if (accessory === 'none') return null;

  return (
    <G transform={[{ translateX: ACCESSORY_CENTER_OFFSET_X }]}>
      {accessory === 'y2k-ribbon' && <Y2kRibbon />}
      {accessory === 'ocean-hat' && <OceanHat />}
      {accessory === 'autumn-leaf' && <AutumnLeaf />}
      {accessory === 'hangul-gat' && <HangulGat />}
    </G>
  );
}

function AutumnLeaf() {
  // 단풍잎 한 장이 머리 위에 내려앉았다. 모자처럼 머리를 덮지 않고 살짝 얹혀
  // 기울어 있어야 "떨어진 잎"으로 읽힌다 — 반듯하면 장식으로 보인다.
  return (
    <G transform={[{ translateX: 118 }, { translateY: 24 }, { rotate: '-16' }]}>
      {/* 잎자루 */}
      <Path d="M2 30 C0 42, -2 50, -5 56" stroke="#7E4A2A" strokeWidth={3} fill="none" strokeLinecap="round" />
      {/* 잎몸 — 다섯 갈래 단풍 */}
      <Path
        d="M2 30 L-10 22 L-4 20 L-22 8 L-12 8 L-20 -6 L-6 -2 L-4 -16 L2 -6 L8 -16 L10 -2 L24 -6 L16 8 L26 8 L8 20 L14 22 Z"
        fill="#B14A2C"
      />
      {/* 잎맥 — 잎이 평평해 보이지 않게 */}
      <Path d="M2 28 L2 -4 M2 14 L-12 6 M2 14 L16 6 M2 4 L-6 -6 M2 4 L10 -6"
        stroke="#8A3820" strokeWidth={1.4} fill="none" opacity={0.55} strokeLinecap="round" />
    </G>
  );
}

function HangulGat() {
  // 갓 — 조선 시대 사대부의 검은 말총 모자. 밀짚모자와 달리 챙이 평평하고
  // 크라운이 원통형이며, 반투명해 보이는 것이 특징이다.
  return (
    <>
      {/* 챙 아래 그림자 */}
      <Ellipse cx={125} cy={47} rx={78} ry={13} fill="#1A1A1E" opacity={0.28} />
      {/* 양태(챙) — 평평하고 넓다 */}
      <Ellipse cx={125} cy={44} rx={78} ry={13} fill="#2B2B30" />
      <Ellipse cx={125} cy={44} rx={78} ry={13} fill="none" stroke="#45454C" strokeWidth={1.6} />
      {/* 총모자(크라운) — 위가 평평한 원통 */}
      <Path d="M97 44 L97 14 C97 9, 153 9, 153 14 L153 44 Z" fill="#2B2B30" />
      <Ellipse cx={125} cy={14} rx={28} ry={6} fill="#35353B" />
      {/* 말총의 성긴 결 — 갓을 갓처럼 보이게 하는 것은 이 세로선이다 */}
      <Path d="M106 16 L106 43 M116 14 L116 44 M125 13 L125 44 M134 14 L134 44 M144 16 L144 43"
        stroke="#4A4A52" strokeWidth={1.1} opacity={0.6} />
      {/* 갓끈 — 턱 아래로 내려가는 두 줄 */}
      <Path d="M92 46 C88 58, 90 68, 94 76" stroke="#2B2B30" strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.75} />
      <Path d="M158 46 C162 58, 160 68, 156 76" stroke="#2B2B30" strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.75} />
    </>
  );
}

function Y2kRibbon() {
  return (
    <>
      {/* Y2K 리본 — 머리 위쪽 (y≈0~35 영역) */}

      {/* 리본 왼쪽 루프 */}
      <Path
        d="M98 22 C80 8, 60 10, 68 26 C74 38, 95 36, 98 22 Z"
        fill="#E878CE"
      />
      {/* 리본 오른쪽 루프 */}
      <Path
        d="M152 22 C170 8, 190 10, 182 26 C176 38, 155 36, 152 22 Z"
        fill="#E878CE"
      />
      {/* 그림자 왼쪽 루프 */}
      <Path
        d="M98 22 C82 12, 64 14, 70 27 C75 35, 94 34, 98 22 Z"
        fill="#C050A8"
        opacity={0.5}
      />
      {/* 그림자 오른쪽 루프 */}
      <Path
        d="M152 22 C168 12, 186 14, 180 27 C175 35, 156 34, 152 22 Z"
        fill="#C050A8"
        opacity={0.5}
      />
      {/* 리본 중앙 매듭 */}
      <Ellipse cx={125} cy={24} rx={10} ry={8} fill="#E878CE" />
      <Ellipse cx={125} cy={24} rx={6} ry={5} fill="#F0A0E0" />
    </>
  );
}

function OceanHat() {
  // 밀짚모자 — 머리 위에 얹힌다(y≈6~50). 오버레이라 캐릭터를 가리지 않게
  // 챙(brim)을 얇은 타원으로 둬 이마 위쪽에만 걸친다.
  return (
    <>
      {/* 챙 아래 그림자 */}
      <Ellipse cx={125} cy={49} rx={80} ry={15} fill="#B98A3C" opacity={0.35} />
      {/* 챙(brim) */}
      <Ellipse cx={125} cy={46} rx={80} ry={16} fill="#E8C878" />
      <Ellipse cx={125} cy={46} rx={80} ry={16} fill="none" stroke="#CBA457" strokeWidth={2} />
      {/* 크라운(crown) — 위로 볼록한 돔 */}
      <Path
        d="M83 44 C86 16, 108 6, 125 6 C142 6, 164 16, 167 44 C150 38, 100 38, 83 44 Z"
        fill="#E8C878"
      />
      <Path
        d="M83 44 C86 16, 108 6, 125 6 C142 6, 164 16, 167 44 C150 38, 100 38, 83 44 Z"
        fill="#D9B45E"
        opacity={0.45}
      />
      {/* 리본 밴드 — 바다 청록 */}
      <Path
        d="M85 41 C100 35, 150 35, 165 41 C150 46, 100 46, 85 41 Z"
        fill="#0C9AA2"
      />
      {/* 밴드 하이라이트 */}
      <Path
        d="M85 41 C100 36, 150 36, 165 41 C150 43, 100 43, 85 41 Z"
        fill="#3FBEC5"
        opacity={0.6}
      />
    </>
  );
}
