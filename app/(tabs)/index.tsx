import React, { useMemo, useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { useSettings, type CustomStudySettings } from '@/contexts/SettingsContext';
import { computePlanStatus, computeDayStudyStatus, type StudyState } from '@/lib/plan-engine';
import type { PlanStatus } from '@/lib/types';
import CustomStudyModal from '@/components/CustomStudyModal';
import ProgressBar from '@/components/ui/ProgressBar';

function getStudyStateConfig(state: StudyState, t: (key: string) => string) {
  switch (state) {
    case 'needs-study':
      return { label: t('home.needsStudy'), bgColor: 'warningLight' as const, textColor: 'warning' as const, actionLabel: t('home.needsStudyAction') };
    case 'studying':
      return { label: t('home.studying'), bgColor: 'primaryLight' as const, textColor: 'primary' as const, actionLabel: t('home.studyingAction') };
    case 'completed':
      return { label: t('home.completed'), bgColor: 'successLight' as const, textColor: 'success' as const, actionLabel: t('home.completedAction') };
  }
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { lists, loading, clearPlan } = useVocab();
  const { t } = useTranslation();
  const { dashboardFilterMode: filterMode, updateDashboardFilter } = useSettings();
  const [showCustomStudy, setShowCustomStudy] = useState(false);
  const [customStudyPresetFilter, setCustomStudyPresetFilter] = useState<CustomStudySettings['wordFilter'] | undefined>();

  const topPadding = Platform.OS === 'web' ? insets.top + 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 120 + 34 : 120;

  const planItems = useMemo(() => {
    const now = Date.now();
    const STATUS_ORDER: Record<string, number> = { 'in-progress': 0, overdue: 1, inactive: 2 };
    return lists
      .filter(l => l.isVisible)
      .map(l => ({
        list: l,
        status: computePlanStatus(l, l.words, now) as PlanStatus,
        dayStatus: computeDayStudyStatus(l, l.words, now),
      }))
      .filter(p => p.status === 'in-progress' || p.status === 'overdue' || p.status === 'inactive')
      .sort((a, b) => {
        const diff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
        if (diff !== 0) return diff;
        return (b.list.planUpdatedAt ?? 0) - (a.list.planUpdatedAt ?? 0);
      });
  }, [lists]);

  const activeItems = useMemo(() => planItems.filter(p => p.status === 'in-progress'), [planItems]);
  const staleItems = useMemo(() => planItems.filter(p => p.status !== 'in-progress'), [planItems]);

  const filteredActive = useMemo(() => {
    if (filterMode === 'studying') return activeItems.filter(p => p.dayStatus.state !== 'completed');
    if (filterMode === 'completed') return activeItems.filter(p => p.dayStatus.state === 'completed');
    return activeItems;
  }, [activeItems, filterMode]);

  const wrongWordCount = useMemo(() => {
    return lists
      .filter(l => l.isVisible)
      .flatMap(l => l.words)
      .filter(w => (w.wrongCount ?? 0) > 0)
      .length;
  }, [lists]);

  const starredWordCount = useMemo(() => {
    return lists
      .filter(l => l.isVisible)
      .flatMap(l => l.words)
      .filter(w => w.isStarred)
      .length;
  }, [lists]);

  const handleCustomStudy = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCustomStudyPresetFilter(undefined);
    setShowCustomStudy(true);
  }, []);

  const handleWrongWordStudy = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCustomStudyPresetFilter('wrongCount');
    setShowCustomStudy(true);
  }, []);

  const handleStarredWordStudy = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCustomStudyPresetFilter('starred');
    setShowCustomStudy(true);
  }, []);

  const handlePlanPress = useCallback((listId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/plan/[id]', params: { id: listId } });
  }, []);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
      >
        {/* 0: Header / Greeting */}
        <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
          <Text style={[styles.greeting, { color: colors.text }]}>
            {t('home.greeting')} <Text style={{ color: colors.primary }}>{t('home.learner')}</Text>
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('home.subtitle')}
          </Text>
        </View>

        {/* 1: Sticky Search Bar */}
        <View style={[styles.searchBarWrapper, { backgroundColor: colors.background }]}>
          <Pressable
            onPress={() => router.push('/search-modal')}
            style={({ pressed }) => [
              styles.searchTrigger,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderLight,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="search" size={20} color={colors.textTertiary} />
            <Text style={[styles.searchTriggerText, { color: colors.textTertiary }]}>
              {t('home.searchPlaceholder')}
            </Text>
          </Pressable>
        </View>

        {/* 2: Content */}
        <View style={styles.content}>
          {/* Quick Action Cards */}
          <View style={styles.quickActionRow}>
            {/* 맞춤 학습 */}
            <Pressable
              onPress={handleCustomStudy}
              style={({ pressed }) => [styles.quickCard, { opacity: pressed ? 0.85 : 1 }]}
            >
              <LinearGradient
                colors={isDark ? ['#1E3A5F', '#2D5A9E'] : ['#3182F6', '#5BA0FC']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.quickCardGradient}
              />
              <View style={styles.quickCardIconWrap}>
                <Ionicons name="flash" size={24} color="#FFFFFF" />
              </View>
              <Text style={styles.quickCardLabelWhite}>{t('home.customStudy')}</Text>
            </Pressable>

            {/* 오답 정복 */}
            <Pressable
              onPress={wrongWordCount > 0 ? handleWrongWordStudy : undefined}
              disabled={wrongWordCount === 0}
              style={({ pressed }) => [
                styles.quickCard,
                {
                  backgroundColor: wrongWordCount > 0
                    ? (isDark ? colors.errorLight : '#FFF5F5')
                    : colors.surface,
                  borderColor: wrongWordCount > 0
                    ? (isDark ? 'rgba(248,81,73,0.3)' : 'rgba(239,68,68,0.15)')
                    : (isDark ? colors.border : colors.borderLight),
                  opacity: pressed && wrongWordCount > 0 ? 0.85 : (wrongWordCount === 0 ? 0.5 : 1),
                },
              ]}
            >
              <View style={styles.quickCardIconWrap}>
                <Ionicons name="alert-circle" size={24} color={wrongWordCount > 0 ? colors.error : colors.textTertiary} />
                {wrongWordCount > 0 && (
                  <View style={[styles.quickCardBadge, { backgroundColor: colors.error }]}>
                    <Text style={styles.quickCardBadgeText}>{wrongWordCount}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.quickCardLabel, { color: colors.text }]}>{t('home.wrongWords')}</Text>
            </Pressable>

            {/* 별표 학습 */}
            <Pressable
              onPress={starredWordCount > 0 ? handleStarredWordStudy : undefined}
              disabled={starredWordCount === 0}
              style={({ pressed }) => [
                styles.quickCard,
                {
                  backgroundColor: starredWordCount > 0
                    ? (isDark ? colors.warningLight : '#FFFBEB')
                    : colors.surface,
                  borderColor: starredWordCount > 0
                    ? (isDark ? 'rgba(245,158,11,0.3)' : 'rgba(245,158,11,0.15)')
                    : (isDark ? colors.border : colors.borderLight),
                  opacity: pressed && starredWordCount > 0 ? 0.85 : (starredWordCount === 0 ? 0.5 : 1),
                },
              ]}
            >
              <View style={styles.quickCardIconWrap}>
                <Ionicons name="star" size={24} color={starredWordCount > 0 ? colors.warning : colors.textTertiary} />
                {starredWordCount > 0 && (
                  <View style={[styles.quickCardBadge, { backgroundColor: colors.warning }]}>
                    <Text style={styles.quickCardBadgeText}>{starredWordCount}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.quickCardLabel, { color: colors.text }]}>{t('home.starredWords')}</Text>
            </Pressable>
          </View>

          {/* Active Plans Section */}
          <View style={styles.section}>
            {/* Section Header: Title + Count + Filters + Collapse */}
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('home.studyingLists')}</Text>
                {activeItems.length > 0 && (
                  <View style={[styles.countBadge, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.countBadgeText, { color: colors.primary }]}>
                      {activeItems.length}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.sectionHeaderRight}>
                {activeItems.length > 0 && (
                  <View style={styles.filterChipRow}>
                    {([['studying', t('home.filterStudying')], ['completed', t('home.filterCompleted')]] as const).map(([key, label]) => (
                      <Pressable
                        key={key}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          updateDashboardFilter(key);
                        }}
                        style={[
                          styles.filterChip,
                          {
                            backgroundColor: filterMode === key ? colors.primary : colors.surfaceSecondary,
                          },
                        ]}
                      >
                        <Text style={[
                          styles.filterChipText,
                          { color: filterMode === key ? '#FFFFFF' : colors.textSecondary },
                        ]}>
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* Cards */}
              <>
                {/* In-progress plan cards */}
                {filteredActive.map(({ list, dayStatus }) => {
                  const statusConfig = getStudyStateConfig(dayStatus.state, t);
                  return (
                    <Pressable
                      key={list.id}
                      onPress={() => handlePlanPress(list.id)}
                      style={({ pressed }) => [
                        styles.planCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: dayStatus.state === 'completed'
                            ? (isDark ? 'rgba(63,185,80,0.2)' : 'rgba(34,197,94,0.15)')
                            : (isDark ? colors.border : 'rgba(49,130,246,0.08)'),
                          shadowColor: colors.cardShadow,
                          opacity: pressed ? 0.92 : 1,
                        },
                      ]}
                    >
                      <View style={styles.planCardTop}>
                        <View style={styles.planCardTitleArea}>
                          {list.icon && (
                            <Text style={{ fontSize: 18 }}>{list.icon}</Text>
                          )}
                          <Text style={[styles.planCardTitle, { color: colors.text }]} numberOfLines={1}>
                            {list.title}
                          </Text>
                        </View>
                        <View style={styles.planCardChips}>
                          <View style={[styles.dayBadge, { backgroundColor: colors.primaryLight }]}>
                            <Text style={[styles.dayBadgeText, { color: colors.primary }]}>
                              Day {dayStatus.displayDay}
                            </Text>
                          </View>
                          <View style={[styles.statusChip, { backgroundColor: colors[statusConfig.bgColor] }]}>
                            <Text style={[styles.statusChipText, { color: colors[statusConfig.textColor] }]}>
                              {statusConfig.label}
                            </Text>
                          </View>
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              Alert.alert(
                                t('home.stopStudyTitle'),
                                t('home.stopStudyMessage'),
                                [
                                  { text: t('common.cancel'), style: 'cancel' },
                                  {
                                    text: t('common.confirm'),
                                    style: 'destructive',
                                    onPress: () => {
                                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                      clearPlan(list.id);
                                    },
                                  },
                                ],
                              );
                            }}
                            style={({ pressed }) => [
                              styles.closeButton,
                              { opacity: pressed ? 0.5 : 0.6 },
                            ]}
                            hitSlop={8}
                          >
                            <Ionicons name="close" size={18} color={colors.textTertiary} />
                          </Pressable>
                        </View>
                      </View>
                      <View style={styles.planCardBottom}>
                        <View style={styles.planCardBottomLeft}>
                          <ProgressBar percent={dayStatus.dayTotal > 0 ? Math.round((dayStatus.dayMemorized / dayStatus.dayTotal) * 100) : 0} colors={colors} />
                          <View style={styles.planStatsRow}>
                            <Text style={[styles.planWordCount, { color: colors.textTertiary }]}>
                              {t('home.dayProgress', { day: dayStatus.displayDay, memorized: dayStatus.dayMemorized, total: dayStatus.dayTotal })}
                            </Text>
                            <Text style={[styles.planStatsPercent, {
                              color: dayStatus.dayTotal > 0 && dayStatus.dayMemorized === dayStatus.dayTotal ? colors.success : colors.primary,
                            }]}>
                              {dayStatus.dayTotal > 0 ? Math.round((dayStatus.dayMemorized / dayStatus.dayTotal) * 100) : 0}%
                            </Text>
                          </View>
                        </View>
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            handlePlanPress(list.id);
                          }}
                          style={({ pressed }) => [
                            styles.actionButton,
                            {
                              backgroundColor: dayStatus.state === 'completed'
                                ? colors.surfaceSecondary
                                : colors.primary,
                              opacity: pressed ? 0.85 : 1,
                            },
                          ]}
                        >
                          <Text style={[
                            styles.actionButtonText,
                            {
                              color: dayStatus.state === 'completed'
                                ? colors.textSecondary
                                : '#FFFFFF',
                            },
                          ]}>
                            {statusConfig.actionLabel}
                          </Text>
                        </Pressable>
                      </View>
                    </Pressable>
                  );
                })}

                {/* Overdue / Inactive plan cards */}
                {staleItems.map(({ list, dayStatus, status }) => {
                  const staleLabel = status === 'overdue' ? t('home.expired') : t('home.inactive');
                  const staleBg = status === 'overdue' ? colors.errorLight : colors.warningLight;
                  const staleColor = status === 'overdue' ? colors.error : colors.warning;
                  const staleBorder = status === 'overdue'
                    ? (isDark ? 'rgba(248,81,73,0.2)' : 'rgba(239,68,68,0.15)')
                    : (isDark ? 'rgba(210,153,34,0.2)' : 'rgba(245,158,11,0.15)');
                  return (
                    <View
                      key={list.id}
                      style={[
                        styles.planCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: staleBorder,
                          shadowColor: colors.cardShadow,
                        },
                      ]}
                    >
                      <View style={styles.planCardTop}>
                        <View style={styles.planCardTitleArea}>
                          {list.icon && (
                            <Text style={{ fontSize: 18 }}>{list.icon}</Text>
                          )}
                          <Text style={[styles.planCardTitle, { color: colors.text }]} numberOfLines={1}>
                            {list.title}
                          </Text>
                        </View>
                        <View style={styles.planCardChips}>
                          <View style={[styles.dayBadge, { backgroundColor: colors.primaryLight }]}>
                            <Text style={[styles.dayBadgeText, { color: colors.primary }]}>
                              Day {dayStatus.displayDay}
                            </Text>
                          </View>
                          <View style={[styles.statusChip, { backgroundColor: staleBg }]}>
                            <Text style={[styles.statusChipText, { color: staleColor }]}>
                              {staleLabel}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.planCardBottom}>
                        <View style={styles.planCardBottomLeft}>
                          <ProgressBar percent={dayStatus.dayTotal > 0 ? Math.round((dayStatus.dayMemorized / dayStatus.dayTotal) * 100) : 0} colors={colors} />
                          <View style={styles.planStatsRow}>
                            <Text style={[styles.planWordCount, { color: colors.textTertiary }]}>
                              {t('home.dayProgress', { day: dayStatus.displayDay, memorized: dayStatus.dayMemorized, total: dayStatus.dayTotal })}
                            </Text>
                            <Text style={[styles.planStatsPercent, {
                              color: dayStatus.dayTotal > 0 && dayStatus.dayMemorized === dayStatus.dayTotal ? colors.success : colors.primary,
                            }]}>
                              {dayStatus.dayTotal > 0 ? Math.round((dayStatus.dayMemorized / dayStatus.dayTotal) * 100) : 0}%
                            </Text>
                          </View>
                        </View>
                        <View style={styles.staleActionRow}>
                          <Pressable
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              clearPlan(list.id);
                            }}
                            style={({ pressed }) => [
                              styles.actionButton,
                              {
                                backgroundColor: colors.surface,
                                borderWidth: 1,
                                borderColor: colors.border,
                                opacity: pressed ? 0.85 : 1,
                              },
                            ]}
                          >
                            <Text style={[styles.actionButtonText, { color: colors.error }]}>
                              {t('home.endStudy')}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handlePlanPress(list.id)}
                            style={({ pressed }) => [
                              styles.actionButton,
                              {
                                backgroundColor: colors.primary,
                                opacity: pressed ? 0.85 : 1,
                              },
                            ]}
                          >
                            <Text style={[styles.actionButtonText, { color: '#FFFFFF' }]}>
                              {t('home.restartStudy')}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  );
                })}

                {/* Empty state */}
                {planItems.length === 0 && (
                  <View style={[styles.emptyPlans, { backgroundColor: colors.surface, borderColor: isDark ? colors.border : colors.borderLight }]}>
                    <Ionicons name="rocket-outline" size={40} color={colors.textTertiary} />
                    <Text style={[styles.emptyPlansTitle, { color: colors.text }]}>
                      {t('home.emptyTitle')}
                    </Text>
                    <Text style={[styles.emptyPlansSubtitle, { color: colors.textTertiary }]}>
                      {t('home.emptySubtitle')}
                    </Text>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.navigate('/(tabs)/vocab-lists' as any);
                      }}
                      style={({ pressed }) => [
                        styles.emptyPlansLink,
                        { backgroundColor: colors.primaryLight, opacity: pressed ? 0.8 : 1 },
                      ]}
                    >
                      <Ionicons name="library-outline" size={16} color={colors.primary} />
                      <Text style={[styles.emptyPlansLinkText, { color: colors.primary }]}>
                        {t('home.goToVocabLists')}
                      </Text>
                    </Pressable>
                  </View>
                )}

                {/* Filtered empty state */}
                {planItems.length > 0 && filteredActive.length === 0 && staleItems.length === 0 && (
                  <Text style={[styles.filterEmptyText, { color: colors.textTertiary }]}>
                    {filterMode === 'completed' ? t('home.noCompletedLists') : t('home.noStudyingLists')}
                  </Text>
                )}
              </>
          </View>

        </View>
      </ScrollView>

      <CustomStudyModal
        visible={showCustomStudy}
        onClose={() => setShowCustomStudy(false)}
        initialFilter={customStudyPresetFilter}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  greeting: {
    fontSize: 26,
    fontFamily: 'Pretendard_700Bold',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    marginTop: 4,
  },
  searchBarWrapper: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  searchTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  searchTriggerText: {
    fontSize: 15,
    fontFamily: 'Pretendard_400Regular',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },

  // Quick Action Cards
  quickActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  quickCard: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  quickCardGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
  },
  quickCardIconWrap: {
    position: 'relative',
    marginBottom: 6,
  },
  quickCardLabelWhite: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  quickCardLabel: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
    textAlign: 'center',
  },
  quickCardBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  quickCardBadgeText: {
    fontSize: 10,
    fontFamily: 'Pretendard_700Bold',
    color: '#FFFFFF',
  },

  // Section
  section: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Pretendard_700Bold',
    letterSpacing: -0.3,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
  },
  countBadgeText: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
  },

  // Filter Chips
  filterChipRow: {
    flexDirection: 'row',
    gap: 4,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  filterChipText: {
    fontSize: 11,
    fontFamily: 'Pretendard_600SemiBold',
  },

  // Plan Card
  planCard: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  planCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  planCardTitleArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  planCardTitle: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
    flexShrink: 1,
  },
  planCardChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  closeButton: {
    marginLeft: 'auto',
    padding: 2,
  },
  dayBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  dayBadgeText: {
    fontSize: 12,
    fontFamily: 'Pretendard_700Bold',
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusChipText: {
    fontSize: 11,
    fontFamily: 'Pretendard_600SemiBold',
  },
  planCardBottom: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    marginTop: 8,
  },
  planCardBottomLeft: {
    flex: 1,
    justifyContent: 'center',
  },
  planStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  planStatsPercent: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
  },
  planWordCount: {
    fontSize: 13,
    fontFamily: 'Pretendard_500Medium',
  },
  actionButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
  },
  actionButtonText: {
    fontSize: 12,
    fontFamily: 'Pretendard_600SemiBold',
  },
  staleActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterEmptyText: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'center',
    paddingVertical: 20,
  },

  // Empty Plans
  emptyPlans: {
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyPlansTitle: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
    marginTop: 4,
  },
  emptyPlansSubtitle: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'center',
  },
  emptyPlansLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    marginTop: 8,
  },
  emptyPlansLinkText: {
    fontSize: 14,
    fontFamily: 'Pretendard_600SemiBold',
  },

});
