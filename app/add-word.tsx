import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Linking,
  Modal,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { autoFillWord } from '@/lib/translation-api';

type TabType = 'edit' | 'dictionary';
type InputMode = 'manual' | 'photo' | 'excel';

export default function AddWordScreen() {
  const { listId, wordId } = useLocalSearchParams<{ listId: string; wordId?: string }>();
  const { colors } = useTheme();
  const { lists, getWordsForList, addWord, updateWord, createList } = useVocab();

  const isEditing = !!wordId;
  const existingWord = isEditing ? getWordsForList(listId!).find(w => w.id === wordId) : null;

  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const [meaningKr, setMeaningKr] = useState('');
  const [exampleEn, setExampleEn] = useState('');
  const [autoFilling, setAutoFilling] = useState(false);
  const [errors, setErrors] = useState<{ term?: boolean; meaningKr?: boolean }>({});
  const [activeTab, setActiveTab] = useState<TabType>('edit');
  const [inputMode, setInputMode] = useState<InputMode>('manual');
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
  }, [existingWord]);

  const handleAutoFill = async () => {
    if (!term.trim() || autoFilling) return;
    setAutoFilling(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await autoFillWord(term.trim());
      if (result.definition) setDefinition(result.definition);
      if (result.meaningKr) setMeaningKr(result.meaningKr);
      if (result.exampleEn) setExampleEn(result.exampleEn);
    } catch {
    } finally {
      setAutoFilling(false);
    }
  };

  const handleSave = async () => {
    const newErrors: { term?: boolean; meaningKr?: boolean } = {};
    if (!term.trim()) newErrors.term = true;
    if (!meaningKr.trim()) newErrors.meaningKr = true;
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setErrors({});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (isEditing && wordId) {
      await updateWord(listId!, wordId, {
        term: term.trim(),
        definition: definition.trim(),
        meaningKr: meaningKr.trim(),
        exampleEn: exampleEn.trim(),
      });
      router.back();
    } else {
      if (!selectedListId) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        handleOpenListPicker();
        return;
      }
      const savedTerm = term.trim();
      await addWord(selectedListId, {
        term: savedTerm,
        definition: definition.trim(),
        exampleEn: exampleEn.trim(),
        meaningKr: meaningKr.trim(),
      });
      setTerm('');
      setDefinition('');
      setMeaningKr('');
      setExampleEn('');
      setErrors({});
      setActiveTab('edit');
      setToastMessage(`"${savedTerm}" 추가 완료!`);
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 1200);
    }
  };

  const handleOpenListPicker = () => {
    setShowNewListInput(false);
    setNewListName('');
    setListPickerOpen(true);
  };

  const handleSelectList = (id: string) => {
    setSelectedListId(id);
    setListPickerOpen(false);
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
          <Pressable onPress={handleSave} hitSlop={8}>
            <Text style={[styles.topBarSave, { color: colors.primary }]}>Save</Text>
          </Pressable>
        ) : (
          <Text style={[styles.topBarSave, { opacity: 0 }]}>Save</Text>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!isEditing && (
          <Pressable
            onPress={handleOpenListPicker}
            style={[styles.listSelector, { backgroundColor: colors.surface, borderColor: selectedListId ? colors.border : colors.error }]}
          >
            <Ionicons name="folder-outline" size={18} color={selectedListId ? colors.textSecondary : colors.error} />
            <Text
              style={[styles.listSelectorText, { color: selectedListId ? colors.text : colors.textTertiary }]}
              numberOfLines={1}
            >
              {selectedListTitle}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.textTertiary} />
          </Pressable>
        )}

        {!isEditing && (
          <View style={[styles.inputModeTabBar, { backgroundColor: colors.surfaceSecondary }]}>
            <Pressable
              onPress={() => setInputMode('manual')}
              style={[
                styles.inputModeTab,
                inputMode === 'manual' && [styles.inputModeTabActive, { backgroundColor: colors.surface, shadowColor: '#000' }],
              ]}
            >
              <Ionicons name="pencil" size={16} color={inputMode === 'manual' ? colors.primary : colors.textSecondary} />
              <Text style={[styles.inputModeTabText, { color: inputMode === 'manual' ? colors.primary : colors.textSecondary }]}>직접 입력</Text>
            </Pressable>
            <Pressable
              onPress={() => setInputMode('photo')}
              style={[
                styles.inputModeTab,
                inputMode === 'photo' && [styles.inputModeTabActive, { backgroundColor: colors.surface, shadowColor: '#000' }],
              ]}
            >
              <Ionicons name="camera" size={16} color={inputMode === 'photo' ? colors.primary : colors.textSecondary} />
              <Text style={[styles.inputModeTabText, { color: inputMode === 'photo' ? colors.primary : colors.textSecondary }]}>사진 스캔</Text>
            </Pressable>
            <Pressable
              onPress={() => setInputMode('excel')}
              style={[
                styles.inputModeTab,
                inputMode === 'excel' && [styles.inputModeTabActive, { backgroundColor: colors.surface, shadowColor: '#000' }],
              ]}
            >
              <Ionicons name="document-text" size={16} color={inputMode === 'excel' ? colors.primary : colors.textSecondary} />
              <Text style={[styles.inputModeTabText, { color: inputMode === 'excel' ? colors.primary : colors.textSecondary }]}>엑셀 업로드</Text>
            </Pressable>
          </View>
        )}

        {(isEditing || inputMode === 'manual') && (
          <>
            <View style={styles.wordSection}>
              <TextInput
                style={[
                  styles.wordInput,
                  {
                    color: colors.text,
                    borderBottomColor: errors.term ? colors.error : colors.border,
                  },
                ]}
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
              {errors.term && (
                <Text style={[styles.errorText, { color: colors.error }]}>Word is required</Text>
              )}

              <Pressable
                onPress={handleAutoFill}
                disabled={!term.trim() || autoFilling}
                style={[
                  styles.analyzeBtn,
                  {
                    backgroundColor: term.trim() && !autoFilling ? colors.text : colors.surfaceSecondary,
                    opacity: term.trim() && !autoFilling ? 1 : 0.5,
                  },
                ]}
              >
                {autoFilling ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <>
                    <Ionicons name="search" size={16} color={term.trim() ? colors.background : colors.textTertiary} />
                    <Text
                      style={[
                        styles.analyzeBtnText,
                        { color: term.trim() ? colors.background : colors.textTertiary },
                      ]}
                    >
                      AI Analyze
                    </Text>
                  </>
                )}
              </Pressable>
            </View>

            <View style={[styles.tabBar, { borderBottomColor: colors.borderLight }]}>
              <Pressable
                onPress={() => setActiveTab('edit')}
                style={[
                  styles.tab,
                  activeTab === 'edit' && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: activeTab === 'edit' ? colors.primary : colors.textTertiary },
                  ]}
                >
                  Edit Info
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab('dictionary')}
                style={[
                  styles.tab,
                  activeTab === 'dictionary' && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: activeTab === 'dictionary' ? colors.primary : colors.textTertiary },
                  ]}
                >
                  Dictionary
                </Text>
              </Pressable>
            </View>

            {activeTab === 'edit' ? (
              <View style={styles.fieldsContainer}>
                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>KOREAN MEANING</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.surface,
                        color: colors.text,
                        borderColor: errors.meaningKr ? colors.error : colors.border,
                      },
                    ]}
                    placeholder="Korean meaning"
                    placeholderTextColor={colors.textTertiary}
                    value={meaningKr}
                    onChangeText={(t) => {
                      setMeaningKr(t);
                      if (errors.meaningKr) setErrors(e => ({ ...e, meaningKr: false }));
                    }}
                  />
                  {errors.meaningKr && (
                    <Text style={[styles.errorText, { color: colors.error }]}>Meaning is required</Text>
                  )}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>DEFINITION</Text>
                  <TextInput
                    style={[
                      styles.input,
                      styles.multilineInput,
                      {
                        backgroundColor: colors.surface,
                        color: colors.text,
                        borderColor: colors.border,
                      },
                    ]}
                    placeholder="English definition"
                    placeholderTextColor={colors.textTertiary}
                    value={definition}
                    onChangeText={setDefinition}
                    multiline
                    textAlignVertical="top"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>EXAMPLE SENTENCE</Text>
                  <TextInput
                    style={[
                      styles.input,
                      styles.multilineInput,
                      {
                        backgroundColor: colors.surface,
                        color: colors.text,
                        borderColor: colors.border,
                        fontStyle: 'italic' as const,
                      },
                    ]}
                    placeholder="Example sentence"
                    placeholderTextColor={colors.textTertiary}
                    value={exampleEn}
                    onChangeText={setExampleEn}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              </View>
            ) : (
              <View style={styles.dictionaryContainer}>
                <View style={[styles.dictionaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.dictionaryHeader}>
                    <Ionicons name="book-outline" size={22} color={colors.primary} />
                    <Text style={[styles.dictionaryTitle, { color: colors.text }]}>
                      External Dictionaries
                    </Text>
                  </View>
                  <Text style={[styles.dictionaryDesc, { color: colors.textSecondary }]}>
                    Look up &quot;{term || '...'}&quot; in external dictionaries for detailed definitions, pronunciation, and usage.
                  </Text>

                  <View style={styles.dictionaryButtons}>
                    <Pressable
                      onPress={() => {
                        if (!term.trim()) return;
                        Linking.openURL(`https://en.dict.naver.com/#/search?query=${encodeURIComponent(term.trim())}`);
                      }}
                      disabled={!term.trim()}
                      style={[
                        styles.dictBtn,
                        {
                          backgroundColor: term.trim() ? '#03C75A' : colors.surfaceSecondary,
                          opacity: term.trim() ? 1 : 0.5,
                        },
                      ]}
                    >
                      <Ionicons name="language-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.dictBtnText}>Naver Dictionary</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        if (!term.trim()) return;
                        Linking.openURL(`https://www.google.com/search?q=define+${encodeURIComponent(term.trim())}`);
                      }}
                      disabled={!term.trim()}
                      style={[
                        styles.dictBtn,
                        {
                          backgroundColor: term.trim() ? '#4285F4' : colors.surfaceSecondary,
                          opacity: term.trim() ? 1 : 0.5,
                        },
                      ]}
                    >
                      <Ionicons name="globe-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.dictBtnText}>Google Define</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
          </>
        )}

        {!isEditing && inputMode === 'photo' && (
          <View style={styles.placeholderContainer}>
            <View style={[styles.placeholderIconContainer, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="camera-outline" size={48} color={colors.primary} />
            </View>
            <Text style={[styles.placeholderTitle, { color: colors.text }]}>사진으로 단어 추가 (개발 중)</Text>
            <Text style={[styles.placeholderDesc, { color: colors.textSecondary }]}>
              교재나 단어장 사진을 찍으면 AI가 자동으로 단어와 뜻을 추출하여 단어장에 추가해줍니다.
            </Text>
            <Pressable style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}>
              <Ionicons name="camera" size={18} color="#FFFFFF" />
              <Text style={styles.primaryActionBtnText}>사진 촬영 / 앨범에서 선택</Text>
            </Pressable>
          </View>
        )}

        {!isEditing && inputMode === 'excel' && (
          <View style={styles.placeholderContainer}>
            <View style={[styles.placeholderIconContainer, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="document-text-outline" size={48} color={colors.primary} />
            </View>
            <Text style={[styles.placeholderTitle, { color: colors.text }]}>엑셀 파일로 추가 (개발 중)</Text>
            <Text style={[styles.placeholderDesc, { color: colors.textSecondary }]}>
              PC에서 작성한 엑셀 파일(.xlsx, .csv)을 업로드하여 한 번에 여러 단어를 추가할 수 있습니다.
            </Text>
            <Pressable style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}>
              <Ionicons name="cloud-upload" size={18} color="#FFFFFF" />
              <Text style={styles.primaryActionBtnText}>엑셀 파일 선택</Text>
            </Pressable>
            <Pressable style={[styles.secondaryActionBtn, { borderColor: colors.border }]}>
              <Ionicons name="download-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.secondaryActionBtnText, { color: colors.textSecondary }]}>양식 다운로드</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {toastVisible && (
        <View style={styles.toastContainer} pointerEvents="none">
          <View style={[styles.toast, { backgroundColor: colors.text }]}>
            <Ionicons name="checkmark-circle" size={20} color={colors.background} />
            <Text style={[styles.toastText, { color: colors.background }]}>{toastMessage}</Text>
          </View>
        </View>
      )}

      <Modal
        visible={listPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setListPickerOpen(false)}
      >
        <Pressable
          style={styles.pickerOverlay}
          onPress={() => setListPickerOpen(false)}
        >
          <Pressable
            style={[styles.pickerSheet, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>단어장 고르기</Text>
              <Pressable onPress={() => setListPickerOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={styles.pickerListScroll} showsVerticalScrollIndicator={false}>
              {lists.map((l) => (
                <Pressable
                  key={l.id}
                  onPress={() => handleSelectList(l.id)}
                  style={[
                    styles.pickerOption,
                    {
                      borderColor: selectedListId === l.id ? colors.primary : colors.border,
                      backgroundColor: selectedListId === l.id ? colors.primaryLight : colors.surfaceSecondary,
                    },
                  ]}
                >
                  <Ionicons
                    name={selectedListId === l.id ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={selectedListId === l.id ? colors.primary : colors.textTertiary}
                  />
                  <Text style={[styles.pickerOptionText, { color: colors.text }]} numberOfLines={1}>
                    {l.title}
                  </Text>
                  {!l.isVisible && (
                    <View style={[styles.pickerHiddenBadge, { backgroundColor: colors.surfaceSecondary }]}>
                      <Ionicons name="eye-off-outline" size={12} color={colors.textTertiary} />
                    </View>
                  )}
                </Pressable>
              ))}

              {showNewListInput ? (
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
                    <Text style={{ color: newListName.trim() ? '#FFFFFF' : colors.textTertiary, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>
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
              )}
            </ScrollView>

            <Pressable
              onPress={() => setListPickerOpen(false)}
              style={[styles.pickerCloseBtn, { backgroundColor: colors.surfaceSecondary }]}
            >
              <Text style={[styles.pickerCloseBtnText, { color: colors.text }]}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarCancel: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  topBarTitle: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
  },
  topBarSave: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  inputModeTabBar: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 12,
    marginBottom: 20,
  },
  inputModeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  inputModeTabActive: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  inputModeTabText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  placeholderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 10,
    gap: 16,
  },
  placeholderIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  placeholderTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  placeholderDesc: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 10,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  secondaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    marginTop: 4,
  },
  secondaryActionBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  listSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
    gap: 8,
  },
  listSelectorText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  wordSection: {
    marginBottom: 20,
  },
  wordInput: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    paddingVertical: 12,
    borderBottomWidth: 2,
  },
  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
    gap: 6,
  },
  analyzeBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  tabText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  fieldsContainer: {
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  multilineInput: {
    minHeight: 80,
    paddingTop: 12,
  },
  errorText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  dictionaryContainer: {
    gap: 16,
  },
  dictionaryCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
  },
  dictionaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  dictionaryTitle: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
  },
  dictionaryDesc: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
    marginBottom: 18,
  },
  dictionaryButtons: {
    gap: 10,
  },
  dictBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 10,
    gap: 8,
  },
  dictBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerSheet: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '70%',
    borderRadius: 16,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  pickerTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  pickerListScroll: {
    maxHeight: 300,
    paddingHorizontal: 20,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  pickerOptionText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    flex: 1,
  },
  pickerHiddenBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pickerNewRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  pickerNewInput: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  pickerNewBtn: {
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerCloseBtn: {
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  pickerCloseBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  toastContainer: {
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
});
