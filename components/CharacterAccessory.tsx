import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Path, Ellipse } from 'react-native-svg';
import type { CharacterAccessory as AccessoryType } from '@/features/theme/types';

interface Props {
  accessory: AccessoryType;
  size: number;
}

export function CharacterAccessory({ accessory, size }: Props) {
  if (accessory === 'none') return null;

  return (
    <Svg
      viewBox="0 0 250 250"
      width={size}
      height={size}
      style={StyleSheet.absoluteFillObject}
    >
      {accessory === 'y2k-ribbon' && <Y2kRibbon />}
      {accessory === 'ocean-hat' && <OceanHat />}
    </Svg>
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
