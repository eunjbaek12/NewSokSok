import React, { useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { useSettings } from '@/contexts/SettingsContext';
import { computePlanStatus, computeCurrentDay } from '@/lib/plan-engine';
import ProgressBar from '@/components/ui/ProgressBar';

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { lists, loading, getListProgress } = useVocab();
  const { updateCustomStudySettings } = useSettings();

  const topPadding = Platform.OS === 'web' ? insets.top + 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 120 + 34 : 120;

  const activePlans = useMemo(() => {
    return lists
      .filter(l => l.isVisible)
      .filter(l => computePlanStatus(l, l.words, Date.now()) === 'in-progress')
      .sort((a, b) => (b.planUpdatedAt ?? 0) - (a.planUpdatedAt ?? 0));
  }, [lists]);

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
    router.push('/(tabs)/custom-study');
  }, []);

  const handleWrongWordStudy = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await updateCustomStudySettings({ useAllLists: true, wordFilter: 'wrongCount' });
    router.push('/(tabs)/custom-study');
  }, [updateCustomStudySettings]);

  const handleStarredWordStudy = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await updateCustomStudySettings({ useAllLists: true, wordFilter: 'starred' });
    router.push('/(tabs)/custom-study');
  }, [updateCustomStudySettings]);

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
            안녕하세요, <Text style={{ color: colors.primary }}>학습자</Text>
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            오늘도 열심히 공부해봐요
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
              단어, 뜻, 태그로 검색...
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
              >
                <View style={[styles.quickCardIconBg, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <Ionicons name="flash" size={20} color="#FFFFFF" />
                </View>
                <Text style={styles.quickCardLabelWhite}>맞춤 학습</Text>
              </LinearGradient>
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
              <View style={[styles.quickCardIconBg, {
                backgroundColor: wrongWordCount > 0
                  ? (isDark ? 'rgba(248,81,73,0.2)' : 'rgba(239,68,68,0.12)')
                  : colors.surfaceSecondary,
              }]}>
                <Ionicons name="alert-circle" size={20} color={wrongWordCount > 0 ? colors.error : colors.textTertiary} />
              </View>
              <Text style={[styles.quickCardLabel, { color: colors.text }]}>오답 정복</Text>
              {wrongWordCount > 0 && (
                <View style={[styles.quickCardBadge, { backgroundColor: colors.error }]}>
                  <Text style={styles.quickCardBadgeText}>{wrongWordCount}</Text>
                </View>
              )}
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
              <View style={[styles.quickCardIconBg, {
                backgroundColor: starredWordCount > 0
                  ? (isDark ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.12)')
                  : colors.surfaceSecondary,
              }]}>
                <Ionicons name="star" size={20} color={starredWordCount > 0 ? colors.warning : colors.textTertiary} />
              </View>
              <Text style={[styles.quickCardLabel, { color: colors.text }]}>별표 학습</Text>
              {starredWordCount > 0 && (
                <View style={[styles.quickCardBadge, { backgroundColor: colors.warning }]}>
                  <Text style={styles.quickCardBadgeText}>{starredWordCount}</Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Active Plans Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>학습 중인 단어장</Text>
              {activePlans.length > 0 && (
                <View style={[styles.countBadge, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.countBadgeText, { color: colors.primary }]}>
                    {activePlans.length}
                  </Text>
                </View>
              )}
            </View>

            {activePlans.length > 0 ? (
              activePlans.map((list) => {
                const progress = getListProgress(list.id);
                const currentDay = computeCurrentDay(list.words);
                return (
                  <Pressable
                    key={list.id}
                    onPress={() => handlePlanPress(list.id)}
                    style={({ pressed }) => [
                      styles.planCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: isDark ? colors.border : 'rgba(49, 130, 246, 0.08)',
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
                      <View style={[styles.dayBadge, { backgroundColor: colors.primaryLight }]}>
                        <Text style={[styles.dayBadgeText, { color: colors.primary }]}>
                          Day {currentDay}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.planCardBottom}>
                      <View style={{ flex: 1 }}>
                        <ProgressBar percent={progress.percent} colors={colors} />
                      </View>
                      <Text style={[styles.planPercent, {
                        color: progress.percent === 100 ? colors.success : colors.primary,
                      }]}>
                        {progress.percent}%
                      </Text>
                    </View>
                    <Text style={[styles.planWordCount, { color: colors.textTertiary }]}>
                      {progress.memorized} / {progress.total} 단어 암기
                    </Text>
                  </Pressable>
                );
              })
            ) : (
              <View style={[styles.emptyPlans, { backgroundColor: colors.surface, borderColor: isDark ? colors.border : colors.borderLight }]}>
                <Ionicons name="rocket-outline" size={40} color={colors.textTertiary} />
                <Text style={[styles.emptyPlansTitle, { color: colors.text }]}>
                  아직 진행 중인 학습 계획이 없어요
                </Text>
                <Text style={[styles.emptyPlansSubtitle, { color: colors.textTertiary }]}>
                  단어장 탭에서 학습 계획을 세워보세요!
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
                    단어장으로 이동
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

        </View>
      </ScrollView>
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
    minHeight: 100,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  quickCardGradient: {
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    width: '100%',
    minHeight: 100,
  },
  quickCardIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
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
    top: 8,
    right: 8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  quickCardBadgeText: {
    fontSize: 11,
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
    gap: 8,
    marginBottom: 12,
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

  // Plan Card
  planCard: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
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
    marginRight: 12,
  },
  planCardTitle: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
    flexShrink: 1,
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
  planCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  planPercent: {
    fontSize: 14,
    fontFamily: 'Pretendard_700Bold',
    minWidth: 38,
    textAlign: 'right',
  },
  planWordCount: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
    marginTop: 6,
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
