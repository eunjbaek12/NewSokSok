import React from 'react';
import { StyleSheet, Text, View, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { Radius } from '@/constants/tokens';
import { useStatsSummary } from './useStats';

/**
 * 스트릭·외운 단어 컴팩트 스트립. 탭하면 전체 통계 화면(/stats)으로 이동한다.
 * 홈 탭 검색창 아래에 상시 노출된다(스트릭은 매일 보여야 동기부여로 작동).
 */
export default function StatsStrip({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const stats = useStatsSummary();

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/stats');
      }}
      accessibilityRole="button"
      accessibilityLabel={t('stats.title')}
      style={({ pressed }) => [
        styles.strip,
        { backgroundColor: colors.surface, borderColor: colors.borderLight, opacity: pressed ? 0.85 : 1 },
        style,
      ]}
    >
      <View style={styles.statCell}>
        <Text style={[styles.statBig, { color: colors.warning }]}>
          🔥 {t('stats.daysValue', { count: stats?.currentStreak ?? 0 })}
        </Text>
        <Text style={[styles.statCap, { color: colors.textTertiary }]}>{t('stats.streakLabel')}</Text>
      </View>
      <View style={[styles.statVDivider, { backgroundColor: colors.borderLight }]} />
      <View style={styles.statCell}>
        <Text style={[styles.statBig, { color: colors.text }]}>
          {t('stats.wordsValue', { count: stats?.totalMemorized ?? 0 })}
        </Text>
        <Text style={[styles.statCap, { color: colors.textTertiary }]}>{t('stats.memorizedLabel')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statBig: {
    fontSize: 20,
    fontFamily: 'Pretendard_700Bold',
  },
  statCap: {
    fontSize: 11.5,
    fontFamily: 'Pretendard_500Medium',
  },
  statVDivider: {
    width: 1,
    height: 30,
    marginHorizontal: 4,
  },
});
