import React, { useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { VocaList, Word } from '@/lib/types';
import { computePlanStatus } from '@/lib/plan-engine';
import ProgressBar from '@/components/ui/ProgressBar';
import StatusBadge, { StatusBadgeType } from '@/components/ui/StatusBadge';

export function getRelativeTime(timestamp?: number): string {
  if (!timestamp) return '학습 기록 없음';
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60 * 1000) return '방금 전';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}분 전`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}시간 전`;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days === 1) return '어제';
  return `${days}일 전`;
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
  const progress = getListProgress(item.id);
  const relativeTime = getRelativeTime(item.lastStudiedAt);

  const planStatus = React.useMemo(
    () => computePlanStatus(item, item.words, Date.now()),
    [item]
  );

  const statusType = React.useMemo((): StatusBadgeType => {
    if (item.isCurated) return 'curated';
    if (planStatus === 'in-progress') return 'plan-progress';
    if (planStatus === 'completed') return 'plan-done';
    if (planStatus === 'overdue') return 'plan-overdue';
    if (planStatus === 'inactive') return 'plan-inactive';
    if (progress.percent === 100 && progress.total > 0) return 'completed';
    return 'learning';
  }, [item.isCurated, planStatus, progress.percent, progress.total]);

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
            <Text style={[styles.cardTitle, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>
              {item.title}
            </Text>
          </View>
          <Text style={[styles.lastStudied, { color: colors.textTertiary }]}>
            마지막 학습: {relativeTime}
          </Text>
        </View>
        <View style={styles.cardActions}>
          <StatusBadge type={statusType} />
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
        <View style={styles.planActionLeft}>
          <ProgressBar percent={progress.percent} colors={colors} />
          <View style={styles.planStatsRow}>
            <Text style={[styles.planStatsText, { color: colors.textSecondary }]}>
              {progress.memorized} / {progress.total} 단어
            </Text>
            <Text style={[styles.planStatsPercent, {
              color: progress.percent === 100 ? colors.success : colors.primary,
            }]}>
              {progress.percent}%
            </Text>
          </View>
        </View>
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            router.push({ pathname: '/plan/[id]', params: { id: item.id } });
          }}
          style={({ pressed }) => [
            styles.planActionButton,
            {
              backgroundColor: planStatus === 'completed'
                ? colors.surfaceSecondary
                : planStatus === 'overdue'
                  ? colors.warningLight
                  : colors.primary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          hitSlop={4}
        >
          <Text style={[styles.planActionButtonText, {
            color: planStatus === 'completed'
              ? colors.textSecondary
              : planStatus === 'overdue'
                ? colors.warning
                : '#FFFFFF',
          }]}>
            {planStatus === 'none' ? '학습계획'
              : planStatus === 'completed' ? '복습하기' : '학습하기'}
          </Text>
        </Pressable>
      </View>

      {topTags.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {topTags.map((tag, idx) => (
            <View key={idx} style={{ backgroundColor: colors.surfaceSecondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
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
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    marginTop: 12,
  },
  planActionLeft: {
    flex: 1,
    justifyContent: 'center',
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
  planActionButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planActionButtonText: {
    fontSize: 12,
    fontFamily: 'Pretendard_600SemiBold',
  },
});
