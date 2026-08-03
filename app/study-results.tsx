import React, { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { View, Text, Pressable, Platform, StyleSheet, ScrollView, BackHandler } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { useStudyResultsStore, setStudySelection } from '@/features/study';
import {
  recordStudySession,
  getStatsSummary,
  pickMilestone,
  loadMaxCelebrated,
  saveMaxCelebrated,
  MilestoneCelebration,
  type StreakMilestone,
} from '@/features/stats';
import { maybeRequestReview, isGoodMoment } from '@/features/reviews';

// 마일스톤 없는 세션에서 리뷰 팝업을 띄우기까지의 대기(ms). 사용자가 자기 정답률·
// 외운 단어 수를 먼저 읽어야 "뿌듯한 순간"이 된다 — 진입 즉시 띄우면 결과를 시스템
// 시트가 덮어 그냥 닫히고, 아까운 요청 기회(OS 연 3회)만 소모된다. 마일스톤 경로가
// 축하 모달을 600ms 늦추는 것과 같은 이유이며, 읽을 내용이 더 많아 조금 더 길다.
const REVIEW_PROMPT_DELAY_MS = 1500;

export default function StudyResultsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors, fontFamily } = useTheme();
  const studyResults = useStudyResultsStore(s => s.results);
  const clearStudyResults = useStudyResultsStore(s => s.clear);
  const { id, mode, duration, isStarred, sessionFilter, quizType } = useLocalSearchParams<{
    id: string;
    mode: string;
    duration: string;
    isStarred: string;
    sessionFilter: string;
    quizType: string;
  }>();

  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

  // 스트릭 마일스톤 축하(3·7·30·100·365일). 판정·중복 방지는 features/stats/milestones.ts.
  const [milestone, setMilestone] = useState<{
    m: StreakMilestone;
    streak: number;
    memorized: number;
  } | null>(null);
  const [milestoneVisible, setMilestoneVisible] = useState(false);
  // 지연 리뷰 요청 타이머 — 화면을 떠난 뒤 시스템 시트가 뒤늦게 뜨는 걸 막으려 정리한다.
  const reviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gotItResults = useMemo(() => studyResults.filter(r => r.gotIt), [studyResults]);
  const reviewResults = useMemo(() => studyResults.filter(r => !r.gotIt), [studyResults]);
  const allCorrect = reviewResults.length === 0 && gotItResults.length > 0;
  const accuracy = studyResults.length > 0 ? Math.round((gotItResults.length / studyResults.length) * 100) : 0;
  const subtitleKey = allCorrect
    ? 'studyResults.perfectMessage'
    : accuracy >= 50
      ? 'studyResults.goodMessage'
      : 'studyResults.needsReviewMessage';

  const formatDuration = (ms: string | undefined) => {
    if (!ms) return '0s';
    const seconds = Math.floor(parseInt(ms) / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  useEffect(() => {
    if (studyResults.length > 0) {
      Haptics.notificationAsync(
        allCorrect
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      );
      // 세션 완료 = 오늘을 '학습일'로 기록(스트릭·주간 통계) 후 마일스톤 판정.
      // 실패는 조용히 무시 — 최악이 "축하 팝업이 안 뜸"이라 학습 흐름에 무해.
      (async () => {
        try {
          await recordStudySession(studyResults.length);
          const [summary, maxCelebrated] = await Promise.all([getStatsSummary(), loadMaxCelebrated()]);
          const m = pickMilestone(summary.currentStreak, maxCelebrated);
          if (!m) {
            // 마일스톤이 없는 세션 — 충분히 몰입했고(누적 암기 임계 이상) 이번 세션도
            // 잘 풀린 사용자에게만 리뷰 요청 시도. 스트릭 없이 한 번에 몰아 외운 열정
            // 신규 사용자를 커버하되, 많이 틀린 직후는 물어볼 순간이 아니다(isGoodMoment).
            if (isGoodMoment(accuracy, summary.totalMemorized)) {
              reviewTimerRef.current = setTimeout(maybeRequestReview, REVIEW_PROMPT_DELAY_MS);
            }
            return;
          }
          // 표시 전에 마킹 — 도중 종료 시 재축하보다 1회 누락이 낫다(반복 방지 우선).
          await saveMaxCelebrated(m);
          setMilestone({ m, streak: summary.currentStreak, memorized: summary.totalMemorized });
          // 결과 화면이 자리 잡은 뒤에 등장해야 축하로 읽힌다(진입 전환과 겹침 방지).
          setTimeout(() => setMilestoneVisible(true), 600);
        } catch {}
      })();
    }
  }, []);

  const handleDone = useCallback(() => {
    router.dismissAll();
  }, []);

  useEffect(() => {
    return () => {
      if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current);
      clearStudyResults();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        handleDone();
        return true;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [handleDone])
  );

  const handleRetryAll = () => {
    const sel = setStudySelection(studyResults.map(r => r.word.id));
    router.replace({
      pathname: `/${mode}/${id}` as any,
      params: { isStarred, filter: sessionFilter, quizType, sel }
    });
  };

  const handleRetryUnmemorized = () => {
    const sel = setStudySelection(reviewResults.map(r => r.word.id));
    router.replace({
      pathname: `/${mode}/${id}` as any,
      params: { isStarred, quizType, sel }
    });
  };

  if (studyResults.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.textTertiary} />
        <Text style={{ color: colors.text, textAlign: 'center', marginTop: 16, fontSize: 18, fontFamily: 'Pretendard_600SemiBold' }}>{t('studyResults.noResults')}</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 24, backgroundColor: colors.primaryButton, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 }}>
          <Text style={{ color: colors.onPrimary, fontFamily: 'Pretendard_600SemiBold' }}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: topInset + 40, paddingBottom: 160 }]}>
        <View style={styles.header}>
          <View style={[styles.statusIcon, { backgroundColor: allCorrect ? colors.successLight : colors.primaryLight, shadowColor: colors.shadow }]}>
            <Ionicons
              name={allCorrect ? 'trophy' : 'checkmark-circle'}
              size={48}
              color={allCorrect ? colors.success : colors.primary}
            />
          </View>
          <Text style={[styles.title, { color: colors.text, fontFamily: fontFamily.bold }]}>{t('studyResults.complete')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t(subtitleKey)}
          </Text>
        </View>

        <View style={[styles.statsContainer, { backgroundColor: colors.surface, shadowColor: colors.cardShadow }]}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text }]}>{accuracy}%</Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>{t('studyResults.accuracy')}</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.borderLight }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text }]}>{formatDuration(duration)}</Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>{t('studyResults.duration')}</Text>
            </View>
          </View>

          <View style={[styles.statDividerH, { backgroundColor: colors.borderLight }]} />

          <View style={styles.summaryRow}>
            <View style={styles.summaryBox}>
              <View style={[styles.dot, { backgroundColor: colors.success }]} />
              <Text style={[styles.summaryText, { color: colors.textSecondary }]}>{t('studyResults.memorized')}</Text>
              <Text style={[styles.summaryValue, { color: colors.success }]}>{gotItResults.length}</Text>
            </View>
            <View style={styles.summaryBox}>
              <View style={[styles.dot, { backgroundColor: colors.warning }]} />
              <Text style={[styles.summaryText, { color: colors.textSecondary }]}>{t('studyResults.needsReview')}</Text>
              <Text style={[styles.summaryValue, { color: colors.warning }]}>{reviewResults.length}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20, backgroundColor: colors.background }]}>
        <View style={styles.retryGroup}>
          <Pressable
            onPress={handleRetryAll}
            style={[styles.retryBtn, { borderColor: colors.primary }]}
          >
            <Ionicons name="refresh-outline" size={20} color={colors.primary} />
            <Text style={[styles.retryBtnText, { color: colors.primary }]}>{t('studyResults.restudyAll')}</Text>
          </Pressable>

          {reviewResults.length > 0 && (
            <Pressable
              onPress={handleRetryUnmemorized}
              style={[styles.retryBtn, { borderColor: colors.warning, flex: 1.2 }]}
            >
              <Ionicons name="repeat-outline" size={20} color={colors.warning} />
              <Text style={[styles.retryBtnText, { color: colors.warning }]}>{t('studyResults.restudyWrong')}</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={handleDone}
          style={[styles.doneBtn, { backgroundColor: colors.primaryButton }]}
        >
          <Text style={[styles.doneBtnText, { color: colors.onPrimary }]}>{t('studyResults.endStudy')}</Text>
        </Pressable>
      </View>

      {milestone && (
        <MilestoneCelebration
          visible={milestoneVisible}
          milestone={milestone.m}
          streak={milestone.streak}
          memorized={milestone.memorized}
          onClose={() => {
            setMilestoneVisible(false);
            // 축하를 닫는 순간 = 최고 기분. 축하 모달 페이드아웃이 끝난 뒤 네이티브 리뷰
            // 팝업(별점만)을 조용히 시도(시스템 시트가 모달 dismiss와 겹치지 않게).
            // maybeRequestReview는 컴포넌트 상태를 안 건드려 언마운트 후 실행돼도 안전.
            setTimeout(() => maybeRequestReview(), 500);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  statusIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  title: {
    fontSize: 28,
    fontFamily: 'Pretendard_700Bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Pretendard_500Medium',
    textAlign: 'center',
  },
  statsContainer: {
    width: '100%',
    borderRadius: 20,
    padding: 24,
    elevation: 8,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 12,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontFamily: 'Pretendard_700Bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
  },
  statDivider: {
    width: 1,
    height: 40,
  },
  statDividerH: {
    height: 1,
    width: '100%',
    marginVertical: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 8,
  },
  summaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  summaryText: {
    fontSize: 14,
    fontFamily: 'Pretendard_500Medium',
  },
  summaryValue: {
    fontSize: 18,
    fontFamily: 'Pretendard_700Bold',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 12,
  },
  retryGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  retryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 6,
  },
  retryBtnText: {
    fontSize: 14,
    fontFamily: 'Pretendard_600SemiBold',
    textAlign: 'center',
  },
  doneBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontSize: 17,
    fontFamily: 'Pretendard_700Bold',
    textAlign: 'center',
  },
});
