import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';

export type StatusBadgeType = 'learning' | 'completed' | 'curated' | 'plan-progress' | 'plan-done' | 'plan-overdue' | 'plan-inactive';

interface StatusBadgeProps {
  type: StatusBadgeType;
}

export default function StatusBadge({ type }: StatusBadgeProps) {
  const { colors } = useTheme();

  const config: Record<StatusBadgeType, { label: string; text: string; bg: string }> = {
    learning: { label: '학습 중', text: colors.primary, bg: colors.primaryLight },
    completed: { label: '완료', text: colors.textTertiary, bg: colors.borderLight },
    curated: { label: '모음', text: colors.secondary, bg: colors.secondaryLight },
    'plan-progress': { label: '진행중', text: colors.primary, bg: colors.primaryLight },
    'plan-done': { label: '완료', text: colors.success, bg: colors.successLight },
    'plan-overdue': { label: '기간만료', text: colors.error, bg: colors.errorLight },
    'plan-inactive': { label: '중단됨', text: colors.warning, bg: colors.warningLight },
  };

  const { label, text, bg } = config[type];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {type === 'curated' && (
        <Ionicons name="sparkles" size={10} color={text} style={{ marginRight: 4 }} />
      )}
      <Text style={[styles.badgeText, { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'Pretendard_600SemiBold',
  },
});
