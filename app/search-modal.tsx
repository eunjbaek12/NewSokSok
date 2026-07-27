/**
 * 내 단어 검색 · 골라서 학습 — 화면 하나를 두 진입점이 공유한다.
 *
 * `mode=pick`으로 들어오면(홈 카드) 입력창 자리에 제목이 오고 텍스트 검색이
 * 없다. 조건으로 고르러 온 자리이기 때문이다. 그 외에는(단어장 탭 검색)
 * 입력창이 자동 포커스되는 찾기 자세로 연다. 칩·목록·학습 바는 완전히 같다.
 *
 * 스크롤되는 건 목록뿐이다 — 칩 영역·결과 줄·학습 바는 고정이다. 패널 전체를
 * ScrollView로 감싸면 FlatList 가상화 경고와 제스처 충돌이 난다.
 */
import React, { useState, useMemo, useDeferredValue, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    Pressable,
    FlatList,
    KeyboardAvoidingView,
    Keyboard,
    Platform,
    ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/features/theme';
import { useLists } from '@/features/vocab';
import { useSettings } from '@/features/settings';
import { getTopTags, type SearchResult } from '@/lib/search';
import { displayTag } from '@/lib/tag-display';
import { POS_ALL, POS_OTHER, presentPosCategories, type PosFilter } from '@/lib/pos';
import { getRelativeTime } from '@/components/ListCard';
import ListDayPicker from '@/components/ListDayPicker';
import { setStudySelection } from '@/features/study';
import {
    collectScopeItems,
    selectPickResults,
    countActiveFilters,
    summarizeScope,
    scopeStillExists,
    scopeLabel,
    conditionLabel,
    wordFilterLabel,
    resultsToWords,
    shuffleWords,
    usePickStore,
    PRESET_LIMIT,
    type WordFilter,
} from '@/features/study/pick';

/** 상태 줄 칩 순서 — 쓰는 빈도순. 별표는 독립 토글이라 이 목록에 없다. */
const STATUS_KEYS: WordFilter[] = ['all', 'learning', 'memorized'];
const PRESET_KEYS: WordFilter[] = ['wrongCount', 'recent'];

export default function SearchModalScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const lists = useLists();
    const { mode } = useLocalSearchParams<{ mode?: string }>();
    const isPick = mode === 'pick';

    const { customStudySettings, updateCustomStudySettings, studySettings } = useSettings();
    const filters = usePickStore(s => s.filters);
    const setFilters = usePickStore(s => s.setFilters);
    const applyFilters = usePickStore(s => s.applyFilters);
    const resetFilters = usePickStore(s => s.resetFilters);
    const recents = usePickStore(s => s.recents);
    const hydrateRecents = usePickStore(s => s.hydrateRecents);
    const rememberCondition = usePickStore(s => s.rememberCondition);

    const [query, setQuery] = useState('');
    const [showListPicker, setShowListPicker] = useState(false);

    // 키입력은 즉시 반응, 무거운 필터 연산은 낮은 우선순위로 처리
    const deferredQuery = useDeferredValue(query);

    useEffect(() => { hydrateRecents(); }, [hydrateRecents]);

    const visibleLists = useMemo(() => lists.filter(l => l.isVisible), [lists]);

    // 범위(단어장·Day)까지만 적용한 풀. 품사 칩·태그 칩의 후보도 여기서 뽑는다 —
    // 전체가 아니라 지금 범위에 실제로 있는 것만 보여야 고를 수 있는 칩이 된다.
    //
    // 범위 세 필드에만 의존한다. filters 전체를 넣으면 상태·품사·태그 칩을 누를
    // 때마다 단어를 다시 수집하고, 그 뒤의 topTags·posOptions까지 함께 다시 돈다.
    const scope = useMemo(
        () => ({
            useAllLists: filters.useAllLists,
            selectedListIds: filters.selectedListIds,
            selectedDaysByList: filters.selectedDaysByList,
        }),
        [filters.useAllLists, filters.selectedListIds, filters.selectedDaysByList],
    );
    const scopeItems = useMemo(() => collectScopeItems(visibleLists, scope), [visibleLists, scope]);

    const topTags = useMemo(() => getTopTags(scopeItems), [scopeItems]);
    const posOptions = useMemo(() => presentPosCategories(scopeItems.map(d => d.word)), [scopeItems]);
    const showPosFilter = posOptions.keys.length + (posOptions.hasOther ? 1 : 0) >= 2;

    const activeFilterCount = countActiveFilters(filters);

    // 질의나 필터가 있을 때만 목록을 띄운다 — 두 자세가 같다. 고르러 온 자세도
    // 첫 화면은 "무엇으로 좁힐까"를 묻는 자리이고, 그 빈 자리가 지난번 조건의
    // 자리다. 필터를 하나라도 걸면 그때부터 단어가 나온다.
    const browse = activeFilterCount > 0;
    const showResults = browse || !!query.trim();

    const results = useMemo(
        () => (showResults ? selectPickResults(scopeItems, deferredQuery, filters, browse) : []),
        [showResults, scopeItems, deferredQuery, filters, browse],
    );

    // 범위가 바뀌어 선택했던 품사가 사라지면 자동으로 '전체'로 되돌린다.
    useEffect(() => {
        if (filters.posFilter === POS_ALL) return;
        const available = filters.posFilter === POS_OTHER
            ? posOptions.hasOther
            : (posOptions.keys as string[]).includes(filters.posFilter);
        if (!available) setFilters({ posFilter: POS_ALL });
    }, [posOptions, filters.posFilter, setFilters]);

    // 단어 구성이 바뀌어 선택했던 태그가 사라지면 자동 해제.
    useEffect(() => {
        if (filters.tag && !topTags.includes(filters.tag)) setFilters({ tag: null });
    }, [topTags, filters.tag, setFilters]);

    // 삭제된 단어장 ID 자동 정리 — 남겨두면 "고른 단어장이 있는데 0개"가 된다.
    useEffect(() => {
        if (filters.useAllLists || filters.selectedListIds.length === 0) return;
        const validIds = filters.selectedListIds.filter(id => visibleLists.some(l => l.id === id));
        if (validIds.length !== filters.selectedListIds.length) {
            setFilters(validIds.length === 0
                ? { useAllLists: true, selectedListIds: [], selectedDaysByList: {} }
                : { selectedListIds: validIds });
        }
    }, [visibleLists, filters.useAllLists, filters.selectedListIds, setFilters]);

    // 가리키던 단어장이 지워진 줄은 버린다 — 눌렀더니 0개가 나오는 일이 없어야 한다.
    const visibleRecents = useMemo(
        () => recents.filter(r => scopeStillExists(visibleLists, r.filters)),
        [recents, visibleLists],
    );
    // 이미 조건을 만들고 있는 사람에게 지난 조건은 방해다.
    const showRecents = activeFilterCount === 0 && !query.trim() && visibleRecents.length > 0;

    const scopeText = useMemo(
        () => scopeLabel(summarizeScope(visibleLists, filters), t),
        [visibleLists, filters, t],
    );

    const batchSize = studySettings.studyBatchSize;
    const countText = useMemo(() => {
        const n = results.length.toLocaleString();
        const base = activeFilterCount > 0
            ? t('search.countWithFilters', { n, filters: activeFilterCount })
            : t('search.countOnly', { n });
        return typeof batchSize === 'number' && results.length > batchSize
            ? `${base} · ${t('search.batchHint', { count: batchSize })}`
            : base;
    }, [results.length, activeFilterCount, batchSize, t]);

    const tap = useCallback(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), []);

    const handleStart = useCallback(() => {
        if (results.length === 0) return;
        Keyboard.dismiss();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        // 저장 시점은 학습을 시작할 때 하나뿐이다. 칩을 누를 때마다 저장하면
        // 만들다 만 중간 상태가 지난번 조건에 쌓인다.
        rememberCondition(filters, results.length);
        const sel = setStudySelection(shuffleWords(resultsToWords(results)).map(w => w.id));
        const params = { id: '__custom__', sel };
        // replace로 가는 이유: 학습 화면은 결과로 넘어갈 때 스스로 replace한다.
        // 이 화면을 스택에 남기면 결과에서 뒤로 눌렀을 때 방금 외운 단어가 빠진
        // 목록으로 돌아오고, 홈까지 두 번 눌러야 한다.
        if (customStudySettings.studyMode === 'quiz') {
            router.replace({ pathname: '/quiz/[id]', params });
        } else {
            router.replace({ pathname: '/flashcards/[id]', params });
        }
    }, [results, filters, rememberCondition, customStudySettings.studyMode, router]);

    const renderResult = useCallback(({ item }: { item: SearchResult }) => {
        const trimmed = deferredQuery.trim().toLowerCase();
        const matchingTags = item.isTagMatch
            ? item.word.tags?.filter(tag => tag.toLowerCase().includes(trimmed)) ?? []
            : [];
        const otherTags = item.isTagMatch
            ? item.word.tags?.filter(tag => !tag.toLowerCase().includes(trimmed)) ?? []
            : item.word.tags ?? [];

        return (
            <Pressable
                onPress={() => {
                    router.push({ pathname: '/add-word', params: { listId: item.listId, wordId: item.word.id, mode: 'read' } });
                }}
                style={({ pressed }) => [
                    styles.resultCard,
                    { backgroundColor: colors.surface, borderColor: colors.borderLight },
                    pressed && { opacity: 0.8 },
                ]}
            >
                {/* 단어 + 단어장 배지 */}
                <View style={styles.resultHeaderRow}>
                    <Text style={[styles.resultTerm, { color: colors.text }]} numberOfLines={1}>
                        {item.word.term}
                    </Text>
                    <View style={styles.resultHeaderRight}>
                        {item.word.isStarred && <Ionicons name="star" size={14} color={colors.warning} />}
                        <View style={[styles.listBadge, { backgroundColor: colors.primaryLight }]}>
                            <Ionicons name="folder-outline" size={11} color={colors.primary} />
                            <Text style={[styles.listBadgeText, { color: colors.primary }]} numberOfLines={1}>
                                {item.listName}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* 뜻 */}
                <Text style={[styles.resultMeaning, { color: colors.primary }]}>
                    {item.word.meaningKr}
                </Text>

                {/* 매칭된 태그 강조 표시 */}
                {matchingTags.length > 0 && (
                    <View style={styles.tagsRow}>
                        {matchingTags.map((tag, idx) => (
                            <View key={idx} style={[styles.matchedTag, { backgroundColor: colors.primaryLight, borderColor: isDark ? colors.primary + '40' : 'rgba(49,130,246,0.2)' }]}>
                                <Ionicons name="pricetag" size={11} color={colors.primary} />
                                <Text style={[styles.matchedTagText, { color: colors.primary }]}>#{displayTag(tag, t)}</Text>
                            </View>
                        ))}
                        {otherTags.map((tag, idx) => (
                            <View key={`o${idx}`} style={[styles.smallTag, { backgroundColor: colors.background }]}>
                                <Text style={[styles.smallTagText, { color: colors.textTertiary }]}>#{displayTag(tag, t)}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* 일반 태그 */}
                {!item.isTagMatch && otherTags.length > 0 && (
                    <View style={styles.tagsRow}>
                        {otherTags.map((tag, idx) => (
                            <View key={idx} style={[styles.smallTag, { backgroundColor: colors.background }]}>
                                <Text style={[styles.smallTagText, { color: colors.textTertiary }]}>#{displayTag(tag, t)}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* 영어 정의에서 매칭된 경우: 배지 대신 텍스트 직접 표시 */}
                {item.isDefinitionMatch && (
                    <Text style={[styles.definitionSnippet, { color: colors.textTertiary, borderLeftColor: colors.borderLight }]} numberOfLines={2}>
                        {item.word.definition}
                    </Text>
                )}
            </Pressable>
        );
    }, [deferredQuery, colors, isDark, router, t]);

    /** 지난번 조건 한 줄. 빈 화면에서는 세 줄, 목록 위에서는 맨 위 하나만 쓴다. */
    const renderRecent = (recent: typeof visibleRecents[number], inline: boolean) => {
        const condition = conditionLabel(recent.filters, visibleLists, t);
        return (
            <Pressable
                key={recent.savedAt}
                onPress={() => {
                    tap();
                    applyFilters(recent.filters);
                    setQuery('');
                }}
                style={({ pressed }) => [
                    styles.recentRow,
                    { backgroundColor: colors.surface, borderColor: colors.borderLight },
                    pressed && { opacity: 0.75 },
                ]}
            >
                <Ionicons name="arrow-undo-outline" size={14} color={colors.primary} />
                <View style={styles.recentBody}>
                    <Text style={[styles.recentCondition, { color: colors.text }]} numberOfLines={1}>
                        {inline ? t('search.recentInline', { condition }) : condition}
                    </Text>
                    <Text style={[styles.recentMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                        {t('search.recentMeta', { when: getRelativeTime(recent.savedAt, t), count: recent.count })}
                    </Text>
                </View>
            </Pressable>
        );
    };

    const chipStyle = (active: boolean) => [
        styles.filterChip,
        active
            ? { backgroundColor: colors.primary, borderColor: colors.primary }
            : { backgroundColor: colors.surface, borderColor: colors.border },
    ];
    const chipTextColor = (active: boolean) => (active ? colors.onPrimary : colors.textSecondary);

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            {/* 헤더 */}
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 20), borderBottomColor: colors.borderLight }]}>

                {isPick ? (
                    <View style={styles.titleRow}>
                        <Text style={[styles.screenTitle, { color: colors.text }]}>{t('search.pickTitle')}</Text>
                        <Pressable onPress={() => router.back()} hitSlop={10}>
                            <Ionicons name="close" size={22} color={colors.textSecondary} />
                        </Pressable>
                    </View>
                ) : (
                    <View style={styles.headerTopRow}>
                        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Ionicons name="search" size={18} color={colors.textTertiary} />
                            <TextInput
                                style={[styles.searchInput, { color: colors.text }]}
                                placeholder={t('search.placeholder')}
                                placeholderTextColor={colors.textTertiary}
                                value={query}
                                onChangeText={setQuery}
                                onSubmitEditing={() => Keyboard.dismiss()}
                                autoFocus
                                autoCapitalize="none"
                                returnKeyType="search"
                            />
                            {query.length > 0 && (
                                <Pressable onPress={() => setQuery('')} hitSlop={10}>
                                    <Ionicons name="close-circle" size={17} color={colors.textTertiary} />
                                </Pressable>
                            )}
                        </View>
                        <Pressable onPress={() => router.back()} hitSlop={10}>
                            <Text style={[styles.cancelText, { color: colors.primary }]}>{t('common.cancel')}</Text>
                        </Pressable>
                    </View>
                )}

                {/* 1줄: 암기 상태(단일 선택) + 별표(독립 토글) + 상한이 붙은 프리셋 둘 */}
                <View style={styles.filterRow}>
                    <Text style={[styles.rowLabel, { color: colors.textTertiary }]}>{t('search.rowStatus')}</Text>
                    <View style={styles.filterScrollerWrap}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.filterContent}
                            keyboardShouldPersistTaps="handled"
                        >
                            {STATUS_KEYS.map(key => {
                                const isActive = filters.wordFilter === key;
                                return (
                                    <Pressable
                                        key={key}
                                        onPress={() => { tap(); setFilters({ wordFilter: key }); }}
                                        style={chipStyle(isActive)}
                                    >
                                        <Text style={[styles.filterChipText, { color: chipTextColor(isActive) }]}>
                                            {wordFilterLabel(key, t)}
                                        </Text>
                                    </Pressable>
                                );
                            })}

                            <View style={[styles.filterDivider, { backgroundColor: colors.borderLight }]} />

                            <Pressable
                                onPress={() => { tap(); setFilters({ starredOnly: !filters.starredOnly }); }}
                                style={[
                                    styles.filterChip,
                                    filters.starredOnly
                                        ? { backgroundColor: colors.warningLight, borderColor: colors.warning }
                                        : { backgroundColor: colors.surface, borderColor: colors.border },
                                ]}
                            >
                                <Ionicons
                                    name={filters.starredOnly ? 'star' : 'star-outline'}
                                    size={13}
                                    color={filters.starredOnly ? colors.warning : colors.textSecondary}
                                />
                                <Text style={[styles.filterChipText, { color: filters.starredOnly ? colors.warning : colors.textSecondary }]}>
                                    {t('search.starredChip')}
                                </Text>
                            </Pressable>

                            <View style={[styles.filterDivider, { backgroundColor: colors.borderLight }]} />

                            {/* 프리셋 둘만 상한이 있다. 숨기지 않고 라벨에 숫자를 박아 드러낸다. */}
                            {PRESET_KEYS.map(key => {
                                const isActive = filters.wordFilter === key;
                                return (
                                    <Pressable
                                        key={key}
                                        onPress={() => { tap(); setFilters({ wordFilter: isActive ? 'all' : key }); }}
                                        style={chipStyle(isActive)}
                                    >
                                        <Text style={[styles.filterChipText, { color: chipTextColor(isActive) }]}>
                                            {key === 'wrongCount' ? t('search.presetWrong') : t('search.presetRecent')}
                                        </Text>
                                        <Text style={[styles.filterChipCap, { color: chipTextColor(isActive) }]}>
                                            {PRESET_LIMIT}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>

                {/* 2줄: 품사 — 지금 범위에 품사가 2종 이상일 때만 */}
                {showPosFilter && (
                    <View style={styles.filterRow}>
                        <Text style={[styles.rowLabel, { color: colors.textTertiary }]}>{t('search.rowPos')}</Text>
                        <View style={styles.filterScrollerWrap}>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.filterContent}
                                keyboardShouldPersistTaps="handled"
                            >
                                {([POS_ALL, ...posOptions.keys, ...(posOptions.hasOther ? [POS_OTHER] : [])] as PosFilter[]).map(key => {
                                    const isActive = filters.posFilter === key;
                                    return (
                                        <Pressable
                                            key={key}
                                            onPress={() => { tap(); setFilters({ posFilter: key }); }}
                                            style={chipStyle(isActive)}
                                        >
                                            <Text style={[styles.filterChipText, { color: chipTextColor(isActive) }]}>
                                                {t(`pos.${key}`)}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    </View>
                )}

                {/* 3줄: 범위 — 유일한 드롭다운. Day는 단어장마다 다른 2차원 선택이라 칩으로 못 접는다. */}
                <View style={styles.filterRow}>
                    <Text style={[styles.rowLabel, { color: colors.textTertiary }]}>{t('search.rowScope')}</Text>
                    <View style={styles.scopeChipWrap}>
                        <Pressable
                            onPress={() => { tap(); setShowListPicker(true); }}
                            style={[styles.filterChip, styles.scopeChip, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                        >
                            <Text style={[styles.filterChipText, styles.scopeChipText, { color: colors.onPrimary }]} numberOfLines={1}>
                                {scopeText}
                            </Text>
                            <Ionicons name="chevron-down" size={12} color={colors.onPrimary} />
                        </Pressable>
                    </View>
                </View>

                {/* 4줄: 태그 — 태그가 있을 때만. 다시 누르면 해제. */}
                {topTags.length > 0 && (
                    <View style={styles.filterRow}>
                        <Text style={[styles.rowLabel, { color: colors.textTertiary }]}>{t('search.rowTag')}</Text>
                        <View style={styles.filterScrollerWrap}>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.filterContent}
                                keyboardShouldPersistTaps="handled"
                            >
                                {topTags.map(tag => {
                                    const isActive = filters.tag === tag;
                                    return (
                                        <Pressable
                                            key={tag}
                                            onPress={() => { tap(); setFilters({ tag: isActive ? null : tag }); }}
                                            style={chipStyle(isActive)}
                                        >
                                            <Ionicons name="pricetag" size={12} color={chipTextColor(isActive)} />
                                            <Text style={[styles.filterChipText, { color: chipTextColor(isActive) }]}>
                                                {displayTag(tag, t)}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </ScrollView>

                            {/* 우측 스크롤 힌트 */}
                            <LinearGradient
                                colors={['transparent', isDark ? 'rgba(18,18,18,0.95)' : 'rgba(240,244,255,0.95)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.filterFadeRight}
                                pointerEvents="none"
                            />
                        </View>
                    </View>
                )}
            </View>

            {/* 결과 줄 — 칩 영역에 붙어 고정된다. 목록 안에 두면 스크롤한 순간
                초기화 버튼이 사라진다(정작 목록이 길어 필요한 상황에서). */}
            {showResults && (
                <View style={[styles.resultCountBar, { borderBottomColor: colors.borderLight }]}>
                    <Text style={[styles.resultCountText, { color: colors.textTertiary }]} numberOfLines={1}>
                        {countText}
                    </Text>
                    {activeFilterCount > 0 && (
                        <Pressable
                            onPress={() => { tap(); resetFilters(); }}
                            hitSlop={8}
                            style={[styles.resetBtn, { borderColor: colors.primary }]}
                        >
                            <Ionicons name="refresh" size={11} color={colors.primary} />
                            <Text style={[styles.resetText, { color: colors.primary }]}>{t('search.reset')}</Text>
                        </Pressable>
                    )}
                </View>
            )}

            {/* 본문 */}
            {!showResults ? (
                <ScrollView
                    style={styles.emptyScroll}
                    contentContainerStyle={styles.emptyContent}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* 고르러 온 자세엔 입력창이 없다 — 돋보기 대신 깔때기를 두고
                        "입력해 보세요"가 아니라 "칩으로 골라보세요"라고 말한다. */}
                    <Ionicons name={isPick ? 'funnel-outline' : 'search-outline'} size={44} color={colors.border} />
                    <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
                        {t(isPick ? 'search.pickEmptyTitle' : 'search.emptyTitle')}
                    </Text>
                    <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
                        {t(isPick ? 'search.pickEmptySubtitle' : 'search.emptySubtitle')}
                    </Text>

                    {showRecents && (
                        <View style={styles.recentSection}>
                            <Text style={[styles.recentHeader, { color: colors.textTertiary }]}>{t('search.recentHeader')}</Text>
                            {visibleRecents.map(r => renderRecent(r, false))}
                        </View>
                    )}
                </ScrollView>
            ) : (
                <FlatList
                    data={results}
                    keyExtractor={item => item.word.id}
                    renderItem={renderResult}
                    contentContainerStyle={styles.resultsContent}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    ListHeaderComponent={
                        // 목록이 주인공인 화면에서 세 줄은 과하다 — 맨 위 하나만.
                        showRecents ? <View style={styles.inlineRecent}>{renderRecent(visibleRecents[0], true)}</View> : null
                    }
                    ListEmptyComponent={
                        <View style={styles.noResultBox}>
                            <Ionicons name="search-outline" size={40} color={colors.border} />
                            <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>{t('search.noResults')}</Text>
                        </View>
                    }
                />
            )}

            {/* 학습 바 — 출력 형식은 필터가 아니므로 칩 줄에 섞지 않고 출발 버튼 옆에 둔다. */}
            <View style={[
                styles.studyBar,
                // 시스템바(제스처 바·홈 인디케이터) 위에 항상 여백이 남게 inset에
                // 더한다. Math.max(inset, 10)은 inset을 그대로 쓰고 끝이라 버튼이
                // 시스템바에 붙었다. 다른 하단 바(import-csv·일괄추가)는 16 기준.
                { backgroundColor: colors.surface, borderTopColor: colors.borderLight, paddingBottom: Math.max(insets.bottom, 6) + 12 },
            ]}>
                <View style={[styles.segmented, { backgroundColor: colors.surfaceSecondary }]}>
                    {(['flashcard', 'quiz'] as const).map(m => {
                        const isActive = customStudySettings.studyMode === m;
                        return (
                            <Pressable
                                key={m}
                                onPress={() => { tap(); updateCustomStudySettings({ studyMode: m }); }}
                                style={[styles.segmentedTab, isActive && { backgroundColor: colors.surface, shadowColor: colors.shadow }]}
                            >
                                <Text style={[styles.segmentedText, { color: isActive ? colors.primary : colors.textSecondary }]}>
                                    {m === 'flashcard' ? t('search.modeFlashcard') : t('search.modeQuiz')}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                <Pressable
                    onPress={handleStart}
                    disabled={results.length === 0}
                    style={[styles.startBtn, { backgroundColor: results.length > 0 ? colors.primaryButton : colors.borderLight }]}
                >
                    <Text style={[styles.startBtnText, { color: results.length > 0 ? colors.onPrimary : colors.textTertiary }]}>
                        {results.length > 0
                            ? t('search.startWithCount', { n: results.length.toLocaleString() })
                            : t('search.startEmpty')}
                    </Text>
                    {results.length > 0 && <Ionicons name="arrow-forward" size={15} color={colors.onPrimary} />}
                </Pressable>
            </View>

            <ListDayPicker
                visible={showListPicker}
                onClose={() => setShowListPicker(false)}
                lists={visibleLists}
                selectedListIds={filters.useAllLists ? visibleLists.map(l => l.id) : filters.selectedListIds}
                selectedDaysByList={filters.selectedDaysByList}
                onApply={(listIds, daysByList) => {
                    // 전부 선택 + 모든 Day 전체면 "전체 단어장"으로 되돌린다 —
                    // 나중에 만든 단어장도 자동으로 포함되게 하기 위해서.
                    const isAll = listIds.length === visibleLists.length &&
                        listIds.every(id => !daysByList[id] || daysByList[id] === 'all');
                    setFilters({
                        useAllLists: isAll,
                        selectedListIds: isAll ? [] : listIds,
                        selectedDaysByList: daysByList,
                    });
                }}
            />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },

    // 헤더
    header: {
        paddingHorizontal: 16,
        paddingBottom: 6,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 6,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 44,
        marginBottom: 2,
    },
    screenTitle: {
        fontSize: 18,
        fontFamily: 'Pretendard_700Bold',
    },
    searchBox: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 12,
        gap: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        fontFamily: 'Pretendard_400Regular',
    },
    cancelText: {
        fontSize: 15,
        fontFamily: 'Pretendard_600SemiBold',
    },

    // 필터 칩
    filterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    rowLabel: {
        width: 26,
        fontSize: 10,
        fontFamily: 'Pretendard_600SemiBold',
    },
    filterScrollerWrap: {
        flex: 1,
        marginRight: -16,
        height: 42,
    },
    filterContent: {
        paddingRight: 16,
        paddingVertical: 5,
        gap: 6,
        alignItems: 'center',
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
    },
    filterChipText: {
        fontSize: 13,
        fontFamily: 'Pretendard_500Medium',
    },
    filterChipCap: {
        fontSize: 10,
        fontFamily: 'Pretendard_700Bold',
        opacity: 0.7,
        marginLeft: -2,
    },
    filterDivider: {
        width: 1,
        height: 20,
        marginHorizontal: 2,
    },
    filterFadeRight: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 40,
    },
    scopeChipWrap: {
        flex: 1,
        paddingVertical: 5,
        flexDirection: 'row',
    },
    scopeChip: {
        maxWidth: '100%',
        flexShrink: 1,
    },
    scopeChipText: {
        flexShrink: 1,
    },

    // 결과 줄
    resultCountBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    resultCountText: {
        flexShrink: 1,
        fontSize: 12,
        fontFamily: 'Pretendard_500Medium',
    },
    resetBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 9,
        paddingVertical: 3,
    },
    resetText: {
        fontSize: 11,
        fontFamily: 'Pretendard_700Bold',
    },

    // 결과 리스트
    resultsContent: {
        padding: 16,
        paddingBottom: 24,
        gap: 10,
    },
    resultCard: {
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        gap: 5,
    },
    resultHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
    },
    resultHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
    },
    resultTerm: {
        fontSize: 17,
        fontFamily: 'Pretendard_700Bold',
        flex: 1,
    },
    listBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        gap: 3,
        maxWidth: 140,
        // 이름이 상한을 넘겨도 알약 밖으로 새지 않게. 안드로이드에서 둥근 배경이
        // 네모로 그려지는 것도 이 속성이 막는다(CLAUDE.md UI 체크리스트).
        overflow: 'hidden',
    },
    listBadgeText: {
        fontSize: 11,
        fontFamily: 'Pretendard_500Medium',
        // RN은 flexShrink 기본값이 0이라 이게 없으면 Text가 제 폭을 고집하고,
        // maxWidth에 걸린 알약 밖으로 글자가 튀어나온다(말줄임도 안 걸린다).
        flexShrink: 1,
    },
    resultMeaning: {
        fontSize: 15,
        fontFamily: 'Pretendard_500Medium',
    },

    // 태그
    // 태그 칩 두 종류(매칭 강조 · 일반)는 같은 뼈대를 쓴다 — View가 알약을 그리고
    // Text는 lineHeight를 명시한다. 예전엔 일반 태그만 배경 깔린 <Text>라
    // 안드로이드 includeFontPadding이 위아래를 부풀렸고, 아래 alignItems가
    // 없어서 한 줄 안의 칩들이 제일 큰 칩 높이로 늘어났다(Yoga 기본값 stretch).
    tagsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 5,
        marginTop: 2,
    },
    matchedTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 8,
        borderWidth: 1,
    },
    matchedTagText: {
        fontSize: 12,
        lineHeight: 16,
        fontFamily: 'Pretendard_600SemiBold',
    },
    // 테두리가 없는 만큼(matchedTag는 1px) 패딩으로 메워 두 칩 높이를 24로 맞춘다.
    smallTag: {
        justifyContent: 'center',
        paddingHorizontal: 7,
        paddingVertical: 4,
        borderRadius: 8,
        overflow: 'hidden',
    },
    smallTagText: {
        fontSize: 12,
        lineHeight: 16,
        fontFamily: 'Pretendard_400Regular',
    },

    // 영어 정의 스니펫
    definitionSnippet: {
        fontSize: 13,
        fontFamily: 'Pretendard_400Regular',
        lineHeight: 19,
        marginTop: 4,
        paddingLeft: 10,
        borderLeftWidth: 2,
    },

    // 빈 화면
    emptyScroll: { flex: 1 },
    emptyContent: {
        paddingTop: 44,
        paddingHorizontal: 20,
        paddingBottom: 24,
        alignItems: 'center',
    },
    emptyTitle: {
        fontSize: 15,
        fontFamily: 'Pretendard_600SemiBold',
        marginTop: 12,
    },
    emptySubtitle: {
        fontSize: 13,
        fontFamily: 'Pretendard_400Regular',
        marginTop: 4,
        textAlign: 'center',
    },
    noResultBox: {
        alignItems: 'center',
        marginTop: 80,
        gap: 12,
    },

    // 지난번 조건
    recentSection: {
        width: '100%',
        marginTop: 30,
    },
    recentHeader: {
        fontSize: 11,
        fontFamily: 'Pretendard_700Bold',
        marginBottom: 7,
        marginLeft: 2,
    },
    inlineRecent: {
        marginBottom: 4,
    },
    recentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 9,
        marginBottom: 7,
    },
    recentBody: { flex: 1, minWidth: 0 },
    recentCondition: {
        fontSize: 13,
        fontFamily: 'Pretendard_600SemiBold',
    },
    recentMeta: {
        fontSize: 11,
        fontFamily: 'Pretendard_400Regular',
        marginTop: 1,
    },

    // 학습 바
    studyBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    segmented: {
        flexDirection: 'row',
        borderRadius: 9,
        padding: 2,
    },
    segmentedTab: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 7,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    segmentedText: {
        fontSize: 13,
        fontFamily: 'Pretendard_600SemiBold',
    },
    startBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 10,
        paddingVertical: 11,
    },
    startBtnText: {
        fontSize: 14,
        fontFamily: 'Pretendard_700Bold',
    },
});
