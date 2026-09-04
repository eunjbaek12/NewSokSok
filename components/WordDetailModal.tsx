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
import { displayTag } from '@/lib/tag-display';
import { formatBaseFormLine } from '@/lib/inflection';
import { useTheme } from '@/features/theme';
import { useListWords, toggleStarred } from '@/features/vocab';
import { useAddWord } from '@/hooks/useAddWord';
import { useSettings } from '@/features/settings';
import { Button } from '@/components/ui/Button';
import * as Haptics from 'expo-haptics';
import { Word } from '@/lib/types';
import SpeakerButton from '@/components/ui/SpeakerButton';
import { getTtsLang, getSpeakableText, getDefinitionLabel, getMeaningLabel, getExampleLabel, getExampleTranslationLabel, getNaverDictUrl, shouldShowExampleTranslation, LanguageCode } from '@/constants/languages';

export type WordModalMode = 'read' | 'edit' | 'add';

interface WordDetailModalProps {
    visible: boolean;
    mode: WordModalMode;
    listId: string;
    wordId?: string | null;
    word?: Word | null;
    readOnly?: boolean;
    /** Fallback source language when the word has no sourceLang (e.g. static curation preview). word.sourceLang wins. */
    sourceLanguage?: string;
    /** Fallback target (meaning) language when the word has no targetLang. Drives 뜻/해석 labels. */
    targetLanguage?: string;
    onClose: () => void;
    onModeChange?: (mode: WordModalMode) => void;
}

// ─── Read-only content view ────────────────────────────────────────────────────

