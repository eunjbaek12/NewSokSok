import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { useLists } from '@/features/vocab';
import SpeakerButton from '@/components/ui/SpeakerButton';
import { getSpeakableText, getStudySourceLang, getTtsLang } from '@/constants/languages';
import { FontSize, FontWeight, Radius } from '@/constants/tokens';
import { buildAnswerSheet, answerOf, promptOf, normalizeAnswer, wrongCount, type SheetRow, type AnswerSheetItem } from './sheet';
import { AnswerKey, MarkIcon } from './parts';

interface Summary {
  accuracy: number;
  duration: string;
  memorized: number;
  needsReview: number;
  allCorrect: boolean;
  subtitle: string;
}

interface Props {
  records: SheetRow[][];
  listId: string | undefined;
  summary: Summary;
  paddingTop: number;
  paddingBottom: number;
}

type Item = { kind: 'summary' } | { kind: 'filter' } | AnswerSheetItem;

/**
 * 시험지 결과 화면 — 줄인 요약 아래 전체 답안지를 쭉(D16·D18).
 *
 * 요약·전환 줄·답안을 **한 목록의 항목**으로 둔다. 전환 줄을 스크롤해도 위에 붙여야 해서(D20)
 * stickyHeaderIndices 를 쓰는데, ListHeaderComponent 에 넣으면 붙일 수가 없다.
 * 답안지는 **처음 채점 결과**다(D21) — 다시 풀기 결과는 records 에 들어오지 않는다.
 */
