import React, { useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { VocaList, Word } from '@/lib/types';
import { computePlanStatus } from '@/lib/plan-engine';
import ProgressBar from '@/components/ui/ProgressBar';
import StatusBadge, { StatusBadgeType } from '@/components/ui/StatusBadge';

export function getRelativeTime(timestamp: number | undefined, t: (key: string, opts?: any) => string): string {
  if (!timestamp) return t('listCard.noStudyRecord');
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60 * 1000) return t('listCard.justNow');
  if (diff < 60 * 60 * 1000) return t('listCard.minutesAgo', { count: Math.floor(diff / (60 * 1000)) });
  if (diff < 24 * 60 * 60 * 1000) return t('listCard.hoursAgo', { count: Math.floor(diff / (60 * 60 * 1000)) });
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days === 1) return t('listCard.yesterday');
  return t('listCard.daysAgo', { count: days });
}

interface ListCardProps {
  item: VocaList;
  getListProgress: (id: string) => { total: number; memorized: number; percent: number };
  getWordsForList: (id: string) => Word[];
  onOpenMenu: (list: VocaList, pos: { x: number; y: number; width: number; height: number }) => void;
}

export default function ListCard({
  item,
  getListProgress,
  getWordsForList,
  onOpenMenu,
}: ListCardProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const progress = getListProgress(item.id);
  const relativeTime = getRelativeTime(item.lastStudiedAt, t);

  const planStatus = React.useMemo(
    () => computePlanStatus(item, item.words, Date.now()),
    [item]
  );

  const statusType = React.useMemo((): StatusBadgeType | null => {
    if (planStatus !== 'none') return 'learning';
    if (item.isCurated) return 'curated';
    return null;
  }, [planStatus, item.isCurated]);

  const topTags = React.useMemo(() => {
    const words = getWordsForList(item.id);
    const counts: Record<string, number> = {};
    for (const w of words) {
      if (w.tags) {
        for (const t of w.tags) {
          counts[t] = (counts[t] || 0) + 1;
        }
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(entry => entry[0]);
  }, [item.id, getWordsForList]);

  const handlePress = () => {
    router.push({ pathname: '/list/[id]', params: { id: item.id } });
  };

  const menuBtnRef = useRef<View>(null);

  const handleContextMenu = () => {
    menuBtnRef.current?.measure((x, y, width, height, pageX, pageY) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onOpenMenu(item, { x: pageX, y: pageY, width, height });
    });
  };

  const handleLongPress = () => {
    handleContextMenu();
  };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: isDark ? colors.border : 'rgba(49, 130, 246, 0.1)',
          shadowColor: colors.cardShadow,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <View style={styles.cardTopRow}>
        <View style={styles.cardTitleArea}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {item.icon && (
              <Text style={{ fontSize: 16 }}>{item.icon}</Text>
            )}
            <Text style={[styles.cardTitle, { color: colors.text, flexShrink: 1 }]} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
          <Text style={[styles.lastStudied, { color: colors.textTertiary }]}>
            {t('listCard.lastStudy', { time: relativeTime })}
          </Text>
        </View>
        <View style={styles.cardActions}>
          {statusType && <StatusBadge type={statusType} />}
          <Pressable
            ref={menuBtnRef}
            onPress={handleContextMenu}
            hitSlop={8}
            style={({ pressed }) => [
              styles.menuBtn,
              { opacity: pressed ? 0.4 : 0.55 },
            ]}
          >
            <Ionicons name="ellipsis-vertical" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.planActionRow}>
        <ProgressBar percent={progress.percent} colors={colors} />
        <View style={styles.planStatsRow}>
          <Text style={[styles.planStatsText, { color: colors.textSecondary }]}>
            {t('listCard.wordProgress', { memorized: progress.memorized, total: progress.total })}
          </Text>
          <Text style={[styles.planStatsPercent, {
            color: progress.percent === 100 ? colors.success : colors.primary,
          }]}>
            {progress.percent}%
          </Text>
        </View>
      </View>

      {topTags.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {topTags.map((tag, idx) => (
            <View key={idx} style={{ backgroundColor: colors.surfaceSecondary, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: 'Pretendard_500Medium' }}>#{tag}</Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitleArea: {
    flex: 1,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 17,
    fontFamily: 'Pretendard_700Bold',
  },
  lastStudied: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
    marginTop: 4,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  menuBtn: {
    padding: 4,
  },
  planActionRow: {
    marginTop: 12,
  },
  planStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  planStatsText: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
  },
  planStatsPercent: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
  },
});
