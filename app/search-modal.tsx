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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { useLists, selectWordsForList } from '@/features/vocab';
import { filterAndRankResults, getTopTags, type AllDataItem, type SearchResult, type StatusFilter } from '@/lib/search';
import { displayTag } from '@/lib/tag-display';
import { POS_ALL, POS_OTHER, matchesPosFilter, presentPosCategories, type PosFilter } from '@/lib/pos';
import * as Haptics from 'expo-haptics';

export default function SearchModalScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const lists = useLists();
    const getWordsForList = useCallback((listId: string) => selectWordsForList(lists, listId), [lists]);

    const [query, setQuery] = useState('');
    const [selectedListId, setSelectedListId] = useState<string | null>(null);
    const [starredOnly, setStarredOnly] = useState(false);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [selectedTag, setSelectedTag] = useState<string | null>(null);
    const [posFilter, setPosFilter] = useState<PosFilter>(POS_ALL);

    // 키입력은 즉시 반응, 무거운 필터 연산은 낮은 우선순위로 처리
    const deferredQuery = useDeferredValue(query);

    // 보이는 단어장 목록
    const visibleLists = useMemo(() => lists.filter(l => l.isVisible), [lists]);

    // 보이는 단어장의 단어만 수집
    const allData = useMemo<AllDataItem[]>(() => {
        const data: AllDataItem[] = [];
        visibleLists.forEach(list => {
            getWordsForList(list.id).forEach(w => {
                data.push({ word: w, listName: list.title, listId: list.id });
            });
        });
        return data;
    }, [visibleLists, getWordsForList]);

    // 자주 쓰는 태그 top 5
    const topTags = useMemo(() => getTopTags(allData), [allData]);

    // 현재 보이는 단어들에 실제로 존재하는 품사만 칩으로 노출. 2종 미만이면 숨김.
    const posOptions = useMemo(() => presentPosCategories(allData.map(d => d.word)), [allData]);
    const showPosFilter = posOptions.keys.length + (posOptions.hasOther ? 1 : 0) >= 2;
    const posActive = showPosFilter && posFilter !== POS_ALL;

    // 필터 + 단일 패스 매칭 + 관련도 정렬. 품사 칩이 켜져 있으면 빈 질의도
    // 브라우징 모드(browse)로 — 후처리 필터가 걸 전체 목록을 받아야 한다.
    const searchResults = useMemo(
        () => filterAndRankResults(allData, deferredQuery, selectedListId, starredOnly, { status: statusFilter, tag: selectedTag, browse: posActive }),
        [deferredQuery, allData, selectedListId, starredOnly, statusFilter, selectedTag, posActive],
    );

    // 랭킹 로직(filterAndRankResults)은 건드리지 않고 결과를 품사로 후처리.
    const results = useMemo(
        () => posActive ? searchResults.filter(r => matchesPosFilter(r.word.pos, posFilter)) : searchResults,
        [searchResults, posActive, posFilter],
    );

    // 질의가 없어도 활성 필터(별표·단어장·상태·태그·품사)가 하나라도 있으면 결과를 보여준다(브라우징).
    const showResults = !!query.trim() || starredOnly || posActive
        || selectedListId !== null || statusFilter !== 'all' || selectedTag !== null;

    // 단어 구성이 바뀌어 선택했던 품사가 사라지면 자동으로 '전체'로 되돌린다.
    useEffect(() => {
        if (posFilter === POS_ALL) return;
        const available = posFilter === POS_OTHER
            ? posOptions.hasOther
            : (posOptions.keys as string[]).includes(posFilter);
        if (!available) setPosFilter(POS_ALL);
    }, [posOptions, posFilter]);

    // 단어 구성이 바뀌어 선택했던 태그가 사라지면 자동 해제.
    useEffect(() => {
        if (selectedTag && !topTags.includes(selectedTag)) setSelectedTag(null);
    }, [topTags, selectedTag]);

    const posChips = useMemo(() => {
        const chips: { key: PosFilter; label: string }[] = [{ key: POS_ALL, label: t('pos.all') }];
        for (const k of posOptions.keys) chips.push({ key: k, label: t(`pos.${k}`) });
        if (posOptions.hasOther) chips.push({ key: POS_OTHER, label: t('pos.other') });
        return chips;
    }, [posOptions, t]);

    const statusChips = useMemo<{ key: StatusFilter; label: string }[]>(() => [
        { key: 'all', label: t('search.filterAll') },
        { key: 'learning', label: t('search.filterLearning') },
        { key: 'memorized', label: t('search.filterMemorized') },
    ], [t]);

    const renderResult = ({ item }: { item: SearchResult }) => {
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
                            {item.word.tags?.length === 0 && null}
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
                            <Text key={`o${idx}`} style={[styles.smallTag, { color: colors.textTertiary, backgroundColor: colors.background }]}>#{displayTag(tag, t)}</Text>
                        ))}
                    </View>
                )}

                {/* 일반 태그 */}
                {!item.isTagMatch && otherTags.length > 0 && (
                    <View style={styles.tagsRow}>
                        {otherTags.map((tag, idx) => (
                            <Text key={idx} style={[styles.smallTag, { color: colors.textTertiary, backgroundColor: colors.background }]}>#{displayTag(tag, t)}</Text>
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
    };

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            {/* 헤더 */}
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 20), borderBottomColor: colors.borderLight }]}>

                {/* 검색창 */}
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

                {/* 1줄: 암기 상태(전체·미암기·암기, 단일 선택) + 별표(독립 토글) */}
                <View style={styles.filterScrollerWrap}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.filterContent}
                    >
                        {statusChips.map(chip => {
                            const isActive = statusFilter === chip.key;
                            return (
                                <Pressable
                                    key={chip.key}
                                    onPress={() => {
                                        setStatusFilter(chip.key);
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    }}
                                    style={[
                                        styles.filterChip,
                                        isActive
                                            ? { backgroundColor: colors.primary, borderColor: colors.primary }
                                            : { backgroundColor: colors.surface, borderColor: colors.border },
                                    ]}
                                >
                                    <Text style={[styles.filterChipText, { color: isActive ? colors.onPrimary : colors.textSecondary }]}>
                                        {chip.label}
                                    </Text>
                                </Pressable>
                            );
                        })}

                        <View style={[styles.filterDivider, { backgroundColor: colors.borderLight }]} />

                        {/* 별표 필터 (독립 토글) */}
                        <Pressable
                            onPress={() => {
                                setStarredOnly(!starredOnly);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                            style={[
                                styles.filterChip,
                                starredOnly
                                    ? { backgroundColor: colors.warningLight, borderColor: colors.warning }
                                    : { backgroundColor: colors.surface, borderColor: colors.border },
                            ]}
                        >
                            <Ionicons
                                name={starredOnly ? 'star' : 'star-outline'}
                                size={13}
                                color={starredOnly ? colors.warning : colors.textSecondary}
                            />
                            <Text style={[styles.filterChipText, { color: starredOnly ? colors.warning : colors.textSecondary }]}>
                                {t('search.starred')}
                            </Text>
                        </Pressable>
                    </ScrollView>
                </View>

                {/* 2줄: 품사 필터 — 품사 2종 이상일 때만. */}
                {showPosFilter && (
                    <View style={styles.filterScrollerWrap}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.filterContent}
                        >
                            {posChips.map(chip => {
                                const isActive = posFilter === chip.key;
                                return (
                                    <Pressable
                                        key={chip.key}
                                        onPress={() => {
                                            setPosFilter(chip.key);
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        }}
                                        style={[
                                            styles.filterChip,
                                            isActive
                                                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                                                : { backgroundColor: colors.surface, borderColor: colors.border },
                                        ]}
                                    >
                                        <Text style={[styles.filterChipText, { color: isActive ? colors.onPrimary : colors.textSecondary }]}>
                                            {chip.label}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    </View>
                )}

                {/* 3줄: 단어장 필터 — 단어장 2개 이상일 때만(1개면 전체와 동일해 무의미). */}
                {visibleLists.length >= 2 && (
                    <View style={styles.filterScrollerWrap}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.filterContent}
                        >
                            {/* 전체 */}
                            <Pressable
                                onPress={() => {
                                    setSelectedListId(null);
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }}
                                style={[
                                    styles.filterChip,
                                    selectedListId === null
                                        ? { backgroundColor: colors.primary, borderColor: colors.primary }
                                        : { backgroundColor: colors.surface, borderColor: colors.border },
                                ]}
                            >
                                <Ionicons
                                    name="folder-outline"
                                    size={12}
                                    color={selectedListId === null ? colors.onPrimary : colors.textSecondary}
                                />
                                <Text style={[styles.filterChipText, { color: selectedListId === null ? colors.onPrimary : colors.textSecondary }]}>
                                    {t('search.allLists')}
                                </Text>
                            </Pressable>

                            {/* 단어장 칩 */}
                            {visibleLists.map(item => {
                                const isActive = selectedListId === item.id;
                                return (
                                    <Pressable
                                        key={item.id}
                                        onPress={() => {
                                            setSelectedListId(item.id);
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        }}
                                        style={[
                                            styles.filterChip,
                                            isActive
                                                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                                                : { backgroundColor: colors.surface, borderColor: colors.border },
                                        ]}
                                    >
                                        {item.icon ? (
                                            <Text style={{ fontSize: 12, lineHeight: 16 }}>{item.icon}</Text>
                                        ) : null}
                                        <Text style={[styles.filterChipText, { color: isActive ? colors.onPrimary : colors.textSecondary }]}>
                                            {item.title}
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
                )}

                {/* 4줄: 태그 필터 — 태그가 하나라도 있을 때만. 단일 선택(다시 누르면 해제). */}
                {topTags.length > 0 && (
                    <View style={styles.filterScrollerWrap}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.filterContent}
                        >
                            {topTags.map(tag => {
                                const isActive = selectedTag === tag;
                                return (
                                    <Pressable
                                        key={tag}
                                        onPress={() => {
                                            setSelectedTag(isActive ? null : tag);
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        }}
                                        style={[
                                            styles.filterChip,
                                            isActive
                                                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                                                : { backgroundColor: colors.surface, borderColor: colors.border },
                                        ]}
                                    >
                                        <Ionicons
                                            name="pricetag"
                                            size={12}
                                            color={isActive ? colors.onPrimary : colors.textSecondary}
                                        />
                                        <Text style={[styles.filterChipText, { color: isActive ? colors.onPrimary : colors.textSecondary }]}>
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
                )}
            </View>

            {/* 결과 개수 바 */}
            {showResults && results.length > 0 && (
                <View style={[styles.resultCountBar, { borderBottomColor: colors.borderLight }]}>
                    <Text style={[styles.resultCountText, { color: colors.textTertiary }]}>
                        {t('search.resultCount', { count: results.length })}
                    </Text>
                </View>
            )}

            {/* 본문 — 인기 태그는 헤더 태그 칩으로 상시 노출되므로 빈 화면은 힌트만. */}
            {!showResults ? (
                <View style={styles.emptyStateContainer}>
                    <View style={styles.emptyHintBox}>
                        <Ionicons name="search-outline" size={48} color={colors.border} />
                        <Text style={[styles.emptyHintText, { color: colors.textTertiary }]}>
                            {t('search.enterQuery')}
                        </Text>
                    </View>
                </View>
            ) : (
                <FlatList
                    data={results}
                    keyExtractor={item => item.word.id}
                    renderItem={renderResult}
                    contentContainerStyle={[styles.resultsContent, { paddingBottom: insets.bottom + 20 }]}
                    ListEmptyComponent={
                        <View style={styles.emptyHintBox}>
                            <Ionicons name="search-outline" size={40} color={colors.border} />
                            <Text style={[styles.emptyHintText, { color: colors.textTertiary }]}>
                                {t('search.noResults')}
                            </Text>
                        </View>
                    }
                    keyboardShouldPersistTaps="handled"
                />
            )}
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },

    // 헤더
    header: {
        paddingHorizontal: 16,
        paddingBottom: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 10,
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
    filterScrollerWrap: {
        marginHorizontal: -16,
        height: 48,
    },
    filterContent: {
        paddingHorizontal: 16,
        paddingVertical: 6,
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

    // 결과 개수
    resultCountBar: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    resultCountText: {
        fontSize: 12,
        fontFamily: 'Pretendard_500Medium',
    },

    // 결과 리스트
    resultsContent: {
        padding: 16,
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
        maxWidth: 120,
    },
    listBadgeText: {
        fontSize: 11,
        fontFamily: 'Pretendard_500Medium',
    },
    resultMeaning: {
        fontSize: 15,
        fontFamily: 'Pretendard_500Medium',
    },

    // 태그
    tagsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
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
        fontFamily: 'Pretendard_600SemiBold',
    },
    smallTag: {
        fontSize: 12,
        fontFamily: 'Pretendard_400Regular',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
        overflow: 'hidden',
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

    // 빈 상태
    emptyStateContainer: {
        flex: 1,
        padding: 20,
    },
    emptyHintBox: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 100,
        gap: 12,
    },
    emptyHintText: {
        fontSize: 15,
        fontFamily: 'Pretendard_400Regular',
    },
});
