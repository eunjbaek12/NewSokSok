import React, { useMemo, useCallback, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import CharacterSvg from '@/components/CharacterSvg';
import { CharacterAccessory } from '@/components/CharacterAccessory';
import { OceanBackdrop } from '@/components/OceanBackdrop';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Radius } from '@/constants/tokens';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { useLists, useBootstrapLoading, clearPlan, restartPlan } from '@/features/vocab';
import { useSettings } from '@/features/settings';
import { useAuth } from '@/features/auth';
import { setStudySelection } from '@/features/study';
import { computePlanStatus, computeDayStudyStatus, type StudyState } from '@/features/study/plan/engine';
import { selectReviewWords } from '@/features/study/review/engine';
import type { PlanStatus, VocaList } from '@/lib/types';
import ReviewBanner from '@/features/study/review/ReviewBanner';
import ReviewNotifySoftAsk from '@/features/study/review/ReviewNotifySoftAsk';
import { useReviewSoftAsk } from '@/features/study/review/use-review-notifications';
import ProgressBar from '@/components/ui/ProgressBar';
import { StatsStrip } from '@/features/stats';
import { AppBannerAd, useTabContentBottomInset } from '@/components/ads/AppBannerAd';
import { useWhatsNew, WhatsNewSheet } from '@/features/whats-new';

