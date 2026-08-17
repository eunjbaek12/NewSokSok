import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, ScrollView, TextInput, Pressable, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { useSettings } from '@/features/settings';
import { Button } from '@/components/ui/Button';

import { fetchWordsFromImage, ScanError } from '@/lib/gemini-api';
import { filterExtractedWords } from '@/lib/stopwords';
import { useEnrichQueue } from '@/hooks/useEnrichQueue';
import { useQuotaStore, getQuotaLeft, useRewardedAd, type QuotaBlockInfo } from '@/features/quota';
import { getWordLabel, getMeaningLabel, getExampleLabel, getExampleTranslationLabel, type LanguageCode } from '@/constants/languages';

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

// Gemini 페이로드 축소를 위한 JPEG 압축률 (ImagePicker quality: 0~1)
const PICKER_QUALITY = 0.7;

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
    const [excludedCount, setExcludedCount] = useState(0);  // isReal=false로 자동 제거된 카드 수
    const [isSaving, setIsSaving] = useState(false);

    const { enrichBatch, enrichingCount } = useEnrichQueue(sourceLang, targetLang, apiKey || undefined, CONCURRENCY, 'photo');

    // 한 번에 보강할 개수는 "남은 AI 한도"로 자른다. 한도를 넘겨 요청하면 초과분이 조용히
    // 실패하고 광고 모달만 맥락 없이 뜬다. 대신 한도까지만 채우고 나머지는 "더 보기"로
    // 남겨, 사용자가 요청할 때 광고를 거쳐 이어가게 한다.
    // BYOK 사용자는 앱 차원의 한도가 없으므로 종전 페이지 크기를 그대로 쓴다.
    const quotaStatus = useQuotaStore(s => s.status);
    // Pro는 일일이 아니라 월 잔량이 실제 한도다 — getQuotaLeft가 둘 중 작은 쪽을 준다.
    // status가 없으면(아직 안 옴) 종전대로 페이지 크기를 그대로 쓴다.
    const quotaLeftOf = (s: typeof quotaStatus): number => getQuotaLeft(s) ?? PAGE_SIZE;
    // 렌더용(구독) — 버튼 문구를 광고 안내로 바꿀지 판단한다.
    const quotaLeftForUi = apiKey ? PAGE_SIZE : quotaLeftOf(quotaStatus);
    // 로직용 — 보강이 도는 동안 계속 줄어들므로 호출 시점의 최신값을 읽는다.
    const currentQuotaLeft = (): number =>
        apiKey ? PAGE_SIZE : quotaLeftOf(useQuotaStore.getState().status);
    // 광고 보상 후 다시 부를 때 오래된 클로저(그 시점의 pendingTerms)를 잡지 않도록
    // 항상 최신 handleLoadMore를 가리킨다. 할당은 정의 직후에 한다.
    const loadMoreRef = useRef<() => void>(() => {});
    // 광고는 이 화면이 직접 튼다(전역 모달을 못 쓰는 자리 — 아래 handleLoadMore 참고).
    // 보상이 들어오면 곧바로 이어서 채운다.
    const rewarded = useRewardedAd({ onGranted: () => loadMoreRef.current() });

    const handleEnrichUpdate = (id: string, result: any) => {
        // 추출 모델이 다른 언어 단어를 잘못 뽑은 경우 — 사전 조회가 "실재하지 않는
        // 단어"(isReal=false)로 판정하면 카드를 지운다. 빈 카드를 남기면 사용자가
        // 일일이 지워야 하고, 조용히 지우면 오판(실재 단어를 없다고 판정)을 눈치챌
        // 수 없으니 제외 개수를 세어 안내한다.
        if (result?.isReal === false) {
            setScannedWords(prev => prev.filter(w => w.id !== id));
            setExcludedCount(c => c + 1);
            return;
        }
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

    // 추출된 카드가 전부 사전 미등재로 제거된 경우 — 화면이 말없이 미리보기로
    // 되돌아가므로, 배치가 끝난 시점(enrichingCount 0)에 이유를 알려준다.
    useEffect(() => {
        if (excludedCount > 0 && scannedWords.length === 0 && enrichingCount === 0 && !isScanning) {
            setExcludedCount(0);
            Alert.alert(t('common.notice'), t('photoImport.allExcluded'));
        }
    }, [excludedCount, scannedWords.length, enrichingCount, isScanning, t]);

    useEffect(() => {
        launchSource(source);
        // 이 화면은 RN Modal 안에서 돈다 — 한도 초과 시 앱 루트의 보상형 광고 모달을 띄우면
        // iOS가 형제 Modal을 present하지 못해 앱이 강제 종료 전까지 먹통이 된다
        // (features/quota/store.ts의 inlineQuotaHandler 주석). 그래서 안내를 이 화면이
        // 맡겠다고 등록한다. 보강 중 초과는 조용히 삼키고, 다음 행동은 아래 "더 불러오기"
        // 버튼이 광고 문구로 바뀌며 안내한다.
        const handler = (_info: QuotaBlockInfo) => { /* 전역 모달 억제 */ };
        useQuotaStore.getState().setInlineQuotaHandler(handler);
        return () => {
            abortControllerRef.current?.abort();
            const quota = useQuotaStore.getState();
            if (quota.inlineQuotaHandler === handler) quota.setInlineQuotaHandler(null);
        };
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

        const result = await ImagePicker.launchCameraAsync({ quality: PICKER_QUALITY, base64: true });
        if (result.canceled) {
            if (!selectedImage) onClose();
            return;
        }
        const asset = result.assets?.[0];
        if (asset?.uri && asset.base64) {
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

        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: PICKER_QUALITY, base64: true });
        if (result.canceled) {
            if (!selectedImage) onClose();
            return;
        }
        const asset = result.assets?.[0];
        if (asset?.uri && asset.base64) {
            setSelectedImage({ uri: asset.uri, base64: asset.base64 });
        }
    };

    const handleRetake = () => {
        abortControllerRef.current?.abort();
        setSelectedImage(null);
        setScannedWords([]);
        setPendingTerms([]);
        setExcludedCount(0);
        launchSource(source);
    };

    // 사진 분석 (Gemini 추출 → 필터 → 첫 페이지 카드화 → 보강 시작)
    const processImage = async (base64Image: string) => {
        const controller = new AbortController();
        abortControllerRef.current = controller;
        setIsScanning(true);
        setExcludedCount(0);
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

            const pageSize = Math.min(PAGE_SIZE, currentQuotaLeft());
            const firstPage = filtered.slice(0, pageSize);
            const rest = filtered.slice(pageSize);

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
            // ScanError는 코드만 들고 온다 — 문구는 여기서 만든다(lib은 UI 언어를 모른다).
            const message = error instanceof ScanError
                ? t(`scanError.${error.code}`, { detail: error.detail ?? '' })
                : (error?.message || t('photoImport.saveError'));
            // 한도 관련은 장애가 아니라 정상 상태라 "오류"가 아닌 한도 제목을 쓴다.
            const title = error instanceof ScanError
                && (error.code === 'byokQuotaExceeded' || error.code === 'byokPerMinuteQuota')
                ? t('scanError.quotaTitle')
                : t('common.error');
            Alert.alert(title, message);
            setIsScanning(false);
        }
    };

    const handleLoadMore = () => {
        if (pendingTerms.length === 0) return;
        if (rewarded.loading) return;
        const left = currentQuotaLeft();
        if (left <= 0) {
            // 한도 소진 — 조용히 실패시키지 않고 광고를 바로 튼다. 광고 자체는 모달 위에서도
            // 정상 재생된다(AdMob은 최상위 present VC를 찾는다). 보상이 들어오면 훅의
            // onGranted가 이 함수를 다시 불러 이어서 채운다.
            const status = useQuotaStore.getState().status;
            if (status?.tier === 'pro') {
                // Pro에게는 광고를 보이지 않는다(Pro 약속 무결성) — 초기화 시점만 알린다.
                Alert.alert(
                    t('ads.proLimitTitle'),
                    t('ads.proLimitBody', { used: status.month_used ?? 0, limit: status.month_limit ?? 0 }),
                );
                return;
            }
            if (!rewarded.canWatch) {
                Alert.alert(t('ads.rewardedTitle'), t('ads.rewardedExhausted'));
                return;
            }
            rewarded.watch();
            return;
        }
        const size = Math.min(PAGE_SIZE, left);
        const next = pendingTerms.slice(0, size);
        const rest = pendingTerms.slice(size);
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

    loadMoreRef.current = handleLoadMore;

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
                        {/* 카드로 띄운 것만이 아니라 "이 사진에서 찾은 후보 전체"를 센다 —
                            한도나 페이지 크기 때문에 아직 안 채운 몫(pendingTerms)이 있어도
                            찾은 개수는 그대로여야 한다. */}
                        {t('photoImport.reviewDesc', { count: scannedWords.length + pendingTerms.length })}
                    </Text>
                    {excludedCount > 0 && (
                        <Text style={[styles.subtitle, { color: colors.textTertiary }]}>
                            {t('photoImport.excludedNotReal', { count: excludedCount })}
                        </Text>
                    )}
                </View>

                <ScrollView style={styles.listContainer} keyboardShouldPersistTaps="handled">
                    {scannedWords.map((item) => (
                        <View key={item.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
                            <View style={styles.cardHeader}>
                                <TextInput
                                    style={[styles.inputBold, { color: colors.text, borderBottomColor: colors.border }]}
                                    value={item.term}
                                    onChangeText={(val) => updateWord(item.id, 'term', val)}
                                    placeholder={getWordLabel(sourceLang as LanguageCode, t)}
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
                                placeholder={getMeaningLabel(targetLang as LanguageCode, t)}
                                placeholderTextColor={colors.textTertiary}
                            />

                            <TextInput
                                style={[styles.input, styles.exampleInput, { color: colors.textSecondary, borderBottomColor: colors.border }]}
                                value={item.exampleEn}
                                onChangeText={(val) => updateWord(item.id, 'exampleEn', val)}
                                placeholder={getExampleLabel(sourceLang as LanguageCode, t)}
                                placeholderTextColor={colors.textTertiary}
                                multiline
                            />

                            <TextInput
                                style={[styles.input, styles.exampleKrInput, { color: colors.textTertiary }]}
                                value={item.exampleKr}
                                onChangeText={(val) => updateWord(item.id, 'exampleKr', val)}
                                placeholder={getExampleTranslationLabel(targetLang as LanguageCode, t)}
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
                            style={[styles.loadMoreBtn, { borderColor: colors.border, backgroundColor: colors.surface, opacity: rewarded.loading ? 0.6 : 1 }]}
                        >
                            {rewarded.loading ? (
                                <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                                <>
                                    <Ionicons
                                        name={quotaLeftForUi > 0 ? 'add-circle-outline' : 'play-circle-outline'}
                                        size={18}
                                        color={colors.primary}
                                    />
                                    <Text style={[styles.loadMoreText, { color: colors.primary }]}>
                                        {quotaLeftForUi > 0
                                            ? t('photoImport.loadMore', { count: pendingTerms.length })
                                            : t('photoImport.loadMoreWithAd', { count: pendingTerms.length })}
                                    </Text>
                                </>
                            )}
                        </Pressable>
                    )}
                    {!!rewarded.error && (
                        <Text style={[styles.failedText, { color: colors.error, textAlign: 'center' }]}>
                            {rewarded.error}
                        </Text>
                    )}

                    <View style={{ height: 16 }} />
                </ScrollView>

                <View style={[styles.footer, {
                    backgroundColor: colors.background,
                    borderTopColor: colors.borderLight,
                    paddingBottom: insets.bottom + 20,
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
                    paddingBottom: insets.bottom + 20,
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
    loadingText: { marginTop: 8, fontSize: 16, fontFamily: 'Pretendard_600SemiBold', textAlign: 'center' },
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
