/**
 * "채울 단어 고르기" — 반쪽 단어 중 어느 것을 채울지 고르는 전용 화면.
 *
 * 🔴 단어장의 `editMode`를 재사용하지 않는 이유: 선택 모드에 들어가면 필터 줄이 통째로
 * "전체 선택"으로 덮인다(app/list/[id].tsx 의 `renderFilterHeader` 첫 분기). 이 화면은
 * 필터가 목적이라 그럴 수 없다. 대신 **필터 줄의 생김새와 동작은 그대로 복제**한다 —
 * 정렬(최신순 → 사전순 → 역순)·상태(전체 → 미암기 → 암기)는 탭할 때마다 순환이고,
 * 새 문법을 만들지 않는다.
 *
 * 🔑 별표는 옮기지 않는다. 단어장의 `renderItem`이 선택 모드에서 체크박스를 **별표 왼쪽에
 * 끼워 넣을 뿐** 별표 자리를 그대로 두는 것과 같다 — 두 화면의 별표 위치가 어긋나지 않는다.
 * 스피커만 빠진다(발음이 없는 단어라 쓸모가 없다).
 *
 * 🔑 174개 중 50개만 되는 상황에서 **어느 50개인지는 사용자만 정할 수 있다**("외운 건 됐고
 * 별표한 것만 먼저", "곧 시험 볼 것"). 그래서 한도만큼 자동으로 고르는 것은 출발점일 뿐이고,
 * 정렬을 바꾸면 채우는 순서도 그 순서를 따른다 — 사용자가 정한 순서가 기본값을 이긴다.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Platform } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { useListWords } from '@/features/vocab';
import { useSettings } from '@/features/settings';
import { useQuotaStore, getQuotaLeft } from '@/features/quota';
import { splitFillTargets, isBareWord, needsExample, setPendingFill, loadUnfillable, clearUnfillable } from '@/features/bare-words';
import { FontSize, FontWeight, Radius } from '@/constants/tokens';
import type { Word } from '@/lib/types';

type FilterStatus = 'all' | 'learning' | 'memorized';
type SortOrder = 'newest' | 'az' | 'za';

export default function FillBareScreen() {
  /**
   * `target` 은 **무엇을 채울 것인가** 하나만 정한다(기본 = 뜻만 있는 단어).
   * 예문 학습에서 열면 「예문 없는 단어」가 대상이 된다 — 두 집합은 28% 어긋난다
   * (docs/example-study-consent-spec.md §3). 나머지(정렬·상한·순서·확정)는 한 벌이다.
   */
  const { id, target } = useLocalSearchParams<{ id: string; target?: string }>();
  const forExamples = target === 'example';
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { apiKey } = useSettings();
  const quotaStatus = useQuotaStore(s => s.status);

  const allWords = useListWords(id!);

  const [filterStarred, setFilterStarred] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  // AI 가 못 찾은 단어. 고를 수는 없지만 **목록 맨 아래에 남긴다** — 배너를 닫은 뒤
  // "얘는 왜 안 채워지지"를 확인할 자리가 여기밖에 없다. 눌러 열면 철자를 고칠 수 있고,
  // 고치면 표시가 풀려 다시 대상이 된다.
  const [unfillable, setUnfillable] = useState<ReadonlySet<string>>(() => new Set());
  // 🔴 마운트 때 한 번만 읽으면 안 된다 — 여기서 단어를 눌러 철자를 고치고 돌아와도
  // 목록이 옛 값이라 그 단어가 "못 찾음"에 그대로 남는다(실기에서 확인).
  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => { const ids = await loadUnfillable(); if (alive) setUnfillable(ids); })();
    return () => { alive = false; };
  }, []));

  const split = useMemo(
    () => splitFillTargets(allWords, unfillable, forExamples ? needsExample : isBareWord),
    [allWords, unfillable, forExamples],
  );
  /** 고를 수 있는 대상 — 언제나 오래 담아둔 것부터. */
  const bare = split.fillable;

  /**
   * 고를 수 있는 상한과, 그 상한을 **한도가 만든 것인지** 를 나눠 둔다.
   *
   * 🔴 둘을 뭉치면 "고를 게 2개뿐"인 상황이 "한도가 2개로 잘랐다"로 읽힌다 — 실기에서
   * 잔량이 42인데 반쪽이 2개뿐이라 "2개 중 2개까지만 고를 수 있어요"라는 거짓 경고가 떴다.
   * BYOK·응답 대기(null)는 "모른다"이지 0이 아니므로 한도로 치지 않는다.
   */
  const quotaLeft = apiKey ? null : getQuotaLeft(quotaStatus);
  const limit = Math.min(quotaLeft ?? bare.length, bare.length);
  /** 한도가 실제로 자르는가 — 반쪽이 잔량보다 많을 때만 참. */
  const quotaCaps = quotaLeft != null && quotaLeft < bare.length;

  // 기본 선택은 오래 담아둔 것부터 한도만큼. 사용자가 건드리면 그 뒤로는 사용자 것이다.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // 처음 한 번, 오래 담아둔 것부터 한도만큼 골라 둔다. 목록·한도가 늦게 오므로
  // 값이 갖춰진 첫 순간에 세운다(이후에는 사용자 선택이 이긴다).
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || bare.length === 0) return;
    seeded.current = true;
    setSelected(new Set(bare.slice(0, limit).map(w => w.id)));
  }, [bare, limit]);

  const filtered = useMemo(() => {
    const rows = bare.filter(w => {
      if (filterStarred && !w.isStarred) return false;
      if (filterStatus === 'learning' && w.isMemorized) return false;
      if (filterStatus === 'memorized' && !w.isMemorized) return false;
      return true;
    });
    const sorted = [...rows];
    if (sortOrder === 'az') sorted.sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));
    else if (sortOrder === 'za') sorted.sort((a, b) => b.term.localeCompare(a.term, 'en', { sensitivity: 'base' }));
    else sorted.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return sorted;
  }, [bare, filterStarred, filterStatus, sortOrder]);

  /**
   * 🔴 선택은 **항상 현재 대상 안으로 좁힌다.** 못 찾은 목록은 비동기로 늦게 오므로,
   * 첫 렌더에서 자동 선택된 단어가 그 뒤 대상에서 빠져도 선택에는 남는다 — 실기에서
   * 고를 수 있는 것이 0개인데 "3/0", "3개를 골라 뒀어요", 활성화된 "3개 채우기"가 나왔고,
   * 눌러도 넘길 id 가 없어 조용히 아무 일도 일어나지 않았다.
   */
  const selectable = useMemo(() => new Set(bare.map(w => w.id)), [bare]);
  const picked = useMemo(
    () => new Set([...selected].filter(id => selectable.has(id))),
    [selected, selectable],
  );

  /** 못 찾은 단어 — 같은 필터를 적용하되 정렬은 하지 않고 맨 아래에 붙인다. */
  const notFoundRows = useMemo(() => split.unfillable.filter(w => {
    if (filterStarred && !w.isStarred) return false;
    if (filterStatus === 'learning' && w.isMemorized) return false;
    if (filterStatus === 'memorized' && !w.isMemorized) return false;
    return true;
  }), [split.unfillable, filterStarred, filterStatus]);

  const atLimit = quotaCaps && picked.size >= limit;

  const toggle = useCallback((wordId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(wordId)) next.delete(wordId);
      // 🔴 한도에 닿으면 더 못 고르게 막는다. 51번째가 조용히 안 눌리면 고장으로 읽히므로
      // 이유는 행에 적는다(아래 miss 줄).
      else if (next.size < limit) next.add(wordId);
      else return prev;
      return next;
    });
    Haptics.selectionAsync();
  }, [limit]);

  // 🔑 전체 선택은 **지금 필터에 걸린 것에만** 적용한다 — 단어장의 toggleSelectAll 이
  // filteredWords 를 쓰는 것과 같은 규칙. 필터를 바꿔도 선택 자체는 유지된다(별표만 봤다가
  // 전체로 돌아왔을 때 고른 것이 풀리면 처음부터 다시 골라야 한다).
  const toggleAll = useCallback(() => {
    setSelected(prev => {
      const allOn = filtered.length > 0 && filtered.every(w => prev.has(w.id));
      const next = new Set(prev);
      if (allOn) {
        for (const w of filtered) next.delete(w.id);
      } else {
        for (const w of filtered) {
          if (next.size >= limit) break;
          next.add(w.id);
        }
      }
      return next;
    });
    Haptics.selectionAsync();
  }, [filtered, limit]);

  const confirm = () => {
    // 정렬을 바꿨으면 채우는 순서도 그 순서를 따른다 — 사용자가 정한 순서가 기본값을 이긴다.
    const ordered = filtered.filter(w => picked.has(w.id)).map(w => w.id);
    // 필터 밖에 있지만 선택된 것은 원래 순서(오래된 것부터)로 뒤에 붙인다.
    const inOrder = new Set(ordered);
    const rest = bare.filter(w => picked.has(w.id) && !inOrder.has(w.id)).map(w => w.id);
    setPendingFill(id!, [...ordered, ...rest]);
    // 🔴 예문 학습에서 왔으면 **학습으로 돌아가야 한다.** dismissTo 로 단어장에 내려놓으면
    // 하던 세션에서 쫓겨나고 고른 단어는 거기서 채워진다 — "지금 하고 싶다"는 의도의 반대다.
    // 이 경로는 예문 학습 화면에서만 열리므로 back 이 언제나 그 화면이다.
    if (forExamples) { router.back(); return; }
    // 🔴 아래는 router.back() 이면 안 된다 — 이 화면은 단어장 상세(배너)에서도, 목록 탭의 ⋯
    // 메뉴에서도 열린다. 메뉴로 들어온 경우 back 은 **목록 탭**으로 가는데 채우기를 이어받는
    // 쪽은 상세 화면이라, 사용자가 "채우기"를 눌러도 아무 일도 일어나지 않는다(실기에서 확인).
    // dismissTo 는 스택에 그 화면이 있으면 되돌아가고, 없으면 이동한다 — 두 경로 모두 맞다.
    router.dismissTo({ pathname: '/list/[id]', params: { id: id! } });
  };

  const cycleSort = () => {
    setSortOrder(p => (p === 'newest' ? 'az' : p === 'az' ? 'za' : 'newest'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const cycleStatus = () => {
    setFilterStatus(p => (p === 'all' ? 'learning' : p === 'learning' ? 'memorized' : 'all'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const sortLabel = sortOrder === 'az' ? t('list.sortAlpha') : sortOrder === 'za' ? t('list.sortReverse') : t('list.sortRecent');
  const sortIcon: React.ComponentProps<typeof Ionicons>['name'] =
    sortOrder === 'az' ? 'arrow-down-outline' : sortOrder === 'za' ? 'arrow-up-outline' : 'time-outline';
  const sortActive = sortOrder !== 'newest';

  const statusIcon: React.ComponentProps<typeof Ionicons>['name'] =
    filterStatus === 'learning' ? 'ellipse-outline' : filterStatus === 'memorized' ? 'checkmark-circle' : 'filter-outline';
  const statusColor = filterStatus === 'learning' ? colors.primary : filterStatus === 'memorized' ? colors.success : colors.textTertiary;
  const statusLabel = filterStatus === 'learning' ? t('list.filterLearning') : filterStatus === 'memorized' ? t('list.filterMemorized') : t('list.filterAll');

  const allFilteredOn = filtered.length > 0 && filtered.every(w => picked.has(w.id));
  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

  const renderRow = ({ item }: { item: Word }) => {
    const on = picked.has(item.id);
    const blocked = !on && atLimit;
    return (
      <Pressable
        onPress={() => toggle(item.id)}
        style={[styles.row, { borderBottomColor: colors.borderLight, opacity: blocked ? 0.45 : 1 }]}
      >
        <Ionicons
          name={on ? 'checkbox' : 'square-outline'}
          size={22}
          color={on ? colors.primary : colors.textTertiary}
        />
        {/* 별표는 단어장과 같은 자리 — 체크박스가 그 왼쪽에 끼어들 뿐이다. */}
        <Ionicons
          name={item.isStarred ? 'star' : 'star-outline'}
          size={20}
          color={item.isStarred ? colors.starGold : colors.textTertiary}
        />
        <View style={styles.rowText}>
          <Text style={[styles.term, { color: colors.text }]} numberOfLines={1}>{item.term}</Text>
          <Text style={[styles.miss, { color: blocked ? colors.textTertiary : colors.warning }]} numberOfLines={1}>
            {blocked ? t('bareWords.pickBlocked') : t(forExamples ? 'examples.pickMissing' : 'bareWords.pickMissing')}
          </Text>
        </View>
        <Ionicons
          name={item.isMemorized ? 'checkmark-circle' : 'ellipse-outline'}
          size={20}
          color={item.isMemorized ? colors.success : colors.textTertiary}
        />
      </Pressable>
    );
  };

  /**
   * 못 찾은 단어 — 목록 **맨 아래**에 모은다. 고를 수 있는 것이 위에 모여야 고르기가 쉽다.
   * 선택은 못 하고, 누르면 단어가 열려 철자를 고칠 수 있다(고치면 표시가 풀린다).
   */
  const renderNotFound = () => {
    if (notFoundRows.length === 0) return null;
    return (
      <View>
        <Text style={[styles.groupHead, { color: colors.textSecondary, borderTopColor: colors.borderLight }]}>
          {t('bareWords.notFoundGroup', { count: notFoundRows.length })}
        </Text>
        {notFoundRows.map(w => (
          <Pressable
            key={w.id}
            onPress={() => {
              // 표제어를 고치면 다시 대상이 된다 — 그래서 여기서 표시를 미리 푼다.
              void clearUnfillable([w.id]);
              router.push({ pathname: '/add-word', params: { listId: id!, wordId: w.id } });
            }}
            style={[styles.row, { borderBottomColor: colors.borderLight, opacity: 0.55 }]}
          >
            <Ionicons name="help-circle-outline" size={22} color={colors.textTertiary} />
            <Ionicons
              name={w.isStarred ? 'star' : 'star-outline'}
              size={20}
              color={w.isStarred ? colors.starGold : colors.textTertiary}
            />
            <View style={styles.rowText}>
              <Text style={[styles.term, { color: colors.text }]} numberOfLines={1}>{w.term}</Text>
              <Text style={[styles.miss, { color: colors.textTertiary }]} numberOfLines={1}>
                {t('bareWords.notFoundRow')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </Pressable>
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {t('bareWords.pickTitle')}
        </Text>
        {bare.length > 0 && (
          <Text style={[styles.counter, { color: atLimit ? colors.warning : colors.primary }]}>
            {picked.size}/{limit}
          </Text>
        )}
      </View>

      {/* 네 열이 세로로 맞는다 — ☑ 전체선택 · ★ 별표필터 · 정렬 · ◯ 상태필터가
          각 행의 같은 열 바로 위에 서서, 무엇을 거르는 스위치인지 선으로 보인다. */}
      <View style={[styles.filterBar, { borderBottomColor: colors.borderLight }]}>
        <Pressable onPress={toggleAll} hitSlop={8}>
          <Ionicons
            name={allFilteredOn ? 'checkbox' : 'square-outline'}
            size={22}
            color={allFilteredOn ? colors.primary : colors.textTertiary}
          />
        </Pressable>
        <Pressable onPress={() => { setFilterStarred(v => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} hitSlop={8}>
          <Ionicons name={filterStarred ? 'star' : 'star-outline'} size={20} color={filterStarred ? colors.starGold : colors.textTertiary} />
        </Pressable>
        <Pressable onPress={cycleSort} hitSlop={8} style={styles.sortBtn}>
          <Ionicons name={sortIcon} size={13} color={sortActive ? colors.primary : colors.textSecondary} />
          <Text style={[styles.filterText, { color: sortActive ? colors.primary : colors.textSecondary }]}>
            {sortLabel} ({filtered.length})
          </Text>
        </Pressable>
        <Pressable onPress={cycleStatus} hitSlop={8} style={styles.statusBtn}>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          <Ionicons name={statusIcon} size={20} color={statusColor} />
        </Pressable>
      </View>

      {/* 고를 수 있는 것이 없으면 안내도 버튼도 그리지 않는다 — 아래 "못 찾은 단어"만 남는다. */}
      {bare.length > 0 && (
        <Text style={[styles.hint, { color: atLimit ? colors.warning : colors.textSecondary, backgroundColor: atLimit ? colors.warningLight : 'transparent' }]}>
          {atLimit
            ? t('bareWords.pickLimitHint', { total: filtered.length, limit })
            : t('bareWords.pickHint', { count: picked.size })}
        </Text>
      )}

      <FlatList
        data={filtered}
        keyExtractor={w => w.id}
        renderItem={renderRow}
        ListFooterComponent={renderNotFound()}
        contentContainerStyle={{ paddingBottom: insets.bottom + (bare.length > 0 ? 90 : 24) }}
        showsVerticalScrollIndicator={false}
      />

      {bare.length > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background, borderTopColor: colors.borderLight }]}>
          <Pressable
            onPress={confirm}
            disabled={picked.size === 0}
            style={[styles.btn, { backgroundColor: colors.primaryButton, opacity: picked.size === 0 ? 0.5 : 1 }]}
          >
            <Text style={[styles.btnText, { color: colors.onPrimary }]}>
              {t('bareWords.fillCount', { count: picked.size })}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { flex: 1, fontSize: 16, fontFamily: 'Pretendard_600SemiBold' },
  counter: { fontSize: 13, fontFamily: 'Pretendard_700Bold' },
  filterBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  sortBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  filterText: { fontSize: 12, fontFamily: 'Pretendard_500Medium' },
  statusText: { fontSize: 11, fontFamily: 'Pretendard_600SemiBold', textTransform: 'uppercase' },
  groupHead: { fontSize: FontSize.label, fontFamily: FontWeight.semibold, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8 },
  hint: { fontSize: FontSize.label, fontFamily: FontWeight.regular, paddingHorizontal: 16, paddingVertical: 8, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1 },
  rowText: { flex: 1, gap: 2 },
  term: { fontSize: 14, fontFamily: 'Pretendard_600SemiBold' },
  miss: { fontSize: 11, fontFamily: 'Pretendard_400Regular' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  btn: { borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center' },
  btnText: { fontSize: FontSize.action, fontFamily: FontWeight.semibold },
});
