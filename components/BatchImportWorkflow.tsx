import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { parseImportedText, ParsedWord } from '@/utils/importParser';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

type ImportStage = 'input' | 'preview';

interface BatchImportWorkflowProps {
    listId: string;
    onClose: () => void;
}

export default function BatchImportWorkflow({ listId, onClose }: BatchImportWorkflowProps) {
    const { colors } = useTheme();
    const { t } = useTranslation();
    const { addBatchWords } = useVocab();
    const router = useRouter();

    const [stage, setStage] = useState<ImportStage>('input');
    const [rawText, setRawText] = useState('');
    const [parsedData, setParsedData] = useState<ParsedWord[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- STAGE 1: INPUT ---
    const handleFileUpload = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['text/csv', 'application/vnd.ms-excel', '*/*'],
                copyToCacheDirectory: true,
            });

            if (result.canceled) return;
            if (result.assets && result.assets.length > 0) {
                const fileUri = result.assets[0].uri;
                // In React Native, reading directly from URI can be tricky depending on the platform.
                // For Expo, we can use fetch to get the blo/text if it's a local file.
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

    const handleNextStage = () => {
        const parsed = parseImportedText(rawText);
        if (parsed.length === 0) {
            Alert.alert(t('common.notice'), t('batchImport.noData'));
            return;
        }
        setParsedData(parsed);
        setStage('preview');
    };

    // --- STAGE 2: PREVIEW & EDIT ---
    const validCount = useMemo(() => parsedData.filter(d => d.isValid).length, [parsedData]);
    const invalidCount = parsedData.length - validCount;

    const updateField = (id: string, field: keyof ParsedWord, value: string) => {
        setParsedData(prev => prev.map(item => {
            if (item.id === id) {
                const updated = { ...item, [field]: value };
                updated.isValid = updated.term.trim().length > 0 && updated.meaningKr.trim().length > 0;
                return updated;
            }
            return item;
        }));
    };

    const removeRow = (id: string) => {
        setParsedData(prev => prev.filter(item => item.id !== id));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handleSubmit = async () => {
        const dataToSubmit = parsedData.filter(d => d.isValid);
        if (dataToSubmit.length === 0) {
            Alert.alert(t('common.notice'), t('batchImport.noValidWords'));
            return;
        }

        setIsSubmitting(true);
        try {
            await addBatchWords(listId, dataToSubmit);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setIsSubmitting(false);
            onClose(); // Returns to previous screen
        } catch (e) {
            console.error(e);
            Alert.alert(t('common.error'), t('batchImport.saveError'));
            setIsSubmitting(false);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* HEADER */}
            <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
                <Pressable onPress={stage === 'preview' ? () => setStage('input') : onClose} style={styles.headerBtn}>
                    <Ionicons name={stage === 'preview' ? "arrow-back" : "close"} size={24} color={colors.text} />
                </Pressable>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                    {stage === 'input' ? t('batchImport.title') : t('batchImport.previewTitle')}
                </Text>
                <View style={styles.headerSpacer} />
            </View>

            {/* STAGE 1 VIEW */}
            {stage === 'input' && (
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                    <View style={[styles.infoBox, { backgroundColor: colors.surfaceSecondary }]}>
                        <Ionicons name="information-circle" size={20} color={colors.primary} />
                        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                            {t('batchImport.instructions')}
                        </Text>
                    </View>
                    <Text style={[styles.formatText, { color: colors.textTertiary }]}>
                        {t('batchImport.format')}
                    </Text>

                    <TextInput
                        style={[styles.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                        placeholder={t('batchImport.textareaPlaceholder')}
                        placeholderTextColor={colors.border}
                        multiline
                        textAlignVertical="top"
                        value={rawText}
                        onChangeText={setRawText}
                    />

                    <View style={styles.btnRow}>
                        <Pressable onPress={handleFileUpload} style={[styles.uploadBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                            <Ionicons name="document-text-outline" size={20} color={colors.text} />
                            <Text style={[styles.uploadBtnText, { color: colors.text }]}>{t('batchImport.csvUpload')}</Text>
                        </Pressable>
                        <Pressable
                            onPress={handleNextStage}
                            disabled={!rawText.trim()}
                            style={[
                                styles.nextBtn,
                                { backgroundColor: rawText.trim() ? colors.primary : colors.surfaceSecondary }
                            ]}
                        >
                            <Text style={[styles.nextBtnText, { color: rawText.trim() ? colors.background : colors.textTertiary }]}>{t('common.next')}</Text>
                            <Ionicons name="arrow-forward" size={18} color={rawText.trim() ? colors.background : colors.textTertiary} />
                        </Pressable>
                    </View>
                </ScrollView>
            )}

            {/* STAGE 2 VIEW */}
            {stage === 'preview' && (
                <View style={styles.previewContainer}>
                    <View style={[styles.statsRow, { backgroundColor: colors.surfaceSecondary }]}>
                        <Text style={[styles.statsText, { color: colors.textSecondary }]}>{t('batchImport.totalCount', { count: parsedData.length })}</Text>
                        <Text style={[styles.statsText, { color: colors.success }]}>{t('batchImport.validCount', { count: validCount })}</Text>
                        {invalidCount > 0 && <Text style={[styles.statsText, { color: colors.error }]}>{t('batchImport.invalidCount', { count: invalidCount })}</Text>}
                    </View>

                    <ScrollView contentContainerStyle={styles.previewScroll} keyboardShouldPersistTaps="handled">
                        {parsedData.map((item, index) => (
                            <View
                                key={item.id}
                                style={[
                                    styles.previewCard,
                                    {
                                        backgroundColor: colors.surface,
                                        borderColor: item.isValid ? colors.borderLight : colors.error
                                    }
                                ]}
                            >
                                <View style={styles.cardHeader}>
                                    <Text style={[styles.cardIndex, { color: colors.textTertiary }]}>#{index + 1}</Text>
                                    <Pressable onPress={() => removeRow(item.id)} hitSlop={10}>
                                        <Ionicons name="trash-outline" size={18} color={colors.error} />
                                    </Pressable>
                                </View>

                                <View style={styles.cardFields}>
                                    <View style={styles.fieldRow}>
                                        <TextInput
                                            style={[styles.inlineInput, { color: colors.text, borderBottomColor: item.term ? colors.borderLight : colors.error }]}
                                            value={item.term}
                                            onChangeText={(t) => updateField(item.id, 'term', t)}
                                            placeholder={t('batchImport.wordRequired')}
                                            placeholderTextColor={colors.error}
                                        />
                                        <TextInput
                                            style={[styles.inlineInput, { color: colors.text, borderBottomColor: item.meaningKr ? colors.borderLight : colors.error }]}
                                            value={item.meaningKr}
                                            onChangeText={(t) => updateField(item.id, 'meaningKr', t)}
                                            placeholder={t('batchImport.meaningRequired')}
                                            placeholderTextColor={colors.error}
                                        />
                                    </View>
                                    <TextInput
                                        style={[styles.inlineInputFull, { color: colors.textSecondary, borderBottomColor: colors.borderLight }]}
                                        value={item.exampleEn}
                                        onChangeText={(t) => updateField(item.id, 'exampleEn', t)}
                                        placeholder={t('batchImport.exampleOptional')}
                                        placeholderTextColor={colors.textTertiary}
                                    />
                                    {item.tags.length > 0 && (
                                        <Text style={[styles.tagPreview, { color: colors.primary }]}>{t('batchImport.tagsLabel', { tags: item.tags.join(', ') })}</Text>
                                    )}
                                </View>
                            </View>
                        ))}
                    </ScrollView>

                    <View style={[styles.footer, { borderTopColor: colors.borderLight, backgroundColor: colors.background }]}>
                        <Pressable
                            onPress={handleSubmit}
                            disabled={isSubmitting || validCount === 0}
                            style={[
                                styles.submitBtn,
                                { backgroundColor: (validCount > 0 && !isSubmitting) ? colors.primary : colors.surfaceSecondary }
                            ]}
                        >
                            {isSubmitting ? (
                                <ActivityIndicator color={colors.background} />
                            ) : (
                                <Text style={[styles.submitBtnText, { color: (validCount > 0) ? colors.background : colors.textTertiary }]}>
                                    {t('batchImport.batchSave', { count: validCount })}
                                </Text>
                            )}
                        </Pressable>
                    </View>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
    headerBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontFamily: 'Pretendard_600SemiBold' },
    headerSpacer: { width: 32 },
    content: { padding: 16, gap: 16 },
    infoBox: { flexDirection: 'row', padding: 12, borderRadius: 12, alignItems: 'center', gap: 8 },
    infoText: { flex: 1, fontSize: 14, fontFamily: 'Pretendard_400Regular', lineHeight: 20 },
    formatText: { fontSize: 13, fontFamily: 'Pretendard_500Medium', alignSelf: 'center', marginBottom: -4 },
    textArea: { height: 300, borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 15, fontFamily: 'Pretendard_400Regular' },
    btnRow: { flexDirection: 'row', gap: 12 },
    uploadBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderWidth: 1, borderRadius: 12, gap: 8 },
    uploadBtnText: { fontSize: 16, fontFamily: 'Pretendard_600SemiBold' },
    nextBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, gap: 6 },
    nextBtnText: { fontSize: 16, fontFamily: 'Pretendard_600SemiBold' },
    previewContainer: { flex: 1 },
    statsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10 },
    statsText: { fontSize: 14, fontFamily: 'Pretendard_600SemiBold' },
    previewScroll: { padding: 16, gap: 12 },
    previewCard: { borderWidth: 1, borderRadius: 20, padding: 12, gap: 8 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardIndex: { fontSize: 12, fontFamily: 'Pretendard_600SemiBold' },
    cardFields: { gap: 8 },
    fieldRow: { flexDirection: 'row', gap: 8 },
    inlineInput: { flex: 1, fontSize: 16, fontFamily: 'Pretendard_600SemiBold', paddingVertical: 4, borderBottomWidth: 1 },
    inlineInputFull: { fontSize: 14, fontFamily: 'Pretendard_400Regular', paddingVertical: 4, borderBottomWidth: 1 },
    tagPreview: { fontSize: 12, fontFamily: 'Pretendard_500Medium', marginTop: 4 },
    footer: { padding: 16, borderTopWidth: 1 },
    submitBtn: { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
    submitBtnText: { fontSize: 16, fontFamily: 'Pretendard_700Bold' },
});
