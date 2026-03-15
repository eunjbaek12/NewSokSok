import React, { useState, useMemo, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    Pressable,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { Word } from '@/lib/types';
import * as Haptics from 'expo-haptics';

export default function SearchModalScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const { lists, getWordsForList } = useVocab();

    const [query, setQuery] = useState('');
    const [selectedListId, setSelectedListId] = useState<string | null>(null);
    const [starredOnly, setStarredOnly] = useState(false);

    // 1. Gather all words from all accessible lists
    const allData = useMemo(() => {
        const data: Array<{ word: Word; listName: string; listId: string }> = [];
        lists.forEach(list => {
            const words = getWordsForList(list.id);
            words.forEach(w => {
                data.push({ word: w, listName: list.title, listId: list.id });
            });
        });
        return data;
    }, [lists, getWordsForList]);

    // 2. Compute Top 5 Tags immediately
    const topTags = useMemo(() => {
        const tagCount: Record<string, number> = {};
        allData.forEach(({ word }) => {
            if (word.tags && word.tags.length > 0) {
                word.tags.forEach(t => {
                    tagCount[t] = (tagCount[t] || 0) + 1;
                });
            }
        });
        return Object.entries(tagCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(entry => entry[0]);
    }, [allData]);

    // 3. Filter Logic
    const searchResults = useMemo(() => {
        const trimmed = query.trim().toLowerCase();
        let filtered = allData;

        if (selectedListId) {
            filtered = filtered.filter(item => item.listId === selectedListId);
        }

        if (starredOnly) {
            filtered = filtered.filter(item => item.word.isStarred);
        }

        if (!trimmed && !starredOnly) return []; // Allow showing starred only without query if desired, or require query? Let's require query or starredOnly. Wait, the old code says `if (!trimmed) return [];`. Let's just return filtered if starredOnly is checked, so users can browse all starred words!

        if (!trimmed && starredOnly) {
            return filtered;
        }

        if (!trimmed) return [];

        return filtered.map(item => {
            const termMatch = item.word.term.toLowerCase().includes(trimmed);
            const meaningKrMatch = item.word.meaningKr.toLowerCase().includes(trimmed);
            const tagMatch = item.word.tags?.some(t => t.toLowerCase().includes(trimmed));

            return {
                ...item,
                isTagMatch: tagMatch && !termMatch && !meaningKrMatch,
            };
        }).filter(item => {
            const w = item.word;
            return (
                w.term.toLowerCase().includes(trimmed) ||
                w.meaningKr.toLowerCase().includes(trimmed) ||
                w.definition.toLowerCase().includes(trimmed) ||
                (w.tags && w.tags.some(t => t.toLowerCase().includes(trimmed)))
            );
        });
    }, [query, allData, selectedListId, starredOnly]);

    const handleTagClick = (tag: string) => {
        setQuery(tag);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const renderResult = ({ item }: { item: any }) => {
        return (
            <Pressable
                onPress={() => {
                    router.push({ pathname: '/add-word', params: { listId: item.listId, wordId: item.word.id, mode: 'read' } });
                }}
                style={({ pressed }) => [
                    styles.resultCard,
                    { backgroundColor: colors.surface, borderColor: colors.borderLight },
                    pressed && { opacity: 0.8 }
                ]}
            >
                <View style={styles.resultHeaderRow}>
                    <Text style={[styles.resultTerm, { color: colors.text }]}>{item.word.term}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {item.word.isStarred && <Ionicons name="star" size={16} color="#FFD700" />}
                        <View style={[styles.listBadge, { backgroundColor: colors.surfaceSecondary }]}>
                            <Ionicons name="folder-outline" size={12} color={colors.textSecondary} />
                            <Text style={[styles.listBadgeText, { color: colors.textSecondary }]} numberOfLines={1}>
                                {item.listName}
                            </Text>
                        </View>
                    </View>
                </View>

                <Text style={[styles.resultMeaning, { color: colors.primary }]}>{item.word.meaningKr}</Text>

                {item.isTagMatch && (
                    <View style={[styles.tagMatchBadge, { backgroundColor: colors.primaryLight }]}>
                        <Ionicons name="pricetag-outline" size={12} color={colors.primary} />
                        <Text style={[styles.tagMatchText, { color: colors.primary }]}>Tag Match</Text>
                    </View>
                )}

                {item.word.tags && item.word.tags.length > 0 && (
                    <View style={styles.tagsRow}>
                        {item.word.tags.map((t: string, idx: number) => (
                            <Text key={idx} style={[styles.smallTag, { color: colors.textTertiary, backgroundColor: colors.background }]}>#{t}</Text>
                        ))}
                    </View>
                )}
            </Pressable>
        );
    };

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 20), borderBottomColor: colors.borderLight }]}>
                <View style={styles.headerTopRow}>
                    <View style={[styles.searchBox, { backgroundColor: colors.surface }]}>
                        <Ionicons name="search" size={20} color={colors.textTertiary} />
                        <TextInput
                            style={[styles.searchInput, { color: colors.text }]}
                            placeholder="단어, 뜻, 태그 검색..."
                            placeholderTextColor={colors.textTertiary}
                            value={query}
                            onChangeText={setQuery}
                            autoFocus
                            autoCapitalize="none"
                            returnKeyType="search"
                        />
                        {query.length > 0 && (
                            <Pressable onPress={() => setQuery('')} hitSlop={10}>
                                <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                            </Pressable>
                        )}
                    </View>
                    <Pressable onPress={() => router.back()} hitSlop={10}>
                        <Text style={[styles.cancelText, { color: colors.textSecondary }]}>취소</Text>
                    </Pressable>
                </View>

                <View style={styles.filterScrollerWrap}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
                        <Pressable
                            onPress={() => setStarredOnly(!starredOnly)}
                            style={[
                                styles.filterChip,
                                {
                                    backgroundColor: starredOnly ? '#FFFDE7' : colors.surfaceSecondary,
                                    borderColor: starredOnly ? '#FFD700' : colors.border,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 4
                                }
                            ]}
                        >
                            <Ionicons name={starredOnly ? "star" : "star-outline"} size={14} color={starredOnly ? "#FFD700" : colors.textSecondary} />
                            <Text style={[styles.filterChipText, { color: starredOnly ? colors.text : colors.textSecondary }]}>중요 단어</Text>
                        </Pressable>

                        <View style={{ width: 1, backgroundColor: colors.borderLight, marginVertical: 6, marginHorizontal: 2 }} />

                        <Pressable
                            onPress={() => setSelectedListId(null)}
                            style={[
                                styles.filterChip,
                                {
                                    backgroundColor: selectedListId === null ? colors.text : colors.surfaceSecondary,
                                    borderColor: selectedListId === null ? colors.text : colors.border
                                }
                            ]}
                        >
                            <Text style={[styles.filterChipText, { color: selectedListId === null ? colors.background : colors.textSecondary }]}>전체 단어장</Text>
                        </Pressable>

                        {lists.map(item => {
                            const isActive = selectedListId === item.id;
                            return (
                                <Pressable
                                    key={item.id}
                                    onPress={() => setSelectedListId(item.id)}
                                    style={[
                                        styles.filterChip,
                                        {
                                            backgroundColor: isActive ? colors.text : colors.surfaceSecondary,
                                            borderColor: isActive ? colors.text : colors.border
                                        }
                                    ]}
                                >
                                    <Text style={[styles.filterChipText, { color: isActive ? colors.background : colors.textSecondary }]}>
                                        {item.title}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                </View>
            </View>

            {!query.trim() && !starredOnly ? (
                <View style={styles.emptyStateContainer}>
                    {topTags.length > 0 ? (
                        <View style={styles.recommendationBox}>
                            <Text style={[styles.recommendTitle, { color: colors.textSecondary }]}>많이 찾는 태그</Text>
                            <View style={styles.tagWrap}>
                                {topTags.map(t => (
                                    <Pressable
                                        key={t}
                                        onPress={() => handleTagClick(t)}
                                        style={({ pressed }) => [
                                            styles.recTagChip,
                                            { backgroundColor: colors.surfaceSecondary },
                                            pressed && { opacity: 0.7 }
                                        ]}
                                    >
                                        <Ionicons name="pricetag" size={14} color={colors.primary} />
                                        <Text style={[styles.recTagText, { color: colors.text }]}>{t}</Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    ) : (
                        <View style={styles.noTagsBox}>
                            <Ionicons name="search-outline" size={48} color={colors.border} />
                            <Text style={[styles.noTagsText, { color: colors.textTertiary }]}>검색어를 입력해보세요.</Text>
                        </View>
                    )}
                </View>
            ) : (
                <FlatList
                    data={searchResults}
                    keyExtractor={(item, index) => item.word.id + index.toString()}
                    renderItem={renderResult}
                    contentContainerStyle={[styles.resultsContent, { paddingBottom: insets.bottom + 20 }]}
                    ListEmptyComponent={
                        <View style={styles.noTagsBox}>
                            <Text style={[styles.noTagsText, { color: colors.textTertiary }]}>검색 결과가 없습니다.</Text>
                        </View>
                    }
                />
            )}
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
    headerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 12, paddingHorizontal: 12, gap: 8 },
    searchInput: { flex: 1, fontSize: 16, fontFamily: 'Pretendard_400Regular' },
    cancelText: { fontSize: 16, fontFamily: 'Pretendard_500Medium' },
    filterScrollerWrap: { marginHorizontal: -16 },
    filterContent: { paddingHorizontal: 16, gap: 8 },
    filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
    filterChipText: { fontSize: 14, fontFamily: 'Pretendard_500Medium' },
    emptyStateContainer: { flex: 1, padding: 20 },
    recommendationBox: { marginTop: 10 },
    recommendTitle: { fontSize: 14, fontFamily: 'Pretendard_600SemiBold', marginBottom: 16 },
    tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    recTagChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, gap: 6 },
    recTagText: { fontSize: 15, fontFamily: 'Pretendard_500Medium' },
    noTagsBox: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100, gap: 12 },
    noTagsText: { fontSize: 15, fontFamily: 'Pretendard_400Regular' },
    resultsContent: { padding: 16, gap: 12 },
    resultCard: { padding: 16, borderRadius: 20, borderWidth: 1, gap: 6 },
    resultHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    resultTerm: { fontSize: 18, fontFamily: 'Pretendard_700Bold' },
    listBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4, maxWidth: '50%' },
    listBadgeText: { fontSize: 11, fontFamily: 'Pretendard_500Medium' },
    resultMeaning: { fontSize: 15, fontFamily: 'Pretendard_500Medium' },
    tagMatchBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, gap: 4, marginTop: 4 },
    tagMatchText: { fontSize: 11, fontFamily: 'Pretendard_600SemiBold' },
    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    smallTag: { fontSize: 12, fontFamily: 'Pretendard_500Medium', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, overflow: 'hidden' }
});
