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
    </G>
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
