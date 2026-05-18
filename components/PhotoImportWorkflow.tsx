import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, ScrollView, TextInput, Pressable, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { useSettings } from '@/features/settings';
import { Button } from '@/components/ui/Button';

import { fetchWordsFromImage } from '@/lib/gemini-api';
import { filterExtractedWords } from '@/lib/stopwords';
import { useEnrichQueue } from '@/hooks/useEnrichQueue';

export type ScannedWord = {
    id: string;
    term: string;
    definition: string;
    phonetic: string;
    pos: string;
    meaningKr: string;
    exampleEn: string;
    exampleKr: string;
    enrichStatus: 'pending' | 'done' | 'failed';
};

type SelectedImage = {
    uri: string;
    base64: string;
};

interface PhotoImportWorkflowProps {
    listId: string;
    source: 'camera' | 'gallery';
    sourceLang: string;
    targetLang: string;
    existingTerms: string[];
    onClose: () => void;
    onSaveWords: (words: ScannedWord[]) => Promise<void>;
}

const PAGE_SIZE = 30;
const CONCURRENCY = 4;

export default function PhotoImportWorkflow({ listId, source, sourceLang, targetLang, existingTerms, onClose, onSaveWords }: PhotoImportWorkflowProps) {
    const { colors } = useTheme();
    const { t } = useTranslation();
    const { apiKey } = useSettings();
    const insets = useSafeAreaInsets();
    const abortControllerRef = useRef<AbortController | null>(null);
    const retakeLabel = source === 'camera' ? t('photoImport.retake') : t('photoImport.reselect');

    const existingSet = useRef(new Set(existingTerms.map(s => s.trim().toLowerCase()))).current;

    const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [pendingTerms, setPendingTerms] = useState<string[]>([]);  // 아직 카드로 표시되지 않은 후보
    const [scannedWords, setScannedWords] = useState<ScannedWord[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const { enrichBatch, enrichingCount } = useEnrichQueue(sourceLang, targetLang, apiKey || undefined, CONCURRENCY, 'photo');

    const handleEnrichUpdate = (id: string, result: any) => {
        setScannedWords(prev => prev.map(w => {
            if (w.id !== id) return w;
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

    useEffect(() => {
        launchSource(source);
        return () => { abortControllerRef.current?.abort(); };
    }, []);

    const launchSource = async (src: 'camera' | 'gallery') => {
        if (src === 'camera') {
            await handleCameraPress();
        } else {
            await handleGalleryPress();
        }
    };

    const handleCameraPress = async () => {
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
        if (permissionResult.granted === false) {
            Alert.alert(t('photoImport.cameraPermission'), t('photoImport.cameraPermissionMessage'));
            onClose();
            return;
        }

        const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.8 });
        if (result.canceled) {
            if (!selectedImage) onClose();
            return;
        }
        const asset = result.assets?.[0];
        if (asset?.base64 && asset?.uri) {
            setSelectedImage({ uri: asset.uri, base64: asset.base64 });
        }
    };

    const handleGalleryPress = async () => {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permissionResult.granted === false) {
            Alert.alert(t('photoImport.galleryPermission'), t('photoImport.galleryPermissionMessage'));
            onClose();
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.8 });
        if (result.canceled) {
            if (!selectedImage) onClose();
            return;
        }
        const asset = result.assets?.[0];
        if (asset?.base64 && asset?.uri) {
            setSelectedImage({ uri: asset.uri, base64: asset.base64 });
        }
    };

    const handleRetake = () => {
        abortControllerRef.current?.abort();
        setSelectedImage(null);
        setScannedWords([]);
        setPendingTerms([]);
        launchSource(source);
    };

    // 사진 분석 (Gemini 추출 → 필터 → 첫 페이지 카드화 → 보강 시작)
    const processImage = async (base64Image: string) => {
        const controller = new AbortController();
        abortControllerRef.current = controller;
        setIsScanning(true);
        try {
            const raw = await fetchWordsFromImage(base64Image, 3, controller.signal, apiKey || undefined, sourceLang);
            const rawTerms = (Array.isArray(raw) ? raw : []).map((w: any) => (w?.word || '')).filter(Boolean);

            // 결정론적 필터 (stopwords·길이·중복) + 기존 리스트에 있는 단어 제거
            const filtered = filterExtractedWords(rawTerms, sourceLang)
                .filter(t => !existingSet.has(t.toLowerCase()));

            if (filtered.length === 0) {
                setIsScanning(false);
                Alert.alert(t('common.notice'), t('photoImport.noWordsFound'));
                return;
            }

            const firstPage = filtered.slice(0, PAGE_SIZE);
            const rest = filtered.slice(PAGE_SIZE);

            const baseTs = Date.now();
            const cards: ScannedWord[] = firstPage.map((term, i) => ({
                id: `${baseTs}-${i}`,
                term,
                definition: '',
                phonetic: '',
                pos: '',
                meaningKr: '',
                exampleEn: '',
                exampleKr: '',
                enrichStatus: 'pending',
            }));

            setScannedWords(cards);
            setPendingTerms(rest);
            setIsScanning(false);

            // 보강은 백그라운드로 시작 (await 안 함)
            enrichBatch(cards.map(c => ({ id: c.id, term: c.term })), handleEnrichUpdate, controller.signal);
        } catch (error: any) {
            if (error?.name === 'AbortError') return;
            console.error(error);
            Alert.alert(t('common.error'), error?.message || t('photoImport.saveError'));
            setIsScanning(false);
        }
    };

    const handleLoadMore = () => {
        if (pendingTerms.length === 0) return;
        const next = pendingTerms.slice(0, PAGE_SIZE);
        const rest = pendingTerms.slice(PAGE_SIZE);
        const baseTs = Date.now();
        const cards: ScannedWord[] = next.map((term, i) => ({
            id: `${baseTs}-more-${i}`,
            term,
            definition: '',
            phonetic: '',
            pos: '',
            meaningKr: '',
            exampleEn: '',
            exampleKr: '',
            enrichStatus: 'pending',
        }));
        setScannedWords(prev => [...prev, ...cards]);
        setPendingTerms(rest);

        const controller = abortControllerRef.current ?? new AbortController();
        abortControllerRef.current = controller;
        enrichBatch(cards.map(c => ({ id: c.id, term: c.term })), handleEnrichUpdate, controller.signal);
    };

    const handleCancelAnalysis = () => {
        abortControllerRef.current?.abort();
    };

    const updateWord = (id: string, field: 'term' | 'meaningKr' | 'exampleEn' | 'phonetic' | 'exampleKr', value: string) => {
        setScannedWords(prev =>
            prev.map(item => item.id === id ? { ...item, [field]: value } : item)
        );
    };

    const removeWord = (id: string) => {
        setScannedWords(prev => prev.filter(item => item.id !== id));
    };

    const handleFinalSave = async () => {
        if (scannedWords.length === 0) {
            Alert.alert(t('common.notice'), t('photoImport.noWordsToSave'));
            return;
        }
        if (enrichingCount > 0) return; // 버튼 비활성 상태인데 안전망

        setIsSaving(true);
        try {
            await onSaveWords(scannedWords);
            setScannedWords([]);
            onClose();
        } catch (error) {
            console.error(error);
            Alert.alert(t('common.error'), t('photoImport.saveError'));
        } finally {
            setIsSaving(false);
        }
    };

    // ── 로딩 화면 (Gemini 추출 중) ─────────────────────────
    if (isScanning) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.loadingText, { color: colors.primary }]}>{t('photoImport.analyzing')}</Text>
                    <Text style={[styles.loadingSubText, { color: colors.textSecondary }]}>{t('photoImport.analyzingDesc')}</Text>
                    <Pressable
                        onPress={handleCancelAnalysis}
                        style={[styles.cancelBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                    >
                        <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>{t('photoImport.cancelAnalysis')}</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    // ── 결과 검토 화면 ──────────────────────────────────────
    if (scannedWords.length > 0) {
        const saveDisabled = isSaving || enrichingCount > 0;
        const saveLabel = enrichingCount > 0
            ? t('photoImport.lookingUp')
            : t('photoImport.finalSave');

        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, {
                    borderBottomColor: colors.borderLight,
                    paddingTop: Math.max(insets.top, 14),
                }]}>
                    <Pressable onPress={handleRetake} hitSlop={8} style={styles.headerBtn}>
                        <Ionicons name="refresh-outline" size={20} color={colors.textSecondary} />
                        <Text style={[styles.headerBtnText, { color: colors.textSecondary }]}>{retakeLabel}</Text>
                    </Pressable>
                    <Text style={[styles.title, { color: colors.text }]}>{t('photoImport.reviewTitle')}</Text>
                    <Pressable onPress={onClose} hitSlop={8} style={styles.headerBtnRight}>
                        <Ionicons name="close" size={22} color={colors.textSecondary} />
                    </Pressable>
                </View>

                <View style={styles.subheader}>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        {t('photoImport.reviewDesc', { count: scannedWords.length })}
                    </Text>
                </View>

                <ScrollView style={styles.listContainer} keyboardShouldPersistTaps="handled">
                    {scannedWords.map((item) => (
                        <View key={item.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
                            <View style={styles.cardHeader}>
                                <TextInput
                                    style={[styles.inputBold, { color: colors.text, borderBottomColor: colors.border }]}
                                    value={item.term}
                                    onChangeText={(val) => updateWord(item.id, 'term', val)}
                                    placeholder={t('photoImport.wordLabel')}
                                    placeholderTextColor={colors.textTertiary}
                                />
                                {item.enrichStatus === 'pending' && (
                                    <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
                                )}
                                <Pressable onPress={() => removeWord(item.id)} hitSlop={8}>
                                    <Ionicons name="close-circle" size={20} color={colors.error} />
                                </Pressable>
                            </View>

                            <TextInput
                                style={[styles.inputSmall, { color: colors.textSecondary, borderBottomColor: colors.border }]}
                                value={item.phonetic}
                                onChangeText={(val) => updateWord(item.id, 'phonetic', val)}
                                placeholder={t('photoImport.phoneticLabel')}
                                placeholderTextColor={colors.textTertiary}
                            />

                            <TextInput
                                style={[styles.input, { color: colors.text, borderBottomColor: colors.border }]}
                                value={item.meaningKr}
                                onChangeText={(val) => updateWord(item.id, 'meaningKr', val)}
                                placeholder={t('photoImport.meaningLabel')}
                                placeholderTextColor={colors.textTertiary}
                            />

                            <TextInput
                                style={[styles.input, styles.exampleInput, { color: colors.textSecondary, borderBottomColor: colors.border }]}
                                value={item.exampleEn}
                                onChangeText={(val) => updateWord(item.id, 'exampleEn', val)}
                                placeholder={t('photoImport.exampleLabel')}
                                placeholderTextColor={colors.textTertiary}
                                multiline
                            />

                            <TextInput
                                style={[styles.input, styles.exampleKrInput, { color: colors.textTertiary }]}
                                value={item.exampleKr}
                                onChangeText={(val) => updateWord(item.id, 'exampleKr', val)}
                                placeholder={t('photoImport.exampleKrLabel')}
                                placeholderTextColor={colors.textTertiary}
                                multiline
                            />

                            {item.enrichStatus === 'failed' && (
                                <Text style={[styles.failedText, { color: colors.textTertiary }]}>
                                    {t('photoImport.lookupFailed')}
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
                        title={retakeLabel}
                        variant="secondary"
                        onPress={handleRetake}
                        style={{ flex: 1 }}
                        disabled={isSaving}
                    />
                    <Button
                        title={saveLabel}
                        variant="primary"
                        onPress={handleFinalSave}
                        style={{ flex: 2 }}
                        loading={isSaving || enrichingCount > 0}
                        disabled={saveDisabled}
                    />
                </View>
            </View>
        );
    }

    // ── 사진 미리보기 화면 ──────────────────────────────────
    if (selectedImage) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, {
                    borderBottomColor: colors.borderLight,
                    paddingTop: Math.max(insets.top, 14),
                }]}>
                    <View style={styles.headerBtn} />
                    <Text style={[styles.title, { color: colors.text }]}>{t('photoImport.previewTitle')}</Text>
                    <Pressable onPress={onClose} hitSlop={8} style={styles.headerBtnRight}>
                        <Ionicons name="close" size={22} color={colors.textSecondary} />
                    </Pressable>
                </View>

                <View style={styles.previewContainer}>
                    <Image
                        source={{ uri: selectedImage.uri }}
                        style={styles.previewImage}
                        resizeMode="contain"
                    />
                </View>

                <View style={[styles.footer, {
                    backgroundColor: colors.background,
                    borderTopColor: colors.borderLight,
                    paddingBottom: Math.max(insets.bottom, 16),
                }]}>
                    <Button
                        title={retakeLabel}
                        variant="secondary"
                        onPress={handleRetake}
                        style={{ flex: 1 }}
                    />
                    <Button
                        title={t('photoImport.confirmAnalysis')}
                        variant="primary"
                        onPress={() => processImage(selectedImage.base64)}
                        style={{ flex: 2 }}
                    />
                </View>
            </View>
        );
    }

    return <View style={[styles.container, { backgroundColor: colors.background }]} />;
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
    headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 60 },
    headerBtnRight: { minWidth: 60, alignItems: 'flex-end' },
    headerBtnText: { fontSize: 14, fontFamily: 'Pretendard_400Regular' },
    title: { fontSize: 17, fontFamily: 'Pretendard_600SemiBold' },
    subheader: { padding: 16, paddingBottom: 8 },
    subtitle: { fontSize: 14, fontFamily: 'Pretendard_400Regular' },
    previewContainer: { flex: 1, padding: 16 },
    previewImage: { flex: 1, borderRadius: 12 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, gap: 12 },
    loadingText: { marginTop: 8, fontSize: 16, fontFamily: 'Pretendard_600SemiBold' },
    loadingSubText: { fontSize: 13, fontFamily: 'Pretendard_400Regular', textAlign: 'center' },
    cancelBtn: { marginTop: 20, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 20, borderWidth: 1 },
    cancelBtnText: { fontSize: 15, fontFamily: 'Pretendard_500Medium' },
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
