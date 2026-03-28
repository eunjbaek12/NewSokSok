import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, ScrollView, TextInput, Pressable, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/Button';

import { fetchWordsFromImage } from '@/lib/gemini-api';

type ScannedWord = {
    id: string;
    word: string;
    meaning: string;
    definition?: string;
    exampleSentence: string;
};

interface PhotoImportWorkflowProps {
    listId: string;
    onClose: () => void;
    onSaveWords: (words: Omit<ScannedWord, 'id'>[]) => Promise<void>;
}

export default function PhotoImportWorkflow({ listId, onClose, onSaveWords }: PhotoImportWorkflowProps) {
    const { colors } = useTheme();
    const { t } = useTranslation();
    const [isScanning, setIsScanning] = useState(false);
    const [scannedWords, setScannedWords] = useState<ScannedWord[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const handleCameraPress = async () => {
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
        if (permissionResult.granted === false) {
            Alert.alert(t('photoImport.cameraPermission'), t('photoImport.cameraPermissionMessage'));
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            base64: true,
            quality: 0.8,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
            const base64 = result.assets[0].base64;
            if (base64) {
                await processImage(base64);
            }
        }
    };

    const handleGalleryPress = async () => {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permissionResult.granted === false) {
            Alert.alert(t('photoImport.galleryPermission'), t('photoImport.galleryPermissionMessage'));
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            base64: true,
            quality: 0.8,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
            const base64 = result.assets[0].base64;
            if (base64) {
                await processImage(base64);
            }
        }
    };

    const processImage = async (base64Image: string) => {
        setIsScanning(true);
        try {
            const words = await fetchWordsFromImage(base64Image);

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
            console.error(error);
            Alert.alert(t('common.error'), error.message || t('photoImport.saveError'));
        } finally {
            setIsScanning(false);
        }
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
            // Remove the temporary id field when passing to parent
            await onSaveWords(scannedWords.map(w => ({
                word: w.word,
                meaning: w.meaning,
                exampleSentence: w.exampleSentence
            })));

            // Success - clear and close
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

    // 검증 및 편집 화면 
    if (scannedWords.length > 0) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
                    <Pressable onPress={() => setScannedWords([])} hitSlop={8}>
                        <Ionicons name="arrow-back" size={24} color={colors.text} />
                    </Pressable>
                    <Text style={[styles.title, { color: colors.text }]}>{t('photoImport.reviewTitle')}</Text>
                    <View style={{ width: 24 }} />
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
                </ScrollView>

                <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.borderLight }]}>
                    <Button
                        title={t('common.cancel')}
                        variant="secondary"
                        onPress={() => setScannedWords([])}
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

    // 초기 업로드 옵션 화면
    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
                <Pressable onPress={onClose} hitSlop={8}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </Pressable>
                <Text style={[styles.title, { color: colors.text }]}>{t('photoImport.title')}</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={styles.placeholderContainer}>
                <View style={[styles.placeholderIconContainer, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name="camera-outline" size={48} color={colors.primary} />
                </View>
                <Text style={[styles.placeholderTitle, { color: colors.text }]}>{t('photoImport.mainTitle')}</Text>
                <Text style={[styles.placeholderDesc, { color: colors.textSecondary }]}>
                    {t('photoImport.mainDesc')}
                </Text>

                <View style={styles.actionButtons}>
                    <Pressable
                        style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        onPress={handleCameraPress}
                        disabled={isScanning}
                    >
                        <Ionicons name="camera" size={24} color={colors.primary} />
                        <Text style={[styles.actionBtnText, { color: colors.text }]}>{t('photoImport.takePhoto')}</Text>
                    </Pressable>

                    <Pressable
                        style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        onPress={handleGalleryPress}
                        disabled={isScanning}
                    >
                        <Ionicons name="images" size={24} color={colors.primary} />
                        <Text style={[styles.actionBtnText, { color: colors.text }]}>{t('photoImport.fromAlbum')}</Text>
                    </Pressable>
                </View>
            </View>

            {/* 로딩 오버레이 */}
            {isScanning && (
                <View style={[styles.loadingOverlay, { backgroundColor: colors.background + 'CC' }]}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.loadingText, { color: colors.primary }]}>{t('photoImport.analyzing')}</Text>
                    <Text style={[styles.loadingSubText, { color: colors.textSecondary }]}>{t('photoImport.analyzingDesc')}</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
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
    placeholderContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
        paddingHorizontal: 20,
        gap: 16
    },
    placeholderIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8
    },
    placeholderTitle: {
        fontSize: 20,
        fontFamily: 'Pretendard_700Bold',
        textAlign: 'center'
    },
    placeholderDesc: {
        fontSize: 15,
        fontFamily: 'Pretendard_400Regular',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 20
    },
    actionButtons: {
        width: '100%',
        gap: 12,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderWidth: 1,
        borderRadius: 12,
        gap: 12,
    },
    actionBtnText: {
        fontSize: 16,
        fontFamily: 'Pretendard_600SemiBold',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
        padding: 20,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        fontFamily: 'Pretendard_600SemiBold',
    },
    loadingSubText: {
        marginTop: 8,
        fontSize: 13,
        fontFamily: 'Pretendard_400Regular',
        textAlign: 'center',
    },
    listContainer: {
        flex: 1,
        paddingHorizontal: 16,
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
        paddingBottom: 32, // for safe area
    },
});
