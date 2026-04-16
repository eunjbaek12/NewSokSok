import React, { useState, useMemo, useDeferredValue } from 'react';
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
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { filterAndRankResults, getTopTags, type AllDataItem, type SearchResult } from '@/lib/search';
import * as Haptics from 'expo-haptics';

export default function SearchModalScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const { lists, getWordsForList } = useVocab();

    const [query, setQuery] = useState('');
    const [selectedListId, setSelectedListId] = useState<string | null>(null);
    const [starredOnly, setStarredOnly] = useState(false);

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

    // 필터 + 단일 패스 매칭 + 관련도 정렬
    const searchResults = useMemo(
        () => filterAndRankResults(allData, deferredQuery, selectedListId, starredOnly),
        [deferredQuery, allData, selectedListId, starredOnly],
    );

    const showResults = !!query.trim() || starredOnly;

    const handleTagClick = (tag: string) => {
        setQuery(tag);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

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
                        {item.word.isStarred && <Ionicons name="star" size={14} color="#F59E0B" />}
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
                                <Text style={[styles.matchedTagText, { color: colors.primary }]}>#{tag}</Text>
                            </View>
                        ))}
                        {otherTags.map((tag, idx) => (
                            <Text key={`o${idx}`} style={[styles.smallTag, { color: colors.textTertiary, backgroundColor: colors.background }]}>#{tag}</Text>
                        ))}
                    </View>
                )}

                {/* 일반 태그 */}
                {!item.isTagMatch && otherTags.length > 0 && (
                    <View style={styles.tagsRow}>
                        {otherTags.map((tag, idx) => (
                            <Text key={idx} style={[styles.smallTag, { color: colors.textTertiary, backgroundColor: colors.background }]}>#{tag}</Text>
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

                {/* 필터 칩 */}
                <View style={styles.filterScrollerWrap}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.filterContent}
                    >
                        {/* 별표 필터 */}
                        <Pressable
                            onPress={() => {
                                setStarredOnly(!starredOnly);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                            style={[
                                styles.filterChip,
                                starredOnly
                                    ? { backgroundColor: '#FFF8E1', borderColor: '#F59E0B' }
                                    : { backgroundColor: colors.surface, borderColor: colors.border },
                            ]}
                        >
                            <Ionicons
                                name={starredOnly ? 'star' : 'star-outline'}
                                size={13}
                                color={starredOnly ? '#F59E0B' : colors.textSecondary}
                            />
                            <Text style={[styles.filterChipText, { color: starredOnly ? '#B45309' : colors.textSecondary }]}>
                                {t('search.starred')}
                            </Text>
                        </Pressable>

                        <View style={[styles.filterDivider, { backgroundColor: colors.borderLight }]} />

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
                            <Text style={[styles.filterChipText, { color: selectedListId === null ? '#FFFFFF' : colors.textSecondary }]}>
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
                                    <Text style={[styles.filterChipText, { color: isActive ? '#FFFFFF' : colors.textSecondary }]}>
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
            </View>

            {/* 결과 개수 바 */}
            {showResults && searchResults.length > 0 && (
                <View style={[styles.resultCountBar, { borderBottomColor: colors.borderLight }]}>
                    <Text style={[styles.resultCountText, { color: colors.textTertiary }]}>
                        {t('search.resultCount', { count: searchResults.length })}
                    </Text>
                </View>
            )}

            {/* 본문 */}
            {!showResults ? (
                <View style={styles.emptyStateContainer}>
                    {topTags.length > 0 ? (
                        <View style={styles.recommendationBox}>
                            <Text style={[styles.recommendTitle, { color: colors.textSecondary }]}>
                                {t('search.popularTags')}
                            </Text>
                            <View style={styles.tagWrap}>
                                {topTags.map(tag => (
                                    <Pressable
                                        key={tag}
                                        onPress={() => handleTagClick(tag)}
                                        style={({ pressed }) => [
                                            styles.recTagChip,
                                            { backgroundColor: colors.primaryLight, borderColor: isDark ? colors.border : 'rgba(49,130,246,0.15)' },
                                            pressed && { opacity: 0.7 },
                                        ]}
                                    >
                                        <Ionicons name="pricetag" size={13} color={colors.primary} />
                                        <Text style={[styles.recTagText, { color: colors.primary }]}>{tag}</Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    ) : (
                        <View style={styles.emptyHintBox}>
                            <Ionicons name="search-outline" size={48} color={colors.border} />
                            <Text style={[styles.emptyHintText, { color: colors.textTertiary }]}>
                                {t('search.enterQuery')}
                            </Text>
                        </View>
                    )}
                </View>
            ) : (
                <FlatList
                    data={searchResults}
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
    recommendationBox: {
        marginTop: 10,
    },
    recommendTitle: {
        fontSize: 13,
        fontFamily: 'Pretendard_600SemiBold',
        marginBottom: 14,
    },
    tagWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    recTagChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        gap: 5,
    },
    recTagText: {
        fontSize: 14,
        fontFamily: 'Pretendard_500Medium',
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
