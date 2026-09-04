import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { useSettings } from '@/features/settings';
import { useEnrichQueue } from '@/hooks/useEnrichQueue';
import { Button } from '@/components/ui/Button';
import { parseImportedTextWithStats, ParsedWord } from '@/utils/importParser';
import { getWordLabel, getMeaningLabel, getExampleLabel, getExampleTranslationLabel, type LanguageCode } from '@/constants/languages';
import * as Haptics from 'expo-haptics';

type ImportStage = 'input' | 'review';

interface BatchImportWorkflowProps {
    listId: string;
    sourceLang: string;
    targetLang: string;
    existingTerms: string[];
    onClose: () => void;
    onSaveWords: (words: ParsedWord[]) => Promise<void>;
}

const PAGE_SIZE = 30;
const CONCURRENCY = 4;

export default function BatchImportWorkflow({
    listId,
    sourceLang,
    targetLang,
    existingTerms,
    onClose,
    onSaveWords,
}: BatchImportWorkflowProps) {
    const { colors } = useTheme();
    const { t } = useTranslation();
    const { apiKey } = useSettings();
    const insets = useSafeAreaInsets();
    const abortControllerRef = useRef<AbortController | null>(null);
    const existingSet = useRef(new Set(existingTerms.map(s => s.trim().toLowerCase()))).current;

    const [stage, setStage] = useState<ImportStage>('input');
    const [rawText, setRawText] = useState('');
    const [pendingTerms, setPendingTerms] = useState<string[]>([]);  // 30개 초과 후보
    const [words, setWords] = useState<ParsedWord[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const { enrichBatch, enrichingCount } = useEnrichQueue(sourceLang, targetLang, apiKey || undefined, CONCURRENCY);

    useEffect(() => {
        return () => { abortControllerRef.current?.abort(); };
    }, []);

    const handleEnrichUpdate = (id: string, result: any) => {
        setWords(prev => prev.map(w => {
            if (w.id !== id) return w;
            // 사전 미등재(isReal=false) 판정 — 사진 스캔과 달리 사용자가 직접
            // 입력한 단어라 자동 삭제하지 않고 '찾지 못함' 표시로 남긴다(오타
            // 수정 기회). 빈 필드로 done 처리하면 아무 안내 없이 넘어간다.
            if (result?.isReal === false) {
                // headwordDefect 가 있으면 AI 를 부르지도 않고 게이트가 막은 것 —
                // 안내 문구가 갈린다(사전 미등재 vs 표제어 자체가 깨짐).
                return { ...w, enrichStatus: 'failed', headwordDefect: result.headwordDefect };
            }
            if (result) {
                return {
                    ...w,
                    definition: result.definition || '',
                    phonetic: result.phonetic || '',
                    pos: result.pos || '',
                    meaningKr: result.meaningKr || '',
                    exampleEn: result.exampleEn || '',
                    exampleKr: result.exampleKr || '',
                    enrichStatus: 'done',
                };
            }
            return { ...w, enrichStatus: 'failed' };
        }));
    };

    // STAGE 1 → STAGE 2: 텍스트 파싱 + 보강 시작
    const handleNextStage = () => {
        const { words: parsed, droppedWords } = parseImportedTextWithStats(rawText, sourceLang);
        const filtered = parsed.filter(p => !existingSet.has(p.term.toLowerCase()));

        if (filtered.length === 0) {
            Alert.alert(t('common.notice'), t('batchImport.noData'));
            return;
        }

        // 🔴 한 줄에 여러 단어를 쉼표로 나열하면 첫 컬럼만 남고 나머지는 사라진다. 그대로
        //    넘어가면 미리보기 개수 말고는 잃었다는 신호가 없어, 사용자는 원인을 AI 한도로
        //    읽는다(2026-09-02 실측: 24개 중 4개). 다음 단계는 곧장 보강을 시작해 한도를
        //    깎으므로 **여기서, 차감 전에** 묻는다.
        if (droppedWords > 0) {
            Alert.alert(
                t('batchImport.droppedTitle'),
                t('batchImport.droppedMessage', { dropped: droppedWords, kept: filtered.length }),
                [
                    { text: t('batchImport.droppedFix'), style: 'cancel' },
                    { text: t('batchImport.droppedProceed'), onPress: () => startReview(filtered) },
                ],
            );
            return;
        }

        startReview(filtered);
    };

    const startReview = (filtered: ParsedWord[]) => {
        const firstPage = filtered.slice(0, PAGE_SIZE);
        const rest = filtered.slice(PAGE_SIZE).map(p => p.term);

        setWords(firstPage);
        setPendingTerms(rest);
        setStage('review');

        const controller = new AbortController();
        abortControllerRef.current = controller;
        enrichBatch(
            firstPage.map(w => ({ id: w.id, term: w.term })),
            handleEnrichUpdate,
            controller.signal,
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    const handleLoadMore = () => {
        if (pendingTerms.length === 0) return;
        const next = pendingTerms.slice(0, PAGE_SIZE);
        const rest = pendingTerms.slice(PAGE_SIZE);
        const baseTs = Date.now();
        const cards: ParsedWord[] = next.map((term, i) => ({
            id: `import-more-${baseTs}-${i}`,
            term,
            enrichStatus: 'pending',
            definition: '',
            phonetic: '',
            pos: '',
            meaningKr: '',
            exampleEn: '',
            exampleKr: '',
        }));
        setWords(prev => [...prev, ...cards]);
        setPendingTerms(rest);

        const controller = abortControllerRef.current ?? new AbortController();
        abortControllerRef.current = controller;
        enrichBatch(cards.map(c => ({ id: c.id, term: c.term })), handleEnrichUpdate, controller.signal);
    };

    const handleFileUpload = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['text/csv', 'text/plain', 'application/vnd.ms-excel', '*/*'],
                copyToCacheDirectory: true,
            });
            if (result.canceled) return;
            if (result.assets && result.assets.length > 0) {
                const fileUri = result.assets[0].uri;
                const response = await fetch(fileUri);
                const text = await response.text();
                setRawText(text);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
        } catch (e) {
            console.warn('Error reading file:', e);
            Alert.alert(t('batchImport.fileReadError'), t('batchImport.fileReadErrorMessage'));
        }
    };

    const updateField = (id: string, field: keyof ParsedWord, value: string) => {
        setWords(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    const removeWord = (id: string) => {
        setWords(prev => prev.filter(item => item.id !== id));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handleSubmit = async () => {
        if (words.length === 0) {
            Alert.alert(t('common.notice'), t('batchImport.noValidWords'));
            return;
        }
        if (enrichingCount > 0) return;
        setIsSaving(true);
        try {
            await onSaveWords(words);
            setWords([]);
            onClose();
        } catch (e) {
            console.error(e);
            Alert.alert(t('common.error'), t('batchImport.saveError'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleBackToInput = () => {
        abortControllerRef.current?.abort();
        setStage('input');
        setWords([]);
        setPendingTerms([]);
    };

    // ── STAGE 1: 입력 ────────────────────────────────────────
    if (stage === 'input') {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, {
                    borderBottomColor: colors.borderLight,
                    paddingTop: Math.max(insets.top, 14),
                }]}>
                    <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} hitSlop={8} style={styles.headerBtn}>
                        <Ionicons name="close" size={22} color={colors.textSecondary} />
                    </Pressable>
                    <Text style={[styles.title, { color: colors.text }]}>{t('batchImport.title')}</Text>
                    <View style={styles.headerBtn} />
                </View>

                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                    <View style={[styles.infoBox, { backgroundColor: colors.surfaceSecondary }]}>
                        <Ionicons name="information-circle" size={20} color={colors.primary} style={{ marginTop: 2 }} />
                        <View style={{ flex: 1, gap: 6 }}>
                            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                                {t('batchImport.instructions')}
                            </Text>
                            <Text style={[styles.guideText, { color: colors.textTertiary }]}>
                                {t('batchImport.formatGuide')}
                            </Text>
                        </View>
                    </View>

                    <TextInput
                        style={[styles.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                        placeholder={t('batchImport.textareaPlaceholder')}
                        placeholderTextColor={colors.textTertiary}
                        multiline
                        textAlignVertical="top"
                        value={rawText}
                        onChangeText={setRawText}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />

                    <View style={styles.btnRow}>
                        <Pressable
                            onPress={handleFileUpload}
                            style={[styles.uploadBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                        >
                            <Ionicons name="document-text-outline" size={20} color={colors.text} />
                            <Text style={[styles.uploadBtnText, { color: colors.text }]}>{t('batchImport.fileUpload')}</Text>
                        </Pressable>
                        <Pressable
                            onPress={handleNextStage}
                            disabled={!rawText.trim()}
                            style={[
                                styles.nextBtn,
                                { backgroundColor: rawText.trim() ? colors.primaryButton : colors.surfaceSecondary }
                            ]}
                        >
                            <Text style={[styles.nextBtnText, { color: rawText.trim() ? colors.onPrimary : colors.textTertiary }]}>
                                {t('common.next')}
                            </Text>
                            <Ionicons name="arrow-forward" size={18} color={rawText.trim() ? colors.onPrimary : colors.textTertiary} />
                        </Pressable>
                    </View>
                </ScrollView>
            </View>
        );
    }

    // ── STAGE 2: 검토 ────────────────────────────────────────
    const saveDisabled = isSaving || enrichingCount > 0 || words.length === 0;
    const saveLabel = enrichingCount > 0 ? t('photoImport.lookingUp') : t('batchImport.batchSave', { count: words.length });

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, {
                borderBottomColor: colors.borderLight,
                paddingTop: Math.max(insets.top, 14),
            }]}>
                <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={handleBackToInput} hitSlop={8} style={styles.headerBtn}>
                    <Ionicons name="arrow-back" size={22} color={colors.textSecondary} />
                </Pressable>
                <Text style={[styles.title, { color: colors.text }]}>{t('batchImport.previewTitle')}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} hitSlop={8} style={styles.headerBtnRight}>
                    <Ionicons name="close" size={22} color={colors.textSecondary} />
                </Pressable>
            </View>

            <View style={styles.subheader}>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                    {t('batchImport.reviewDesc', { count: words.length })}
                </Text>
            </View>

            <ScrollView style={styles.listContainer} keyboardShouldPersistTaps="handled">
                {words.map((item) => (
                    <View key={item.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
                        <View style={styles.cardHeader}>
                            <TextInput
                                style={[styles.inputBold, { color: colors.text, borderBottomColor: colors.border }]}
                                value={item.term}
                                onChangeText={(val) => updateField(item.id, 'term', val)}
                                placeholder={getWordLabel(sourceLang as LanguageCode, t)}
                                placeholderTextColor={colors.textTertiary}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            {item.enrichStatus === 'pending' && (
                                <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
                            )}
                            <Pressable accessibilityRole="button" accessibilityLabel={`${item.term} ${t('common.removeFromList')}`} onPress={() => removeWord(item.id)} hitSlop={8}>
                                <Ionicons name="close-circle" size={20} color={colors.error} />
                            </Pressable>
                        </View>

                        <TextInput
                            style={[styles.inputSmall, { color: colors.textSecondary, borderBottomColor: colors.border }]}
                            value={item.phonetic}
                            onChangeText={(val) => updateField(item.id, 'phonetic', val)}
                            placeholder={t('photoImport.phoneticLabel')}
                            placeholderTextColor={colors.textTertiary}
                        />

                        <TextInput
                            style={[styles.input, { color: colors.text, borderBottomColor: colors.border }]}
                            value={item.meaningKr}
                            onChangeText={(val) => updateField(item.id, 'meaningKr', val)}
                            placeholder={getMeaningLabel(targetLang as LanguageCode, t)}
                            placeholderTextColor={colors.textTertiary}
                        />

                        <TextInput
                            style={[styles.input, styles.exampleInput, { color: colors.textSecondary, borderBottomColor: colors.border }]}
                            value={item.exampleEn}
                            onChangeText={(val) => updateField(item.id, 'exampleEn', val)}
                            placeholder={getExampleLabel(sourceLang as LanguageCode, t)}
                            placeholderTextColor={colors.textTertiary}
                            multiline
                        />

                        <TextInput
                            style={[styles.input, styles.exampleKrInput, { color: colors.textTertiary }]}
                            value={item.exampleKr}
                            onChangeText={(val) => updateField(item.id, 'exampleKr', val)}
                            placeholder={getExampleTranslationLabel(targetLang as LanguageCode, t)}
                            placeholderTextColor={colors.textTertiary}
                            multiline
                        />

                        {item.enrichStatus === 'failed' && (
                            <Text style={[styles.failedText, { color: colors.textTertiary }]}>
                                {item.headwordDefect === 'script_mix'
                                    ? t('batchImport.headwordScriptMix')
                                    : item.headwordDefect
                                        ? t('batchImport.headwordMalformed')
                                        : t('photoImport.lookupFailed')}
                            </Text>
                        )}
                    </View>
                ))}

                {pendingTerms.length > 0 && (
                    <Pressable
                        onPress={handleLoadMore}
                        style={[styles.loadMoreBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                    >
                        <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                        <Text style={[styles.loadMoreText, { color: colors.primary }]}>
                            {t('photoImport.loadMore', { count: pendingTerms.length })}
                        </Text>
                    </Pressable>
                )}

                <View style={{ height: 16 }} />
            </ScrollView>

            <View style={[styles.footer, {
                backgroundColor: colors.background,
                borderTopColor: colors.borderLight,
                paddingBottom: Math.max(insets.bottom, 16),
            }]}>
                <Button
                    title={t('common.back')}
                    variant="secondary"
                    onPress={handleBackToInput}
                    style={{ flex: 1 }}
                    disabled={isSaving}
                />
                <Button
                    title={saveLabel}
                    variant="primary"
                    onPress={handleSubmit}
                    style={{ flex: 2 }}
                    loading={isSaving || enrichingCount > 0}
                    disabled={saveDisabled}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerBtn: { padding: 4, minWidth: 32 },
    headerBtnRight: { minWidth: 32, alignItems: 'flex-end' },
    title: { fontSize: 17, fontFamily: 'Pretendard_600SemiBold' },
    subheader: { padding: 16, paddingBottom: 8 },
    subtitle: { fontSize: 14, fontFamily: 'Pretendard_400Regular' },
    content: { padding: 16, gap: 16 },
    infoBox: { flexDirection: 'row', padding: 12, borderRadius: 12, alignItems: 'flex-start', gap: 8 },
    infoText: { fontSize: 14, fontFamily: 'Pretendard_500Medium', lineHeight: 20 },
    guideText: { fontSize: 13, fontFamily: 'Pretendard_400Regular', lineHeight: 20 },
    textArea: { height: 300, borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 15, fontFamily: 'Pretendard_400Regular' },
    btnRow: { flexDirection: 'row', gap: 12 },
    uploadBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderWidth: 1, borderRadius: 12, gap: 8 },
    uploadBtnText: { fontSize: 15, fontFamily: 'Pretendard_600SemiBold', textAlign: 'center' },
    nextBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, gap: 6 },
    nextBtnText: { fontSize: 15, fontFamily: 'Pretendard_600SemiBold' },
    listContainer: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
    card: {
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    inputBold: {
        flex: 1,
        fontSize: 18,
        fontFamily: 'Pretendard_700Bold',
        borderBottomWidth: 1,
        paddingBottom: 8,
        marginRight: 10,
    },
    input: {
        fontSize: 15,
        fontFamily: 'Pretendard_400Regular',
        borderBottomWidth: 1,
        paddingVertical: 8,
        marginBottom: 8,
    },
    inputSmall: {
        fontSize: 13,
        fontFamily: 'Pretendard_400Regular',
        borderBottomWidth: 1,
        paddingVertical: 6,
        marginBottom: 8,
    },
    exampleInput: { fontFamily: 'Pretendard_400Regular', fontStyle: 'italic', borderBottomWidth: 1, marginBottom: 4 },
    exampleKrInput: {
        fontSize: 13,
        fontFamily: 'Pretendard_400Regular',
        fontStyle: 'italic',
        borderBottomWidth: 0,
        paddingVertical: 4,
        marginBottom: 0,
    },
    failedText: { fontSize: 12, fontFamily: 'Pretendard_400Regular', marginTop: 4 },
    loadMoreBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: 4,
        marginBottom: 12,
        paddingVertical: 12,
        borderRadius: 10,
        borderWidth: 1,
    },
    loadMoreText: { fontSize: 14, fontFamily: 'Pretendard_600SemiBold' },
    footer: {
        flexDirection: 'row',
        padding: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        gap: 12,
    },
});
