import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, ActivityIndicator, TextInput, KeyboardAvoidingView, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useScrollToTop } from '@react-navigation/native';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { VocaList, Word } from '@/lib/types';
import { curationPresets } from '@/constants/curationData';
import { SUPPORTED_LANGUAGES, getLanguageFlag } from '@/constants/languages';
import WordDetailModal from '@/components/WordDetailModal';

// Simple fetch for AI if lib/gemini-api.ts doesn't have text generation yet
const generateAIWords = async (query: string): Promise<Word[]> => {
    const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error('API Key missing');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
    const prompt = `성인 학습자가 '${query}' 상황에서 사용할 수 있는 전문적인 영어 단어 10~50개를 생성해줘. 
  응답은 오직 JSON 배열만 반환해야 해. 
  포맷: [{"term": "단어", "definition": "영영뜻", "meaningKr": "한국어 뜻", "exampleEn": "영어 예문", "tags": ["${query}"]}]`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, responseMimeType: 'application/json' }
    };

    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error('AI 생성에 실패했습니다.');

    const data = await response.json();
    let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Check and remove markdown wrap
    textResponse = textResponse.trim();
    if (textResponse.startsWith('```')) {
        const firstNewLine = textResponse.indexOf('\n');
        const lastBacktick = textResponse.lastIndexOf('```');
        if (firstNewLine !== -1 && lastBacktick !== -1) {
            textResponse = textResponse.slice(firstNewLine, lastBacktick).trim();
        }
    }

    let parsed: any[] = [];
    try {
        parsed = JSON.parse(textResponse);
    } catch (e) {
        console.error('Failed to parse AI response:', textResponse);
        throw new Error('응답을 파싱할 수 없습니다.');
    }

    return parsed.map((w: any, index: number) => ({
        id: `ai-word-${index}-${Date.now()}`,
        term: w.term,
        definition: w.definition,
        meaningKr: w.meaningKr,
        exampleEn: w.exampleEn,
        isMemorized: false,
        isStarred: false,
        tags: w.tags || [query]
    }));
};

