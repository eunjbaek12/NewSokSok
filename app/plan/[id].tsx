import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Modal,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { PlanStatus, Word } from '@/lib/types';
import {
  computePlanStatus,
  computeCurrentDay,
  suggestWordsPerDay,
} from '@/lib/plan-engine';

// ─── Status Banner ────────────────────────────────────────────────────────────

interface BannerConfig {
  icon: string;
  bgColor: string;
  iconColor: string;
  message: string;
  subMessage?: string;
}

function getBannerConfig(
  status: PlanStatus,
  list: any,
  colors: any
): BannerConfig {
  const remaining =
    list?.planStartedAt && list?.planTotalDays
      ? Math.max(
          0,
          Math.ceil(
            (list.planStartedAt + list.planTotalDays * 86400000 - Date.now()) /
              86400000
          )
        )
      : 0;

  switch (status) {
    case 'in-progress':
      return {
        icon: 'calendar-outline',
        bgColor: colors.primaryLight,
        iconColor: colors.primary,
        message: `학습 진행 중`,
        subMessage: `${remaining}일 남음 · 총 ${list?.planTotalDays ?? 0}일 계획`,
      };
    case 'completed':
      return {
        icon: 'trophy-outline',
        bgColor: colors.successLight,
        iconColor: colors.success,
        message: '모든 단어 암기 완료!',
        subMessage: '전체 랜덤 복습으로 기억을 강화해보세요',
      };
    case 'overdue':
      return {
        icon: 'alert-circle-outline',
        bgColor: colors.errorLight,
        iconColor: colors.error,
        message: '학습 기간이 만료되었습니다',
        subMessage: '남은 단어를 집중 학습해보세요',
      };
    case 'inactive':
      return {
        icon: 'pause-circle-outline',
        bgColor: colors.warningLight,
        iconColor: colors.warning,
        message: '7일 이상 학습하지 않았습니다',
        subMessage: '학습 계획을 재설정하여 다시 시작해보세요',
      };
    default:
      return {
        icon: 'calendar-number-outline',
        bgColor: colors.surfaceSecondary,
        iconColor: colors.textTertiary,
        message: '암기 계획이 없습니다',
        subMessage: '하루 목표를 설정하고 체계적으로 학습해보세요',
      };
  }
}

// ─── Word Plan Card ───────────────────────────────────────────────────────────

interface WordPlanCardProps {
  word: Word;
  onToggle: (wordId: string) => void;
  colors: any;
}

