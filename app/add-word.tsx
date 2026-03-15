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
} from 'react-native';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { useAddWord } from '@/hooks/useAddWord';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { ModalPicker, PickerOption } from '@/components/ui/ModalPicker';
import BatchImportWorkflow from '@/components/BatchImportWorkflow';
import PhotoImportWorkflow from '@/components/PhotoImportWorkflow';

type InputMode = 'manual' | 'photo' | 'excel';

export default function AddWordScreen() {
    const { listId, wordId } = useLocalSearchParams<{ listId: string; wordId?: string }>();
    const { colors } = useTheme();
    const { lists, getWordsForList, createList, addWord } = useVocab();

    const isEditing = !!wordId;
    const existingWord = isEditing && listId ? getWordsForList(listId).find(w => w.id === wordId) : null;

    const {
        term, setTerm,
        definition, setDefinition,
        meaningKr, setMeaningKr,
        exampleEn, setExampleEn,
        errors, setErrors,
        handleAutoFill,
        handleSaveWord,
        isPendingFill,
        isPendingSave,
    } = useAddWord(listId, wordId, existingWord);

    const [activeTab, setActiveTab] = useState<'edit' | 'dictionary'>('edit');
    const [inputMode, setInputMode] = useState<'manual' | 'photo' | 'excel'>('manual');
    const [selectedListId, setSelectedListId] = useState(listId || (lists.length > 0 ? lists[0].id : ''));
    const [listPickerOpen, setListPickerOpen] = useState(false);
    const [newListName, setNewListName] = useState('');
    const [showNewListInput, setShowNewListInput] = useState(false);
    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState('');

    useEffect(() => {
        if (existingWord) {
            setTerm(existingWord.term);
            setDefinition(existingWord.definition);
            setMeaningKr(existingWord.meaningKr);
            setExampleEn(existingWord.exampleEn);
        }
    }, [existingWord, setTerm, setDefinition, setMeaningKr, setExampleEn]);

    const navigation = useNavigation();

    useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', (e) => {
            if (!isEditing && inputMode !== 'manual') {
                e.preventDefault();
                setInputMode('manual');
            }
        });
        return unsubscribe;
    }, [navigation, inputMode, isEditing]);

    const handleOpenListPicker = () => {
        setShowNewListInput(false);
        setNewListName('');
        setListPickerOpen(true);
    };

    const handleSelectList = (id: string) => {
        setSelectedListId(id);
        setListPickerOpen(false);
    };

    const onSave = () => {
        handleSaveWord(
            selectedListId,
            (savedTerm) => {
                if (isEditing) {
                    router.back();
                } else {
                    setActiveTab('edit');
                    setToastMessage(`"${savedTerm}" 추가 완료!`);
                    setToastVisible(true);
                    setTimeout(() => setToastVisible(false), 1200);
                }
            },
            () => {
                handleOpenListPicker();
            }
        );
    };

    const handleCreateNewList = async () => {
        const trimmed = newListName.trim();
        if (!trimmed) return;
        try {
            const newList = await createList(trimmed);
            setSelectedListId(newList.id);
            setNewListName('');
            setShowNewListInput(false);
            setListPickerOpen(false);
        } catch (e: any) {
            if (e?.message === 'DUPLICATE_LIST') {
                Alert.alert('중복된 이름', `"${trimmed}" 단어장이 이미 있습니다. 다른 이름을 사용해 주세요.`);
            }
        }
    };

    const selectedListTitle = lists.find(l => l.id === selectedListId)?.title || '단어장 고르기';

    const pickerOptions: PickerOption[] = lists.map(l => ({
        id: l.id,
        title: l.title,
        rightElement: !l.isVisible ? (
            <View style={[styles.pickerHiddenBadge, { backgroundColor: colors.surfaceSecondary }]}>
                <Ionicons name="eye-off-outline" size={12} color={colors.textTertiary} />
            </View>
        ) : undefined,
    }));

    const pickerFooter = showNewListInput ? (
        <View style={[styles.pickerNewRow, { borderColor: colors.border }]}>
            <TextInput
                style={[styles.pickerNewInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                placeholder="새 단어장 이름"
                placeholderTextColor={colors.textTertiary}
                value={newListName}
                onChangeText={setNewListName}
                onSubmitEditing={handleCreateNewList}
                autoFocus
                returnKeyType="done"
            />
            <Pressable
                onPress={handleCreateNewList}
                disabled={!newListName.trim()}
                style={[styles.pickerNewBtn, { backgroundColor: newListName.trim() ? colors.primary : colors.surfaceSecondary }]}
            >
                <Text style={{ color: newListName.trim() ? '#FFFFFF' : colors.textTertiary, fontSize: 14, fontFamily: 'Pretendard_600SemiBold' }}>
                    Create
                </Text>
            </Pressable>
        </View>
    ) : (
        <Pressable
            onPress={() => setShowNewListInput(true)}
            style={[styles.pickerOption, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
        >
            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
            <Text style={[styles.pickerOptionText, { color: colors.primary }]}>
                + 새 단어장 만들기
            </Text>
        </Pressable>
    );

    // If excel mode is selected, we replace the screen content with BatchImportWorkflow
    if (!isEditing && inputMode === 'excel') {
        return (
            <View style={{ flex: 1, backgroundColor: colors.background }}>
                {!selectedListId ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                        <Ionicons name="warning-outline" size={48} color={colors.warning} style={{ marginBottom: 16 }} />
                        <Text style={{ fontSize: 16, color: colors.text, fontFamily: 'Pretendard_500Medium', textAlign: 'center' }}>
                            먼저 단어장을 선택해주세요.
                        </Text>
                        <Button
                            title="단어장 선택하기"
                            onPress={() => setInputMode('manual')}
                            style={{ marginTop: 20 }}
                        />
                    </View>
                ) : (
                    <BatchImportWorkflow
                        listId={selectedListId}
                        onClose={() => setInputMode('manual')}
                    />
                )}
            </View>
        );
    }

    // If photo mode is selected, replace screen content with PhotoImportWorkflow
    if (!isEditing && inputMode === 'photo') {
        return (
            <View style={{ flex: 1, backgroundColor: colors.background }}>
                {!selectedListId ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                        <Ionicons name="warning-outline" size={48} color={colors.warning} style={{ marginBottom: 16 }} />
                        <Text style={{ fontSize: 16, color: colors.text, fontFamily: 'Pretendard_500Medium', textAlign: 'center' }}>
                            먼저 단어장을 선택해주세요.
                        </Text>
                        <Button
                            title="단어장 선택하기"
                            onPress={() => setInputMode('manual')}
                            style={{ marginTop: 20 }}
                        />
                    </View>
                ) : (
                    <PhotoImportWorkflow
                        listId={selectedListId}
                        onClose={() => setInputMode('manual')}
                        onSaveWords={async (words) => {
                            let addedCount = 0;
                            for (const w of words) {
                                if (w.word.trim()) {
                                    await addWord(selectedListId, {
                                        term: w.word.trim(),
                                        definition: w.definition || '', // Note: API prompt returned 'meaning' mostly, but type ScannedWord currently uses meaning. I'll map meaning to meaningKr and definition.
                                        meaningKr: w.meaning,
                                        exampleEn: w.exampleSentence || '',
                                        exampleKr: '',
                                        isStarred: false,
                                        tags: []
                                    });
                                    addedCount++;
                                }
                            }
                            if (addedCount > 0) {
                                setToastMessage(`${addedCount}개 추출 단어 저장 완료!`);
                                setToastVisible(true);
                                setTimeout(() => setToastVisible(false), 2000);
                            }
                        }}
                    />
                )}
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
            <View style={[styles.topBar, { borderBottomColor: colors.borderLight }]}>
                <Pressable onPress={() => router.back()} hitSlop={8}>
                    <Text style={[styles.topBarCancel, { color: colors.textSecondary }]}>Cancel</Text>
                </Pressable>
                <Text style={[styles.topBarTitle, { color: colors.text }]}>
                    {isEditing ? 'Edit Word' : 'Add Word'}
                </Text>
                {isEditing || inputMode === 'manual' ? (
                    <Pressable onPress={onSave} hitSlop={8} disabled={isPendingSave}>
                        <Text style={[styles.topBarSave, { color: colors.primary, opacity: isPendingSave ? 0.5 : 1 }]}>Save</Text>
                    </Pressable>
                ) : (
                    <Text style={[styles.topBarSave, { opacity: 0 }]}>Save</Text>
                )}
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {!isEditing && (
                    <Pressable
                        onPress={handleOpenListPicker}
                        style={[styles.listSelector, { backgroundColor: colors.surface, borderColor: selectedListId ? colors.border : colors.error }]}
                    >
                        <Ionicons name="folder-outline" size={18} color={selectedListId ? colors.textSecondary : colors.error} />
                        <Text style={[styles.listSelectorText, { color: selectedListId ? colors.text : colors.textTertiary }]} numberOfLines={1}>
                            {selectedListTitle}
                        </Text>
                        <Ionicons name="chevron-down" size={16} color={colors.textTertiary} />
                    </Pressable>
                )}

                {!isEditing && (
                    <View style={[styles.inputModeTabBar, { backgroundColor: colors.surfaceSecondary }]}>
                        {(['manual', 'photo', 'excel'] as InputMode[]).map((mode) => (
                            <Pressable
                                key={mode}
                                onPress={() => setInputMode(mode)}
                                style={[
                                    styles.inputModeTab,
                                    inputMode === mode && [styles.inputModeTabActive, { backgroundColor: colors.surface, shadowColor: '#000' }],
                                ]}
                            >
                                <Ionicons
                                    name={mode === 'manual' ? 'pencil' : mode === 'photo' ? 'camera' : 'document-text'}
                                    size={16}
                                    color={inputMode === mode ? colors.primary : colors.textSecondary}
                                />
                                <Text style={[styles.inputModeTabText, { color: inputMode === mode ? colors.primary : colors.textSecondary }]}>
                                    {mode === 'manual' ? '직접 입력' : mode === 'photo' ? '사진 스캔' : '엑셀 업로드'}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                )}

                {(isEditing || inputMode === 'manual') && (
                    <>
                        <View style={styles.wordSection}>
                            <TextInput
                                style={[styles.wordInput, { color: colors.text, borderBottomColor: errors.term ? colors.error : colors.border }]}
                                placeholder="Enter word"
                                placeholderTextColor={colors.textTertiary}
                                value={term}
                                onChangeText={(t) => {
                                    setTerm(t);
                                    if (errors.term) setErrors(e => ({ ...e, term: false }));
                                }}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            {errors.term && <Text style={[styles.errorText, { color: colors.error }]}>Word is required</Text>}

                            <Button
                                variant={term.trim() && !isPendingFill ? 'primary' : 'secondary'}
                                title="AI Analyze"
                                icon="search"
                                iconColor={term.trim() ? colors.background : colors.textTertiary}
                                loading={isPendingFill}
                                disabled={!term.trim() || isPendingFill}
                                onPress={handleAutoFill}
                                style={[styles.analyzeBtn, { backgroundColor: term.trim() && !isPendingFill ? colors.text : colors.surfaceSecondary }]}
                                textStyle={{ color: term.trim() ? colors.background : colors.textTertiary, fontSize: 14 }}
                            />
                        </View>

                        <View style={[styles.tabBar, { borderBottomColor: colors.borderLight }]}>
                            <Pressable onPress={() => setActiveTab('edit')} style={[styles.tab, activeTab === 'edit' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}>
                                <Text style={[styles.tabText, { color: activeTab === 'edit' ? colors.primary : colors.textTertiary }]}>Edit Info</Text>
                            </Pressable>
                            <Pressable onPress={() => setActiveTab('dictionary')} style={[styles.tab, activeTab === 'dictionary' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}>
                                <Text style={[styles.tabText, { color: activeTab === 'dictionary' ? colors.primary : colors.textTertiary }]}>Dictionary</Text>
                            </Pressable>
                        </View>

                        {activeTab === 'edit' ? (
                            <View style={styles.fieldsContainer}>
                                <Input
                                    label="KOREAN MEANING"
                                    placeholder="Korean meaning"
                                    value={meaningKr}
                                    onChangeText={(t) => { setMeaningKr(t); if (errors.meaningKr) setErrors(e => ({ ...e, meaningKr: false })); }}
                                    error={errors.meaningKr ? "Meaning is required" : undefined}
                                />
                                <Input
                                    label="DEFINITION"
                                    placeholder="English definition"
                                    value={definition}
                                    onChangeText={setDefinition}
                                    multiline
                                />
                                <Input
                                    label="EXAMPLE SENTENCE"
                                    placeholder="Example sentence"
                                    value={exampleEn}
                                    onChangeText={setExampleEn}
                                    multiline
                                    style={{ fontStyle: 'italic' }}
                                />
                            </View>
                        ) : (
                            <View style={styles.dictionaryContainer}>
                                <Card style={{ borderColor: colors.border, borderWidth: 1 }}>
                                    <View style={styles.dictionaryHeader}>
                                        <Ionicons name="book-outline" size={22} color={colors.primary} />
                                        <Text style={[styles.dictionaryTitle, { color: colors.text }]}>External Dictionaries</Text>
                                    </View>
                                    <Text style={[styles.dictionaryDesc, { color: colors.textSecondary }]}>
                                        Look up &quot;{term || '...'}&quot; in external dictionaries for detailed definitions, pronunciation, and usage.
                                    </Text>
                                    <View style={styles.dictionaryButtons}>
                                        <Button
                                            onPress={() => { if (term.trim()) Linking.openURL(`https://en.dict.naver.com/#/search?query=${encodeURIComponent(term.trim())}`); }}
                                            disabled={!term.trim()}
                                            icon="language-outline"
                                            title="Naver Dictionary"
                                            style={{ backgroundColor: term.trim() ? '#03C75A' : colors.surfaceSecondary }}
                                        />
                                        <Button
                                            onPress={() => { if (term.trim()) Linking.openURL(`https://www.google.com/search?q=define+${encodeURIComponent(term.trim())}`); }}
                                            disabled={!term.trim()}
                                            icon="globe-outline"
                                            title="Google Define"
                                            style={{ backgroundColor: term.trim() ? '#4285F4' : colors.surfaceSecondary }}
                                        />
                                    </View>
                                </Card>
                            </View>
                        )}
                    </>
                )}

                {/* inputMode === 'photo' is currently handled as full screen replacement above, 
                 so this block acts as a fallback or is hidden. Handled directly via PhotoImportWorkflow */}

            </ScrollView>

            {toastVisible && (
                <View style={styles.toastContainer} pointerEvents="none">
                    <View style={[styles.toast, { backgroundColor: colors.text }]}>
                        <Ionicons name="checkmark-circle" size={20} color={colors.background} />
                        <Text style={[styles.toastText, { color: colors.background }]}>{toastMessage}</Text>
                    </View>
                </View>
            )}

            <ModalPicker
                visible={listPickerOpen}
                onClose={() => setListPickerOpen(false)}
                title="단어장 고르기"
                options={pickerOptions}
                selectedValue={selectedListId}
                onSelect={handleSelectList}
                footer={pickerFooter}
            />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
    topBarCancel: { fontSize: 16, fontFamily: 'Pretendard_400Regular' },
    topBarTitle: { fontSize: 17, fontFamily: 'Pretendard_600SemiBold' },
    topBarSave: { fontSize: 16, fontFamily: 'Pretendard_700Bold' },
    inputModeTabBar: { flexDirection: 'row', padding: 4, borderRadius: 12, marginBottom: 20 },
    inputModeTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12, gap: 6 },
    inputModeTabActive: { shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
    inputModeTabText: { fontSize: 14, fontFamily: 'Pretendard_600SemiBold' },
    placeholderContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 10, gap: 16 },
    placeholderIconContainer: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    placeholderTitle: { fontSize: 18, fontFamily: 'Pretendard_700Bold', textAlign: 'center' },
    placeholderDesc: { fontSize: 14, fontFamily: 'Pretendard_400Regular', textAlign: 'center', lineHeight: 22, marginBottom: 10 },
    scrollContent: { padding: 20, paddingBottom: 40 },
    listSelector: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20, gap: 8 },
    listSelectorText: { flex: 1, fontSize: 15, fontFamily: 'Pretendard_500Medium' },
    wordSection: { marginBottom: 20 },
    wordInput: { fontSize: 24, fontFamily: 'Pretendard_700Bold', paddingVertical: 12, borderBottomWidth: 2 },
    analyzeBtn: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, marginTop: 12 },
    tabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 20 },
    tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
    tabText: { fontSize: 14, fontFamily: 'Pretendard_600SemiBold' },
    fieldsContainer: { gap: 16 },
    errorText: { fontSize: 12, fontFamily: 'Pretendard_400Regular', marginTop: 2 },
    dictionaryContainer: { gap: 16 },
    dictionaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    dictionaryTitle: { fontSize: 17, fontFamily: 'Pretendard_600SemiBold' },
    dictionaryDesc: { fontSize: 14, fontFamily: 'Pretendard_400Regular', lineHeight: 20, marginBottom: 18 },
    dictionaryButtons: { gap: 10 },
    toastContainer: { position: 'absolute', bottom: 100, left: 0, right: 0, alignItems: 'center', zIndex: 999 },
    toast: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 },
    toastText: { fontSize: 15, fontFamily: 'Pretendard_600SemiBold' },
    pickerHiddenBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
    pickerNewRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
    pickerNewInput: { flex: 1, height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15, fontFamily: 'Pretendard_400Regular' },
    pickerNewBtn: { height: 44, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    pickerOptionText: { fontSize: 15, fontFamily: 'Pretendard_500Medium' },
    pickerOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, borderRadius: 12 },
});