export default function CurationScreen() {
    const scrollRef = useRef<ScrollView>(null);
    useScrollToTop(scrollRef);

    const insets = useSafeAreaInsets();
    const { colors } = useTheme();
    const [viewMode, setViewMode] = useState<'detailed' | 'compact'>('detailed');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTheme, setSelectedTheme] = useState<VocaList | null>(null);
    const [saving, setSaving] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [detailWord, setDetailWord] = useState<Word | null>(null);
    const [activeTab, setActiveTab] = useState<'official' | 'community'>('official');
    const [communityThemes, setCommunityThemes] = useState<VocaList[]>([]);
    const [languageFilter, setLanguageFilter] = useState<string>('all');

    const { createCuratedList, fetchCloudCurations } = useVocab();

    useEffect(() => {
        let mounted = true;
        setGenerating(true); // Re-using generating state as loading indicator safely
        fetchCloudCurations().then(data => {
            if (mounted) {
                setCommunityThemes(data);
                setGenerating(false);
            }
        });
        return () => { mounted = false; };
    }, [fetchCloudCurations]);

    // Context from useVocab will handle cloud/local sync internally. 

    useEffect(() => {
        const backAction = () => {
            if (detailWord) {
                setDetailWord(null);
                return true;
            }
            if (selectedTheme) {
                setSelectedTheme(null);
                return true; // prevent default behavior
            }
            return false;
        };

        const backHandler = BackHandler.addEventListener(
            "hardwareBackPress",
            backAction
        );

        return () => backHandler.remove();
    }, [selectedTheme, detailWord]);

    const sourceThemes = activeTab === 'official' ? curationPresets : communityThemes;
    const filteredThemes = useMemo(() => sourceThemes.filter(t => {
        const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesLang = languageFilter === 'all' || t.sourceLanguage === languageFilter;
        return matchesSearch && matchesLang;
    }), [sourceThemes, searchQuery, languageFilter]);

    const langFilterChips = useMemo(() => [
        { code: 'all', label: '전체' },
        ...SUPPORTED_LANGUAGES.map(l => ({ code: l.code, label: l.label })),
    ], []);

    const getLevelStyle = (level?: string) => {
        switch (level) {
            case 'beginner': return { label: '초급', bg: '#DCFCE7', color: '#16A34A' };
            case 'intermediate': return { label: '중급', bg: '#DBEAFE', color: '#2563EB' };
            case 'advanced': return { label: '고급', bg: '#FEE2E2', color: '#DC2626' };
            default: return null;
        }
    };

    const getTopTags = (theme: VocaList): string[] => {
        const counts: Record<string, number> = {};
        for (const w of theme.words) {
            if (w.tags) {
                for (const t of w.tags) {
                    counts[t] = (counts[t] || 0) + 1;
                }
            }
        }
        if (theme.category && !counts[theme.category]) {
            counts[theme.category] = theme.words.length;
        }
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(e => e[0]);
    };

    const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;
    const bottomInset = Platform.OS === 'web' ? 84 + 34 : 84;

    const handleGenerateAI = async () => {
        if (!searchQuery.trim()) {
            alert('검색어를 먼저 입력해주세요.');
            return;
        }
        setGenerating(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        try {
            const words = await generateAIWords(searchQuery);
            const newTheme: VocaList = {
                id: `ai-theme-${Date.now()}`,
                title: `AI: ${searchQuery}`,
                icon: '✨',
                words,
                isVisible: true,
                createdAt: Date.now(),
                isCurated: true,
            };
            setSelectedTheme(newTheme);
        } catch (e: any) {
            alert(e.message || '단어 생성 중 오류가 발생했습니다.');
        } finally {
            setGenerating(false);
        }
    };

    const handleSaveTheme = async (theme: VocaList) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSaving(true);
        try {
            await createCuratedList(theme.title, theme.icon || '✨', theme.words.map(w => ({
                term: w.term,
                meaningKr: w.meaningKr,
                definition: w.definition,
                exampleEn: w.exampleEn,
                exampleKr: w.exampleKr,
                isStarred: false,
                tags: w.tags || []
            })));

            alert('나의 단어장에 성공적으로 저장되었습니다!');
            setSelectedTheme(null);
            // Optional: navigate home or to lists route
            // router.replace('/');
        } catch (e: any) {
            if (e.message === 'DUPLICATE_LIST') {
                alert('이미 같은 이름의 단어장이 존재합니다.');
            } else {
                alert('저장하는 중 오류가 발생했습니다.');
                console.error(e);
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.container, { backgroundColor: colors.background }]}>
            {selectedTheme ? (
                <View style={[styles.container, { backgroundColor: colors.background }]}>
                    <ScrollView contentContainerStyle={{ paddingBottom: bottomInset + 80 }}>
                        <View style={[styles.detailHero, { backgroundColor: colors.surfaceSecondary, paddingTop: topInset + 16 }]}>
                            <Pressable onPress={() => setSelectedTheme(null)} style={[styles.backBtn, { backgroundColor: 'rgba(255,255,255,0.7)' }]}>
                                <Ionicons name="arrow-back" size={24} color={colors.text} />
                            </Pressable>
                            <View style={styles.heroContent}>
                                <Text style={{ fontSize: 100 }}>{selectedTheme.icon}</Text>
                            </View>
                            <View style={styles.heroTextContainer}>
                                <Text style={[styles.detailTitle, { color: colors.text }]}>{selectedTheme.title}</Text>
                                <Text style={[styles.detailDesc, { color: colors.textSecondary }]}>
                                    {selectedTheme.words.length}개의 전문 단어 {selectedTheme.creatorName ? `• by ${selectedTheme.creatorName}` : ''}
                                </Text>
                            </View>
                        </View>
                        <View style={{ padding: 24 }}>
                            {selectedTheme.words.map((w, i) => (
                                <Pressable
                                    key={i}
                                    onPress={() => { Haptics.selectionAsync(); setDetailWord(w); }}
                                    style={({ pressed }) => [
                                        styles.wordItem,
                                        { backgroundColor: colors.surface, borderColor: colors.borderLight, opacity: pressed ? 0.7 : 1 }
                                    ]}
                                >
                                    <Text style={[styles.wordTerm, { color: colors.text }]}>{w.term}</Text>
                                    <Text style={[styles.wordMeaning, { color: colors.primary }]}>{w.meaningKr}</Text>
                                    {w.exampleEn ? <Text style={[styles.wordDesc, { color: colors.textSecondary, marginTop: 4 }]}>{w.exampleEn}</Text> : null}
                                </Pressable>
                            ))}
                        </View>
                    </ScrollView>
                    <View style={[styles.masterBar, { paddingBottom: bottomInset + 8, backgroundColor: colors.surface }]}>
                        <Pressable onPress={() => handleSaveTheme(selectedTheme)} disabled={saving} style={[styles.masterBtn, { backgroundColor: colors.primary }]}>
                            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.masterBtnText}>내 단어장으로 가져오기</Text>}
                        </Pressable>
                    </View>
                </View>
            ) : (
                <>
                    <View style={[styles.header, { paddingTop: topInset + 12 }]}>
                        <View>
                            <Text style={[styles.headerTitle, { color: colors.text }]}>단어 모음</Text>
                            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>전문가가 엄선한 상황별 어휘</Text>
                        </View>
                        <Pressable onPress={() => setViewMode(prev => prev === 'detailed' ? 'compact' : 'detailed')} style={[styles.actionBtn, { borderColor: colors.border }]}>
                            <Ionicons name={viewMode === 'detailed' ? 'list' : 'grid'} size={22} color={colors.textSecondary} />
                        </Pressable>
                    </View>

                    <View style={styles.tabContainer}>
                        <Pressable
                            style={[styles.tabButton, activeTab === 'official' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                            onPress={() => { Haptics.selectionAsync(); setActiveTab('official'); }}
                        >
                            <Text style={[styles.tabText, { color: activeTab === 'official' ? colors.primary : colors.textSecondary }]}>공식 큐레이션</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.tabButton, activeTab === 'community' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                            onPress={() => { Haptics.selectionAsync(); setActiveTab('community'); }}
                        >
                            <Text style={[styles.tabText, { color: activeTab === 'community' ? colors.primary : colors.textSecondary }]}>사용자 공유</Text>
                        </Pressable>
                    </View>

                    <View style={{ paddingHorizontal: 24, paddingBottom: 12 }}>
                        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                            <Ionicons name="search" size={20} color={colors.textTertiary} />
                            <TextInput
                                placeholder="예: 미국 부동산 계약"
                                placeholderTextColor={colors.textTertiary}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                style={[styles.searchInput, { color: colors.text }]}
                            />
                            {searchQuery.length > 0 && (
                                <Pressable onPress={() => setSearchQuery('')}>
                                    <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
                                </Pressable>
                            )}
                        </View>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.langChipContainer}>
                        {langFilterChips.map(chip => {
                            const isActive = languageFilter === chip.code;
                            return (
                                <Pressable
                                    key={chip.code}
                                    onPress={() => { Haptics.selectionAsync(); setLanguageFilter(chip.code); }}
                                    style={[styles.langChip, { backgroundColor: isActive ? colors.primary : colors.surfaceSecondary }]}
                                >
                                    <Text style={[styles.langChipText, { color: isActive ? '#FFF' : colors.textSecondary }]}>{chip.label}</Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>

                    <ScrollView ref={scrollRef} contentContainerStyle={[{ paddingHorizontal: 24, paddingBottom: bottomInset + 100 }, viewMode === 'compact' && { flexDirection: 'column', gap: 12 }]}>
                        {filteredThemes.map(theme => {
                            const levelStyle = getLevelStyle(theme.level);
                            const tags = getTopTags(theme);
                            const srcFlag = getLanguageFlag(theme.sourceLanguage || 'en');
                            const tgtFlag = getLanguageFlag(theme.targetLanguage || 'ko');
                            const srcCode = (theme.sourceLanguage || 'en').toUpperCase();
                            const tgtCode = (theme.targetLanguage || 'ko').toUpperCase();

                            return (
                                <Pressable key={theme.id} onPress={() => { Haptics.selectionAsync(); setSelectedTheme(theme); }} style={[styles.themeCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }, viewMode === 'detailed' ? styles.cardDetailed : styles.cardCompact]}>
                                    <View style={[styles.cardIconBox, { backgroundColor: colors.surfaceSecondary }, viewMode === 'detailed' ? styles.iconBoxDetailed : styles.iconBoxCompact]}>
                                        <Text style={{ fontSize: viewMode === 'detailed' ? 32 : 24 }}>{theme.icon}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <View style={styles.cardHeader}>
                                            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{theme.title}</Text>
                                            {levelStyle && (
                                                <View style={[styles.levelBadge, { backgroundColor: levelStyle.bg }]}>
                                                    <Text style={[styles.levelBadgeText, { color: levelStyle.color }]}>{levelStyle.label}</Text>
                                                </View>
                                            )}
                                        </View>
                                        {viewMode === 'detailed' && (
                                            <>
                                                {tags.length > 0 && (
                                                    <View style={styles.tagRow}>
                                                        {tags.map(tag => (
                                                            <View key={tag} style={[styles.tagChip, { backgroundColor: colors.surfaceSecondary }]}>
                                                                <Text style={[styles.tagText, { color: colors.textSecondary }]}>#{tag}</Text>
                                                            </View>
                                                        ))}
                                                    </View>
                                                )}
                                                {theme.description && (
                                                    <Text style={[styles.cardDesc, { color: colors.textSecondary }]} numberOfLines={1}>{theme.description}</Text>
                                                )}
                                                <Text style={[styles.langPair, { color: colors.textTertiary }]}>
                                                    {srcFlag} {srcCode} → {tgtFlag} {tgtCode}
                                                </Text>
                                                <View style={styles.cardFooter}>
                                                    <Text style={[styles.cardCount, { color: colors.primary }]}>{theme.words.length} 단어 수록</Text>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                        {theme.creatorName && (
                                                            <Text style={{ fontSize: 11, color: colors.textTertiary }}>by {theme.creatorName}</Text>
                                                        )}
                                                        {activeTab === 'community' && (theme.downloadCount ?? 0) > 0 && (
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                                                <Ionicons name="download-outline" size={12} color={colors.textTertiary} />
                                                                <Text style={{ fontSize: 11, color: colors.textTertiary }}>{theme.downloadCount}</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                </View>
                                            </>
                                        )}
                                        {viewMode === 'compact' && (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                                <Text style={{ fontSize: 11, color: colors.textTertiary }}>{theme.words.length} 단어</Text>
                                                {tags.length > 0 && (
                                                    <Text style={{ fontSize: 10, color: colors.textTertiary }}>#{tags[0]}</Text>
                                                )}
                                            </View>
                                        )}
                                    </View>
                                </Pressable>
                            );
                        })}

                        {filteredThemes.length === 0 && (
                            <View style={{ alignItems: 'center', marginVertical: 40 }}>
                                <Ionicons name="search-outline" size={48} color={colors.textTertiary} />
                                <Text style={{ marginTop: 16, color: colors.textSecondary, fontFamily: 'Pretendard_500Medium' }}>검색 결과가 없습니다.</Text>
                            </View>
                        )}
                    </ScrollView>

                    <View style={[styles.fallbackBar, { backgroundColor: colors.surface, paddingBottom: bottomInset + 8, borderTopColor: colors.border }]}>
                        <Text style={[styles.fallbackText, { color: colors.textSecondary }]}>찾으시는 테마가 없나요?</Text>
                        <Pressable onPress={handleGenerateAI} disabled={generating || !searchQuery} style={[styles.fallbackBtn, { backgroundColor: searchQuery ? colors.accent : colors.border }]}>
                            {generating ? <ActivityIndicator color="#FFF" /> : (
                                <>
                                    <Ionicons name="sparkles" size={18} color="#FFF" />
                                    <Text style={{ color: '#FFF', fontFamily: 'Pretendard_600SemiBold', fontSize: 14 }}>AI가 즉석에서 생성할까요?</Text>
                                </>
                            )}
                        </Pressable>
                    </View>
                </>
            )}

            <WordDetailModal
                visible={!!detailWord}
                mode="read"
                readOnly={true}
                listId="curation"
                word={detailWord}
                onClose={() => setDetailWord(null)}
            />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 16 },
    headerTitle: { fontSize: 28, fontFamily: 'Pretendard_700Bold', letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 14, fontFamily: 'Pretendard_500Medium', marginTop: 4 },
    actionBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    searchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 50, borderRadius: 12, borderWidth: 1, gap: 10 },
    searchInput: { flex: 1, fontFamily: 'Pretendard_500Medium', fontSize: 15 },
    tabContainer: { flexDirection: 'row', paddingHorizontal: 24, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5E5' },
    tabButton: { flex: 1, paddingVertical: 12, alignItems: 'center' },
    tabText: { fontSize: 16, fontFamily: 'Pretendard_600SemiBold' },
    themeCard: { borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 16, marginBottom: 16 },
    cardDetailed: { padding: 24 },
    cardCompact: { padding: 16, alignItems: 'center', marginBottom: 0 },
    cardIconBox: { alignItems: 'center', justifyContent: 'center' },
    iconBoxDetailed: { width: 64, height: 64, borderRadius: 20 },
    iconBoxCompact: { width: 48, height: 48, borderRadius: 12 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    cardTitle: { flex: 1, fontSize: 18, fontFamily: 'Pretendard_700Bold' },
    levelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginLeft: 8 },
    levelBadgeText: { fontSize: 11, fontFamily: 'Pretendard_600SemiBold' },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    tagChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    tagText: { fontSize: 11, fontFamily: 'Pretendard_500Medium' },
    cardDesc: { fontSize: 13, fontFamily: 'Pretendard_400Regular', marginTop: 6 },
    langPair: { fontSize: 11, fontFamily: 'Pretendard_500Medium', marginTop: 4 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
    cardCount: { fontSize: 11, fontFamily: 'Pretendard_700Bold', letterSpacing: 0.5 },
    langChipContainer: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 16, flexDirection: 'row' },
    langChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8 },
    langChipText: { fontSize: 13, fontFamily: 'Pretendard_600SemiBold' },
    fallbackBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingTop: 16, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    fallbackText: { fontSize: 13, fontFamily: 'Pretendard_500Medium' },
    fallbackBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
    detailHero: { height: 260, position: 'relative', padding: 24, justifyContent: 'flex-end' },
    backBtn: { position: 'absolute', top: 60, left: 24, width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
    heroContent: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', opacity: 0.1 },
    heroTextContainer: { zIndex: 1 },
    detailTitle: { fontSize: 28, fontFamily: 'Pretendard_700Bold', marginBottom: 4 },
    detailDesc: { fontSize: 14, fontFamily: 'Pretendard_500Medium' },
    wordItem: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
    wordTerm: { fontSize: 16, fontFamily: 'Pretendard_700Bold', marginBottom: 4 },
    wordMeaning: { fontSize: 14, fontFamily: 'Pretendard_600SemiBold' },
    wordDesc: { fontSize: 13, fontFamily: 'Pretendard_400Regular' },
    masterBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingTop: 16 },
    masterBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 12 },
    masterBtnText: { fontSize: 18, fontFamily: 'Pretendard_700Bold', color: '#FFFFFF' }
});
