import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, ActivityIndicator, TextInput, KeyboardAvoidingView, BackHandler, Animated as RNAnimated, Alert } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import CharacterSvg from '@/components/CharacterSvg';
import { useScrollToTop } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/features/theme';
import { useAuth } from '@/features/auth';
import {
  useLists,
  useFetchCloudCurations,
  useDeleteCloudCuration,
  createCuratedList,
  addBatchWords,
} from '@/features/vocab';
import { useSettings } from '@/features/settings';
import { VocaList, Word } from '@/lib/types';
import { AIWordResultArraySchema } from '@shared/contracts';
import { curationPresets } from '@/constants/curationData';

import { SUPPORTED_LANGUAGES, getLanguageFlag, getLanguageLabel } from '@/constants/languages';
import WordDetailModal from '@/components/WordDetailModal';
import { Snackbar } from '@/components/ui/Snackbar';
import { ModalPicker, PickerOption } from '@/components/ui/ModalPicker';
import DialogModal from '@/components/ui/DialogModal';

type AiDifficulty = 'beginner' | 'intermediate' | 'advanced';

const DIFFICULTY_PROMPT: Record<AiDifficulty, string> = {
    beginner: '초급 수준의 쉬운',
    intermediate: '중급 수준의',
    advanced: '고급/전문적인',
};

const generateAIWords = async (query: string, apiKey: string, wordCount: number, difficulty: AiDifficulty): Promise<Word[]> => {
    if (!apiKey) throw new Error('API Key missing');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const diffLabel = DIFFICULTY_PROMPT[difficulty];
    const prompt = `성인 학습자가 '${query}' 상황에서 사용할 수 있는 ${diffLabel} 영어 단어 ${wordCount}개를 생성해줘.
  응답은 오직 JSON 배열만 반환해야 해.
  포맷: [{"term": "단어", "definition": "영영뜻", "meaningKr": "한국어 뜻", "exampleEn": "영어 예문", "tags": ["${query}"]}]`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, responseMimeType: 'application/json' }
    };

    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) {
        if (response.status === 429) throw new Error('API 할당량이 초과되었습니다. 잠시 후 다시 시도해주세요.');
        if (response.status === 400) throw new Error('API 키가 올바르지 않습니다. 설정을 확인해주세요.');
        throw new Error('AI 생성에 실패했습니다.');
    }

    const data = await response.json();
    let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    textResponse = textResponse.trim();
    if (textResponse.startsWith('```')) {
        const firstNewLine = textResponse.indexOf('\n');
        const lastBacktick = textResponse.lastIndexOf('```');
        if (firstNewLine !== -1 && lastBacktick !== -1) {
            textResponse = textResponse.slice(firstNewLine, lastBacktick).trim();
        }
    }

    let raw: unknown;
    try {
        raw = JSON.parse(textResponse);
    } catch (e) {
        console.error('Failed to parse AI response:', textResponse);
        throw new Error('응답을 파싱할 수 없습니다.');
    }

    const result = AIWordResultArraySchema.safeParse(raw);
    if (!result.success) {
        console.error('AI curation schema mismatch:', result.error.issues, 'raw:', raw);
        throw new Error('AI 응답 형식이 올바르지 않습니다. 다시 시도해주세요.');
    }

    return result.data.map((w, index) => ({
        id: `ai-word-${index}-${Date.now()}`,
        term: w.term,
        definition: w.definition,
        meaningKr: w.meaningKr,
        exampleEn: w.exampleEn,
        isMemorized: false,
        isStarred: false,
        tags: w.tags ?? [query],
    }));
};

const getUniqueName = (base: string, existingNames: string[]): string => {
    const lowerNames = existingNames.map(n => n.trim().toLowerCase());
    let candidate = base;
    let suffix = 1;
    while (lowerNames.includes(candidate.trim().toLowerCase())) {
        candidate = `${base}-${suffix}`;
        suffix++;
    }
    return candidate;
};

