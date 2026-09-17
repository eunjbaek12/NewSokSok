import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import type { useTheme } from '@/features/theme';
import { FontSize, FontWeight } from '@/constants/tokens';
import type { SheetMark } from './sheet';

// 시험지 화면과 결과 화면 답안지가 같이 쓰는 조각. 채점한 줄과 답안지의 줄이 같은 모양이어야
// «채점한 그대로 남았다»(D21)가 눈으로 확인된다.

export type SheetColors = ReturnType<typeof useTheme>['colors'];

/**
 * 띄어쓰기 없는 한 낱말은 한 줄에 두고 글자를 줄여 맞춘다.
 *
 * 🔴 실기(Galaxy S22, 9/17): 답 칸이 약 111dp 라 «prognostication» 이 «prognosticatio / n» 으로
 *    **낱말 한가운데서** 끊겼다. 띄어쓰기가 없으면 줄을 바꿀 자리가 없어 글자 단위로 자르기 때문이다.
 *    띄어쓰기가 있는 구(«palliative care»)는 그 자리에서 줄을 바꾸는 게 자연스러우니 그대로 둔다.
 */
export function fitWordProps(text: string) {
  return /\s/.test(text.trim())
    ? {}
    : { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.6 } as const;
}

/** «정답  빌리다» — 적은 답이 맞았지만 정답과 글자가 다를 때 옆에 적어 준다. */
export function AnswerKey({ answer, colors, t }: { answer: string; colors: SheetColors; t: TFunction }) {
  return (
    <Text style={[styles.key, { color: colors.textSecondary }]}>
      <Text style={{ color: colors.textTertiary }}>{t('testSheet.correctAnswer')}  </Text>
      {answer}
    </Text>
  );
}

/** 맞은 줄 청록 ○, 틀린 줄 주황 ✕(D17). 모양이 달라 색 없이도 구분된다. */
export function MarkIcon({ mark, colors, onPress, label }: {
  mark: SheetMark;
  colors: SheetColors;
  onPress?: () => void;
  label: string;
}) {
  const icon = (
    <Ionicons
      name={mark === 'ok' ? 'checkmark-circle' : 'close-circle'}
      size={22}
      color={mark === 'ok' ? colors.primary : colors.warning}
    />
  );
  if (!onPress) {
    return <View accessible accessibilityLabel={label}>{icon}</View>;
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={12}>
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  key: {
    fontSize: FontSize.label,
    fontFamily: FontWeight.regular,
    lineHeight: 17,
  },
});
