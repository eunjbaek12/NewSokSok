import React from 'react';
import { View, useWindowDimensions, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

/**
 * 여름 바다 스킨 전용 홈 배경 — 화면 하단에 겹친 물결 밴드.
 *
 * container의 첫 자식(맨 뒤 레이어)으로 깔고 pointerEvents="none"이라
 * 콘텐츠 터치를 막지 않는다. 헤더·검색바·카드가 위를 덮으므로 파도는
 * 배경 여백(빈 상태·스크롤 하단)으로만 비쳐 은은하게 보인다.
 */

const HEIGHT = 210;

export function OceanBackdrop() {
  const { width } = useWindowDimensions();
  const w = Math.max(width, 1);

  // 물결 한 겹: baseY에서 시작해 좌→우로 출렁이고 아래를 채운다.
  const wave = (baseY: number, amp: number, color: string, opacity = 1) => {
    const d =
      `M0 ${baseY}` +
      ` Q ${w * 0.25} ${baseY - amp}, ${w * 0.5} ${baseY}` +
      ` T ${w} ${baseY}` +
      ` L ${w} ${HEIGHT} L 0 ${HEIGHT} Z`;
    return <Path d={d} fill={color} opacity={opacity} />;
  };

  return (
    <View pointerEvents="none" style={[styles.wrap, { width: w, height: HEIGHT }]}>
      <Svg width={w} height={HEIGHT} viewBox={`0 0 ${w} ${HEIGHT}`}>
        {/* 뒤(연한) → 앞(진한) 3겹으로 원근을 준다 */}
        {wave(74, 16, '#CDEBED')}
        {wave(108, 22, '#8FD6DB')}
        {wave(146, 18, '#0C9AA2')}

        {/* 물거품·반짝임 — 흰 점 몇 개로 수면 느낌 */}
        <Circle cx={w * 0.18} cy={64} r={4} fill="#FFFFFF" opacity={0.55} />
        <Circle cx={w * 0.72} cy={56} r={5} fill="#FFFFFF" opacity={0.45} />
        <Circle cx={w * 0.88} cy={78} r={3} fill="#FFFFFF" opacity={0.5} />
        <Circle cx={w * 0.42} cy={92} r={3} fill="#FFFFFF" opacity={0.4} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
