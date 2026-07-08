import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import {
  useStatsSummary,
  pickDailyQuote,
  todayStr,
  startOfWeekStr,
  addDaysStr,
  ShareCard,
  shareStatsCard,
  saveStatsCard,
} from '@/features/stats';

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const summary = useStatsSummary();

  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const streak = summary?.currentStreak ?? 0;
  const longest = summary?.longestStreak ?? 0;

  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);

  const quote = useMemo(() => pickDailyQuote(todayStr(), i18n.language), [i18n.language]);

  // 이번 주(월~일) 7칸: 학습한 날 채움, 오늘 강조.
  const week = useMemo(() => {
    const today = todayStr();
    const start = startOfWeekStr();
    const studied = new Set((summary?.days ?? []).map(d => d.date));
    const labels = t('stats.weekdays').split(',');
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDaysStr(start, i);
      return { date, label: labels[i] ?? '', on: studied.has(date), isToday: date === today };
    });
  }, [summary, t]);

  const tiles = [
    { icon: 'book', color: colors.primary, value: t('stats.wordsValue', { count: summary?.totalMemorized ?? 0 }), label: t('stats.totalMemorized') },
    { icon: 'calendar', color: colors.accent, value: t('stats.wordsValue', { count: summary?.weekStudied ?? 0 }), label: t('stats.weekStudied') },
    { icon: 'calendar-outline', color: colors.accent, value: t('stats.wordsValue', { count: summary?.monthStudied ?? 0 }), label: t('stats.monthStudied') },
    { icon: 'checkmark-done', color: colors.success, value: t('stats.daysValue', { count: summary?.totalDays ?? 0 }), label: t('stats.totalDays') },
  ] as const;

  const handleShare = async () => {
    if (busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(true);
    const outcome = await shareStatsCard(cardRef, t('shareCard.shareMessage', { days: streak }));
    setBusy(false);
    if (outcome === 'unavailable') Alert.alert(t('stats.share'), t('shareCard.unavailable'));
    else if (outcome === 'error') Alert.alert(t('stats.share'), t('shareCard.shareError'));
  };

  const handleSave = async () => {
    if (busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(true);
    const outcome = await saveStatsCard(cardRef);
    setBusy(false);
    if (outcome === 'saved') Alert.alert(t('shareCard.savedTitle'), t('shareCard.saved'));
    else if (outcome === 'denied') Alert.alert(t('shareCard.saveDeniedTitle'), t('shareCard.saveDenied'));
    else if (outcome === 'error') Alert.alert(t('stats.share'), t('shareCard.shareError'));
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('stats.title')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 스트릭 히어로 */}
        <View style={[styles.hero, { backgroundColor: colors.warningLight, borderColor: colors.border }]}>
          <Text style={styles.heroFlame}>🔥</Text>
          <Text style={[styles.heroNum, { color: colors.warning }]}>
            {t('stats.daysValue', { count: streak })}
          </Text>
          <Text style={[styles.heroLabel, { color: colors.warning }]}>{t('stats.streakLabel')}</Text>
          <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
            {streak > 0 ? t('stats.streakSub') : t('stats.streakSubZero')}
          </Text>
          <View style={[styles.heroRec, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <Text style={[styles.heroRecText, { color: colors.textSecondary }]}>
              🏆 {t('stats.longestRecord', { count: longest })}
            </Text>
          </View>
        </View>

        {/* 주간 스트립 */}
        <View style={[styles.week, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          {week.map(d => (
            <View key={d.date} style={styles.day}>
              <View
                style={[
                  styles.dayDot,
                  { borderColor: d.isToday ? colors.warning : colors.borderLight },
                  d.on && { backgroundColor: colors.primary, borderColor: d.isToday ? colors.warning : colors.primary },
                ]}
              >
                {d.on && <Ionicons name="checkmark" size={14} color={colors.onPrimary} />}
              </View>
              <Text style={[styles.dayLabel, { color: d.isToday ? colors.warning : colors.textTertiary }]}>{d.label}</Text>
            </View>
          ))}
        </View>

        {/* 지표 타일 */}
        <View style={styles.tiles}>
          {tiles.map((tile, i) => (
            <View key={i} style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
              <Ionicons name={tile.icon as any} size={19} color={tile.color} />
              <Text style={[styles.tileNum, { color: colors.text }]}>{tile.value}</Text>
              <Text style={[styles.tileLabel, { color: colors.textTertiary }]}>{tile.label}</Text>
            </View>
          ))}
        </View>

        {/* 오늘의 명언 */}
        <View style={[styles.quote, { backgroundColor: colors.primaryLight, borderColor: colors.borderLight }]}>
          <Text style={[styles.quoteLabel, { color: colors.primary }]}>{t('stats.quoteLabel')}</Text>
          <Text style={[styles.quoteText, { color: colors.text }]}>{quote.text}</Text>
          {!!quote.author && (
            <Text style={[styles.quoteBy, { color: colors.primary }]}>— {quote.author}</Text>
          )}
        </View>

        {/* 자랑하기 — 카드 캡처 후 공유 시트 */}
        <Pressable
          onPress={handleShare}
          disabled={busy}
          style={({ pressed }) => [styles.shareBtn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <>
              <Ionicons name="share-social-outline" size={18} color={colors.onPrimary} />
              <Text style={[styles.shareText, { color: colors.onPrimary }]}>{t('stats.share')}</Text>
            </>
          )}
        </Pressable>

        {/* 이미지 저장 */}
        <Pressable onPress={handleSave} disabled={busy} style={styles.saveBtn}>
          <Ionicons name="download-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.saveText, { color: colors.textSecondary }]}>{t('shareCard.save')}</Text>
        </Pressable>
      </ScrollView>

      {/* 캡처 전용 화면 밖 카드 (렌더는 되지만 화면엔 안 보임) */}
      <View style={styles.offscreen} pointerEvents="none">
        <ShareCard ref={cardRef} streak={streak} memorized={summary?.totalMemorized ?? 0} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'Pretendard_700Bold' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },

  hero: {
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  heroFlame: { fontSize: 40, lineHeight: 46 },
  heroNum: { fontSize: 44, fontFamily: 'Pretendard_700Bold', letterSpacing: -1, marginTop: 2 },
  heroLabel: { fontSize: 14, fontFamily: 'Pretendard_700Bold', marginTop: -2 },
  heroSub: { fontSize: 13.5, fontFamily: 'Pretendard_500Medium', marginTop: 8 },
  heroRec: {
    marginTop: 14,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  heroRecText: { fontSize: 12.5, fontFamily: 'Pretendard_600SemiBold' },

  week: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginTop: 12,
  },
  day: { alignItems: 'center', gap: 7, flex: 1 },
  dayDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabel: { fontSize: 11, fontFamily: 'Pretendard_600SemiBold' },

  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '47%',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 15,
    paddingHorizontal: 14,
    gap: 7,
  },
  tileNum: { fontSize: 23, fontFamily: 'Pretendard_700Bold', letterSpacing: -0.5 },
  tileLabel: { fontSize: 12.5, fontFamily: 'Pretendard_500Medium' },

  quote: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 12,
  },
  quoteLabel: { fontSize: 11, fontFamily: 'Pretendard_700Bold', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
  quoteText: { fontSize: 15, fontFamily: 'Pretendard_600SemiBold', lineHeight: 23 },
  quoteBy: { fontSize: 12.5, fontFamily: 'Pretendard_500Medium', marginTop: 8 },

  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 16,
    minHeight: 52,
  },
  shareText: { fontSize: 15.5, fontFamily: 'Pretendard_700Bold' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 4,
  },
  saveText: { fontSize: 14, fontFamily: 'Pretendard_600SemiBold' },
  offscreen: { position: 'absolute', left: -10000, top: 0 },
});
