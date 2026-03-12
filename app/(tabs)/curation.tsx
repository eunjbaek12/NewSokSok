import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, ActivityIndicator, TextInput, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { VocaList, Word } from '@/lib/types';
// This assumes constants/curationData exists and exports curationPresets
import { curationPresets } from '@/constants/curationData';
// Removed firebase & Firestore imports since we use VocabContext

import { VocabProvider } from '@/contexts/VocabContext'; // ensure useVocab works

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
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    let parsed: any[] = [];
    try {
        parsed = JSON.parse(textResponse);
    } catch (e) {
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
    const insets = useSafeAreaInsets();
    const { colors } = useTheme();
    const [viewMode, setViewMode] = useState<'detailed' | 'compact'>('detailed');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTheme, setSelectedTheme] = useState<VocaList | null>(null);
    const [saving, setSaving] = useState(false);
    const [generating, setGenerating] = useState(false);

    const { createCuratedList } = useVocab();

    // Context from useVocab will handle cloud/local sync internally. 

    const filteredThemes = curationPresets.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()));

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

    if (selectedTheme) {
        return (
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
                            <Text style={[styles.detailDesc, { color: colors.textSecondary }]}>{selectedTheme.words.length}개의 전문 단어</Text>
                        </View>
                    </View>
                    <View style={{ padding: 24 }}>
                        {selectedTheme.words.map((w, i) => (
                            <View key={i} style={[styles.wordItem, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                                <Text style={[styles.wordTerm, { color: colors.text }]}>{w.term}</Text>
                                <Text style={[styles.wordMeaning, { color: colors.primary }]}>{w.meaningKr}</Text>
                                {w.exampleEn ? <Text style={[styles.wordDesc, { color: colors.textSecondary, marginTop: 4 }]}>{w.exampleEn}</Text> : null}
                            </View>
                        ))}
                    </View>
                </ScrollView>
                <View style={[styles.masterBar, { paddingBottom: bottomInset + 8, backgroundColor: colors.surface }]}>
                    <Pressable onPress={() => handleSaveTheme(selectedTheme)} disabled={saving} style={[styles.masterBtn, { backgroundColor: colors.primary }]}>
                        {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.masterBtnText}>내 단어장에 최종 저장</Text>}
                    </Pressable>
                </View>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { paddingTop: topInset + 12 }]}>
                <View>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>큐레이션</Text>
                    <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>전문가가 엄선한 상황별 어휘</Text>
                </View>
                <Pressable onPress={() => setViewMode(prev => prev === 'detailed' ? 'compact' : 'detailed')} style={[styles.actionBtn, { borderColor: colors.border }]}>
                    <Ionicons name={viewMode === 'detailed' ? 'list' : 'grid'} size={22} color={colors.textSecondary} />
                </Pressable>
            </View>

            <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
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

            <ScrollView contentContainerStyle={[{ paddingHorizontal: 24, paddingBottom: bottomInset + 100 }, viewMode === 'compact' && { flexDirection: 'column', gap: 12 }]}>
                {filteredThemes.map(theme => (
                    <Pressable key={theme.id} onPress={() => { Haptics.selectionAsync(); setSelectedTheme(theme); }} style={[styles.themeCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }, viewMode === 'detailed' ? styles.cardDetailed : styles.cardCompact]}>
                        <View style={[styles.cardIconBox, { backgroundColor: colors.surfaceSecondary }, viewMode === 'detailed' ? styles.iconBoxDetailed : styles.iconBoxCompact]}>
                            <Text style={{ fontSize: viewMode === 'detailed' ? 32 : 24 }}>{theme.icon}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <View style={styles.cardHeader}>
                                <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{theme.title}</Text>
                            </View>
                            {viewMode === 'detailed' ? (
                                <View style={styles.cardFooter}>
                                    <Text style={[styles.cardCount, { color: colors.primary }]}>{theme.words.length} 단어 수록</Text>
                                </View>
                            ) : (
                                <Text style={[{ fontSize: 11, color: colors.textTertiary, marginTop: 4 }]}>{theme.words.length} 단어</Text>
                            )}
                        </View>
                    </Pressable>
                ))}

                {filteredThemes.length === 0 && (
                    <View style={{ alignItems: 'center', marginVertical: 40 }}>
                        <Ionicons name="search-outline" size={48} color={colors.textTertiary} />
                        <Text style={{ marginTop: 16, color: colors.textSecondary, fontFamily: 'Inter_500Medium' }}>검색 결과가 없습니다.</Text>
                    </View>
                )}
            </ScrollView>

            {/* AI Fallback Button always floats at the bottom */}
            <View style={[styles.fallbackBar, { backgroundColor: colors.surface, paddingBottom: bottomInset + 8, borderTopColor: colors.border }]}>
                <Text style={[styles.fallbackText, { color: colors.textSecondary }]}>찾으시는 테마가 없나요?</Text>
                <Pressable onPress={handleGenerateAI} disabled={generating || !searchQuery} style={[styles.fallbackBtn, { backgroundColor: searchQuery ? colors.accent : colors.border }]}>
                    {generating ? <ActivityIndicator color="#FFF" /> : (
                        <>
                            <Ionicons name="sparkles" size={18} color="#FFF" />
                            <Text style={{ color: '#FFF', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>AI가 즉석에서 생성할까요?</Text>
                        </>
                    )}
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 16 },
    headerTitle: { fontSize: 28, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 14, fontFamily: 'Inter_500Medium', marginTop: 4 },
    actionBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    searchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 50, borderRadius: 16, borderWidth: 1, gap: 10 },
    searchInput: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 15 },
    themeCard: { borderRadius: 24, borderWidth: 1, flexDirection: 'row', gap: 16, marginBottom: 16 },
    cardDetailed: { padding: 20 },
    cardCompact: { padding: 16, alignItems: 'center', marginBottom: 0 },
    cardIconBox: { alignItems: 'center', justifyContent: 'center' },
    iconBoxDetailed: { width: 64, height: 64, borderRadius: 20 },
    iconBoxCompact: { width: 48, height: 48, borderRadius: 16 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    cardTitle: { flex: 1, fontSize: 18, fontFamily: 'Inter_700Bold' },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
    cardCount: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
    fallbackBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingTop: 16, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    fallbackText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
    fallbackBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
    detailHero: { height: 260, position: 'relative', padding: 24, justifyContent: 'flex-end' },
    backBtn: { position: 'absolute', top: 60, left: 24, width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
    heroContent: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', opacity: 0.1 },
    heroTextContainer: { zIndex: 1 },
    detailTitle: { fontSize: 28, fontFamily: 'Inter_700Bold', marginBottom: 4 },
    detailDesc: { fontSize: 14, fontFamily: 'Inter_500Medium' },
    wordItem: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
    wordTerm: { fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 4 },
    wordMeaning: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
    wordDesc: { fontSize: 13, fontFamily: 'Inter_400Regular' },
    masterBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingTop: 16 },
    masterBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 20 },
    masterBtnText: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#FFFFFF' }
});