function WordPlanCard({ word, onToggle, colors }: WordPlanCardProps) {
  return (
    <Pressable
      onPress={() => onToggle(word.id)}
      style={({ pressed }) => [
        styles.wordCard,
        {
          backgroundColor: word.isMemorized ? colors.surfaceSecondary : colors.surface,
          opacity: pressed ? 0.85 : word.isMemorized ? 0.65 : 1,
          borderColor: word.isMemorized ? colors.borderLight : colors.border,
        },
      ]}
    >
      <View style={styles.wordCardLeft}>
        {word.pos ? (
          <View style={[styles.posBadge, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.posText, { color: colors.primary }]}>{word.pos}</Text>
          </View>
        ) : null}
        <Text style={[styles.wordTerm, { color: colors.text }]} numberOfLines={1}>
          {word.term}
        </Text>
        <Text style={[styles.wordMeaning, { color: colors.textSecondary }]} numberOfLines={1}>
          {word.meaningKr}
        </Text>
      </View>
      <Ionicons
        name={word.isMemorized ? 'checkmark-circle' : 'ellipse-outline'}
        size={26}
        color={word.isMemorized ? colors.success : colors.border}
      />
    </Pressable>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const {
    lists,
    toggleMemorized,
    setupPlan,
    rechunkPlan,
    clearPlan,
    updatePlanProgress,
  } = useVocab();

  const [setupModalVisible, setSetupModalVisible] = useState(false);
  const [wordsPerDayInput, setWordsPerDayInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewingDay, setViewingDay] = useState<number>(0); // 0 = not initialized

  const list = useMemo(() => lists.find(l => l.id === id), [lists, id]);
  const words = list?.words ?? [];

  const planStatus = useMemo(
    () => (list ? computePlanStatus(list, words, Date.now()) : 'none'),
    [list, words]
  );

  const autoCurrentDay = useMemo(() => computeCurrentDay(words), [words]);
  const suggested = useMemo(() => suggestWordsPerDay(words.length), [words.length]);

  // Initialize viewingDay to auto-computed current day
  useEffect(() => {
    if (viewingDay === 0 && planStatus !== 'none') {
      setViewingDay(autoCurrentDay);
    }
  }, [planStatus, autoCurrentDay, viewingDay]);

  // Auto-open setup modal if no plan
  useEffect(() => {
    if (planStatus === 'none' && words.length > 0) {
      setWordsPerDayInput(String(suggested));
      setSetupModalVisible(true);
    }
  }, [planStatus, words.length, suggested]);

  const banner = useMemo(
    () => getBannerConfig(planStatus, list, colors),
    [planStatus, list, colors]
  );

  // Build list of all days + "미배정" (-1) at the end
  const allDays = useMemo(() => {
    const daySet = new Set<number>();
    for (const w of words) {
      if (w.assignedDay != null && w.assignedDay > 0) daySet.add(w.assignedDay);
    }
    const sorted = Array.from(daySet).sort((a, b) => a - b);
    const hasUnassigned = words.some(w => w.assignedDay == null || w.assignedDay === 0);
    if (hasUnassigned) sorted.push(-1);
    return sorted;
  }, [words]);

  const currentDayIndex = allDays.indexOf(viewingDay);

  // Words for the currently viewed day
  const viewingWords = useMemo(() => {
    if (viewingDay === -1) return words.filter(w => w.assignedDay == null || w.assignedDay === 0);
    return words.filter(w => w.assignedDay === viewingDay);
  }, [words, viewingDay]);

  const viewingMemorized = viewingWords.filter(w => w.isMemorized).length;

  // Setup modal logic
  const parsedWordsPerDay = useMemo(() => {
    const n = parseInt(wordsPerDayInput, 10);
    return isNaN(n) || n <= 0 ? suggested : n;
  }, [wordsPerDayInput, suggested]);

  const previewDays = useMemo(() => {
    if (planStatus === 'inactive' || planStatus === 'overdue') {
      const unmemorized = words.filter(w => !w.isMemorized).length;
      return Math.ceil(unmemorized / parsedWordsPerDay);
    }
    return Math.ceil(words.length / parsedWordsPerDay);
  }, [planStatus, words, parsedWordsPerDay]);

  const completedWords = words.filter(w => w.isMemorized).length;

  // ─── Handlers ───────────────────────────────────────────────────────

  const handleOpenSetup = useCallback(() => {
    setWordsPerDayInput(String(suggested));
    setSetupModalVisible(true);
  }, [suggested]);

  const handleConfirmSetup = useCallback(async () => {
    if (!id) return;
    setIsSubmitting(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (planStatus === 'none') {
        await setupPlan(id, parsedWordsPerDay);
      } else {
        await rechunkPlan(id, parsedWordsPerDay);
        await updatePlanProgress(id, 1);
      }
      setSetupModalVisible(false);
      setViewingDay(0); // Reset to trigger re-init from autoCurrentDay
    } finally {
      setIsSubmitting(false);
    }
  }, [id, planStatus, parsedWordsPerDay, setupPlan, rechunkPlan, updatePlanProgress]);

  const handleToggleMemorized = useCallback(
    async (wordId: string) => {
      if (!id) return;
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await toggleMemorized(id, wordId);
    },
    [id, toggleMemorized]
  );

  const goToPrevDay = useCallback(() => {
    const idx = allDays.indexOf(viewingDay);
    if (idx > 0) {
      setViewingDay(allDays[idx - 1]);
      Haptics.selectionAsync();
    }
  }, [allDays, viewingDay]);

  const goToNextDay = useCallback(() => {
    const idx = allDays.indexOf(viewingDay);
    if (idx < allDays.length - 1) {
      setViewingDay(allDays[idx + 1]);
      Haptics.selectionAsync();
    }
  }, [allDays, viewingDay]);

  const handleActionButton = useCallback(async () => {
    if (!id) return;

    if (planStatus === 'none') {
      handleOpenSetup();
      return;
    }

    if (planStatus === 'completed') {
      router.push({ pathname: '/study-select/[id]', params: { id, filter: 'all' } });
      return;
    }

    if (viewingDay === -1) {
      handleOpenSetup(); // 미배정 → 재설정
      return;
    }

    if (planStatus === 'inactive') {
      handleOpenSetup();
      return;
    }

    const targetWords = viewingWords.filter(w => !w.isMemorized);
    if (targetWords.length < 2) {
      // This day is done → fallback to all unmemorized
      router.push({ pathname: '/study-select/[id]', params: { id, filter: 'learning' } });
    } else {
      await updatePlanProgress(id, viewingDay); // Update planUpdatedAt
      const ids = targetWords.map(w => w.id).join(',');
      router.push({ pathname: '/study-select/[id]', params: { id, filter: 'learning', ids } });
    }
  }, [id, planStatus, viewingDay, viewingWords, updatePlanProgress, handleOpenSetup]);

  const actionLabel = useMemo(() => {
    if (planStatus === 'none') return '암기 계획 만들기';
    if (planStatus === 'completed') return '전체 랜덤 복습';
    if (viewingDay === -1) return '계획에 포함하기';
    if (planStatus === 'inactive') return '학습 계획 재설정하기';
    return `Day ${viewingDay} 학습 시작`;
  }, [planStatus, viewingDay]);

  // ─── Render ─────────────────────────────────────────────────────────

  if (!list) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>단어장을 찾을 수 없습니다.</Text>
      </View>
    );
  }

  const hasDays = planStatus !== 'none' && allDays.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>암기 계획</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textTertiary }]} numberOfLines={1}>
            {list.title}
          </Text>
        </View>
        {planStatus !== 'none' && (
          <Pressable
            onPress={handleOpenSetup}
            style={({ pressed }) => [styles.resetBtn, { opacity: pressed ? 0.6 : 1 }]}
            hitSlop={8}
          >
            <Ionicons name="refresh-outline" size={20} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {/* Status Banner */}
      <View style={[styles.banner, { backgroundColor: banner.bgColor }]}>
        <Ionicons name={banner.icon as any} size={22} color={banner.iconColor} />
        <View style={styles.bannerText}>
          <Text style={[styles.bannerMessage, { color: banner.iconColor }]}>{banner.message}</Text>
          {banner.subMessage ? (
            <Text style={[styles.bannerSub, { color: banner.iconColor, opacity: 0.75 }]}>
              {banner.subMessage}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Progress Summary */}
      {planStatus !== 'none' && (
        <View style={[styles.progressRow, { borderColor: colors.borderLight }]}>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>
            <Text style={[styles.progressCount, { color: colors.text }]}>{completedWords}</Text>
            {'/' + words.length + ' 암기 완료'}
          </Text>
          <View style={[styles.progressBar, { backgroundColor: colors.surfaceSecondary }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: completedWords === words.length ? colors.success : colors.primary,
                  width: words.length > 0 ? `${Math.round((completedWords / words.length) * 100)}%` : '0%',
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* Day Navigation: < Day N > */}
      {hasDays && (
        <View style={[styles.dayNavRow, { borderBottomColor: colors.borderLight }]}>
          <Pressable
            onPress={goToPrevDay}
            disabled={currentDayIndex <= 0}
            style={({ pressed }) => [
              styles.dayNavArrow,
              { opacity: currentDayIndex <= 0 ? 0.3 : (pressed ? 0.6 : 1) },
            ]}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.dayNavCenter}>
            <Text style={[styles.dayNavTitle, { color: colors.text }]}>
              {viewingDay === -1 ? '미배정' : `Day ${viewingDay}`}
            </Text>
            <Text style={[styles.dayNavSub, { color: colors.textTertiary }]}>
              {viewingDay === -1
                ? `${viewingWords.length}개 단어`
                : `${viewingMemorized}/${viewingWords.length} 암기`}
            </Text>
          </View>
          <Pressable
            onPress={goToNextDay}
            disabled={currentDayIndex >= allDays.length - 1}
            style={({ pressed }) => [
              styles.dayNavArrow,
              { opacity: currentDayIndex >= allDays.length - 1 ? 0.3 : (pressed ? 0.6 : 1) },
            ]}
            hitSlop={12}
          >
            <Ionicons name="chevron-forward" size={22} color={colors.text} />
          </Pressable>
        </View>
      )}

      {/* Word List */}
      {planStatus === 'none' ? (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-number-outline" size={60} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>암기 계획이 없습니다</Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
            {words.length > 0
              ? `단어 ${words.length}개를 체계적으로 학습할 계획을 만들어보세요.`
              : '먼저 단어장에 단어를 추가해주세요.'}
          </Text>
        </View>
      ) : planStatus === 'completed' ? (
        <View style={styles.completedState}>
          <Ionicons name="trophy" size={56} color={colors.success} />
          <Text style={[styles.completedTitle, { color: colors.text }]}>학습 완료!</Text>
          <Text style={[styles.completedDesc, { color: colors.textSecondary }]}>
            모든 단어를 암기했습니다.{'\n'}랜덤 복습으로 기억을 강화해보세요.
          </Text>
        </View>
      ) : viewingDay === -1 ? (
        <FlatList
          data={viewingWords}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <WordPlanCard word={item} onToggle={handleToggleMemorized} colors={colors} />
          )}
          ListFooterComponent={
            <Pressable
              onPress={handleOpenSetup}
              style={[styles.includeBtn, { borderColor: colors.primary }]}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
              <Text style={[styles.includeBtnText, { color: colors.primary }]}>계획에 포함하기 (재설정)</Text>
            </Pressable>
          }
          ListEmptyComponent={
            <View style={styles.dayEmptyState}>
              <Text style={[styles.dayEmptyText, { color: colors.textTertiary }]}>미배정된 단어가 없습니다</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 120, paddingTop: 8 }}
        />
      ) : (
        <FlatList
          data={viewingWords}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <WordPlanCard word={item} onToggle={handleToggleMemorized} colors={colors} />
          )}
          ListEmptyComponent={
            <View style={styles.dayEmptyState}>
              <Text style={[styles.dayEmptyText, { color: colors.textTertiary }]}>
                이 Day에 배정된 단어가 없습니다
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 120, paddingTop: 8 }}
        />
      )}

      {/* Bottom Action Button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={handleActionButton}
          style={({ pressed }) => [
            styles.actionBtn,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Text style={styles.actionBtnText}>{actionLabel}</Text>
        </Pressable>
      </View>

      {/* Setup Modal */}
      <Modal
        visible={setupModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSetupModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSetupModalVisible(false)}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalWrapper}
        >
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />

            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {planStatus === 'none' ? '암기 계획 만들기' : '학습 계획 재설정'}
            </Text>
            <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
              {planStatus === 'inactive' || planStatus === 'overdue'
                ? `미암기 단어 ${words.filter(w => !w.isMemorized).length}개를 새로 배분합니다.`
                : `총 ${words.length}개 단어를 하루 학습량에 맞게 나눕니다.`}
            </Text>

            <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>하루 학습량</Text>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={wordsPerDayInput}
                onChangeText={setWordsPerDayInput}
                keyboardType="number-pad"
                placeholder={String(suggested)}
                placeholderTextColor={colors.textTertiary}
                selectTextOnFocus
              />
              <Text style={[styles.inputUnit, { color: colors.textTertiary }]}>개/일</Text>
            </View>

            <View style={[styles.previewBox, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={[styles.previewText, { color: colors.primary }]}>
                총 {previewDays}일 계획 · 하루 {parsedWordsPerDay}개
              </Text>
            </View>

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setSetupModalVisible(false)}
                style={({ pressed }) => [
                  styles.modalBtnOutline,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.modalBtnOutlineText, { color: colors.textSecondary }]}>취소</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmSetup}
                disabled={isSubmitting}
                style={({ pressed }) => [
                  styles.modalBtnPrimary,
                  { backgroundColor: colors.primary, opacity: pressed || isSubmitting ? 0.8 : 1 },
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnPrimaryText}>계획 시작</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
    fontFamily: 'Pretendard_400Regular',
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Pretendard_700Bold',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
    marginTop: 1,
  },
  resetBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 20,
  },
  bannerText: {
    flex: 1,
  },
  bannerMessage: {
    fontSize: 14,
    fontFamily: 'Pretendard_600SemiBold',
  },
  bannerSub: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
    marginTop: 2,
  },
  // Progress
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 10,
  },
  progressText: {
    fontSize: 13,
    fontFamily: 'Pretendard_400Regular',
    minWidth: 80,
  },
  progressCount: {
    fontFamily: 'Pretendard_600SemiBold',
  },
  progressBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  // Day Navigation
  dayNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayNavArrow: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNavCenter: {
    flex: 1,
    alignItems: 'center',
  },
  dayNavTitle: {
    fontSize: 18,
    fontFamily: 'Pretendard_700Bold',
  },
  dayNavSub: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
    marginTop: 2,
  },
  // Word Card
  wordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  wordCardLeft: {
    flex: 1,
    marginRight: 10,
    gap: 3,
  },
  posBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 2,
  },
  posText: {
    fontSize: 10,
    fontFamily: 'Pretendard_500Medium',
  },
  wordTerm: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
    letterSpacing: -0.2,
  },
  wordMeaning: {
    fontSize: 13,
    fontFamily: 'Pretendard_400Regular',
  },
  // Empty / Completed States
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Pretendard_600SemiBold',
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  completedState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  completedTitle: {
    fontSize: 22,
    fontFamily: 'Pretendard_700Bold',
  },
  completedDesc: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  dayEmptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  dayEmptyText: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
  },
  includeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  includeBtnText: {
    fontSize: 14,
    fontFamily: 'Pretendard_600SemiBold',
  },
  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 16,
    right: 16,
  },
  actionBtn: {
    borderRadius: 28,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
    letterSpacing: -0.2,
  },
  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalWrapper: {
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    gap: 16,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Pretendard_700Bold',
    letterSpacing: -0.3,
  },
  modalDesc: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    lineHeight: 20,
    marginTop: -4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  inputLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Pretendard_500Medium',
  },
  input: {
    fontSize: 20,
    fontFamily: 'Pretendard_700Bold',
    minWidth: 48,
    textAlign: 'center',
  },
  inputUnit: {
    fontSize: 13,
    fontFamily: 'Pretendard_400Regular',
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  previewText: {
    fontSize: 14,
    fontFamily: 'Pretendard_600SemiBold',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalBtnOutline: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalBtnOutlineText: {
    fontSize: 15,
    fontFamily: 'Pretendard_600SemiBold',
  },
  modalBtnPrimary: {
    flex: 2,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Pretendard_600SemiBold',
  },
});
