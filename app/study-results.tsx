import React, { useEffect, useMemo, useCallback } from 'react';
import { View, Text, Pressable, Platform, StyleSheet, ScrollView, BackHandler } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';

export default function StudyResultsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { studyResults, clearStudyResults } = useVocab();
  const { id, mode, duration, isStarred, sessionFilter, quizType } = useLocalSearchParams<{
    id: string;
    mode: string;
    duration: string;
    isStarred: string;
    sessionFilter: string;
    quizType: string;
  }>();

  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

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
    }
  }, []);

  const handleDone = useCallback(() => {
    router.back();
  }, []);

  useEffect(() => {
    return () => {
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
    const sessionIds = studyResults.map(r => r.word.id).join(',');
    router.replace({
      pathname: `/${mode}/${id}` as any,
      params: { isStarred, filter: sessionFilter, quizType, ids: sessionIds }
    });
  };

  const handleRetryUnmemorized = () => {
    const failedIds = reviewResults.map(r => r.word.id).join(',');
    router.replace({
      pathname: `/${mode}/${id}` as any,
      params: { isStarred, quizType, ids: failedIds }
    });
  };

  if (studyResults.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.textTertiary} />
        <Text style={{ color: colors.text, textAlign: 'center', marginTop: 16, fontSize: 18, fontFamily: 'Pretendard_600SemiBold' }}>{t('studyResults.noResults')}</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 24, backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 }}>
          <Text style={{ color: '#FFF', fontFamily: 'Pretendard_600SemiBold' }}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: topInset + 40, paddingBottom: 160 }]}>
        <View style={styles.header}>
          <View style={[styles.statusIcon, { backgroundColor: allCorrect ? colors.successLight : colors.primaryLight }]}>
            <Ionicons
              name={allCorrect ? 'trophy' : 'checkmark-circle'}
              size={48}
              color={allCorrect ? colors.success : colors.primary}
            />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{t('studyResults.complete')}</Text>
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
          style={[styles.doneBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.doneBtnText, { color: '#FFFFFF' }]}>{t('studyResults.endStudy')}</Text>
        </Pressable>
      </View>
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
        shadowColor: '#000',
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
  },
});
