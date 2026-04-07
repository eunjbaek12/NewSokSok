import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, ScrollView, TextInput, Pressable, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { Button } from '@/components/ui/Button';

import { fetchWordsFromImage } from '@/lib/gemini-api';

type ScannedWord = {
    id: string;
    word: string;
    meaning: string;
    definition?: string;
    exampleSentence: string;
};

type SelectedImage = {
    uri: string;
    base64: string;
};

interface PhotoImportWorkflowProps {
    listId: string;
    source: 'camera' | 'gallery';
    onClose: () => void;
    onSaveWords: (words: Omit<ScannedWord, 'id'>[]) => Promise<void>;
}

export default function PhotoImportWorkflow({ listId, source, onClose, onSaveWords }: PhotoImportWorkflowProps) {
    const { colors } = useTheme();
    const { t } = useTranslation();
    const { profileSettings } = useSettings();
    const insets = useSafeAreaInsets();
    const abortControllerRef = useRef<AbortController | null>(null);
    const retakeLabel = source === 'camera' ? t('photoImport.retake') : t('photoImport.reselect');

    const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [scannedWords, setScannedWords] = useState<ScannedWord[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        launchSource(source);
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

        const result = await ImagePicker.launchCameraAsync({
            base64: true,
            quality: 0.8,
        });

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

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            base64: true,
            quality: 0.8,
        });

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
        setSelectedImage(null);
        launchSource(source);
    };

    const processImage = async (base64Image: string) => {
        const controller = new AbortController();
        abortControllerRef.current = controller;
        setIsScanning(true);
        try {
            const words = await fetchWordsFromImage(base64Image, 3, controller.signal, profileSettings.geminiApiKey || undefined);

            if (!Array.isArray(words) || words.length === 0) {
                Alert.alert(t('common.notice'), t('photoImport.noWordsFound'));
                return;
            }

            const wordsWithIds = words.map((w: any, index: number) => ({
                id: Date.now().toString() + index,
                word: w.word || '',
                meaning: w.meaning || '',
                exampleSentence: w.exampleSentence || ''
            }));

            setScannedWords(wordsWithIds);
        } catch (error: any) {
            if (error.name === 'AbortError') return; // 취소 — 조용히 미리보기로 복귀
            console.error(error);
            Alert.alert(t('common.error'), error.message || t('photoImport.saveError'));
        } finally {
            setIsScanning(false);
            abortControllerRef.current = null;
        }
    };

    const handleCancelAnalysis = () => {
        abortControllerRef.current?.abort();
        // isScanning은 finally 블록에서 false로 변경됨
        // selectedImage는 유지 → 미리보기 화면으로 자동 복귀
    };

    const updateWord = (id: string, field: keyof ScannedWord, value: string) => {
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

        setIsSaving(true);
        try {
            await onSaveWords(scannedWords.map(w => ({
                word: w.word,
                meaning: w.meaning,
                exampleSentence: w.exampleSentence
            })));

            setScannedWords([]);
            onClose();
            Alert.alert(t('common.success'), t('photoImport.wordsAdded', { count: scannedWords.length }));
        } catch (error) {
            console.error(error);
            Alert.alert(t('common.error'), t('photoImport.saveError'));
        } finally {
            setIsSaving(false);
        }
    };

    // ── 로딩 화면 ──────────────────────────────────────────
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
                        <View key={item.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <View style={styles.cardHeader}>
                                <TextInput
                                    style={[styles.inputBold, { color: colors.text, borderBottomColor: colors.border }]}
                                    value={item.word}
                                    onChangeText={(val) => updateWord(item.id, 'word', val)}
                                    placeholder={t('photoImport.wordLabel')}
                                    placeholderTextColor={colors.textTertiary}
                                />
                                <Pressable onPress={() => removeWord(item.id)} hitSlop={8}>
                                    <Ionicons name="close-circle" size={20} color={colors.error} />
                                </Pressable>
                            </View>

                            <TextInput
                                style={[styles.input, { color: colors.text, borderBottomColor: colors.border }]}
                                value={item.meaning}
                                onChangeText={(val) => updateWord(item.id, 'meaning', val)}
                                placeholder={t('photoImport.meaningLabel')}
                                placeholderTextColor={colors.textTertiary}
                            />

                            <TextInput
                                style={[styles.input, styles.exampleInput, { color: colors.textSecondary }]}
                                value={item.exampleSentence}
                                onChangeText={(val) => updateWord(item.id, 'exampleSentence', val)}
                                placeholder={t('photoImport.exampleLabel')}
                                placeholderTextColor={colors.textTertiary}
                                multiline
                            />
                        </View>
                    ))}
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
                        title={t('photoImport.finalSave')}
                        variant="primary"
                        onPress={handleFinalSave}
                        style={{ flex: 2 }}
                        loading={isSaving}
                        disabled={isSaving}
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

    // ── 초기 빈 화면 (카메라/갤러리 실행 중) ───────────────
    return <View style={[styles.container, { backgroundColor: colors.background }]} />;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        minWidth: 60,
    },
    headerBtnRight: {
        minWidth: 60,
        alignItems: 'flex-end',
    },
    headerBtnText: {
        fontSize: 14,
        fontFamily: 'Pretendard_400Regular',
    },
    title: {
        fontSize: 17,
        fontFamily: 'Pretendard_600SemiBold',
    },
    subheader: {
        padding: 16,
        paddingBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        fontFamily: 'Pretendard_400Regular',
    },
    previewContainer: {
        flex: 1,
        padding: 16,
    },
    previewImage: {
        flex: 1,
        borderRadius: 12,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        gap: 12,
    },
    loadingText: {
        marginTop: 8,
        fontSize: 16,
        fontFamily: 'Pretendard_600SemiBold',
    },
    loadingSubText: {
        fontSize: 13,
        fontFamily: 'Pretendard_400Regular',
        textAlign: 'center',
    },
    cancelBtn: {
        marginTop: 20,
        paddingHorizontal: 28,
        paddingVertical: 12,
        borderRadius: 20,
        borderWidth: 1,
    },
    cancelBtnText: {
        fontSize: 15,
        fontFamily: 'Pretendard_500Medium',
    },
    listContainer: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    card: {
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
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
    exampleInput: {
        fontFamily: 'Pretendard_400Regular',
        fontStyle: 'italic',
        borderBottomWidth: 0,
        marginBottom: 0,
    },
    footer: {
        flexDirection: 'row',
        padding: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        gap: 12,
    },
});