function CircularProgress({ percent, memorized, total, colors }: { percent: number; memorized: number; total: number; colors: any }) {
  const size = 148;
  const strokeWidth = 11;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - percent / 100);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G rotation="-90" origin={`${size / 2},${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.borderLight} strokeWidth={strokeWidth} fill="none" />
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.success} strokeWidth={strokeWidth} fill="none"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
        </G>
      </Svg>
      <Text style={{ fontSize: 30, fontFamily: 'Pretendard_700Bold', color: colors.success }}>{percent}%</Text>
      <Text style={{ fontSize: 13, fontFamily: 'Pretendard_400Regular', color: colors.textTertiary, marginTop: 2 }}>
        {memorized}/{total}
      </Text>
    </View>
  );
}

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
  const { colors, isDark, skin, fontFamily } = useTheme();
  const lists = useLists();
  const loading = useBootstrapLoading();
  const { t } = useTranslation();
  const { dashboardFilterMode: filterMode, updateDashboardFilter, profileSettings } = useSettings();
  const { user } = useAuth();
  const displayName = profileSettings.nickname.trim() || user?.displayName?.split(' ')[0] || t('home.learner');
  const [resultList, setResultList] = useState<VocaList | null>(null);
  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);

  const topPadding = Platform.OS === 'web' ? insets.top + 67 : insets.top;
  const bottomPadding = useTabContentBottomInset(16);

  const planItems = useMemo(() => {
    const now = Date.now();
    const STATUS_ORDER: Record<string, number> = { 'in-progress': 0, overdue: 1, inactive: 2, completed: 3 };
    return lists
      .filter(l => l.isVisible)
      .map(l => ({
        list: l,
        status: computePlanStatus(l, l.words, now) as PlanStatus,
        dayStatus: computeDayStudyStatus(l, l.words, now),
      }))
      .filter(p => p.status === 'in-progress' || p.status === 'overdue' || p.status === 'inactive' || p.status === 'completed')
      .sort((a, b) => {
        const diff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
        if (diff !== 0) return diff;
        return (b.list.planUpdatedAt ?? 0) - (a.list.planUpdatedAt ?? 0);
      });
  }, [lists]);

  const filteredItems = useMemo(() => {
    switch (filterMode) {
      case 'studying':
        return planItems.filter(p =>
          (p.status === 'in-progress' && p.dayStatus.state !== 'completed') ||
          p.status === 'overdue' ||
          p.status === 'inactive'
        );
      case 'completed':
        return planItems.filter(p => p.status === 'in-progress' && p.dayStatus.state === 'completed');
      case 'finished':
        return planItems.filter(p => p.status === 'completed');
      default:
        return planItems;
    }
  }, [planItems, filterMode]);

  const headerSubtitle = useMemo(() => {
    const activePlans = planItems.filter(p => p.status !== 'completed');
    const activePlanCount = activePlans.length;
    if (activePlanCount > 0) {
      const todayDoneCount = activePlans.filter(p => p.dayStatus.state === 'completed').length;
      if (todayDoneCount > 0) {
        return t('home.planSubtitleWithDone', { count: activePlanCount, done: todayDoneCount });
      }
      return t('home.planSubtitle', { count: activePlanCount });
    }
    const tips = t('home.tips', { returnObjects: true }) as string[];
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return tips[dayOfYear % tips.length];
  }, [planItems, t]);

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

  // 오늘의 복습 후보. 상한(20)이 이미 적용된 목록이라 배너 개수와 세션 단어가 항상 같다.
  // `Date.now()`를 memo 안에서 읽으므로 앱을 열어둔 채 자정을 넘기면 lists가 다시
  // 바뀔 때까지 개수가 갱신되지 않는다 — 학습을 하면 곧바로 맞춰지므로 수용한다.
  const reviewWords = useMemo(() => selectReviewWords(lists, Date.now()), [lists]);

  // 첫 복습이 생긴 날의 권한 soft ask(§8.4). 일정 유지(재예약)는 앱 루트의
  // ReviewNotificationScheduler가 상시 담당한다 — 홈 마운트와 무관하게 돌게 하기 위해서.
  const { softAskVisible, handleSoftAskDecided } = useReviewSoftAsk(reviewWords.length);

  // 버전이 올라간 첫 실행에만 값이 들어온다(신규 설치·같은 버전은 null).
  const { announcement: whatsNew, dismiss: dismissWhatsNew } = useWhatsNew();

  const handleReviewStudy = useCallback(() => {
    if (reviewWords.length === 0) return;
    const sel = setStudySelection(reviewWords.map(w => w.id));
    // 복습은 설정을 건너뛰고 항상 카드학습으로 간다(§5.1·§5.4). 홈의 원탭이 전부
    // 카드학습이라는 규칙에 더해 복습만의 이유가 하나 더 있다: "외웠어요/다시 볼게요"
    // 스와이프가 간격 사다리의 입력 그 자체라, 퀴즈로 열면 성공/실패 신호가 사라진다.
    router.push({ pathname: '/flashcards/[id]', params: { id: '__custom__', sel } });
  }, [reviewWords]);

  // 옆의 오답·별표 카드는 앱이 알아서 고르고, 이 카드만 사용자가 조건을 고른다.
  // 팝업이던 것을 전체화면으로 옮긴 이유는 목록 때문이다 — 팝업에서는 고른
  // 조건에 무슨 단어가 걸리는지 보이지 않았고, 검색과 필터도 각자 갖고 있었다.
  const handleCustomStudy = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: '/search-modal', params: { mode: 'pick' } });
  }, []);

  const handleWrongWordStudy = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const words = lists
      .filter(l => l.isVisible)
      .flatMap(l => l.words)
      .filter(w => (w.wrongCount ?? 0) > 0)
      .sort((a, b) => (b.wrongCount ?? 0) - (a.wrongCount ?? 0))
      .slice(0, 50);
    if (words.length === 0) return;
    const sel = setStudySelection(words.map(w => w.id));
    // 홈의 원탭은 전부 카드학습으로 고정한다. 누르면 곧바로 시작하는 버튼인데
    // 다른 화면에 숨은 studyMode 설정 때문에 어떤 날은 카드로, 어떤 날은 퀴즈로
    // 열리면 같은 버튼을 신뢰할 수 없다. 퀴즈는 모드를 고르는 화면에서만 고른다
    // — 단어장 상세·플랜·골라서 학습. customStudySettings.studyMode는 이제
    // 골라서 학습 전용 값이다.
    router.push({ pathname: '/flashcards/[id]', params: { id: '__custom__', sel } });
  }, [lists]);

  const handleStarredWordStudy = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const words = lists
      .filter(l => l.isVisible)
      .flatMap(l => l.words)
      .filter(w => w.isStarred);
    if (words.length === 0) return;
    const sel = setStudySelection(words.map(w => w.id));
    // 오답 정복과 같은 이유로 카드학습 고정 — handleWrongWordStudy의 주석 참고.
    router.push({ pathname: '/flashcards/[id]', params: { id: '__custom__', sel } });
  }, [lists]);

  const handlePlanPress = useCallback((listId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/plan/[id]', params: { id: listId } });
  }, []);

  // "다시 학습"(이어서): 기간 만료(overdue)·중단(inactive) 플랜 모두 진행 상태
  // (planCurrentDay)와 Day 배정을 보존한 채 마감 창만 새로 시작해 'in-progress'로
  // 되돌린다. 재구성(setupPlan)을 거치지 않으므로 외운 단어가 미배정으로 추방되거나
  // Day가 축소되지 않고, 카드도 계속 "기간 만료/중단"에 갇히지 않는다.
  const handleRestartPlan = useCallback(async (listId: string, status: PlanStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (status === 'overdue' || status === 'inactive') {
      await restartPlan(listId);
    }
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
      {/* 여름 바다 스킨 — 홈 하단 파도 배경(맨 뒤 레이어, 터치 통과) */}
      {skin.id === 'ocean' && <OceanBackdrop />}

      {/* Fixed Header / Greeting */}
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <View style={{ width: 56, height: 56 }}>
          <CharacterSvg size={56} isDark={isDark} />
          <CharacterAccessory accessory={skin.characterAccessory} size={56} />
        </View>
        <View style={styles.headerTextArea}>
          <Text style={[styles.greeting, { color: colors.text, fontFamily: fontFamily.bold }]} numberOfLines={1}>
            {t('home.greeting')}<Text style={{ color: colors.primary, fontFamily: fontFamily.bold }}>{displayName}</Text>
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {headerSubtitle}
          </Text>
        </View>
      </View>

      {/* 검색창은 단어장 탭에 하나만 둔다. 검색 대상(내가 저장한 단어)이 사는 곳이
          거기이고, 홈은 "무엇을 할까"를 묻는 자리다. 여기 있을 때는 위치 때문에
          앱 전체 검색으로 읽혔는데 실제로는 개인 단어장만 뒤졌다. */}
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
      >
        {/* Content */}
        <View style={styles.content}>
          {/* 내 학습 스트립 — 스트릭·외운 단어 요약 → /stats (설정 탭에서 이동) */}
          <StatsStrip style={styles.statsStrip} />

          {/* 오늘의 복습 — due>0일 때만 나타난다(0이면 스스로 null을 반환해 홈이 지금과
              똑같아진다). 위치가 퀵액션 바로 위인 건 의도: StatsStrip은 '지표'이고
              복습·맞춤·오답·별표는 '학습 액션'이라 기능으로 묶는다(§5.2). */}
          <ReviewBanner count={reviewWords.length} onPress={handleReviewStudy} style={styles.reviewBanner} />

          {/* Quick Action Cards */}
          <View style={styles.quickActionRow}>
            {/* 맞춤 학습 */}
            <Pressable
              onPress={handleCustomStudy}
              style={({ pressed }) => [styles.quickCard, { opacity: pressed ? 0.85 : 1 }]}
            >
              <LinearGradient
                colors={colors.accentActionGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.quickCardGradient}
              />
              <View style={styles.quickCardIconWrap}>
                <Ionicons name="flash" size={24} color={colors.onPrimary} />
              </View>
              <Text style={[styles.quickCardLabelWhite, { color: colors.onPrimary }]}>{t('home.customStudy')}</Text>
            </Pressable>

            {/* 오답 정복 */}
            <Pressable
              onPress={wrongWordCount > 0 ? handleWrongWordStudy : undefined}
              disabled={wrongWordCount === 0}
              style={({ pressed }) => [
                styles.quickCard,
                {
                  backgroundColor: wrongWordCount > 0
                    ? colors.errorLight
                    : colors.surface,
                  borderColor: wrongWordCount > 0
                    ? colors.error + (isDark ? '4D' : '26')
                    : (isDark ? colors.border : colors.borderLight),
                  opacity: pressed && wrongWordCount > 0 ? 0.85 : (wrongWordCount === 0 ? 0.5 : 1),
                },
              ]}
            >
              <View style={styles.quickCardIconWrap}>
                <Ionicons name="alert-circle" size={24} color={wrongWordCount > 0 ? colors.error : colors.textTertiary} />
                {wrongWordCount > 0 && (
                  <View style={[styles.quickCardBadge, { backgroundColor: colors.error }]}>
                    <Text style={[styles.quickCardBadgeText, { color: colors.onPrimary }]}>{Math.min(wrongWordCount, 50)}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.quickCardLabel, { color: colors.text }]}>{t('home.wrongWords')}</Text>
              {wrongWordCount > 0 && (
                <Text style={[styles.quickCardSub, { color: colors.textTertiary }]}>{t('home.wrongWordsLimit')}</Text>
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
                    ? colors.warningLight
                    : colors.surface,
                  borderColor: starredWordCount > 0
                    ? colors.warning + (isDark ? '4D' : '26')
                    : (isDark ? colors.border : colors.borderLight),
                  opacity: pressed && starredWordCount > 0 ? 0.85 : (starredWordCount === 0 ? 0.5 : 1),
                },
              ]}
            >
              <View style={styles.quickCardIconWrap}>
                <Ionicons name="star" size={24} color={starredWordCount > 0 ? colors.warning : colors.textTertiary} />
                {starredWordCount > 0 && (
                  <View style={[styles.quickCardBadge, { backgroundColor: colors.warning }]}>
                    <Text style={[styles.quickCardBadgeText, { color: colors.onPrimary }]}>{starredWordCount}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.quickCardLabel, { color: colors.text }]}>{t('home.starredWords')}</Text>
            </Pressable>
          </View>

          {/* Plans Section */}
          <View style={styles.section}>
            {/* Section Header */}
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('home.studyingLists')}</Text>
                {planItems.length > 0 && (
                  <View style={[styles.countBadge, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.countBadgeText, { color: colors.primary }]}>
                      {planItems.length}
                    </Text>
                  </View>
                )}
                {planItems.length > 0 && (
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      Alert.alert(
                        t('home.dayStatusHelpTitle'),
                        t('home.dayStatusHelpMessage'),
                      );
                    }}
                    style={({ pressed }) => [styles.helpButton, { opacity: pressed ? 0.4 : 0.6 }]}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.dayStatusHelpTitle')}
                  >
                    <Ionicons name="help-circle-outline" size={18} color={colors.textTertiary} />
                  </Pressable>
                )}
              </View>
              {planItems.length > 0 && (
                <View style={styles.filterChipRow}>
                  {(
                    [
                      ['all', t('home.filterAll')],
                      ['studying', t('home.filterStudying')],
                      ['completed', t('home.filterCompleted')],
                      ['finished', t('home.filterFinished')],
                    ] as const
                  ).map(([key, label]) => (
                    <Pressable
                      key={key}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        updateDashboardFilter(key);
                      }}
                      style={[
                        styles.filterChip,
                        { backgroundColor: filterMode === key ? colors.primaryButton : colors.surfaceSecondary },
                      ]}
                    >
                      <Text style={[
                        styles.filterChipText,
                        { color: filterMode === key ? colors.onPrimary : colors.textSecondary },
                      ]}>
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Cards */}
            <>
              {filteredItems.map(({ list, status, dayStatus }) => {
                // ── 완주 카드 ──────────────────────────────────────────
                if (status === 'completed') {
                  const totalWords = list.words.length;
                  const memorizedWords = list.words.filter(w => w.isMemorized).length;
                  const percent = totalWords > 0 ? Math.round((memorizedWords / totalWords) * 100) : 0;
                  return (
                    <View
                      key={list.id}
                      style={[
                        styles.planCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.success + (isDark ? '40' : '33'),
                          shadowColor: colors.cardShadow,
                        },
                      ]}
                    >
                      <View style={styles.planCardTop}>
                        <View style={styles.planCardTitleArea}>
                          {list.icon && <Text style={{ fontSize: 18 }}>{list.icon}</Text>}
                          <Text style={[styles.planCardTitle, { color: colors.text }]} numberOfLines={1}>
                            {list.title}
                          </Text>
                        </View>
                        <View style={styles.planCardChips}>
                          <View style={[styles.statusChip, { backgroundColor: colors.success + (isDark ? '33' : '26') }]}>
                            <Text style={[styles.statusChipText, { color: colors.success }]}>
                              {t('home.planCompleted')}
                            </Text>
                          </View>
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              Alert.alert(
                                t('home.removePlanTitle'),
                                t('home.removePlanMessage'),
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
                            style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.4 : 0.7 }]}
                            hitSlop={8}
                          >
                            <Ionicons name="close" size={18} color={colors.textTertiary} />
                          </Pressable>
                        </View>
                      </View>
                      <View style={styles.planCardBottom}>
                        <View style={styles.planCardBottomLeft}>
                          <ProgressBar percent={percent} colors={colors} />
                          <View style={styles.planStatsRow}>
                            <Text style={[styles.planWordCount, { color: colors.textTertiary }]}>
                              {t('home.allMemorized', { memorized: memorizedWords, total: totalWords })}
                            </Text>
                            <Text style={[styles.planStatsPercent, { color: colors.success }]}>{percent}%</Text>
                          </View>
                        </View>
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setResultList(list);
                          }}
                          style={({ pressed }) => [
                            styles.actionButton,
                            { backgroundColor: colors.successButton, opacity: pressed ? 0.85 : 1 },
                          ]}
                        >
                          <Text style={[styles.actionButtonText, { color: colors.onPrimary }]}>
                            {t('home.studyResult')}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                }

                // ── 기간초과 / 장기미학습 카드 ─────────────────────────
                if (status === 'overdue' || status === 'inactive') {
                  const staleLabel = status === 'overdue' ? t('home.expired') : t('home.inactive');
                  const staleBg = status === 'overdue' ? colors.errorLight : colors.warningLight;
                  const staleColor = status === 'overdue' ? colors.error : colors.warning;
                  const staleBorder = status === 'overdue'
                    ? colors.error + (isDark ? '33' : '26')
                    : colors.warning + (isDark ? '33' : '26');
                  return (
                    <View
                      key={list.id}
                      style={[styles.planCard, { backgroundColor: colors.surface, borderColor: staleBorder, shadowColor: colors.cardShadow }]}
                    >
                      <View style={styles.planCardTop}>
                        <View style={styles.planCardTitleArea}>
                          {list.icon && <Text style={{ fontSize: 18 }}>{list.icon}</Text>}
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
                            <Text style={[styles.statusChipText, { color: staleColor }]}>{staleLabel}</Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.planCardBottom}>
                        <View style={styles.planCardBottomLeft}>
                          <ProgressBar percent={dayStatus.dayTotal > 0 ? Math.round((dayStatus.dayMemorized / dayStatus.dayTotal) * 100) : 0} colors={colors} />
                          <View style={styles.planStatsRow}>
                            <Text
                              style={[styles.planWordCount, { color: colors.textTertiary, flexShrink: 1 }]}
                              numberOfLines={1}
                            >
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
                              Alert.alert(
                                t('home.endStudyTitle'),
                                t('home.endStudyMessage'),
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
                              styles.actionButton,
                              { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
                            ]}
                          >
                            <Text style={[styles.actionButtonText, { color: colors.error }]}>{t('home.endStudy')}</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleRestartPlan(list.id, status)}
                            style={({ pressed }) => [
                              styles.actionButton,
                              { backgroundColor: colors.primaryButton, opacity: pressed ? 0.85 : 1 },
                            ]}
                          >
                            <Text style={[styles.actionButtonText, { color: colors.onPrimary }]}>{t('home.restartStudy')}</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  );
                }

                // ── 진행중 카드 ────────────────────────────────────────
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
                          ? colors.success + (isDark ? '33' : '26')
                          // 라이트의 평상시 테두리는 borderLight가 아니라 브랜드색 8%다 —
                          // 옛 값이 primary(당시 파란색) 8%였고, 무게를 그대로 두려는 것이다.
                          // borderLight는 불투명이라 카드가 훨씬 무거워진다.
                          : (isDark ? colors.border : colors.primary + '14'),
                        shadowColor: colors.cardShadow,
                        opacity: pressed ? 0.92 : 1,
                      },
                    ]}
                  >
                    <View style={styles.planCardTop}>
                      <View style={styles.planCardTitleArea}>
                        {list.icon && <Text style={{ fontSize: 18 }}>{list.icon}</Text>}
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
                          style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.5 : 0.6 }]}
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
                        onPress={(e) => { e.stopPropagation(); handlePlanPress(list.id); }}
                        style={({ pressed }) => [
                          styles.actionButton,
                          {
                            backgroundColor: dayStatus.state === 'completed' ? colors.surfaceSecondary : colors.primaryButton,
                            opacity: pressed ? 0.85 : 1,
                          },
                        ]}
                      >
                        <Text style={[
                          styles.actionButtonText,
                          { color: dayStatus.state === 'completed' ? colors.textSecondary : colors.onPrimary },
                        ]}>
                          {statusConfig.actionLabel}
                        </Text>
                      </Pressable>
                    </View>
                  </Pressable>
                );
              })}

              {/* Empty: 플랜 자체가 없음 */}
              {planItems.length === 0 && (
                <View style={[styles.emptyPlans, { backgroundColor: colors.surface, borderColor: isDark ? colors.border : colors.borderLight }]}>
                  <View style={{ width: 72, height: 72 }}>
                    <CharacterSvg size={72} isDark={isDark} wave />
                    <CharacterAccessory accessory={skin.characterAccessory} size={72} />
                  </View>
                  <Text style={[styles.emptyPlansTitle, { color: colors.text }]}>{t('home.emptyTitle')}</Text>
                  <Text style={[styles.emptyPlansSubtitle, { color: colors.textTertiary }]}>{t('home.emptySubtitle')}</Text>
                  <Pressable
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.navigate('/(tabs)/vocab-lists' as any); }}
                    style={({ pressed }) => [styles.emptyPlansLink, { backgroundColor: colors.primaryLight, opacity: pressed ? 0.8 : 1 }]}
                  >
                    <Ionicons name="library-outline" size={16} color={colors.primary} />
                    <Text style={[styles.emptyPlansLinkText, { color: colors.primary }]}>{t('home.goToVocabLists')}</Text>
                  </Pressable>
                </View>
              )}

              {/* Empty: 필터 결과 없음 */}
              {planItems.length > 0 && filteredItems.length === 0 && (
                <View style={[styles.emptyPlans, {
                  backgroundColor: filterMode === 'studying' ? colors.successLight : colors.surface,
                  borderColor: filterMode === 'studying'
                    ? colors.success + (isDark ? '40' : '33')
                    : (isDark ? colors.border : colors.borderLight),
                }]}>
                  {filterMode === 'studying' ? (
                    <Text style={[styles.emptyPlansTitle, { color: colors.success }]}>
                      {t('home.filterAllDoneToday')}
                    </Text>
                  ) : filterMode === 'completed' ? (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={36} color={colors.textTertiary} />
                      <Text style={[styles.emptyPlansTitle, { color: colors.text }]}>{t('home.filterEmptyCompleted')}</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="trophy-outline" size={36} color={colors.textTertiary} />
                      <Text style={[styles.emptyPlansTitle, { color: colors.text }]}>{t('home.filterEmptyFinished')}</Text>
                    </>
                  )}
                </View>
              )}
            </>
          </View>

        </View>
      </ScrollView>

      {/* Study Result Modal */}
      <Modal
        visible={!!resultList}
        transparent
        animationType="slide"
        onRequestClose={() => setResultList(null)}
      >
        <Pressable
          style={[styles.resultBackdrop, { backgroundColor: colors.overlay }]}
          onPress={() => setResultList(null)}
        />
        {resultList && (() => {
          const totalWords = resultList.words.length;
          const memorizedWords = resultList.words.filter(w => w.isMemorized).length;
          const percent = totalWords > 0 ? Math.round((memorizedWords / totalWords) * 100) : 0;
          return (
            <View style={[styles.resultSheet, { backgroundColor: colors.surface, paddingBottom: Math.max(40, insets.bottom + 24) }]}>
              <View style={[styles.resultHandle, { backgroundColor: colors.border }]} />
              <View style={styles.resultHeaderRow}>
                <View style={{ width: 48, height: 48 }}>
                  <CharacterSvg size={48} isDark={isDark} wave />
                  <CharacterAccessory accessory={skin.characterAccessory} size={48} />
                </View>
                <View style={styles.resultTitleRow}>
                  <Text style={[styles.resultSubtitle, { color: colors.textSecondary }]}>
                    {t('home.studyResult')}
                  </Text>
                  <View style={styles.resultTitleMain}>
                    {resultList.icon && <Text style={{ fontSize: 20 }}>{resultList.icon}</Text>}
                    <Text style={[styles.resultTitle, { color: colors.text }]} numberOfLines={1}>
                      {resultList.title}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.resultCircleArea}>
                <CircularProgress percent={percent} memorized={memorizedWords} total={totalWords} colors={colors} />
              </View>
              <Text style={[styles.resultStats, { color: colors.textSecondary }]}>
                {t('home.allMemorized', { memorized: memorizedWords, total: totalWords })}
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  const listId = resultList.id;
                  setResultList(null);
                  router.push({ pathname: '/plan/[id]', params: { id: listId, openSetup: '1' } });
                }}
                style={({ pressed }) => [
                  styles.resultRestartBtn,
                  { backgroundColor: colors.primaryButton, opacity: pressed ? 0.9 : 1 },
                ]}
              >
                <Text style={[styles.resultRestartBtnText, { color: colors.onPrimary }]}>{t('home.restartPlan')}</Text>
              </Pressable>
              <Text style={[styles.resultNote, { color: colors.textTertiary }]}>
                {t('home.restartPlanNote')}
              </Text>
            </View>
          );
        })()}
      </Modal>

      {/* 첫 복습이 준비된 날에만 한 번. "나중에"를 누르면 다시 묻지 않는다(§8.4). */}
      <ReviewNotifySoftAsk visible={softAskVisible} onDecided={handleSoftAskDecided} />

      {/*
        업데이트 직후 첫 홈 진입에 한 번. 앱 시작 지점이 아니라 여기에 두는 이유는,
        복습 알림을 눌러 들어온 사람은 목적이 있어서 온 것이고 시작 탭이 단어장인
        사용자도 있기 때문이다.
      */}
      <WhatsNewSheet announcement={whatsNew} onDismiss={dismissWhatsNew} />

      <AppBannerAd mode="tab-anchor" />
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTextArea: {
    flex: 1,
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
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  statsStrip: {
    marginBottom: 12,
  },
  // 비대칭 여백(§5.2): 위는 넓게(StatsStrip과 그룹 경계), 아래는 좁게(퀵액션과 근접).
  // 근접성으로 `배너 + 퀵액션 = 한 덩어리`로 읽히게 해 등간격 밴드의 "낀" 느낌을 없앤다.
  // 배너가 숨으면(due=0) statsStrip의 marginBottom만 남아 지금 앱의 간격 그대로다.
  reviewBanner: {
    marginTop: 6,
    marginBottom: 8,
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
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  quickCardGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.lg,
  },
  quickCardIconWrap: {
    position: 'relative',
    marginBottom: 6,
  },
  quickCardLabelWhite: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
    textAlign: 'center',
  },
  quickCardLabel: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
    textAlign: 'center',
  },
  quickCardSub: {
    fontSize: 10,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'center',
    marginTop: 2,
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
  },

  // Section
  section: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // 좁은 화면(예: iPhone 13 mini)에서 제목+필터 칩이 한 줄에 안 들어가면 칩이
    // 잘려나갔다. RN은 기본 flexShrink=0이라 wrap을 켜면 줄어들지 않고 칩 그룹이
    // 통째로 다음 줄로 내려간다(칩 4개 모두 노출). 넓은 화면은 한 줄 유지 = 기존 그대로.
    // rowGap은 wrap된 경우에만 두 줄 사이 간격을 주고 한 줄일 땐 영향 없음.
    flexWrap: 'wrap',
    rowGap: 8,
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
    borderRadius: Radius.md,
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
    borderRadius: Radius.sm,
  },
  filterChipText: {
    fontSize: 11,
    fontFamily: 'Pretendard_600SemiBold',
  },

  // Plan Card
  planCard: {
    borderRadius: Radius.lg,
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
  helpButton: {
    padding: 2,
    marginLeft: -2,
  },
  dayBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  dayBadgeText: {
    fontSize: 12,
    fontFamily: 'Pretendard_700Bold',
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
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
    borderRadius: Radius.md,
  },
  actionButtonText: {
    fontSize: 12,
    fontFamily: 'Pretendard_600SemiBold',
    textAlign: 'center',
  },
  staleActionRow: {
    flexDirection: 'row',
    gap: 6,
    flexShrink: 0,
    alignItems: 'center',
  },
  filterEmptyText: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'center',
    paddingVertical: 20,
  },

  // Completed section divider
  completedDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
  },
  completedDividerText: {
    fontSize: 18,
    fontFamily: 'Pretendard_700Bold',
    letterSpacing: -0.3,
  },

  // Study Result Modal
  resultBackdrop: {
    flex: 1,
  },
  resultSheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  resultHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 4,
  },
  resultHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'stretch',
  },
  resultTitleRow: {
    flexDirection: 'column',
    gap: 4,
    flex: 1,
  },
  resultSubtitle: {
    fontSize: 12,
    fontFamily: 'Pretendard_500Medium',
  },
  resultTitleMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultTitle: {
    fontSize: 20,
    fontFamily: 'Pretendard_700Bold',
    flex: 1,
    letterSpacing: -0.3,
  },
  resultCircleArea: {
    marginVertical: 8,
  },
  resultStats: {
    fontSize: 15,
    fontFamily: 'Pretendard_600SemiBold',
  },
  resultNote: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'center',
    lineHeight: 18,
  },
  resultRestartBtn: {
    alignSelf: 'stretch',
    borderRadius: Radius.xl,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  resultRestartBtnText: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
    textAlign: 'center',
  },

  // Empty Plans
  emptyPlans: {
    borderRadius: Radius.lg,
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
    textAlign: 'center',
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
    borderRadius: Radius.lg,
    marginTop: 8,
  },
  emptyPlansLinkText: {
    fontSize: 14,
    fontFamily: 'Pretendard_600SemiBold',
    textAlign: 'center',
  },

});
