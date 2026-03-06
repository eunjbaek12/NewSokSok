import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Pressable,
    Platform,
    KeyboardAvoidingView,
    ScrollView,
    StyleSheet,
    Alert,
    Linking,
    TextInput,
    Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { useAddWord } from '@/hooks/useAddWord';
import { Button } from '@/components/ui/Button';
import * as Haptics from 'expo-haptics';

export type WordModalMode = 'read' | 'edit' | 'add';

interface WordDetailModalProps {
    visible: boolean;
    mode: WordModalMode;
    listId: string;
    wordId?: string | null;
    onClose: () => void;
    onModeChange?: (mode: WordModalMode) => void;
}

export default function WordDetailModal({
    visible,
    mode,
    listId,
    wordId,
    onClose,
    onModeChange,
}: WordDetailModalProps) {
    const { colors } = useTheme();
    const { getWordsForList, toggleStarred } = useVocab();

    const isEditing = wordId !== undefined && wordId !== null;
    const existingWord = isEditing ? getWordsForList(listId).find(w => w.id === wordId) : null;

    const {
        term, setTerm,
        definition, setDefinition,
        meaningKr, setMeaningKr,
        exampleEn, setExampleEn,
        exampleKr, setExampleKr,
        isStarred, setIsStarred,
        tags, setTags,
        errors, setErrors,
        handleAutoFill,
        handleSaveWord,
        isPendingFill,
        isPendingSave,
    } = useAddWord(listId, wordId || undefined, existingWord);

    const [tagInput, setTagInput] = useState('');

    // Reset or populate fields when modal opens/changes target
    useEffect(() => {
        if (visible && existingWord) {
            setTerm(existingWord.term);
            setDefinition(existingWord.definition);
            setMeaningKr(existingWord.meaningKr);
            setExampleEn(existingWord.exampleEn);
            setExampleKr(existingWord.exampleKr || '');
            setTags(existingWord.tags || []);
            setIsStarred(existingWord.isStarred || false);
            setErrors({});
        } else if (visible && !existingWord) {
            // Clear fields for new add
            setTerm('');
            setDefinition('');
            setMeaningKr('');
            setExampleEn('');
            setExampleKr('');
            setTags([]);
            setIsStarred(false);
            setErrors({});
        }
    }, [visible, existingWord, setTerm, setDefinition, setMeaningKr, setExampleEn, setExampleKr, setTags, setIsStarred, setErrors]);

    const onSave = () => {
        handleSaveWord(
            listId,
            (savedTerm) => {
                if (mode === 'edit') {
                    // Stay on screen but switch back to read mode
                    if (onModeChange) onModeChange('read');
                    else onClose();
                } else {
                    // If added from list, just close it so they see it in the list
                    onClose();
                }
            },
            () => {
                Alert.alert("오류", "단어를 저장하는 중 문제가 발생했습니다.");
            }
        );
    };

    const handleCancel = () => {
        if (mode === 'edit') {
            if (existingWord) {
                setTerm(existingWord.term);
                setDefinition(existingWord.definition);
                setMeaningKr(existingWord.meaningKr);
                setExampleEn(existingWord.exampleEn);
                setExampleKr(existingWord.exampleKr || '');
                setTags(existingWord.tags || []);
                setIsStarred(existingWord.isStarred || false);
            }
            if (onModeChange) onModeChange('read');
            setErrors({});
        } else {
            onClose();
        }
    };

    const switchToEdit = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (onModeChange) onModeChange('edit');
    };

    const handleToggleStar = async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (mode === 'read' && wordId) {
            setIsStarred(!isStarred);
            await toggleStarred(listId, wordId);
        } else {
            setIsStarred(!isStarred);
        }
    };

    const handleAddTag = () => {
        const newTags = tagInput
            .split(/[\s,]+/) // split by space or comma
            .map(t => t.trim().toLowerCase())
            .filter(t => t.length > 0 && !tags.includes(t));

        if (newTags.length > 0) {
            setTags([...tags, ...newTags].slice(0, 10)); // max 10 tags
        }
        setTagInput('');
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setTags(tags.filter(t => t !== tagToRemove));
    };

    const EditableField = ({ label, value, onChangeText, multiline, placeholder, error, isCore }: { label: string, value: string, onChangeText: (t: string) => void, multiline?: boolean, placeholder?: string, error?: string, isCore?: boolean }) => {
        return (
            <View style={styles.fieldWrapper}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
                {mode !== 'read' ? (
                    <TextInput
                        style={[
                            styles.fieldInput,
                            { color: colors.text, backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border },
                            multiline && { minHeight: 80, textAlignVertical: 'top' }
                        ]}
                        value={value}
                        onChangeText={onChangeText}
                        multiline={multiline}
                        placeholder={placeholder}
                        placeholderTextColor={colors.textTertiary}
                    />
                ) : (
                    <Pressable onPress={switchToEdit} style={[
                        styles.fieldInput,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                        multiline && { minHeight: 80, justifyContent: 'flex-start' }
                    ]}>
                        <Text style={[styles.fieldText, { color: isCore ? colors.primary : colors.text, fontSize: isCore ? 16 : 15, fontFamily: isCore ? 'Inter_600SemiBold' : 'Inter_400Regular' }]}>
                            {value || '-'}
                        </Text>
                    </Pressable>
                )}
                {error && <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>}
            </View>
        );
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={handleCancel}
        >
            <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.4)' }]}>
                <Pressable style={styles.modalBackdrop} onPress={mode === 'read' ? onClose : undefined} />

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.keyboardView}
                >
                    <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
                        {/* Header */}
                        <View style={[styles.topBar, { borderBottomColor: colors.borderLight }]}>
                            <Pressable onPress={handleCancel} hitSlop={8} style={styles.topBtn}>
                                <Text style={[styles.topBarCancel, { color: colors.textSecondary }]}>
                                    {mode === 'read' ? '닫기' : '취소'}
                                </Text>
                            </Pressable>

                            <Text style={[styles.topBarTitle, { color: colors.text }]}>
                                {mode === 'add' ? '새 단어 추가' : mode === 'edit' ? '단어 수정' : '상세 보기'}
                            </Text>

                            {mode === 'read' ? (
                                <Pressable onPress={switchToEdit} hitSlop={8} style={styles.topBtn}>
                                    <Text style={[styles.topBarSave, { color: colors.primary }]}>편집</Text>
                                </Pressable>
                            ) : (
                                <Pressable onPress={onSave} hitSlop={8} disabled={isPendingSave} style={styles.topBtn}>
                                    <Text style={[styles.topBarSave, { color: colors.primary, opacity: isPendingSave ? 0.5 : 1 }]}>저장</Text>
                                </Pressable>
                            )}
                        </View>

                        {/* Content Body */}
                        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                            <View style={styles.wordSection}>
                                <View style={styles.wordTitleRow}>
                                    {mode === 'read' ? (
                                        <Pressable onPress={switchToEdit} style={{ flex: 1 }}>
                                            <Text style={[styles.wordInputText, { color: colors.text }]}>{term}</Text>
                                        </Pressable>
                                    ) : (
                                        <TextInput
                                            style={[styles.wordInput, { color: colors.text, borderBottomColor: errors.term ? colors.error : colors.border }]}
                                            placeholder="단어 입력"
                                            placeholderTextColor={colors.textTertiary}
                                            value={term}
                                            onChangeText={(t) => {
                                                setTerm(t);
                                                if (errors.term) setErrors(e => ({ ...e, term: false }));
                                            }}
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                        />
                                    )}
                                    <Pressable onPress={handleToggleStar} hitSlop={12} style={{ paddingLeft: 8 }}>
                                        <Ionicons name={isStarred ? "star" : "star-outline"} size={28} color={isStarred ? "#FFD700" : colors.textTertiary} />
                                    </Pressable>
                                </View>
                                {mode !== 'read' && errors.term && <Text style={[styles.errorText, { color: colors.error }]}>Word is required</Text>}

                                {mode !== 'read' && (
                                    <Button
                                        variant={term.trim() && !isPendingFill ? 'primary' : 'secondary'}
                                        title="AI 뜻/예문 자동 완성"
                                        icon="sparkles-outline"
                                        iconColor={term.trim() ? colors.background : colors.textTertiary}
                                        loading={isPendingFill}
                                        disabled={!term.trim() || isPendingFill}
                                        onPress={handleAutoFill}
                                        style={[styles.analyzeBtn, { backgroundColor: term.trim() && !isPendingFill ? colors.text : colors.surfaceSecondary }]}
                                        textStyle={{ color: term.trim() ? colors.background : colors.textTertiary, fontSize: 13 }}
                                    />
                                )}
                            </View>

                            <View style={styles.fieldsContainer}>
                                <EditableField
                                    label="한국어 뜻 (필수)"
                                    placeholder="단어의 뜻을 적어주세요"
                                    value={meaningKr}
                                    onChangeText={(t: string) => { setMeaningKr(t); if (errors.meaningKr) setErrors(e => ({ ...e, meaningKr: false })); }}
                                    error={errors.meaningKr ? "Meaning is required" : undefined}
                                    isCore
                                />
                                <EditableField
                                    label="영영사전 정의"
                                    placeholder="영어 정의를 적어주세요"
                                    value={definition}
                                    onChangeText={setDefinition}
                                    multiline
                                />

                                <View style={[styles.exampleGroup, { backgroundColor: mode === 'read' ? 'transparent' : colors.surfaceSecondary }]}>
                                    <EditableField
                                        label="예문"
                                        placeholder="예문을 적어주세요"
                                        value={exampleEn}
                                        onChangeText={setExampleEn}
                                        multiline
                                    />
                                    <EditableField
                                        label="예문 해석"
                                        placeholder="한국어 예문 해석"
                                        value={exampleKr}
                                        onChangeText={setExampleKr}
                                        multiline
                                    />
                                </View>

                                <View style={styles.tagsContainer}>
                                    <Text style={[styles.tagsLabel, { color: colors.textSecondary }]}>태그 (TAGS)</Text>

                                    {mode !== 'read' && (
                                        <View style={styles.tagInputRow}>
                                            <TextInput
                                                style={[styles.tagInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                                                placeholder="태그 입력 (쉼표나 띄어쓰기로 구분)"
                                                placeholderTextColor={colors.textTertiary}
                                                value={tagInput}
                                                onChangeText={setTagInput}
                                                onSubmitEditing={handleAddTag}
                                                returnKeyType="done"
                                                autoCapitalize="none"
                                            />
                                            <Pressable
                                                onPress={handleAddTag}
                                                disabled={!tagInput.trim()}
                                                style={[styles.addTagBtn, { backgroundColor: tagInput.trim() ? colors.primary : colors.surfaceSecondary }]}
                                            >
                                                <Ionicons name="add" size={20} color={tagInput.trim() ? '#fff' : colors.textTertiary} />
                                            </Pressable>
                                        </View>
                                    )}

                                    {tags.length > 0 ? (
                                        <View style={styles.tagsFlexBox}>
                                            {tags.map((t, idx) => (
                                                <View key={`${t}-${idx}`} style={[styles.tagChip, { backgroundColor: mode === 'read' ? colors.surfaceSecondary : colors.primaryLight }]}>
                                                    <Text style={[styles.tagChipText, { color: mode === 'read' ? colors.text : colors.primary }]}>#{t}</Text>
                                                    {mode !== 'read' && (
                                                        <Pressable onPress={() => handleRemoveTag(t)} hitSlop={6} style={styles.tagChipClose}>
                                                            <Ionicons name="close-circle" size={16} color={colors.primary} />
                                                        </Pressable>
                                                    )}
                                                </View>
                                            ))}
                                        </View>
                                    ) : (
                                        mode === 'read' && <Text style={{ color: colors.textTertiary, fontFamily: 'Inter_400Regular', fontSize: 14, marginLeft: 4 }}>태그 없음</Text>
                                    )}
                                </View>

                                {mode === 'read' && (
                                    <View style={{ marginTop: 24, paddingBottom: 12 }}>
                                        <Button
                                            onPress={() => { if (term.trim()) Linking.openURL(`https://en.dict.naver.com/#/search?query=${encodeURIComponent(term.trim())}`); }}
                                            disabled={!term.trim()}
                                            icon="language-outline"
                                            title="네이버 어학사전 검색"
                                            style={{ backgroundColor: term.trim() ? '#03C75A' : colors.surfaceSecondary, paddingVertical: 10 }}
                                        />
                                    </View>
                                )}
                            </View>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalBackdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    keyboardView: {
        width: '92%',
        maxWidth: 500,
        maxHeight: '85%',
    },
    modalContent: {
        width: '100%',
        height: '100%',
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
        elevation: 10,
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth
    },
    topBtn: {
        padding: 4,
        minWidth: 44,
        alignItems: 'center',
    },
    topBarCancel: { fontSize: 16, fontFamily: 'Inter_400Regular' },
    topBarTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
    topBarSave: { fontSize: 16, fontFamily: 'Inter_700Bold' },
    scrollContent: { padding: 20, paddingBottom: 40 },
    wordSection: { marginBottom: 20 },
    wordTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    wordInputText: { fontSize: 26, fontFamily: 'Inter_700Bold', paddingVertical: 8, letterSpacing: -0.5 },
    wordInput: { flex: 1, fontSize: 24, fontFamily: 'Inter_700Bold', paddingVertical: 8, borderBottomWidth: 2, letterSpacing: -0.5 },
    analyzeBtn: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, marginTop: 12 },
    fieldsContainer: { gap: 16 },
    fieldWrapper: { marginBottom: 4 },
    fieldLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginBottom: 6, letterSpacing: 0.5, marginLeft: 2 },
    fieldInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontFamily: 'Inter_400Regular', textAlignVertical: 'center' },
    fieldText: { fontSize: 15, fontFamily: 'Inter_400Regular', lineHeight: 22 },
    readFieldPressable: {
        paddingVertical: 6,
        paddingHorizontal: 2,
        borderRadius: 6,
    },
    exampleGroup: { padding: 12, borderRadius: 12, gap: 16, marginHorizontal: -4 },
    errorText: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4, marginLeft: 4 },
    tagsContainer: { marginTop: 8 },
    tagsLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 },
    tagInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    tagInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'Inter_400Regular' },
    addTagBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    tagsFlexBox: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tagChip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingLeft: 10, paddingRight: 6, borderRadius: 16, gap: 4 },
    tagChipText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
    tagChipClose: { marginLeft: 2 },
});
