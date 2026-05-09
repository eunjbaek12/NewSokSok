import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';

export type StatusBadgeType = 'learning' | 'completed' | 'curated' | 'ai-generated' | 'plan-progress' | 'plan-done' | 'plan-overdue' | 'plan-inactive';

interface StatusBadgeProps {
  type: StatusBadgeType;
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export default function StatusBadge({ type }: StatusBadgeProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const config: Record<StatusBadgeType, { label: string; text: string; bg: string; icon?: IconName }> = {
    learning: { label: t('status.studying'), text: colors.primary, bg: colors.primaryLight },
    completed: { label: t('status.completed'), text: colors.textTertiary, bg: colors.borderLight },
    curated: { label: t('status.curated'), text: colors.secondary, bg: colors.secondaryLight, icon: 'library-outline' },
    'ai-generated': { label: t('status.aiGenerated'), text: colors.accent, bg: colors.accentLight, icon: 'sparkles' },
    'plan-progress': { label: t('status.planInProgress'), text: colors.primary, bg: colors.primaryLight },
    'plan-done': { label: t('status.planCompleted'), text: colors.success, bg: colors.successLight },
    'plan-overdue': { label: t('status.planExpired'), text: colors.error, bg: colors.errorLight },
    'plan-inactive': { label: t('status.planInactive'), text: colors.warning, bg: colors.warningLight },
  };

  const { label, text, bg, icon } = config[type];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon && (
        <Ionicons name={icon} size={10} color={text} style={{ marginRight: 4 }} />
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