function ReadOnlyView({ word, onClose, colors, t, ttsLang, sourceLang, targetLang }: {
    word: Word;
    onClose: () => void;
    colors: any;
    t: (key: string) => string;
    ttsLang: string;
    sourceLang: string | undefined;
    targetLang: string | undefined;
}) {
    const hasExample = !!(word.exampleEn || word.exampleKr);
    // 어순이 언어마다 달라(ko "abandon의 과거분사" / en "past participle of abandon")
    // 문장 조립을 i18n에 맡긴다. 원형이 없으면 null → 줄 자체를 그리지 않는다.
    const baseFormLine = formatBaseFormLine(word.baseForm, word.inflection, t);

    return (
        <>
            {/* Header */}
            <View style={[styles.topBar, { borderBottomColor: colors.borderLight }]}>
                <Pressable onPress={onClose} hitSlop={8} style={styles.topBtn}>
                    <Text style={[styles.topBarCancel, { color: colors.textSecondary }]}>
                        {t('common.close')}
                    </Text>
                </Pressable>
                <Text style={[styles.topBarTitle, { color: colors.text }]}>
                    {t('wordDetail.viewWord')}
                </Text>
                {/* 오른쪽 영역 균형용 빈 뷰 */}
                <View style={styles.topBtn} />
            </View>

            <ScrollView
                contentContainerStyle={styles.roScrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* ── 단어 + 발음 + 품사 ── */}
                <View style={styles.roTermSection}>
                    <View style={styles.roTermRow}>
                        <Text style={[styles.roTerm, { color: colors.text }]}>
                            {word.term}
                        </Text>
                        {word.term?.trim() ? (
                            <SpeakerButton
                                text={getSpeakableText(word.term, word.phonetic, sourceLang)}
                                language={ttsLang}
                                size={20}
                                color={colors.textSecondary}
                                style={[styles.roTtsBtn, { backgroundColor: colors.surfaceSecondary }]}
                            />
                        ) : null}
                    </View>

                    {(word.phonetic || word.pos) ? (
                        <View style={styles.roMetaRow}>
                            {word.pos ? (
                                <View style={[styles.posBadge, { backgroundColor: colors.primaryLight }]}>
                                    <Text style={[styles.posBadgeText, { color: colors.primary }]}>{word.pos}</Text>
                                </View>
                            ) : null}
                            {word.phonetic ? (
                                <Text style={[styles.phoneticText, { color: colors.textSecondary }]}>
                                    /{word.phonetic}/
                                </Text>
                            ) : null}
                        </View>
                    ) : null}

                    {/* 굴절형이면 원형을 한 줄로. 뜻 칸에 문법 설명이 섞이는 것을 막는 자리다
                        — 뜻은 플래시카드 뒷면·퀴즈 선택지에 그대로 나가므로 거기에 "go의
                        과거 시제" 같은 것이 들어가면 외울 것이 사라진다. lib/inflection.ts */}
                    {baseFormLine ? (
                        <View style={[styles.baseFormRow, { backgroundColor: colors.primaryLight }]}>
                            <Text style={[styles.baseFormArrow, { color: colors.primary }]}>↳</Text>
                            <Text style={[styles.baseFormText, { color: colors.primary }]} numberOfLines={2}>
                                {baseFormLine}
                            </Text>
                        </View>
                    ) : null}
                </View>

                {/* ── 뜻 ── */}
                <View style={[styles.roDivider, { borderTopColor: colors.borderLight }]} />
                <View style={styles.roSection}>
                    <Text style={[styles.roLabel, { color: colors.textTertiary }]}>
                        {getMeaningLabel((targetLang ?? 'ko') as LanguageCode, t)}
                    </Text>
                    <Text style={[styles.roMeaning, { color: colors.primary }]}>
                        {word.meaningKr || '—'}
                    </Text>
                </View>

                {/* ── 정의 ── */}
                {word.definition ? (
                    <>
                        <View style={[styles.roDivider, { borderTopColor: colors.borderLight }]} />
                        <View style={styles.roSection}>
                            <Text style={[styles.roLabel, { color: colors.textTertiary }]}>
                                {getDefinitionLabel((sourceLang ?? 'en') as LanguageCode, t)}
                            </Text>
                            <Text style={[styles.roBody, { color: colors.text }]}>
                                {word.definition}
                            </Text>
                        </View>
                    </>
                ) : null}

                {/* ── 예문 ── */}
                {hasExample ? (
                    <>
                        <View style={[styles.roDivider, { borderTopColor: colors.borderLight }]} />
                        <View style={styles.roSection}>
                            <Text style={[styles.roLabel, { color: colors.textTertiary }]}>
                                {getExampleLabel((sourceLang ?? 'en') as LanguageCode, t)}
                            </Text>
                            {word.exampleEn ? (
                                <Text style={[styles.roBody, { color: colors.text }]}>
                                    {word.exampleEn}
                                </Text>
                            ) : null}
                            {shouldShowExampleTranslation(word.exampleEn, word.exampleKr) ? (
                                <Text style={[styles.roBodySub, { color: colors.textSecondary }]}>
                                    {word.exampleKr}
                                </Text>
                            ) : null}
                        </View>
                    </>
                ) : null}

                {/* ── 태그 ── */}
                {word.tags && word.tags.length > 0 ? (
                    <>
                        <View style={[styles.roDivider, { borderTopColor: colors.borderLight }]} />
                        <View style={styles.roSection}>
                            <Text style={[styles.roLabel, { color: colors.textTertiary }]}>
                                {t('wordDetail.tagsLabel')}
                            </Text>
                            <View style={styles.roTagsRow}>
                                {word.tags.map((tag, idx) => (
                                    <View
                                        key={`${tag}-${idx}`}
                                        style={[styles.roTagChip, { backgroundColor: colors.surfaceSecondary }]}
                                    >
                                        <Text style={[styles.roTagText, { color: colors.textSecondary }]}>#{displayTag(tag, t)}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    </>
                ) : null}

            </ScrollView>
        </>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WordDetailModal({
    visible,
    mode,
    listId,
    wordId,
    word,
    readOnly = false,
    sourceLanguage,
    targetLanguage,
    onClose,
    onModeChange,
}: WordDetailModalProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const listWords = useListWords(listId);
    const { apiKey } = useSettings();

    const isEditing = wordId !== undefined && wordId !== null;
    const existingWord = word || (isEditing ? listWords.find(w => w.id === wordId) : null);

    // TTS 언어: 단어 자체의 sourceLang > 명시 prop(리스트/테마 언어) > en.
    // 한 덱에 여러 언어쌍이 섞일 수 있으므로 단어 언어가 있으면 그게 진실이고,
    // prop은 단어에 언어가 없는 경우(정적 큐레이션 미리보기 등)의 폴백이다.
    // 영어 보이스로 일본어를 읽으면 무음이 되므로 발음 재생은 반드시 단어의
    // 실제 출발어로 호출한다.
    const resolvedSourceLang = existingWord?.sourceLang ?? sourceLanguage;
    const resolvedTargetLang = existingWord?.targetLang ?? targetLanguage;
    const ttsLang = getTtsLang(resolvedSourceLang);

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
    } = useAddWord(listId, wordId || undefined, existingWord, undefined, resolvedSourceLang, resolvedTargetLang, apiKey || undefined);

    const [tagInput, setTagInput] = useState('');

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
            setTerm(''); setDefinition(''); setMeaningKr('');
            setPhonetic(''); setPos(''); setExampleEn('');
            setExampleKr(''); setTags([]); setIsStarred(false);
            setErrors({});
        }
    }, [visible, existingWord, setTerm, setDefinition, setMeaningKr, setExampleEn, setExampleKr, setTags, setIsStarred, setErrors]);

    const onSave = () => {
        handleSaveWord(
            listId,
            () => {
                if (mode === 'edit') {
                    if (onModeChange) onModeChange('read');
                    else onClose();
                } else {
                    onClose();
                }
            },
            () => { Alert.alert(t('common.error'), t('wordDetail.saveError')); }
        );
    };

    const handleCancel = () => {
        if (mode === 'edit') {
            if (existingWord) {
                setTerm(existingWord.term); setDefinition(existingWord.definition);
                setMeaningKr(existingWord.meaningKr); setPhonetic(existingWord.phonetic || '');
                setPos(existingWord.pos || ''); setExampleEn(existingWord.exampleEn);
                setExampleKr(existingWord.exampleKr || ''); setTags(existingWord.tags || []);
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
            .split(/[\s,]+/)
            .map(t => t.trim().toLowerCase())
            .filter(t => t.length > 0 && !tags.includes(t));
        if (newTags.length > 0) setTags([...tags, ...newTags].slice(0, 10));
        setTagInput('');
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setTags(tags.filter(t => t !== tagToRemove));
    };

    const EditableField = ({ label, value, onChangeText, multiline, placeholder, error, isCore, maxLength }: {
        label: string; value: string; onChangeText: (t: string) => void;
        multiline?: boolean; placeholder?: string; error?: string; isCore?: boolean; maxLength?: number;
    }) => (
        <View style={styles.fieldWrapper}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
            {mode !== 'read' ? (
                <TextInput
                    style={[
                        styles.fieldInput,
                        { color: colors.text, backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border },
                        multiline && { minHeight: 80, textAlignVertical: 'top' }
                    ]}
                    value={value} onChangeText={onChangeText} multiline={multiline}
                    placeholder={placeholder} placeholderTextColor={colors.textTertiary}
                    maxLength={maxLength}
                />
            ) : (
                <Pressable onPress={switchToEdit} style={[
                    styles.fieldInput,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    multiline && { minHeight: 80, justifyContent: 'flex-start' }
                ]}>
                    <Text style={[styles.fieldText, {
                        color: isCore ? colors.primary : colors.text,
                        fontSize: isCore ? 16 : 15,
                        fontFamily: isCore ? 'Pretendard_600SemiBold' : 'Pretendard_400Regular',
                        lineHeight: isCore ? 24 : 22,
                    }]}>
                        {value || '-'}
                    </Text>
                </Pressable>
            )}
            {error && <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>}
        </View>
    );

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
            <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                <Pressable style={styles.modalBackdrop} onPress={mode === 'read' ? onClose : undefined} />

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.keyboardView}
                >
                    <View style={[styles.modalContent, { backgroundColor: colors.background, shadowColor: colors.shadow }]}>

                        {/* ── readOnly: 콘텐츠 뷰 ── */}
                        {readOnly && existingWord ? (
                            <ReadOnlyView
                                word={existingWord}
                                onClose={onClose}
                                colors={colors}
                                t={t}
                                ttsLang={ttsLang}
                                sourceLang={resolvedSourceLang}
                                targetLang={resolvedTargetLang}
                            />
                        ) : (
                            <>
                                {/* ── 편집/추가 모드: 기존 폼 UI ── */}
                                <View style={[styles.topBar, { borderBottomColor: colors.borderLight }]}>
                                    <Pressable onPress={handleCancel} hitSlop={8} style={styles.topBtn}>
                                        <Text style={[styles.topBarCancel, { color: colors.textSecondary }]}>
                                            {mode === 'read' ? t('common.close') : t('common.cancel')}
                                        </Text>
                                    </Pressable>
                                    <Text style={[styles.topBarTitle, { color: colors.text }]}>
                                        {mode === 'add' ? t('wordDetail.addWord') : mode === 'edit' ? t('wordDetail.editWord') : t('wordDetail.viewWord')}
                                    </Text>
                                    <View style={styles.topBtn}>
                                        {mode === 'read' ? (
                                            !readOnly && (
                                                <Pressable onPress={switchToEdit} hitSlop={8}>
                                                    <Text style={[styles.topBarSave, { color: colors.primary }]}>{t('common.edit')}</Text>
                                                </Pressable>
                                            )
                                        ) : (
                                            /* AI 분석 중에는 저장을 막는다 — 곧 채워질 필드가 빠진 채로
                                               저장되고 모달이 닫혀 결과가 갈 곳이 사라진다(add-word 화면과 동일). */
                                            <Pressable onPress={onSave} hitSlop={8} disabled={isPendingSave || isPendingFill}>
                                                <Text style={[styles.topBarSave, { color: colors.primary, opacity: isPendingSave || isPendingFill ? 0.5 : 1 }]}>
                                                    {t('common.save')}
                                                </Text>
                                            </Pressable>
                                        )}
                                    </View>
                                </View>

                                <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                                    <View style={styles.wordSection}>
                                        <View style={styles.wordTitleRow}>
                                            <Pressable onPress={switchToEdit} style={{ flex: 1 }}>
                                                <Text style={[styles.wordInputText, { color: colors.text }]}>{term}</Text>
                                            </Pressable>
                                            {mode === 'read' && term.trim() ? (
                                                <SpeakerButton
                                                    text={getSpeakableText(term, phonetic, resolvedSourceLang)}
                                                    language={ttsLang}
                                                    size={20}
                                                    color={colors.textSecondary}
                                                    style={[styles.termActionBtn, { backgroundColor: colors.surfaceSecondary }]}
                                                />
                                            ) : null}
                                            {!readOnly && (
                                                <Pressable accessibilityRole="button" accessibilityLabel={t(isStarred ? 'list.starOff' : 'list.starOn')} onPress={handleToggleStar} hitSlop={12} style={{ paddingLeft: 4 }}>
                                                    <Ionicons name={isStarred ? "star" : "star-outline"} size={28} color={isStarred ? colors.starGold : colors.textTertiary} />
                                                </Pressable>
                                            )}
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
                                                                value={phonetic} onChangeText={setPhonetic}
                                                                placeholder={t('wordDetail.phonetic')} placeholderTextColor={colors.textTertiary}
                                                                maxLength={80}
                                                            />
                                                        </View>
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 4 }]}>{t('wordDetail.posLabel')}</Text>
                                                            <TextInput
                                                                style={[styles.smallInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
                                                                value={pos} onChangeText={setPos}
                                                                placeholder={t('wordDetail.posPlaceholder')} placeholderTextColor={colors.textTertiary}
                                                                maxLength={60}
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
                                        <EditableField label={getMeaningLabel((resolvedTargetLang ?? 'ko') as LanguageCode, t)} placeholder={t('wordDetail.meaningPlaceholder')} value={meaningKr}
                                            onChangeText={(v) => { setMeaningKr(v); if (errors.meaningKr) setErrors(e => ({ ...e, meaningKr: false })); }}
                                            error={errors.meaningKr ? t('wordDetail.enterWord') : undefined} isCore maxLength={300} />
                                        <EditableField label={getDefinitionLabel((resolvedSourceLang ?? 'en') as LanguageCode, t)} placeholder={getDefinitionLabel((resolvedSourceLang ?? 'en') as LanguageCode, t)} value={definition}
                                            onChangeText={setDefinition} multiline maxLength={500} />

                                        <View style={[styles.exampleGroup, { backgroundColor: mode === 'read' ? 'transparent' : colors.surfaceSecondary }]}>
                                            <EditableField label={getExampleLabel((resolvedSourceLang ?? 'en') as LanguageCode, t)} placeholder={t('wordDetail.examplePlaceholder')} value={exampleEn}
                                                onChangeText={setExampleEn} multiline maxLength={300} />
                                            <EditableField label={getExampleTranslationLabel((resolvedTargetLang ?? 'ko') as LanguageCode, t)} placeholder={getExampleTranslationLabel((resolvedTargetLang ?? 'ko') as LanguageCode, t)} value={exampleKr}
                                                onChangeText={setExampleKr} multiline maxLength={300} />
                                        </View>

                                        <View style={styles.tagsContainer}>
                                            <Text style={[styles.tagsLabel, { color: colors.textSecondary }]}>{t('wordDetail.tagsLabel')}</Text>
                                            {mode !== 'read' && (
                                                <View style={styles.tagInputRow}>
                                                    <TextInput
                                                        style={[styles.tagInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                                                        placeholder={t('wordDetail.tagsPlaceholder')} placeholderTextColor={colors.textTertiary}
                                                        value={tagInput} onChangeText={setTagInput}
                                                        onSubmitEditing={handleAddTag} returnKeyType="done" autoCapitalize="none"
                                                    />
                                                    <Pressable accessibilityRole="button" accessibilityLabel={t('addWord.addTag')} onPress={handleAddTag} disabled={!tagInput.trim()}
                                                        style={[styles.addTagBtn, { backgroundColor: tagInput.trim() ? colors.primaryButton : colors.surfaceSecondary }]}>
                                                        <Ionicons name="add" size={20} color={tagInput.trim() ? colors.onPrimary : colors.textTertiary} />
                                                    </Pressable>
                                                </View>
                                            )}
                                            {tags.length > 0 ? (
                                                <View style={styles.tagsFlexBox}>
                                                    {tags.map((tag, idx) => (
                                                        <View key={`${tag}-${idx}`} style={[styles.tagChip, { backgroundColor: mode === 'read' ? colors.surfaceSecondary : colors.primaryLight }]}>
                                                            <Text style={[styles.tagChipText, { color: mode === 'read' ? colors.text : colors.primary }]}>#{displayTag(tag, t)}</Text>
                                                            {mode !== 'read' && (
                                                                <Pressable accessibilityRole="button" accessibilityLabel={t('addWord.removeTag', { tag: displayTag(tag, t) })} onPress={() => handleRemoveTag(tag)} hitSlop={6} style={styles.tagChipClose}>
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
                                                    onPress={() => { if (term.trim()) Linking.openURL(getNaverDictUrl(resolvedSourceLang, resolvedTargetLang, term)); }}
                                                    disabled={!term.trim()} icon="language-outline" title={t('wordDetail.naverDict')}
                                                    style={{ backgroundColor: term.trim() ? colors.brand.naverGreen : colors.surfaceSecondary, paddingVertical: 10 }}
                                                />
                                            </View>
                                        )}
                                    </View>
                                </ScrollView>
                            </>
                        )}
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    modalBackdrop: { ...StyleSheet.absoluteFillObject },
    keyboardView: { width: '92%', maxWidth: 500, maxHeight: '85%' },
    modalContent: {
        width: '100%', height: '100%', borderRadius: 20, overflow: 'hidden',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12, shadowRadius: 16, elevation: 10,
    },
    topBar: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    topBtn: { padding: 4, minWidth: 44, alignItems: 'center' },
    topBarCancel: { fontSize: 16, fontFamily: 'Pretendard_400Regular' },
    topBarTitle: { fontSize: 17, fontFamily: 'Pretendard_600SemiBold' },
    topBarSave: { fontSize: 16, fontFamily: 'Pretendard_700Bold' },

    // ── readOnly 전용 스타일 ──────────────────────────────────────────────────
    roScrollContent: { paddingBottom: 36 },
    roTermSection: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 20 },
    roTermRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    roTerm: { flex: 1, fontSize: 30, fontFamily: 'Pretendard_700Bold', letterSpacing: -0.5 },
    roTtsBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    roMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    // 원형 줄. 배경 있는 둥근 칩이라 Android(Fabric)에서 네모로 그려지는 것을 막으려면
    // overflow:'hidden'이 필요하다 — CLAUDE.md의 달력 마커 항목과 같은 함정이다.
    baseFormRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 9, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8, alignSelf: 'flex-start', overflow: 'hidden' },
    baseFormArrow: { fontSize: 12, fontFamily: 'Pretendard_600SemiBold' },
    baseFormText: { fontSize: 13, fontFamily: 'Pretendard_500Medium', flexShrink: 1 },
    roDivider: { borderTopWidth: StyleSheet.hairlineWidth, marginHorizontal: 0 },
    roSection: { paddingHorizontal: 24, paddingVertical: 16 },
    roLabel: { fontSize: 11, fontFamily: 'Pretendard_600SemiBold', letterSpacing: 0.5, marginBottom: 6 },
    roMeaning: { fontSize: 20, fontFamily: 'Pretendard_700Bold', lineHeight: 28 },
    roBody: { fontSize: 15, fontFamily: 'Pretendard_400Regular', lineHeight: 22 },
    roBodySub: { fontSize: 14, fontFamily: 'Pretendard_400Regular', lineHeight: 20, marginTop: 6 },
    roTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
    roTagChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
    roTagText: { fontSize: 13, fontFamily: 'Pretendard_500Medium' },

    // ── 편집/추가 모드 스타일 ─────────────────────────────────────────────────
    scrollContent: { padding: 20, paddingBottom: 40 },
    wordSection: { marginBottom: 20 },
    wordTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    termActionBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    wordInputText: { fontSize: 26, fontFamily: 'Pretendard_700Bold', paddingVertical: 8, letterSpacing: -0.5 },
    wordInput: { flex: 1, fontSize: 24, fontFamily: 'Pretendard_700Bold', paddingVertical: 8, borderBottomWidth: 2, letterSpacing: -0.5 },
    analyzeBtn: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, marginTop: 12 },
    fieldsContainer: { gap: 16 },
    fieldWrapper: { marginBottom: 4 },
    fieldLabel: { fontSize: 11, fontFamily: 'Pretendard_600SemiBold', marginBottom: 6, letterSpacing: 0.5, marginLeft: 2 },
    fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontFamily: 'Pretendard_400Regular', textAlignVertical: 'center' },
    fieldText: { fontSize: 15, fontFamily: 'Pretendard_400Regular', lineHeight: 22 },
    fieldReadView: { paddingVertical: 4, paddingHorizontal: 2 },
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
    posBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
    posBadgeText: { fontSize: 12, fontFamily: 'Pretendard_600SemiBold' },
    phoneticText: { fontSize: 14, fontFamily: 'Pretendard_400Regular' },
    smallInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontFamily: 'Pretendard_400Regular' },
});