export default function CurationScreen() {
    const scrollRef = useRef<ScrollView>(null);
    useScrollToTop(scrollRef);
    const scrollY = useRef(new RNAnimated.Value(0)).current;
    const fabAnim = useRef(new RNAnimated.Value(0)).current;
    const isTopBtnVisible = useRef(false);

    const detailScrollRef = useRef<ScrollView>(null);
    const detailScrollY = useRef(new RNAnimated.Value(0)).current;
    const detailFabAnim = useRef(new RNAnimated.Value(0)).current;
    const isDetailTopBtnVisible = useRef(false);

    const insets = useSafeAreaInsets();
    const { colors, isDark } = useTheme();
    const { t } = useTranslation();
    const router = useRouter();
    const [viewMode, setViewMode] = useState<'detailed' | 'compact'>('detailed');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTheme, setSelectedTheme] = useState<VocaList | null>(null);
    const [saving, setSaving] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [isCommunityLoading, setIsCommunityLoading] = useState(true);
    const [detailWord, setDetailWord] = useState<Word | null>(null);
    const [activeTab, setActiveTab] = useState<'official' | 'community'>('official');
    const [communityThemes, setCommunityThemes] = useState<VocaList[]>([]);
    const [languageFilter, setLanguageFilter] = useState<string>('all');
    const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());
    const [showListPicker, setShowListPicker] = useState(false);
    const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; actionLabel?: string; onAction?: () => void }>({ visible: false, message: '' });
    const [masterBarHeight, setMasterBarHeight] = useState(0);

    const lists = useLists();
    const fetchCloudCurations = useFetchCloudCurations();
    const deleteCloudCuration = useDeleteCloudCuration();
    const { user } = useAuth();
    const { profileSettings } = useSettings();
    const [aiModalVisible, setAiModalVisible] = useState(false);
    const [aiTopic, setAiTopic] = useState('');
    const [aiWordCount, setAiWordCount] = useState(20);
    const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('intermediate');

    useEffect(() => {
        let mounted = true;
        setIsCommunityLoading(true);
        fetchCloudCurations().then(data => {
            if (mounted) {
                // Server curations have a superset of VocaList fields via
                // `.passthrough()`; the UI reads only what it needs so this
                // cast is safe.
                setCommunityThemes(data as unknown as VocaList[]);
                setIsCommunityLoading(false);
            }
        });
        return () => { mounted = false; };
    }, [fetchCloudCurations]);

    // Initialize word selection when theme is selected
    useEffect(() => {
        if (selectedTheme) {
            setSelectedWordIds(new Set(selectedTheme.words.map((_, i) => String(i))));
        } else {
            setSelectedWordIds(new Set());
        }
    }, [selectedTheme]);

    useEffect(() => {
        const backAction = () => {
            if (showListPicker) {
                setShowListPicker(false);
                return true;
            }
            if (detailWord) {
                setDetailWord(null);
                return true;
            }
            if (selectedTheme) {
                setSelectedTheme(null);
                return true;
            }
            return false;
        };

        const backHandler = BackHandler.addEventListener(
            "hardwareBackPress",
            backAction
        );

        return () => backHandler.remove();
    }, [selectedTheme, detailWord, showListPicker]);

    useEffect(() => {
        const listener = scrollY.addListener(({ value }) => {
            const shouldShow = value > 300;
            if (shouldShow !== isTopBtnVisible.current) {
                isTopBtnVisible.current = shouldShow;
                RNAnimated.spring(fabAnim, { toValue: shouldShow ? 1 : 0, useNativeDriver: true, tension: 60, friction: 8 }).start();
            }
        });
        return () => scrollY.removeListener(listener);
    }, [scrollY, fabAnim]);

    useEffect(() => {
        const listener = detailScrollY.addListener(({ value }) => {
            const shouldShow = value > 200;
            if (shouldShow !== isDetailTopBtnVisible.current) {
                isDetailTopBtnVisible.current = shouldShow;
                RNAnimated.spring(detailFabAnim, { toValue: shouldShow ? 1 : 0, useNativeDriver: true, tension: 60, friction: 8 }).start();
            }
        });
        return () => detailScrollY.removeListener(listener);
    }, [detailScrollY, detailFabAnim]);

    const sourceThemes = activeTab === 'official' ? curationPresets : communityThemes;
    const filteredThemes = useMemo(() => sourceThemes.filter(t => {
        const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesLang = languageFilter === 'all' || t.sourceLanguage === languageFilter;
        return matchesSearch && matchesLang;
    }), [sourceThemes, searchQuery, languageFilter]);

    const langFilterChips = useMemo(() => [
        { code: 'all', label: t('curation.langAll') },
        ...SUPPORTED_LANGUAGES.map(l => ({ code: l.code, label: getLanguageLabel(l.code, t) })),
    ], [t]);

    const getLevelStyle = (level?: string) => {
        switch (level) {
            case 'beginner': return { label: t('curation.beginner'), bg: colors.difficulty.beginnerBg, color: colors.difficulty.beginnerText };
            case 'intermediate': return { label: t('curation.intermediate'), bg: colors.difficulty.intermediateBg, color: colors.difficulty.intermediateText };
            case 'advanced': return { label: t('curation.advanced'), bg: colors.difficulty.advancedBg, color: colors.difficulty.advancedText };
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

    const dailyTip = useMemo(() => {
        const tips = t('curation.tips', { returnObjects: true }) as string[];
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
        return tips[dayOfYear % tips.length];
    }, [t]);
    const tabBarHeight = useBottomTabBarHeight();
    const bottomInset = Platform.OS === 'web' ? 84 + 34 : tabBarHeight;

    const selectedCount = selectedWordIds.size;
    const totalCount = selectedTheme?.words.length ?? 0;
    const allSelected = selectedCount === totalCount && totalCount > 0;

    const toggleWordSelection = useCallback((index: number) => {
        setSelectedWordIds(prev => {
            const next = new Set(prev);
            const key = String(index);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const toggleSelectAll = useCallback(() => {
        if (!selectedTheme) return;
        if (allSelected) {
            setSelectedWordIds(new Set());
        } else {
            setSelectedWordIds(new Set(selectedTheme.words.map((_, i) => String(i))));
        }
    }, [selectedTheme, allSelected]);

    const getSelectedWords = useCallback(() => {
        if (!selectedTheme) return [];
        return selectedTheme.words
            .filter((_, i) => selectedWordIds.has(String(i)))
            .map(w => ({
                term: w.term,
                meaningKr: w.meaningKr,
                definition: w.definition,
                exampleEn: w.exampleEn,
                exampleKr: w.exampleKr,
                isStarred: false,
                tags: w.tags || []
            }));
    }, [selectedTheme, selectedWordIds]);

    const importOptions: PickerOption[] = useMemo(() =>
        lists.map(l => ({
            id: l.id,
            title: l.title,
            subtitle: t('curation.wordsIncluded', { count: l.words.length }),
        })),
        [lists, t]
    );

    const isAlreadySaved = useCallback((theme: VocaList): boolean => {
        return lists.some(l => l.isCurated && l.title.startsWith(theme.title));
    }, [lists]);

    const canDeleteCuration = useCallback((theme: VocaList): boolean => {
        if (!user) return false;
        return theme.creatorId === user.id || user.isAdmin;
    }, [user]);

    const handleDeleteCuration = useCallback((theme: VocaList) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert(
            t('curation.deleteConfirmTitle'),
            t('curation.deleteConfirmMessage', { title: theme.title }),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteCloudCuration(theme.id);
                            setCommunityThemes(prev => prev.filter(c => c.id !== theme.id));
                            if (selectedTheme?.id === theme.id) setSelectedTheme(null);
                            setSnackbar({ visible: true, message: t('curation.deleteSuccess') });
                        } catch (e: any) {
                            setSnackbar({ visible: true, message: t('curation.deleteError') });
                        }
                    },
                },
            ],
        );
    }, [t, deleteCloudCuration, selectedTheme]);

    const hasApiKey = !!profileSettings.geminiApiKey;

    const handleOpenAiModal = () => {
        if (!hasApiKey) {
            router.push('/(tabs)/settings');
            return;
        }
        setAiTopic(searchQuery);
        setAiModalVisible(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handleGenerateAI = async () => {
        if (!aiTopic.trim()) {
            setSnackbar({ visible: true, message: t('curation.enterSearchFirst') });
            return;
        }
        setGenerating(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        try {
            const words = await generateAIWords(aiTopic.trim(), profileSettings.geminiApiKey, aiWordCount, aiDifficulty);
            const newTheme: VocaList = {
                id: `ai-theme-${Date.now()}`,
                title: `AI: ${aiTopic.trim()}`,
                icon: '✨',
                words,
                isVisible: true,
                createdAt: Date.now(),
                isCurated: true,
            };
            setAiModalVisible(false);
            setSelectedTheme(newTheme);
        } catch (e: any) {
            setSnackbar({ visible: true, message: e.message || t('curation.aiGenerateError') });
        } finally {
            setGenerating(false);
        }
    };

    const handleCreateNew = async () => {
        if (!selectedTheme) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSaving(true);
        const words = getSelectedWords();
        try {
            const uniqueTitle = getUniqueName(selectedTheme.title, lists.map(l => l.title));
            const newList = await createCuratedList(uniqueTitle, selectedTheme.icon || '✨', words);
            setSnackbar({
                visible: true,
                message: t('curation.savedSuccess'),
                actionLabel: t('curation.goToVocabList'),
                onAction: () => router.push(`/list/${newList.id}`),
            });
            setSelectedTheme(null);
        } catch (e: any) {
            setSnackbar({ visible: true, message: t('curation.saveError') });
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    const handleImport = async (targetListId: string) => {
        if (!selectedTheme) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSaving(true);
        setShowListPicker(false);
        const words = getSelectedWords();
        try {
            await addBatchWords(targetListId, words);
            const targetList = lists.find(l => l.id === targetListId);
            setSnackbar({
                visible: true,
                message: t('curation.addedToExistingList', { title: targetList?.title ?? '' }),
                actionLabel: t('curation.goToVocabList'),
                onAction: () => router.push(`/list/${targetListId}`),
            });
            setSelectedTheme(null);
        } catch (e: any) {
            setSnackbar({ visible: true, message: t('curation.saveError') });
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.container, { backgroundColor: colors.background }]}>
            {selectedTheme ? (
                <View style={[styles.container, { backgroundColor: colors.background }]}>
                    <ScrollView
                        ref={detailScrollRef}
                        style={{ flex: 1 }}
                        contentContainerStyle={{ paddingBottom: masterBarHeight > 0 ? masterBarHeight + 8 : 140 }}
                        onScroll={RNAnimated.event([{ nativeEvent: { contentOffset: { y: detailScrollY } } }], { useNativeDriver: false })}
                        scrollEventThrottle={16}
                    >
                        <View style={[styles.detailHero, { backgroundColor: colors.surfaceSecondary, paddingTop: topInset + 16 }]}>
                            <Pressable onPress={() => setSelectedTheme(null)} style={[styles.backBtn, { backgroundColor: 'rgba(255,255,255,0.7)' }]}>
                                <Ionicons name="arrow-back" size={24} color={colors.text} />
                            </Pressable>
                            {activeTab === 'community' && canDeleteCuration(selectedTheme) && (
                                <Pressable
                                    onPress={() => handleDeleteCuration(selectedTheme)}
                                    style={[styles.backBtn, { backgroundColor: 'rgba(255,255,255,0.7)', left: undefined, right: 20 }]}
                                    hitSlop={8}
                                >
                                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                                </Pressable>
                            )}
                            <View style={styles.heroContent}>
                                <Text style={{ fontSize: 64 }}>{selectedTheme.icon}</Text>
                            </View>
                            <View style={styles.heroTextContainer}>
                                <Text style={[styles.detailTitle, { color: colors.text }]}>{selectedTheme.title}</Text>
                                <View style={styles.heroMetaRow}>
                                    <Text style={[styles.detailDesc, { color: colors.textSecondary }]}>
                                        {t('curation.nExpertWords', { count: selectedTheme.words.length })}
                                    </Text>
                                    {(() => {
                                        const levelStyle = getLevelStyle(selectedTheme.level);
                                        return levelStyle ? (
                                            <View style={[styles.levelBadge, { backgroundColor: levelStyle.bg }]}>
                                                <Text style={[styles.levelBadgeText, { color: levelStyle.color }]}>{levelStyle.label}</Text>
                                            </View>
                                        ) : null;
                                    })()}
                                    {selectedTheme.creatorName && (
                                        <Text style={[styles.detailDesc, { color: colors.textSecondary }]}>• by {selectedTheme.creatorName}</Text>
                                    )}
                                </View>
                                {selectedTheme.description && (
                                    <Text style={[styles.detailDescription, { color: colors.textSecondary }]}>
                                        {selectedTheme.description}
                                    </Text>
                                )}
                                {selectedTheme.isAiGenerated && (
                                    <Text style={[styles.aiGeneratedNote, { color: colors.textTertiary }]}>
                                        {t('curation.aiGeneratedNote')}
                                    </Text>
                                )}
                                {(selectedTheme.downloadCount ?? 0) > 0 && (
                                    <View style={styles.downloadRow}>
                                        <Ionicons name="download-outline" size={14} color={colors.textTertiary} />
                                        <Text style={{ fontSize: 12, color: colors.textTertiary, fontFamily: 'Pretendard_500Medium' }}>{selectedTheme.downloadCount}</Text>
                                    </View>
                                )}
                                {(() => {
                                    const tags = getTopTags(selectedTheme);
                                    return tags.length > 0 ? (
                                        <View style={[styles.tagRow, { marginTop: 8, justifyContent: 'flex-end' }]}>
                                            {tags.map(tag => (
                                                <View key={tag} style={[styles.tagChip, { backgroundColor: isDark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.65)' }]}>
                                                    <Text style={[styles.tagText, { color: colors.text }]}>#{tag}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    ) : null;
                                })()}
                            </View>
                        </View>
                        <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 0 }}>
                            <View style={styles.selectionBar}>
                                <Text style={[styles.selectionText, { color: colors.textSecondary, marginRight: 8 }]}>
                                    {t('curation.selectedCount', { selected: selectedCount, total: totalCount })}
                                </Text>
                                <View style={{ paddingRight: 16 }}>
                                    <Pressable onPress={toggleSelectAll} hitSlop={8}>
                                        <Ionicons
                                            name={allSelected ? 'checkbox' : selectedCount > 0 ? 'checkbox-outline' : 'square-outline'}
                                            size={24}
                                            color={selectedCount > 0 ? colors.primary : colors.textTertiary}
                                        />
                                    </Pressable>
                                </View>
                            </View>
                        </View>
                        <View style={{ padding: 24, paddingTop: 4 }}>
                            {selectedTheme.words.map((w, i) => {
                                const isSelected = selectedWordIds.has(String(i));
                                return (
                                    <Pressable
                                        key={i}
                                        onPress={() => { Haptics.selectionAsync(); setDetailWord(w); }}
                                        style={({ pressed }) => [
                                            styles.wordItem,
                                            { backgroundColor: colors.surface, borderColor: colors.borderLight, opacity: pressed ? 0.7 : isSelected ? 1 : 0.4 }
                                        ]}
                                    >
                                        <View style={styles.checkboxRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.wordTerm, { color: colors.text }]}>{w.term}</Text>
                                                <Text style={[styles.wordMeaning, { color: colors.primary }]}>{w.meaningKr}</Text>
                                                {w.exampleEn ? (
                                                    <Text style={[styles.wordDesc, { color: colors.textTertiary, marginTop: 4, fontStyle: 'italic' }]}>
                                                        {w.exampleEn}
                                                    </Text>
                                                ) : null}
                                            </View>
                                            <Pressable
                                                onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync(); toggleWordSelection(i); }}
                                                hitSlop={8}
                                                style={styles.checkboxHit}
                                            >
                                                <Ionicons
                                                    name={isSelected ? 'checkbox' : 'square-outline'}
                                                    size={24}
                                                    color={isSelected ? colors.primary : colors.textTertiary}
                                                />
                                            </Pressable>
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </ScrollView>
                    <View
                        style={[styles.masterBar, {
                            paddingBottom: bottomInset + 10,
                            backgroundColor: isDark ? 'rgba(18, 18, 18, 0.92)' : 'rgba(255, 255, 255, 0.92)',
                            borderTopColor: colors.border,
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                        }]}
                        onLayout={(e) => setMasterBarHeight(e.nativeEvent.layout.height)}
                    >
                        <BlurView
                            intensity={80}
                            tint={isDark ? 'dark' : 'light'}
                            style={StyleSheet.absoluteFill}
                        />
                        <View style={styles.masterBtnRow}>
                            <Pressable
                                onPress={() => setShowListPicker(true)}
                                disabled={saving || selectedCount === 0 || lists.length === 0}
                                style={[styles.masterBtnSecondary, {
                                    backgroundColor: colors.surface,
                                    borderColor: colors.border,
                                }]}
                            >
                                <Text style={[styles.masterBtnSecondaryText, {
                                    color: (saving || selectedCount === 0 || lists.length === 0) ? colors.textTertiary : colors.textSecondary,
                                }]}>
                                    {t('curation.addToExisting')}
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={handleCreateNew}
                                disabled={saving || selectedCount === 0}
                                style={[styles.masterBtn, {
                                    backgroundColor: (saving || selectedCount === 0) ? colors.surface : colors.primaryLight,
                                    borderWidth: 1.5,
                                    borderColor: (saving || selectedCount === 0) ? colors.border : colors.primary,
                                }]}
                            >
                                {saving ? <ActivityIndicator color={colors.primary} /> : (
                                    <Text style={[styles.masterBtnText, {
                                        color: (saving || selectedCount === 0) ? colors.textTertiary : colors.primary,
                                    }]}>{t('curation.createNewList')}</Text>
                                )}
                            </Pressable>
                        </View>
                    </View>
                    <RNAnimated.View
                        style={{
                            position: 'absolute',
                            right: 20,
                            bottom: tabBarHeight + 88,
                            opacity: detailFabAnim,
                            transform: [{ scale: detailFabAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
                        }}
                        pointerEvents="box-none"
                    >
                        <Pressable
                            onPress={() => { detailScrollRef.current?.scrollTo({ y: 0, animated: true }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                            style={({ pressed }) => [styles.fab, { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', shadowColor: colors.shadow, opacity: pressed ? 0.7 : 1 }]}
                        >
                            {Platform.OS === 'ios' && (
                                <View style={[StyleSheet.absoluteFill, { borderRadius: 24, overflow: 'hidden' }]}>
                                    <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                                </View>
                            )}
                            <Ionicons name="arrow-up" size={24} color={colors.text} />
                        </Pressable>
                    </RNAnimated.View>
                </View>
            ) : (
                <>
                    <View style={[styles.header, { paddingTop: topInset + 16 }]}>
                        <CharacterSvg size={56} isDark={isDark} />
                        <View style={styles.headerTextArea}>
                            <Text style={[styles.headerTitle, { color: colors.text }]}>{t('curation.title')}</Text>
                            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>{dailyTip}</Text>
                        </View>
                        <Pressable onPress={() => setViewMode(prev => prev === 'detailed' ? 'compact' : 'detailed')} style={[styles.actionBtn, { borderColor: colors.border }]}>
                            <Ionicons name={viewMode === 'detailed' ? 'reorder-three-outline' : 'reader-outline'} size={22} color={colors.textSecondary} />
                        </Pressable>
                    </View>

                    <View style={{ paddingHorizontal: 20, paddingVertical: 8 }}>
                        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.borderLight, shadowColor: colors.shadow }]}>
                            <Ionicons name="search" size={20} color={colors.textTertiary} />
                            <TextInput
                                placeholder={t('curation.searchPlaceholder')}
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

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={styles.langChipContainer}>
                        {langFilterChips.map(chip => {
                            const isActive = languageFilter === chip.code;
                            return (
                                <Pressable
                                    key={chip.code}
                                    onPress={() => { Haptics.selectionAsync(); setLanguageFilter(chip.code); }}
                                    style={[styles.langChip, { backgroundColor: isActive ? colors.primaryButton : colors.surfaceSecondary }]}
                                >
                                    <Text style={[styles.langChipText, { color: isActive ? colors.onPrimary : colors.textSecondary }]}>{chip.label}</Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>

                    <View style={[styles.tabContainer, { borderBottomColor: colors.border }]}>
                        <Pressable
                            style={[styles.tabButton, activeTab === 'official' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                            onPress={() => { Haptics.selectionAsync(); setActiveTab('official'); }}
                        >
                            <Text style={[styles.tabText, { color: activeTab === 'official' ? colors.primary : colors.textSecondary }]}>{t('curation.officialTab')}</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.tabButton, activeTab === 'community' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                            onPress={() => { Haptics.selectionAsync(); setActiveTab('community'); }}
                        >
                            <Text style={[styles.tabText, { color: activeTab === 'community' ? colors.primary : colors.textSecondary }]}>{t('curation.communityTab')}</Text>
                        </Pressable>
                    </View>

                    {activeTab === 'community' && isCommunityLoading ? (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <ActivityIndicator size="large" color={colors.primary} />
                        </View>
                    ) : (
                    <ScrollView
                        ref={scrollRef}
                        style={{ flex: 1 }}
                        contentContainerStyle={[{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: bottomInset + 24 }, viewMode === 'compact' && { flexDirection: 'column', gap: 12 }]}
                        onScroll={RNAnimated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
                        scrollEventThrottle={16}
                    >
                        {filteredThemes.map(theme => {
                            const levelStyle = getLevelStyle(theme.level);
                            const tags = getTopTags(theme);
                            const srcFlag = getLanguageFlag(theme.sourceLanguage || 'en');
                            const tgtFlag = getLanguageFlag(theme.targetLanguage || 'ko');
                            const srcCode = (theme.sourceLanguage || 'en').toUpperCase();
                            const tgtCode = (theme.targetLanguage || 'ko').toUpperCase();
                            const alreadySaved = isAlreadySaved(theme);
                            const canDelete = activeTab === 'community' && canDeleteCuration(theme);
                            const showLangPair = languageFilter === 'all';

                            return (
                                <Pressable key={theme.id} onPress={() => { Haptics.selectionAsync(); setSelectedTheme(theme); }} style={[styles.themeCard, { backgroundColor: colors.surface, borderColor: isDark ? colors.border : 'rgba(49, 130, 246, 0.1)', shadowColor: colors.cardShadow }, viewMode === 'detailed' ? styles.cardDetailed : styles.cardCompact]}>
                                    <View style={{ flex: 1 }}>
                                        <View style={styles.cardHeader}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                                                {theme.icon && <Text style={{ fontSize: 16 }}>{theme.icon}</Text>}
                                                <Text style={[styles.cardTitle, { color: colors.text, flex: 1 }]} numberOfLines={1}>{theme.title}</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                {alreadySaved && (
                                                    <View style={[styles.savedBadge, { backgroundColor: colors.successLight }]}>
                                                        <Ionicons name="checkmark" size={10} color={colors.success} />
                                                        <Text style={[styles.savedBadgeText, { color: colors.success }]}>{t('curation.saved')}</Text>
                                                    </View>
                                                )}
                                                {levelStyle && (
                                                    <View style={[styles.levelBadge, { backgroundColor: levelStyle.bg }]}>
                                                        <Text style={[styles.levelBadgeText, { color: levelStyle.color }]}>{levelStyle.label}</Text>
                                                    </View>
                                                )}
                                                {canDelete && (
                                                    <Pressable
                                                        onPress={(e) => { e.stopPropagation(); handleDeleteCuration(theme); }}
                                                        hitSlop={8}
                                                        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 2 })}
                                                    >
                                                        <Ionicons name="trash-outline" size={16} color={colors.error} />
                                                    </Pressable>
                                                )}
                                            </View>
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
                                                {showLangPair && (
                                                    <Text style={[styles.langPair, { color: colors.textTertiary }]}>
                                                        {srcFlag} {srcCode} → {tgtFlag} {tgtCode}
                                                    </Text>
                                                )}
                                                <View style={styles.cardFooter}>
                                                    <View style={[styles.wordCountPill, { backgroundColor: colors.primaryLight }]}>
                                                        <Text style={[styles.cardCount, { color: colors.primary }]}>{t('curation.wordsIncluded', { count: theme.words.length })}</Text>
                                                    </View>
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
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                                                <View style={[styles.wordCountPill, { backgroundColor: colors.primaryLight }]}>
                                                    <Text style={[styles.cardCount, { color: colors.primary }]}>{t('curation.nWordsCompact', { count: theme.words.length })}</Text>
                                                </View>
                                                {levelStyle && (
                                                    <View style={[styles.levelBadge, { backgroundColor: levelStyle.bg }]}>
                                                        <Text style={[styles.levelBadgeText, { color: levelStyle.color }]}>{levelStyle.label}</Text>
                                                    </View>
                                                )}
                                                {tags.length > 0 && (
                                                    <View style={[styles.tagChip, { backgroundColor: colors.surfaceSecondary }]}>
                                                        <Text style={[styles.tagText, { color: colors.textSecondary }]}>#{tags[0]}</Text>
                                                    </View>
                                                )}
                                            </View>
                                        )}
                                    </View>
                                </Pressable>
                            );
                        })}

                        {filteredThemes.length === 0 && (
                            <View style={{ alignItems: 'center', marginTop: 40, marginBottom: 24 }}>
                                <Ionicons name="search-outline" size={48} color={colors.textTertiary} />
                                <Text style={{ marginTop: 16, color: colors.textSecondary, fontFamily: 'Pretendard_500Medium' }}>{t('curation.noResults')}</Text>
                            </View>
                        )}

                        {filteredThemes.length === 0 && activeTab === 'official' && (
                            <View style={[styles.inlineFallback, { borderTopColor: colors.borderLight }]}>
                                <Text style={[styles.fallbackText, { color: colors.textSecondary }]}>{t('curation.noThemeFound')}</Text>
                                {hasApiKey ? (
                                    <Pressable onPress={handleOpenAiModal} style={[styles.fallbackBtn, { backgroundColor: colors.accent }]}>
                                        <Ionicons name="sparkles" size={18} color={colors.onPrimary} />
                                        <Text style={{ color: colors.onPrimary, fontFamily: 'Pretendard_600SemiBold', fontSize: 14 }}>{t('curation.aiGenerate')}</Text>
                                    </Pressable>
                                ) : (
                                    <View style={{ alignItems: 'center', gap: 8 }}>
                                        <Text style={{ color: colors.textTertiary, fontSize: 13, fontFamily: 'Pretendard_400Regular' }}>{t('curation.aiApiKeyRequired')}</Text>
                                        <Pressable
                                            onPress={() => router.push('/(tabs)/settings')}
                                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.primaryLight }}
                                        >
                                            <Ionicons name="settings-outline" size={16} color={colors.primary} />
                                            <Text style={{ color: colors.primary, fontSize: 13, fontFamily: 'Pretendard_600SemiBold' }}>{t('curation.aiGoToSettings')}</Text>
                                        </Pressable>
                                    </View>
                                )}
                            </View>
                        )}
                    </ScrollView>
                    )}

                    <RNAnimated.View
                        style={{
                            position: 'absolute',
                            right: 20,
                            bottom: insets.bottom + 84,
                            opacity: fabAnim,
                            transform: [{ scale: fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
                        }}
                        pointerEvents="box-none"
                    >
                        <Pressable
                            onPress={() => { scrollRef.current?.scrollTo({ y: 0, animated: true }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                            style={({ pressed }) => [styles.fab, { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', shadowColor: colors.shadow, opacity: pressed ? 0.7 : 1 }]}
                        >
                            {Platform.OS === 'ios' && (
                                <View style={[StyleSheet.absoluteFill, { borderRadius: 24, overflow: 'hidden' }]}>
                                    <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                                </View>
                            )}
                            <Ionicons name="arrow-up" size={24} color={colors.text} />
                        </Pressable>
                    </RNAnimated.View>
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

            <ModalPicker
                visible={showListPicker}
                onClose={() => setShowListPicker(false)}
                title={t('curation.chooseDestination')}
                options={importOptions}
                onSelect={handleImport}
            />

            <DialogModal
                visible={aiModalVisible}
                onClose={() => { if (!generating) setAiModalVisible(false); }}
                title={t('curation.aiGenerate')}
                scrollable={false}
                footer={
                    <Pressable
                        onPress={handleGenerateAI}
                        disabled={generating || !aiTopic.trim()}
                        style={{
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                            backgroundColor: aiTopic.trim() && !generating ? colors.accent : colors.border,
                            paddingVertical: 14, borderRadius: 14,
                        }}
                    >
                        {generating ? (
                            <>
                                <ActivityIndicator color={colors.onPrimary} size="small" />
                                <Text style={{ color: colors.onPrimary, fontFamily: 'Pretendard_600SemiBold', fontSize: 15 }}>{t('curation.aiGenerating')}</Text>
                            </>
                        ) : (
                            <>
                                <Ionicons name="sparkles" size={18} color={colors.onPrimary} />
                                <Text style={{ color: colors.onPrimary, fontFamily: 'Pretendard_600SemiBold', fontSize: 15 }}>{t('curation.aiGenerateAction')}</Text>
                            </>
                        )}
                    </Pressable>
                }
            >
                <View style={{ paddingHorizontal: 20, gap: 16, paddingBottom: 8 }}>
                    <View style={{ gap: 6 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'Pretendard_600SemiBold', color: colors.textSecondary }}>{t('curation.aiTopicLabel')}</Text>
                        <TextInput
                            style={{
                                height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14,
                                fontSize: 16, fontFamily: 'Pretendard_400Regular',
                                color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border,
                            }}
                            value={aiTopic}
                            onChangeText={setAiTopic}
                            placeholder={t('curation.aiTopicPlaceholder')}
                            placeholderTextColor={colors.textTertiary}
                            autoFocus
                            editable={!generating}
                        />
                    </View>

                    <View style={{ gap: 6 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'Pretendard_600SemiBold', color: colors.textSecondary }}>{t('curation.aiDifficultyLabel')}</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {([
                                { key: 'beginner' as AiDifficulty, label: t('curation.beginner') },
                                { key: 'intermediate' as AiDifficulty, label: t('curation.intermediate') },
                                { key: 'advanced' as AiDifficulty, label: t('curation.advanced') },
                            ]).map(d => (
                                <Pressable
                                    key={d.key}
                                    onPress={() => !generating && setAiDifficulty(d.key)}
                                    style={{
                                        flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                                        backgroundColor: aiDifficulty === d.key ? colors.primaryButton : colors.surfaceSecondary,
                                    }}
                                >
                                    <Text style={{
                                        fontSize: 14, fontFamily: 'Pretendard_600SemiBold',
                                        color: aiDifficulty === d.key ? colors.onPrimary : colors.textSecondary,
                                    }}>{d.label}</Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>

                    <View style={{ gap: 6 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'Pretendard_600SemiBold', color: colors.textSecondary }}>{t('curation.aiWordCount')}</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {[10, 20, 30, 50].map(n => (
                                <Pressable
                                    key={n}
                                    onPress={() => !generating && setAiWordCount(n)}
                                    style={{
                                        flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                                        backgroundColor: aiWordCount === n ? colors.primaryButton : colors.surfaceSecondary,
                                    }}
                                >
                                    <Text style={{
                                        fontSize: 14, fontFamily: 'Pretendard_600SemiBold',
                                        color: aiWordCount === n ? colors.onPrimary : colors.textSecondary,
                                    }}>{n}{t('curation.aiWordUnit')}</Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                </View>
            </DialogModal>

            <Snackbar
                visible={snackbar.visible}
                message={snackbar.message}
                actionLabel={snackbar.actionLabel}
                onAction={snackbar.onAction}
                onDismiss={() => setSnackbar(prev => ({ ...prev, visible: false }))}
            />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 8, gap: 12 },
    headerTextArea: { flex: 1 },
    headerTitle: { fontSize: 26, fontFamily: 'Pretendard_700Bold', letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 14, fontFamily: 'Pretendard_400Regular', marginTop: 2, lineHeight: 20 },
    actionBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    searchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16, borderWidth: 1, gap: 10, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    searchInput: { flex: 1, fontFamily: 'Pretendard_400Regular', fontSize: 15, fontWeight: '400', padding: 0 },
    tabContainer: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 16, borderBottomWidth: 1 },
    tabButton: { flex: 1, paddingVertical: 12, alignItems: 'center' },
    tabText: { fontSize: 16, fontFamily: 'Pretendard_600SemiBold' },
    themeCard: { borderRadius: 16, borderWidth: 1, marginBottom: 12, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 10, elevation: 4 },
    cardDetailed: { padding: 16 },
    cardCompact: { padding: 12, marginBottom: 0 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    cardTitle: { fontSize: 17, fontFamily: 'Pretendard_700Bold' },
    levelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    levelBadgeText: { fontSize: 11, fontFamily: 'Pretendard_600SemiBold' },
    savedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
    savedBadgeText: { fontSize: 11, fontFamily: 'Pretendard_600SemiBold' },
    aiGeneratedNote: { fontSize: 11, fontFamily: 'Pretendard_400Regular', marginTop: 4, textAlign: 'right', fontStyle: 'italic' },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    tagChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
    tagText: { fontSize: 11, fontFamily: 'Pretendard_500Medium' },
    cardDesc: { fontSize: 13, fontFamily: 'Pretendard_400Regular', marginTop: 6 },
    langPair: { fontSize: 13, fontFamily: 'Pretendard_500Medium', marginTop: 4 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
    wordCountPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    cardCount: { fontSize: 12, fontFamily: 'Pretendard_700Bold', letterSpacing: 0.3 },
    langChipContainer: { paddingHorizontal: 20, paddingVertical: 2, flexDirection: 'row', alignItems: 'center' },
    langChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8 },
    langChipText: { fontSize: 13, fontFamily: 'Pretendard_600SemiBold' },
    inlineFallback: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
    fallbackText: { fontSize: 13, fontFamily: 'Pretendard_500Medium', flex: 1, marginRight: 12 },
    fallbackBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
    detailHero: { minHeight: 160, position: 'relative', padding: 20, justifyContent: 'flex-end' },
    backBtn: { position: 'absolute', top: 52, left: 20, width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
    heroContent: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', opacity: 0.1 },
    heroTextContainer: { zIndex: 1, alignItems: 'flex-end' },
    heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap', justifyContent: 'flex-end' },
    downloadRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    detailTitle: { fontSize: 28, fontFamily: 'Pretendard_700Bold', marginBottom: 4, textAlign: 'right' },
    detailDesc: { fontSize: 14, fontFamily: 'Pretendard_500Medium' },
    detailDescription: { fontSize: 13, fontFamily: 'Pretendard_400Regular', marginTop: 6, textAlign: 'right', lineHeight: 18 },
    wordItem: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
    wordTerm: { fontSize: 17, fontFamily: 'Pretendard_700Bold', marginBottom: 4 },
    wordMeaning: { fontSize: 14, fontFamily: 'Pretendard_500Medium' },
    wordDesc: { fontSize: 13, fontFamily: 'Pretendard_400Regular' },
    checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    checkboxHit: { paddingLeft: 4 },
    selectionBar: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 6 },
    selectionText: { fontSize: 13, fontFamily: 'Pretendard_500Medium' },
    masterBar: { paddingHorizontal: 24, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
    masterBtnRow: { flexDirection: 'row', gap: 10 },
    masterBtnSecondary: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
    masterBtnSecondaryText: { fontSize: 15, fontFamily: 'Pretendard_600SemiBold' },
    masterBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12 },
    masterBtnText: { fontSize: 15, fontFamily: 'Pretendard_700Bold' },
    fab: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },
});