export default function AnswerSheetList({ records, listId, summary, paddingTop, paddingBottom }: Props) {
  const { colors, fontFamily } = useTheme();
  const { t } = useTranslation();
  const lists = useLists();
  const list = lists.find(l => l.id === listId);
  const [onlyWrong, setOnlyWrong] = useState(false);

  const total = useMemo(() => records.reduce((n, rows) => n + rows.length, 0), [records]);
  const wrong = useMemo(() => records.reduce((n, rows) => n + wrongCount(rows), 0), [records]);
  // 틀린 게 없으면 전환 줄을 숨긴다 — 그때 «틀린 것»은 빈 목록일 뿐이다.
  const showFilter = wrong > 0;
  const data = useMemo<Item[]>(() => [
    { kind: 'summary' },
    ...(showFilter ? [{ kind: 'filter' } as const] : []),
    ...buildAnswerSheet(records, showFilter && onlyWrong),
  ], [records, showFilter, onlyWrong]);

  const renderItem = ({ item }: { item: Item }) => {
    if (item.kind === 'summary') {
      return (
        <View style={styles.summary}>
          <View style={styles.titleRow}>
            <View style={[styles.titleIcon, { backgroundColor: summary.allCorrect ? colors.successLight : colors.primaryLight }]}>
              <Ionicons
                name={summary.allCorrect ? 'trophy' : 'checkmark-circle'}
                size={26}
                color={summary.allCorrect ? colors.success : colors.primary}
              />
            </View>
            <View style={styles.titleText}>
              <Text style={[styles.title, { color: colors.text, fontFamily: fontFamily.bold }]}>{t('studyResults.complete')}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{summary.subtitle}</Text>
            </View>
          </View>
          <View style={[styles.stats, { backgroundColor: colors.surface, shadowColor: colors.cardShadow }]}>
            <Stat value={`${summary.accuracy}%`} label={t('studyResults.accuracy')} color={colors.text} labelColor={colors.textTertiary} first />
            <Stat value={summary.duration} label={t('studyResults.duration')} color={colors.text} labelColor={colors.textTertiary} dividerColor={colors.borderLight} />
            <Stat value={String(summary.memorized)} label={t('testSheet.statMemorized')} color={colors.success} labelColor={colors.textTertiary} dividerColor={colors.borderLight} />
            <Stat value={String(summary.needsReview)} label={t('testSheet.statNeedsReview')} color={colors.warning} labelColor={colors.textTertiary} dividerColor={colors.borderLight} />
          </View>
        </View>
      );
    }

    if (item.kind === 'filter') {
      // 위에 붙는 줄이라 배경을 칠한다 — 비우면 아래로 지나가는 답안이 비친다.
      return (
        <View style={[styles.filterBar, { backgroundColor: colors.background }]}>
          <View style={[styles.segment, { backgroundColor: colors.surfaceSecondary }]}>
            {([
              [false, t('testSheet.filterAll', { count: total })],
              [true, t('testSheet.filterWrong', { count: wrong })],
            ] as const).map(([value, label]) => {
              const active = onlyWrong === value;
              return (
                <Pressable
                  key={String(value)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => setOnlyWrong(value)}
                  style={[styles.segmentTab, active && { backgroundColor: colors.surface }]}
                >
                  <Text style={[active ? styles.segmentTextActive : styles.segmentText, { color: active ? colors.primary : colors.textSecondary }]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      );
    }

    if (item.kind === 'set') {
      return (
        <View style={styles.setDivider}>
          <Text style={[styles.setLabel, { color: colors.textSecondary }]}>
            {t('testSheet.setDivider', { n: item.setNumber })}
            <Text style={[styles.setScore, { color: colors.textTertiary }]}>{`  ·  ${item.ok}/${item.total}`}</Text>
          </Text>
          <View style={[styles.setLine, { backgroundColor: colors.borderLight }]} />
        </View>
      );
    }

    const { row, n } = item;
    const answer = answerOf(row);
    const blank = !normalizeAnswer(row.typed);
    const exact = !blank && normalizeAnswer(row.typed) === normalizeAnswer(answer);
    const isTermPrompt = row.direction === 'term-to-meaning';
    const sourceLang = getStudySourceLang(row.word, list);

    return (
      <View style={[styles.row, { borderBottomColor: colors.borderLight }]}>
        <Text style={[styles.num, { color: colors.textTertiary }]}>{n}</Text>
        <Text style={[styles.prompt, isTermPrompt ? styles.promptTerm : styles.promptMeaning, { color: colors.text }]}>
          {promptOf(row)}
        </Text>
        <View style={styles.answer}>
          {row.mark === 'ok' ? (
            <>
              <Text style={[blank ? styles.blank : styles.typed, { color: blank ? colors.textTertiary : colors.text }]}>
                {blank ? t('testSheet.notWritten') : row.typed}
              </Text>
              {!exact && <AnswerKey answer={answer} colors={colors} t={t} />}
            </>
          ) : (
            <>
              {blank ? (
                <Text style={[styles.blank, { color: colors.textTertiary }]}>{t('testSheet.notWritten')}</Text>
              ) : (
                <Text style={[styles.wrongTyped, { color: colors.warning }]}>{row.typed}</Text>
              )}
              <Text style={[styles.typed, { color: colors.text }]}>{answer}</Text>
            </>
          )}
        </View>
        <SpeakerButton
          text={getSpeakableText(row.word.term, row.word.phonetic, sourceLang)}
          language={getTtsLang(sourceLang)}
          size={18}
          style={styles.speaker}
        />
        <View style={styles.mark}>
          {row.mark && (
            <MarkIcon mark={row.mark} colors={colors} label={t(row.mark === 'ok' ? 'testSheet.markOk' : 'testSheet.markNo')} />
          )}
        </View>
      </View>
    );
  };

  return (
    <FlatList
      data={data}
      keyExtractor={(item, index) =>
        item.kind === 'row' ? `r${item.n}` : item.kind === 'set' ? `s${item.setNumber}` : `${item.kind}${index}`
      }
      renderItem={renderItem}
      stickyHeaderIndices={showFilter ? [1] : undefined}
      initialNumToRender={20}
      contentContainerStyle={{ paddingTop, paddingBottom }}
    />
  );
}

function Stat({ value, label, color, labelColor, dividerColor, first }: {
  value: string;
  label: string;
  color: string;
  labelColor: string;
  dividerColor?: string;
  first?: boolean;
}) {
  return (
    <View style={[styles.stat, !first && { borderLeftWidth: 1, borderLeftColor: dividerColor }]}>
      <Text style={[styles.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={[styles.statLabel, { color: labelColor }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // 배경 + 반경인 원은 Android(Fabric)에서 네모로 그려질 수 있다 — overflow 로 잘라 둔다(CLAUDE.md).
  titleIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  titleText: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: FontSize.small,
    fontFamily: FontWeight.regular,
    marginTop: 2,
  },
  stats: {
    flexDirection: 'row',
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: Radius.lg,
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 14 },
      android: { elevation: 3 },
    }),
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  statValue: {
    fontSize: 19,
    fontFamily: FontWeight.bold,
    lineHeight: 24,
  },
  statLabel: {
    fontSize: FontSize.label,
    fontFamily: FontWeight.medium,
  },
  filterBar: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  // 작은 세그먼트(DESIGN.md §7)
  segment: {
    flexDirection: 'row',
    borderRadius: Radius.sm,
    padding: 2,
  },
  segmentTab: {
    flex: 1,
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: 'center',
  },
  segmentText: {
    fontSize: FontSize.small,
    fontFamily: FontWeight.medium,
  },
  segmentTextActive: {
    fontSize: FontSize.small,
    fontFamily: FontWeight.semibold,
  },
  setDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  setLabel: {
    fontSize: FontSize.label,
    fontFamily: FontWeight.semibold,
  },
  setScore: {
    fontFamily: FontWeight.medium,
  },
  setLine: {
    flex: 1,
    height: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    minHeight: 54,
    borderBottomWidth: 1,
  },
  num: {
    width: 22,
    fontSize: FontSize.label,
    fontFamily: FontWeight.medium,
  },
  prompt: {
    flex: 1.25,
  },
  promptMeaning: {
    fontSize: FontSize.bodyLg,
    fontFamily: FontWeight.medium,
  },
  promptTerm: {
    fontSize: FontSize.action,
    fontFamily: FontWeight.semibold,
  },
  answer: {
    flex: 1,
    gap: 2,
  },
  typed: {
    fontSize: FontSize.action,
    fontFamily: FontWeight.semibold,
  },
  wrongTyped: {
    fontSize: FontSize.body,
    fontFamily: FontWeight.medium,
    textDecorationLine: 'line-through',
  },
  blank: {
    fontSize: FontSize.small,
    fontFamily: FontWeight.regular,
  },
  speaker: {
    width: 22,
    alignItems: 'center',
  },
  mark: {
    width: 22,
    alignItems: 'flex-end',
  },
});
