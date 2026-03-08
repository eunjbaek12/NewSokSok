import React, { useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert, ScrollView, TextInput, Image } from 'react-native';
import { Camera } from 'lucide-react-native'; // Assuming lucide-react-native is used for icons

import { fetchWordsFromImage } from '@/lib/gemini-api';

export default function VocaAppUI({ onSaveWords }) {
    const [isScanning, setIsScanning] = useState(false);
    const [scannedWords, setScannedWords] = useState([]);
    const fileInputRef = useRef(null);

    // 1. 이미지 캡처/업로드 (input[type="file"] 연동)
    const handleFileChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // 파일을 Base64로 변환
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64String = reader.result.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
            await handleOCRScan(base64String);
        };
        reader.readAsDataURL(file);

        // 동일한 파일 재선택 가능하게 값 초기화
        event.target.value = null;
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    // 2. 단어 인식 로직 (Gemini API 호출 및 로딩 상태 처리)
    const handleOCRScan = async (base64Image) => {
        setIsScanning(true);
        try {
            // API를 호출하여 이미지 내 단어 정보를 JSON 배열로 받아옴
            const words = await fetchWordsFromImage(base64Image);
            // 고유 ID 추가
            const wordsWithIds = words.map((w, index) => ({
                id: Date.now().toString() + index,
                word: w.word || '',
                meaning: w.meaning || '',
                exampleSentence: w.exampleSentence || ''
            }));
            setScannedWords(wordsWithIds);
        } catch (error) {
            console.error(error);
            Alert.alert('오류', '단어를 인식하는 중 문제가 발생했습니다.');
        } finally {
            setIsScanning(false);
        }
    };

    // 3. 검증 및 편집 (작성/수정/삭제)
    const updateWord = (id, field, value) => {
        setScannedWords(prev =>
            prev.map(item => item.id === id ? { ...item, [field]: value } : item)
        );
    };

    const removeWord = (id) => {
        setScannedWords(prev => prev.filter(item => item.id !== id));
    };

    const handleFinalSave = () => {
        if (scannedWords.length === 0) {
            Alert.alert('알림', '저장할 단어가 없습니다.');
            return;
        }
        // 부모 컴포넌트로 전달 또는 전역 상태/DB에 저장
        if (onSaveWords) {
            onSaveWords(scannedWords);
        }
        // 상태 초기화
        setScannedWords([]);
    };

    // 렌더링: 검증 및 확정 Flow (미리보기 목록)
    if (scannedWords.length > 0) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>스캔된 단어 미리보기</Text>
                    <Text style={styles.subtitle}>틀린 부분을 수정하거나 제외할 수 있습니다.</Text>
                </View>

                <ScrollView style={styles.listContainer}>
                    {scannedWords.map((item) => (
                        <View key={item.id} style={styles.card}>
                            <TextInput
                                style={styles.inputBold}
                                value={item.word}
                                onChangeText={(val) => updateWord(item.id, 'word', val)}
                                placeholder="단어"
                            />
                            <TextInput
                                style={styles.input}
                                value={item.meaning}
                                onChangeText={(val) => updateWord(item.id, 'meaning', val)}
                                placeholder="뜻"
                            />
                            <TextInput
                                style={[styles.input, styles.exampleInput]}
                                value={item.exampleSentence}
                                onChangeText={(val) => updateWord(item.id, 'exampleSentence', val)}
                                placeholder="예문"
                                multiline
                            />
                            <Pressable style={styles.deleteButton} onPress={() => removeWord(item.id)}>
                                <Text style={styles.deleteButtonText}>✕ 삭제</Text>
                            </Pressable>
                        </View>
                    ))}
                </ScrollView>

                <View style={styles.footer}>
                    <Pressable style={[styles.button, styles.cancelBtn]} onPress={() => setScannedWords([])}>
                        <Text style={styles.btnText}>취소</Text>
                    </Pressable>
                    <Pressable style={[styles.button, styles.saveBtn]} onPress={handleFinalSave}>
                        <Text style={[styles.btnText, styles.saveBtnText]}>최종 저장하기</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* 
        모바일 웹뷰 및 웹 환경에서 카메라/앨범을 호출하기 위한 숨겨진 file input.
        capture="environment" 속성으로 후면 카메라를 우선 호출하도록 유도.
      */}
            <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
            />

            <Pressable
                style={styles.uploadCard}
                onPress={triggerFileInput}
                disabled={isScanning}
            >
                <View style={styles.iconWrapper}>
                    <Camera size={48} color="#4F46E5" />
                </View>
                <Text style={styles.uploadTitle}>
                    사진 찍어서 단어 추가하기
                </Text>
                <Text style={styles.uploadDesc}>
                    카메라로 책이나 노트를 찍어보세요!
                </Text>
            </Pressable>

            {/* 로딩 상태 (Spinner/Overlay) */}
            {isScanning && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#4F46E5" />
                    <Text style={styles.loadingText}>AI가 단어를 분석 중입니다...</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#F9FAFB',
    },
    uploadCard: {
        backgroundColor: '#FFFFFF',
        borderWidth: 2,
        borderColor: '#E5E7EB',
        borderStyle: 'dashed',
        borderRadius: 12,
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 20,
    },
    iconWrapper: {
        backgroundColor: '#EEF2FF',
        padding: 16,
        borderRadius: 50,
        marginBottom: 16,
    },
    uploadTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#111827',
        marginBottom: 8,
    },
    uploadDesc: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        fontWeight: '600',
        color: '#4F46E5',
    },
    header: {
        marginBottom: 16,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#111827',
    },
    subtitle: {
        fontSize: 14,
        color: '#6B7280',
        marginTop: 4,
    },
    listContainer: {
        flex: 1,
        marginBottom: 16,
    },
    card: {
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    inputBold: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#111827',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        paddingVertical: 8,
        marginBottom: 8,
    },
    input: {
        fontSize: 15,
        color: '#374151',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        paddingVertical: 8,
        marginBottom: 8,
    },
    exampleInput: {
        color: '#6B7280',
        fontStyle: 'italic',
        borderBottomWidth: 0,
    },
    deleteButton: {
        alignSelf: 'flex-end',
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: '#FEE2E2',
        borderRadius: 6,
        marginTop: 4,
    },
    deleteButtonText: {
        color: '#DC2626',
        fontSize: 13,
        fontWeight: '600',
    },
    footer: {
        flexDirection: 'row',
        gap: 12,
    },
    button: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    cancelBtn: {
        backgroundColor: '#F3F4F6',
    },
    saveBtn: {
        backgroundColor: '#4F46E5',
    },
    btnText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
    },
    saveBtnText: {
        color: '#FFFFFF',
    },
});
