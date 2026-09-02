/**
 * 진도 줄에 얹히는 채우기 상태 칩 — 배너가 카드를 먹지 않게 하려고 접어 놓은 자리.
 *
 * 무엇을 그릴지는 chip.ts 가 정한다(그 머리말에 왜 칩인지가 있다). 여기는 그림만 그린다.
 *
 * 🔴 **`overflow: 'hidden'` 이 반드시 있어야 한다.** 배경색 + borderRadius 만으로는
 * Android(New Arch/Fabric)가 사각형으로 그린다 — 값은 맞는데 네이티브 렌더러가 둥근 경로를
 * 타지 않는다. borderWidth 로는 안 고쳐진다(캘린더 암기 표시에서 다섯 번 틀린 그 자리).
 *
 * 🔴 **터치 타깃은 hitSlop 으로 만든다.** 칩 자체는 진도 줄 안이라 22dp 남짓이고, 줄 높이를
 * 키우면 그만큼 카드가 준다 — 이 기능이 피하려던 바로 그 손해다. 좌우 hitSlop 은 8 로 조인다:
 * 오른쪽 끝에 설정(⚙) 아이콘이 있어 크게 주면 서로 먹는다.
 */

import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/features/theme';
import { FontSize, FontWeight } from '@/constants/tokens';
import type { ChipView } from './chip';

export default function FillChip({ chip, onPress }: { chip: ChipView; onPress: () => void }) {
  const { colors } = useTheme();

  const spin = useSharedValue(0);
  useEffect(() => {
    if (chip.spin) {
      spin.value = 0;
      spin.value = withRepeat(withTiming(360, { duration: 1600, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(spin);
      spin.value = 0;
    }
    return () => cancelAnimation(spin);
  }, [chip.spin, spin]);

  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

  const solid = chip.tone === 'solid';
  const warn = chip.tone === 'warn';
  const bg = solid ? colors.primary : warn ? colors.warning : 'transparent';
  const fg = solid || warn ? colors.onPrimary : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      accessibilityRole="button"
      style={[
        styles.chip,
        { backgroundColor: bg },
        chip.tone === 'ghost' && { borderWidth: 1, borderColor: colors.primary },
      ]}
    >
      <Animated.View style={chip.spin ? spinStyle : undefined}>
        <Ionicons name={chip.icon} size={11} color={fg} />
      </Animated.View>
      <Text style={[styles.label, { color: fg }]}>{chip.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
    // 🔴 위 머리말 참고 — 이것이 없으면 Android 에서 모서리가 각진다.
    overflow: 'hidden',
  },
  // 숫자가 진행(2/7)과 단수(7)를 오가므로 폭이 흔들린다 — tabular 로 고정한다.
  label: { fontSize: FontSize.caption, fontFamily: FontWeight.semibold, fontVariant: ['tabular-nums'] },
});

// 진도 줄에 칩이 들어갈 자리를 비워 두는 쪽(screen.tsx)에서 쓰라고 내보낸다.
export const FILL_CHIP_GAP = 8;

/** 칩이 없을 때도 줄 높이가 흔들리지 않게 하는 자리 지킴이. */
export function FillChipSpacer() {
  return <View style={{ height: 22 }} />;
}
