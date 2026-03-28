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
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { useAddWord } from '@/hooks/useAddWord';
import { Button } from '@/components/ui/Button';
import * as Haptics from 'expo-haptics';
import { Word } from '@/lib/types';

export type WordModalMode = 'read' | 'edit' | 'add';

interface WordDetailModalProps {
    visible: boolean;
    mode: WordModalMode;
    listId: string;
    wordId?: string | null;
    word?: Word | null;
    readOnly?: boolean;
    onClose: () => void;
    onModeChange?: (mode: WordModalMode) => void;
}

export default function WordDetailModal({
    visible,
    mode,
    listId,
    wordId,
    word,
    readOnly = false,
    onClose,
    onModeChange,
}: WordDetailModalProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const { getWordsForList, toggleStarred } = useVocab();

    const isEditing = wordId !== undefined && wordId !== null;
    const existingWord = word || (isEditing ? getWordsForList(listId).find(w => w.id === wordId) : null);

    const {
        term, setTerm,
        definition, setDefinition,
        meaningKr, setMeaningKr,
        phonetic, setPhonetic,
        pos, setPos,
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
            setPhonetic(existingWord.phonetic || '');
            setPos(existingWord.pos || '');
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
            setPhonetic('');
            setPos('');
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
                Alert.alert(t('common.error'), t('wordDetail.saveError'));
            }
        );
    };

    const handleCancel = () => {
        if (mode === 'edit') {
            if (existingWord) {
                setTerm(existingWord.term);
                setDefinition(existingWord.definition);
                setMeaningKr(existingWord.meaningKr);
                setPhonetic(existingWord.phonetic || '');
                setPos(existingWord.pos || '');
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
        if (readOnly) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (onModeChange) onModeChange('edit');
    };

    const handleToggleStar = async () => {
        if (readOnly) return;
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
                        <Text style={[styles.fieldText, { color: isCore ? colors.primary : colors.text, fontSize: isCore ? 16 : 15, fontFamily: isCore ? 'Pretendard_600SemiBold' : 'Pretendard_400Regular' }]}>
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
                                    {mode === 'read' ? t('common.close') : t('common.cancel')}
                                </Text>
                            </Pressable>

                            <Text style={[styles.topBarTitle, { color: colors.text }]}>
                                {readOnly ? '' : (mode === 'add' ? t('wordDetail.addWord') : mode === 'edit' ? t('wordDetail.editWord') : t('wordDetail.viewWord'))}
                            </Text>

                            <View style={styles.topBtn}>
                                {mode === 'read' ? (
                                    !readOnly && (
                                        <Pressable onPress={switchToEdit} hitSlop={8}>
                                            <Text style={[styles.topBarSave, { color: colors.primary }]}>{t('common.edit')}</Text>
                                        </Pressable>
                                    )
                                ) : (
                                    <Pressable onPress={onSave} hitSlop={8} disabled={isPendingSave}>
                                        <Text style={[styles.topBarSave, { color: colors.primary, opacity: isPendingSave ? 0.5 : 1 }]}>{t('common.save')}</Text>
                                    </Pressable>
                                )}
                            </View>
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
                                            placeholder={t('wordDetail.wordInput')}
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

                                {(phonetic || pos || mode !== 'read') && (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4, marginBottom: 8 }}>
                                        {mode === 'read' ? (
                                            <>
                                                {pos ? (
                                                    <View style={[styles.posBadge, { backgroundColor: colors.primaryLight }]}>
                                                        <Text style={[styles.posBadgeText, { color: colors.primary }]}>{pos}</Text>
                                                    </View>
                                                ) : null}
                                                {phonetic ? (
                                                    <Text style={[styles.phoneticText, { color: colors.textSecondary }]}>/{phonetic}/</Text>
                                                ) : null}
                                            </>
                                        ) : (
                                            <View style={{ flex: 1, flexDirection: 'row', gap: 12 }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 4 }]}>{t('wordDetail.phonetic')}</Text>
                                                    <TextInput
                                                        style={[styles.smallInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
                                                        value={phonetic}
                                                        onChangeText={setPhonetic}
                                                        placeholder={t('wordDetail.phonetic')}
                                                        placeholderTextColor={colors.textTertiary}
                                                    />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 4 }]}>{t('wordDetail.posLabel')}</Text>
                                                    <TextInput
                                                        style={[styles.smallInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
                                                        value={pos}
                                                        onChangeText={setPos}
                                                        placeholder={t('wordDetail.posPlaceholder')}
                                                        placeholderTextColor={colors.textTertiary}
                                                    />
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                )}
                                {mode !== 'read' && errors.term && <Text style={[styles.errorText, { color: colors.error }]}>{t('wordDetail.enterWord')}</Text>}

                                {mode !== 'read' && (
                                    <Button
                                        variant={term.trim() && !isPendingFill ? 'primary' : 'secondary'}
                                        title={t('wordDetail.aiAutoComplete')}
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
                                    label={t('wordDetail.meaningRequired')}
                                    placeholder={t('wordDetail.meaningPlaceholder')}
                                    value={meaningKr}
                                    onChangeText={(v: string) => { setMeaningKr(v); if (errors.meaningKr) setErrors(e => ({ ...e, meaningKr: false })); }}
                                    error={errors.meaningKr ? t('wordDetail.enterWord') : undefined}
                                    isCore
                                />
                                <EditableField
                                    label={t('wordDetail.definitionLabel')}
                                    placeholder={t('wordDetail.definitionPlaceholder')}
                                    value={definition}
                                    onChangeText={setDefinition}
                                    multiline
                                />

                                <View style={[styles.exampleGroup, { backgroundColor: mode === 'read' ? 'transparent' : colors.surfaceSecondary }]}>
                                    <EditableField
                                        label={t('wordDetail.exampleLabel')}
                                        placeholder={t('wordDetail.examplePlaceholder')}
                                        value={exampleEn}
                                        onChangeText={setExampleEn}
                                        multiline
                                    />
                                    <EditableField
                                        label={t('wordDetail.translationLabel')}
                                        placeholder={t('wordDetail.translationPlaceholder')}
                                        value={exampleKr}
                                        onChangeText={setExampleKr}
                                        multiline
                                    />
                                </View>

                                <View style={styles.tagsContainer}>
                                    <Text style={[styles.tagsLabel, { color: colors.textSecondary }]}>{t('wordDetail.tagsLabel')}</Text>

                                    {mode !== 'read' && (
                                        <View style={styles.tagInputRow}>
                                            <TextInput
                                                style={[styles.tagInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                                                placeholder={t('wordDetail.tagsPlaceholder')}
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
                                        mode === 'read' && <Text style={{ color: colors.textTertiary, fontFamily: 'Pretendard_400Regular', fontSize: 14, marginLeft: 4 }}>{t('wordDetail.noTags')}</Text>
                                    )}
                                </View>

                                {mode === 'read' && (
                                    <View style={{ marginTop: 24, paddingBottom: 12 }}>
                                        <Button
                                            onPress={() => { if (term.trim()) Linking.openURL(`https://en.dict.naver.com/#/search?query=${encodeURIComponent(term.trim())}`); }}
                                            disabled={!term.trim()}
                                            icon="language-outline"
                                            title={t('wordDetail.naverDict')}
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
        borderRadius: 20,
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
    topBarCancel: { fontSize: 16, fontFamily: 'Pretendard_400Regular' },
    topBarTitle: { fontSize: 17, fontFamily: 'Pretendard_600SemiBold' },
    topBarSave: { fontSize: 16, fontFamily: 'Pretendard_700Bold' },
    scrollContent: { padding: 20, paddingBottom: 40 },
    wordSection: { marginBottom: 20 },
    wordTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    wordInputText: { fontSize: 26, fontFamily: 'Pretendard_700Bold', paddingVertical: 8, letterSpacing: -0.5 },
    wordInput: { flex: 1, fontSize: 24, fontFamily: 'Pretendard_700Bold', paddingVertical: 8, borderBottomWidth: 2, letterSpacing: -0.5 },
    analyzeBtn: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, marginTop: 12 },
    fieldsContainer: { gap: 16 },
    fieldWrapper: { marginBottom: 4 },
    fieldLabel: { fontSize: 11, fontFamily: 'Pretendard_600SemiBold', marginBottom: 6, letterSpacing: 0.5, marginLeft: 2 },
    fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontFamily: 'Pretendard_400Regular', textAlignVertical: 'center' },
    fieldText: { fontSize: 15, fontFamily: 'Pretendard_400Regular', lineHeight: 22 },
    readFieldPressable: {
        paddingVertical: 6,
        paddingHorizontal: 2,
        borderRadius: 6,
    },
    exampleGroup: { padding: 12, borderRadius: 12, gap: 16, marginHorizontal: -4 },
    errorText: { fontSize: 12, fontFamily: 'Pretendard_400Regular', marginTop: 4, marginLeft: 4 },
    tagsContainer: { marginTop: 8 },
    tagsLabel: { fontSize: 11, fontFamily: 'Pretendard_600SemiBold', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 },
    tagInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    tagInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'Pretendard_400Regular' },
    addTagBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    tagsFlexBox: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tagChip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingLeft: 10, paddingRight: 6, borderRadius: 12, gap: 4 },
    tagChipText: { fontSize: 13, fontFamily: 'Pretendard_500Medium' },
    tagChipClose: { marginLeft: 2 },
    posBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    posBadgeText: {
        fontSize: 12,
        fontFamily: 'Pretendard_600SemiBold',
    },
    phoneticText: {
        fontSize: 14,
        fontFamily: 'Pretendard_400Regular',
    },
    smallInput: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 14,
        fontFamily: 'Pretendard_400Regular',
    },
});
