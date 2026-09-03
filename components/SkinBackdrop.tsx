import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type { SkinId } from '@/features/theme';

/**
 * 스킨 전용 홈 배경 그림.
 *
 * `OceanBackdrop`(파도)과 같은 자리·같은 규칙이다 — container의 첫 자식(맨 뒤
 * 레이어)으로 깔고 `pointerEvents="none"`이라 콘텐츠 터치를 막지 않는다. 헤더·
 * 카드가 위를 덮으므로 그림은 배경 여백으로만 비친다.
 *
 * 다른 점은 둘이다. 파도는 화면 하단 210px 띠에 SVG로 그렸지만 이쪽은
 * **화면 전체를 덮는 이미지 한 장**이고, `opacity`로 눌러 얹는다.
 *
 * 🔑 왜 그림이 눌려 있나 — 카드 테두리(#E3CDB0/#C9AC82)가 묻히면 안 되기 때문이다.
 *    실기(갤럭시 S22)에서 25·35·40%를 대조해 35%로 정했다. 100%는 카드가 그림에
 *    파묻히고, 25%는 지붕이 뭉개진다. 값을 바꾸려면 눈으로 다시 볼 것.
 *
 * 🔑 그림 규격과 구도 제약은 `docs/skin-art-brief.md`에 있다. 요지는 하나 —
 *    화면 가운데는 카드가 덮으므로 그림의 무게가 위쪽에 있고 가운데는 비어 있다.
 *    (그 빈 자리는 9:16 원본을 1080×2340으로 늘릴 때 쓰인 자리이기도 하다.)
 */

const ART: Partial<Record<SkinId, ReturnType<typeof require>>> = {
  autumn: require('@/assets/images/skin-autumn-bg.webp'),
  hangul: require('@/assets/images/skin-hanok-bg.webp'),
};

const OPACITY = 0.35;

export function SkinBackdrop({ skinId }: { skinId: SkinId }) {
  const source = ART[skinId];
  if (!source) return null;

  // pointerEvents 를 Image 가 받지 않으므로 View 로 감싼다 — 파도 배경도 같은 꼴이다.
  // 배경 그림에는 읽을 것이 없어 스크린리더에서도 숨긴다. 이름을 주면 화면마다
  // 무의미한 항목이 하나씩 늘어난다.
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={source}
        style={[StyleSheet.absoluteFill, { opacity: OPACITY }]}
        resizeMode="cover"
      />
    </View>
  );
}
