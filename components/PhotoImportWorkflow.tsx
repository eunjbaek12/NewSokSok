import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, ScrollView, TextInput, Pressable, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
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
    const [isScanning, setIsScanning] = useState(false);
    const [scannedWords, setScannedWords] = useState<ScannedWord[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const handleCameraPress = async () => {
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
        if (permissionResult.granted === false) {
            Alert.alert("권한 필요", "사진을 찍기 위해 카메라 권한이 필요합니다.");
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
            Alert.alert("권한 필요", "사진을 선택하기 위해 갤러리 권한이 필요합니다.");
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
                Alert.alert('알림', '이미지에서 단어를 찾지 못했습니다.');
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
            Alert.alert('오류', error.message || '단어를 인식하는 중 문제가 발생했습니다.');
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
            Alert.alert('알림', '저장할 단어가 없습니다.');
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
            Alert.alert('성공', `${scannedWords.length}개의 단어가 추가되었습니다.`);
        } catch (error) {
            console.error(error);
            Alert.alert('오류', '단어 저장 중 문제가 발생했습니다.');
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
                    <Text style={[styles.title, { color: colors.text }]}>단어 확인 및 수정</Text>
                    <View style={{ width: 24 }} />
                </View>

                <View style={styles.subheader}>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        총 {scannedWords.length}개의 단어를 찾았습니다. 틀린 부분을 수정하거나 제외할 수 있습니다.
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
                                    placeholder="단어"
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
                                placeholder="뜻"
                                placeholderTextColor={colors.textTertiary}
                            />

                            <TextInput
                                style={[styles.input, styles.exampleInput, { color: colors.textSecondary }]}
                                value={item.exampleSentence}
                                onChangeText={(val) => updateWord(item.id, 'exampleSentence', val)}
                                placeholder="예문"
                                placeholderTextColor={colors.textTertiary}
                                multiline
                            />
                        </View>
                    ))}
                </ScrollView>

                <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.borderLight }]}>
                    <Button
                        title="취소"
                        variant="secondary"
                        onPress={() => setScannedWords([])}
                        style={{ flex: 1 }}
                        disabled={isSaving}
                    />
                    <Button
                        title="최종 저장하기"
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
            <View style={styles.placeholderContainer}>
                <View style={[styles.placeholderIconContainer, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name="camera-outline" size={48} color={colors.primary} />
                </View>
                <Text style={[styles.placeholderTitle, { color: colors.text }]}>사진으로 단어 추가</Text>
                <Text style={[styles.placeholderDesc, { color: colors.textSecondary }]}>
                    교재나 단어장 사진을 찍으면 AI가 자동으로 단어와 뜻을 추출하여 단어장에 추가해줍니다.
                </Text>

                <View style={styles.actionButtons}>
                    <Pressable
                        style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        onPress={handleCameraPress}
                        disabled={isScanning}
                    >
                        <Ionicons name="camera" size={24} color={colors.primary} />
                        <Text style={[styles.actionBtnText, { color: colors.text }]}>사진 촬영하기</Text>
                    </Pressable>

                    <Pressable
                        style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        onPress={handleGalleryPress}
                        disabled={isScanning}
                    >
                        <Ionicons name="images" size={24} color={colors.primary} />
                        <Text style={[styles.actionBtnText, { color: colors.text }]}>앨범에서 선택</Text>
                    </Pressable>
                </View>
            </View>

            {/* 로딩 오버레이 */}
            {isScanning && (
                <View style={[styles.loadingOverlay, { backgroundColor: colors.background + 'CC' }]}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.loadingText, { color: colors.primary }]}>AI가 단어를 분석 중입니다...</Text>
                    <Text style={[styles.loadingSubText, { color: colors.textSecondary }]}>사진의 글자가 많을수록 오래 걸릴 수 있어요.</Text>
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
        fontFamily: 'Inter_600SemiBold',
    },
    subheader: {
        padding: 16,
        paddingBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        fontFamily: 'Inter_400Regular',
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
        fontFamily: 'Inter_700Bold',
        textAlign: 'center'
    },
    placeholderDesc: {
        fontSize: 15,
        fontFamily: 'Inter_400Regular',
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
        fontFamily: 'Inter_600SemiBold',
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
        fontFamily: 'Inter_600SemiBold',
    },
    loadingSubText: {
        marginTop: 8,
        fontSize: 13,
        fontFamily: 'Inter_400Regular',
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
        fontFamily: 'Inter_700Bold',
        borderBottomWidth: 1,
        paddingBottom: 8,
        marginRight: 10,
    },
    input: {
        fontSize: 15,
        fontFamily: 'Inter_400Regular',
        borderBottomWidth: 1,
        paddingVertical: 8,
        marginBottom: 8,
    },
    exampleInput: {
        fontFamily: 'Inter_400Regular',
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
