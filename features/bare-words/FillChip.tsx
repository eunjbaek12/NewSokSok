/**
 * 진도 줄에 얹히는 채우기 상태 칩 — 배너가 카드를 먹지 않게 하려고 접어 놓은 자리.
 *
 * 무엇을 그릴지는 chip.ts 가 정한다(그 머리말에 왜 칩인지가 있다). 여기는 그림만 그린다.
 *
 * 🔴 **`overflow: 'hidden'` 을 쓰면 안 된다 — 자식이 사라진다.** 실기(Galaxy S22)에서
 * 배경색이 있는 칩(진행·완료·주황)만 **알약만 그려지고 아이콘·숫자가 통째로 안 보였다.**
 * 테두리 칩(배경 transparent)은 멀쩡했으니 갈리는 것은 backgroundColor 하나였고, 값은
 * 정상이었다(화면에 상태를 찍어 `c0/8w` 로 확인 — 라벨도 톤도 맞는데 화면에만 없었다).
 *
 * 🔑 CLAUDE.md 의 «배경색 + borderRadius 는 overflow:'hidden' 이 필요하다»는 **자식이 없는
 * 점(dot)의 이야기다.** 패딩과 자식을 가진 알약에서는 그것 없이도 Android 가 둥글게 그리고,
 * 오히려 넣으면 자식을 잘라낸다 — 같은 화면에서 둘 다 확인했다.
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
        {/* 🔴 11 은 checkmark 가 잘려 «⌃» 로 보였다. 12 는 나머지 넷도 그대로 읽힌다. */}
        <Ionicons name={chip.icon} size={12} color={fg} />
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
    // 🔴 overflow: 'hidden' 을 넣지 말 것 — 위 머리말 참고(자식이 사라진다).
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
