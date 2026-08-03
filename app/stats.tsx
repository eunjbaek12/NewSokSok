import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable, Platform, Alert, ActivityIndicator, Modal, Image, Dimensions } from 'react-native';
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
  monthPrefix,
  addMonths,
  monthGridDates,
  weekdayIndexMon0,
  getDayDetail,
  type DayDetail,
  ShareCard,
  shareStatsCard,
  saveStatsCard,
} from '@/features/stats';
import { requestManualReview } from '@/features/reviews';

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

  const today = todayStr();
  const currentMonth = monthPrefix();
  const [month, setMonth] = useState(currentMonth);
  // 달력 날짜 원형 크기(px) — 측정 없이 화면 폭에서 결정적으로 계산한다.
  // 그리드 폭 = 화면폭 − 스크롤 좌우패딩(16*2) − 카드 좌우패딩(10*2). 7등분 후 셀 패딩(3*2) 제외.
  // 명시적 width===height + borderRadius=절반.
  // 이 값은 처음부터 정상이었다(실측 38.0×38.0 = 계산값). 원형이 세 번 깨진 진짜 원인은
  // 계산이 아니라 아래 렌더 코드의 borderWidth 누락이다 — '50%'→onLayout→Dimensions로
  // 계산법만 바꾼 세 번의 수정이 전부 빗나간 이유.
  const dayCircle = Math.max(26, Math.min(46, Math.floor((Dimensions.get('window').width - 52) / 7) - 6));

  // 날짜 탭 상세 시트. dayReqRef는 늦게 도착한 이전 날짜 응답이 시트를 덮는 경합 방지.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const dayReqRef = useRef<string | null>(null);

  const weekdayLabels = useMemo(() => t('stats.weekdays').split(','), [t]);
  const monthNames = useMemo(() => t('stats.monthNames').split(','), [t]);

  // 학습한 날(활동 기록이 있는 날) — 달력 채움 + 탭 가능 여부의 기준.
  const studiedSet = useMemo(() => new Set((summary?.days ?? []).map(d => d.date)), [summary]);

  // 이전 달 탐색 하한 = 가장 오래된 기록의 달. 기록이 없으면 이번 달만.
  const earliestMonth = useMemo(() => {
    const days = summary?.days ?? [];
    if (days.length === 0) return currentMonth;
    let min = days[0].date;
    for (const d of days) if (d.date < min) min = d.date;
    return min.slice(0, 7);
  }, [summary, currentMonth]);

  const grid = useMemo(() => monthGridDates(month), [month]);
  // 주(7칸) 단위 행으로 분할 렌더 — %너비+flexWrap 7열은 Android 픽셀 반올림으로
  // 합이 컨테이너를 서브픽셀 초과해 7번째 칸(일)이 다음 줄로 래핑된다.
  const weeks = useMemo(() => {
    const rows: (string | null)[][] = [];
    for (let i = 0; i < grid.length; i += 7) rows.push(grid.slice(i, i + 7));
    return rows;
  }, [grid]);
  const prevDisabled = month <= earliestMonth;
  const nextDisabled = month >= currentMonth;

  const monthTitle = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return t('stats.monthTitle', { year: y, month: m, monthName: monthNames[m - 1] ?? String(m) });
  }, [month, monthNames, t]);

  const sheetTitle = useMemo(() => {
    if (!selectedDate) return '';
    const [, m, d] = selectedDate.split('-').map(Number);
    return t('stats.sheetDateTitle', {
      month: m,
      day: d,
      weekday: weekdayLabels[weekdayIndexMon0(selectedDate)] ?? '',
      monthName: monthNames[m - 1] ?? String(m),
    });
  }, [selectedDate, weekdayLabels, monthNames, t]);

  const openDay = (date: string) => {
    Haptics.selectionAsync();
    dayReqRef.current = date;
    setSelectedDate(date);
    setDayDetail(null);
    getDayDetail(date)
      .then(detail => { if (dayReqRef.current === date) setDayDetail(detail); })
      .catch(() => {});
  };

  const closeDay = () => {
    dayReqRef.current = null;
    setSelectedDate(null);
    setDayDetail(null);
  };

  const moveMonth = (delta: number) => {
    Haptics.selectionAsync();
    setMonth(m => addMonths(m, delta));
  };

  const tiles = [
    { icon: 'sunny', color: colors.warning, value: t('stats.wordsValue', { count: summary?.todayMemorized ?? 0 }), label: t('stats.todayMemorized') },
    { icon: 'calendar', color: colors.accent, value: t('stats.wordsValue', { count: summary?.weekMemorized ?? 0 }), label: t('stats.weekMemorized') },
    { icon: 'book', color: colors.primary, value: t('stats.wordsValue', { count: summary?.totalMemorized ?? 0 }), label: t('stats.totalMemorized') },
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

  const handleRate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    requestManualReview();
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
        {/* 스트릭 히어로 — 가로형 컴팩트. 왼쪽 캐릭터+숫자, 오른쪽 응원문구+최장기록. */}
        <View style={[styles.hero, { backgroundColor: colors.warningLight, borderColor: colors.border }]}>
          <Image
            source={streak > 0
              ? require('../assets/images/streak-success.png')
              : require('../assets/images/streak-idle.png')}
            style={styles.heroImg}
          />
          <View>
            <Text style={[styles.heroNum, { color: colors.warning }]}>
              {t('stats.daysValue', { count: streak })}
            </Text>
            <Text style={[styles.heroLabel, { color: colors.warning }]}>{t('stats.streakLabel')}</Text>
          </View>
          <View style={styles.heroRight}>
            <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
              {streak > 0 ? t('stats.streakSub') : t('stats.streakSubZero')}
            </Text>
            <View style={[styles.heroRec, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
              <Text style={[styles.heroRecText, { color: colors.textSecondary }]}>
                🏆 {t('stats.longestRecord', { count: longest })}
              </Text>
            </View>
          </View>
        </View>

        {/* 요약 타일 — 달력 위. 지표는 전부 "외운 단어" 계열 + 학습한 날. */}
        <View style={styles.tiles}>
          {tiles.map((tile, i) => (
            <View key={i} style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
              <Ionicons name={tile.icon as any} size={15} color={tile.color} />
              <Text style={[styles.tileNum, { color: colors.text }]} numberOfLines={1}>{tile.value}</Text>
              <Text style={[styles.tileLabel, { color: colors.textTertiary }]} numberOfLines={1}>{tile.label}</Text>
            </View>
          ))}
        </View>

        {/* 월 달력 — 이진 표시(학습한 날 = 채움). 학습한 과거~오늘만 탭 가능. */}
        <View style={[styles.cal, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={styles.calHead}>
            <Pressable onPress={() => moveMonth(-1)} disabled={prevDisabled} hitSlop={8} style={styles.calArrow}>
              <Ionicons name="chevron-back" size={18} color={prevDisabled ? colors.borderLight : colors.textSecondary} />
            </Pressable>
            <Text style={[styles.calMonth, { color: colors.text }]}>{monthTitle}</Text>
            <Pressable onPress={() => moveMonth(1)} disabled={nextDisabled} hitSlop={8} style={styles.calArrow}>
              <Ionicons name="chevron-forward" size={18} color={nextDisabled ? colors.borderLight : colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.calRow}>
            {weekdayLabels.map((label, i) => (
              <View key={`dow-${i}`} style={styles.calCell}>
                <Text style={[styles.calDow, { color: colors.textTertiary }]}>{label}</Text>
              </View>
            ))}
          </View>
          {weeks.map((week, w) => (
            <View key={`week-${w}`} style={styles.calRow}>
              {week.map((date, i) => {
                if (!date) return <View key={`pad-${w}-${i}`} style={styles.calCell} />;
                const isFuture = date > today;
                const on = studiedSet.has(date);
                const isToday = date === today;
                return (
                  <Pressable
                    key={date}
                    style={styles.calCell}
                    disabled={!on || isFuture}
                    onPress={() => openDay(date)}
                  >
                    <View
                      style={[
                        styles.calDay,
                        // ⚠️ 배경색이 있는 칸(on)은 아래 overflow:'hidden'이 없으면 Android에서
                        // 네모로 그려진다. borderRadius는 스타일에 정상으로 살아있는데도(실측:
                        // StyleSheet.flatten 결과 borderRadius=19·w=h=38·bg 적용됨) Android(New
                        // Arch/Fabric)가 배경 View의 borderRadius를 렌더링에서 무시하기 때문이다.
                        // borderWidth로는 못 고친다(1px·2px 둘 다 네모였다) — overflow:'hidden'이
                        // 원형 클리핑을 강제한다. 배경 없는 isToday 칸(테두리만)은 이 버그가 없다.
                        //
                        // 조건부 스타일은 배열 원소(`[base, cond && {...}]`)가 아니라 이 객체 안
                        // 스프레드(`...(cond && {...})`)로 둔다 — 배열 조건부는 Android 릴리스+React
                        // Compiler에서 앞 원소가 유실되는 별개 회귀가 있다(DialogModal 3faf4f1 참조).
                        {
                          width: dayCircle,
                          height: dayCircle,
                          borderRadius: dayCircle / 2,
                          overflow: 'hidden' as const, // 배경 View의 borderRadius 렌더 버그 우회(위 주석). 지우면 학습한 날이 네모로 되돌아간다.
                          ...(on && {
                            backgroundColor: colors.primary,
                            borderWidth: 1,
                            borderColor: colors.primary,
                          }),
                          ...(isToday && { borderWidth: 2, borderColor: colors.warning }),
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.calDayNum,
                          {
                            color: on
                              ? colors.onPrimary
                              : isToday
                                ? colors.warning
                                : isFuture
                                  ? colors.borderLight
                                  : colors.textSecondary,
                          },
                        ]}
                      >
                        {Number(date.slice(8))}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

          <Text style={[styles.calHint, { color: colors.textTertiary }]}>{t('stats.calHint')}</Text>
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

        {/* 앱 평가하기 — 스트릭 보러 오는 몰입 사용자가 모이는 화면. 스토어 리스팅으로
            이동해 별점만으로 응원(글 안 써도 됨). */}
        <Pressable onPress={handleRate} style={styles.rateBtn}>
          <Ionicons name="star-outline" size={15} color={colors.warning} />
          <Text style={[styles.rateText, { color: colors.textSecondary }]}>{t('stats.rateApp')}</Text>
        </Pressable>
      </ScrollView>

      {/* 캡처 전용 화면 밖 카드 (렌더는 되지만 화면엔 안 보임) */}
      <View style={styles.offscreen} pointerEvents="none">
        <ShareCard ref={cardRef} streak={streak} memorized={summary?.totalMemorized ?? 0} />
      </View>

      {/* 날짜 탭 상세 — 하단 시트. 기록은 불변: 미암기로 되돌린 단어는 배지로만 구분.
          ⓘ 설명은 네이티브 Alert(모달 위에 안전하게 뜸). */}
      <Modal visible={selectedDate !== null} transparent animationType="slide" onRequestClose={closeDay}>
        <View style={styles.sheetRoot}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={closeDay} />
          <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.borderLight }]} />
            <Text style={[styles.sheetDate, { color: colors.text }]}>{sheetTitle}</Text>
            <View style={styles.sheetSumRow}>
              <Text style={[styles.sheetSum, { color: colors.textSecondary }]}>
                {t('stats.reviewedCount', { count: dayDetail?.studiedCount ?? 0 })}
                {' · '}
                <Text style={{ color: colors.primary, fontFamily: 'Pretendard_700Bold' }}>
                  {t('stats.memorizedCount', { count: dayDetail?.memorizedCount ?? 0 })}
                </Text>
              </Text>
              <Pressable
                onPress={() => Alert.alert(t('stats.termInfoTitle'), t('stats.termInfoBody'))}
                hitSlop={10}
              >
                <Ionicons name="information-circle-outline" size={17} color={colors.textTertiary} />
              </Pressable>
            </View>

            {dayDetail === null ? (
              <ActivityIndicator style={styles.sheetLoading} color={colors.primary} />
            ) : dayDetail.words.length > 0 ? (
              <ScrollView style={styles.sheetList} bounces={false}>
                {dayDetail.words.map(w => (
                  <View key={w.id} style={[styles.wordRow, { borderTopColor: colors.borderLight }]}>
                    <View style={styles.wordTextCol}>
                      <Text style={[styles.wordTerm, { color: colors.text }]} numberOfLines={1}>{w.term}</Text>
                      {!!w.meaningKr && (
                        <Text style={[styles.wordMeaning, { color: colors.textSecondary }]} numberOfLines={1}>
                          {w.meaningKr}
                        </Text>
                      )}
                    </View>
                    {!w.isMemorized && (
                      <View style={[styles.wordBadge, { backgroundColor: colors.surfaceSecondary }]}>
                        <Text style={[styles.wordBadgeText, { color: colors.textTertiary }]}>
                          {t('stats.notMemorized')}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            ) : dayDetail.memorizedCount > 0 && dayDetail.logCount === 0 ? (
              // memorized_log 도입 이전의 기록 — 개수만 있고 목록은 없다.
              <View style={[styles.sheetNotice, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <Text style={[styles.sheetNoticeText, { color: colors.textSecondary }]}>
                  {t('stats.preLogNotice')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  heroImg: { width: 52, height: 52, borderRadius: 26 },
  heroNum: { fontSize: 26, fontFamily: 'Pretendard_700Bold', letterSpacing: -0.5, lineHeight: 31 },
  heroLabel: { fontSize: 12, fontFamily: 'Pretendard_700Bold', textAlign: 'center' },
  heroRight: { marginLeft: 'auto', alignItems: 'flex-end', gap: 6 },
  heroSub: { fontSize: 12, fontFamily: 'Pretendard_500Medium' },
  heroRec: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  heroRecText: { fontSize: 11, fontFamily: 'Pretendard_600SemiBold' },

  tiles: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 11,
  },
  tile: {
    flex: 1,
    borderRadius: 13,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 3,
  },
  tileNum: { fontSize: 15.5, fontFamily: 'Pretendard_700Bold', letterSpacing: -0.3 },
  tileLabel: { fontSize: 10, fontFamily: 'Pretendard_500Medium' },

  cal: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginTop: 11,
  },
  calHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  calArrow: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  calMonth: { fontSize: 15, fontFamily: 'Pretendard_700Bold' },
  calRow: { flexDirection: 'row' },
  calCell: { flex: 1, aspectRatio: 1, padding: 3, alignItems: 'center', justifyContent: 'center' },
  calDow: { fontSize: 10.5, fontFamily: 'Pretendard_600SemiBold' },
  calDay: {
    // 크기·반경은 인라인(dayCircle)으로 부여. 명시적 정사각 + borderRadius 절반 = 완전한 원.
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDayNum: { fontSize: 12.5, fontFamily: 'Pretendard_600SemiBold' },
  calHint: { fontSize: 10.5, fontFamily: 'Pretendard_500Medium', textAlign: 'center', paddingTop: 8 },

  quote: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 11,
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
  saveText: { fontSize: 14, fontFamily: 'Pretendard_600SemiBold', textAlign: 'center' },
  rateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 2,
  },
  rateText: { fontSize: 13.5, fontFamily: 'Pretendard_600SemiBold' },
  offscreen: { position: 'absolute', left: -10000, top: 0 },

  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 8,
    maxHeight: '75%',
  },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  sheetDate: { fontSize: 17, fontFamily: 'Pretendard_700Bold' },
  sheetSumRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, marginBottom: 10 },
  sheetSum: { fontSize: 13, fontFamily: 'Pretendard_500Medium' },
  sheetLoading: { paddingVertical: 28 },
  sheetList: { flexGrow: 0 },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  wordTextCol: { flex: 1, gap: 2 },
  wordTerm: { fontSize: 15, fontFamily: 'Pretendard_700Bold' },
  wordMeaning: { fontSize: 12.5, fontFamily: 'Pretendard_500Medium' },
  wordBadge: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
  wordBadgeText: { fontSize: 10, fontFamily: 'Pretendard_700Bold' },
  sheetNotice: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 14,
    marginTop: 2,
  },
  sheetNoticeText: { fontSize: 12.5, fontFamily: 'Pretendard_500Medium', textAlign: 'center', lineHeight: 19 },
});
