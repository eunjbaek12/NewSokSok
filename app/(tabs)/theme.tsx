import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Platform,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { generateThemeWords, isGeminiAvailable } from '@/lib/translation-api';
import { AIWordResult } from '@/lib/types';

const CHIP_BATCHES = [
  ['Travel English', 'IT Interview', 'Business Email', 'Medical Terms', 'K-Pop Fandom'],
  ['Yoga Poses', 'Startup Lingo', 'Cooking Verbs', 'Hotel Check-in', 'Dating Phrases'],
];

const DIFFICULTIES = [
  { key: 'Beginner', label: '초급' },
  { key: 'Intermediate', label: '중급' },
  { key: 'Advanced', label: '고급' },
];
const WORD_COUNTS = [20, 30, 40, 50, 60, 70, 80, 90, 100];

const NEW_LIST_ID = '__new__';

export default function ThemeTabScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { lists, createList, addBatchWords } = useVocab();

  const [theme, setTheme] = useState('');
  const [results, setResults] = useState<AIWordResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [chipBatch, setChipBatch] = useState(0);
  const [difficulty, setDifficulty] = useState('Intermediate');
  const [wordCount, setWordCount] = useState(20);
  const [hasGemini, setHasGemini] = useState(false);
  const [targetListId, setTargetListId] = useState(NEW_LIST_ID);
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 84 + 34 : 84;

  useEffect(() => {
    isGeminiAvailable().then(setHasGemini);
  }, []);

  const selectedList = useMemo(() => {
    if (targetListId === NEW_LIST_ID) return null;
    return lists.find(l => l.id === targetListId) || null;
  }, [targetListId, lists]);

  const existingWordsForDedup = useMemo(() => {
    if (!selectedList) return [];
    return selectedList.words.map(w => w.term);
  }, [selectedList]);

  const targetLabel = useMemo(() => {
    if (targetListId === NEW_LIST_ID) return '새 단어장 생성';
    const found = lists.find(l => l.id === targetListId);
    return found ? found.title : '새 단어장 생성';
  }, [targetListId, lists]);

  const handleGenerate = useCallback(async () => {
    const trimmed = theme.trim();
    if (!trimmed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setResults([]);
    try {
      const words = await generateThemeWords(trimmed, difficulty, wordCount, existingWordsForDedup);
      if (words.length === 0) {
        Alert.alert('No Results', 'No words found for this theme. Try a different topic.');
      }
      setResults(words);
    } catch {
      Alert.alert('Error', 'Failed to generate words. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [theme, difficulty, wordCount, existingWordsForDedup]);

  const handleSave = useCallback(async () => {
    if (results.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      let savedName = '';
      let savedListId = '';
      if (targetListId === NEW_LIST_ID) {
        const trimmed = theme.trim();
        savedName = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
        const newList = await createList(savedName);
        await addBatchWords(newList.id, results);
        savedListId = newList.id;
      } else {
        savedName = targetLabel;
        savedListId = targetListId;
        await addBatchWords(targetListId, results);
      }
      setResults([]);
      setTheme('');
      setSaving(false);
      router.replace('/');
      setTimeout(() => {
        router.push({ pathname: '/list/[id]', params: { id: savedListId } });
      }, 50);
    } catch (e: any) {
      if (e?.message === 'DUPLICATE_LIST') {
        Alert.alert('중복된 이름', '같은 이름의 단어장이 이미 있습니다. 기존 단어장을 선택하거나 다른 테마를 입력해 주세요.');
      } else {
        Alert.alert('Error', 'Failed to save the list. Please try again.');
      }
      setSaving(false);
    }
  }, [results, theme, targetListId, targetLabel, createList, addBatchWords]);

  const handleRefreshChips = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setChipBatch((prev) => (prev === 0 ? 1 : 0));
  }, []);

  const handleChipPress = useCallback((label: string) => {
    Haptics.selectionAsync();
    setTheme(label);
  }, []);

  const handleBack = useCallback(() => {
    setResults([]);
  }, []);

  const renderWordCard = useCallback(
    ({ item }: { item: AIWordResult }) => (
      <View
        style={[
          styles.wordCard,
          { backgroundColor: colors.surface, shadowColor: colors.cardShadow },
        ]}
      >
        <Text style={[styles.wordTerm, { color: colors.text }]}>{item.term}</Text>
        <Text style={[styles.wordDefinition, { color: colors.textSecondary }]}>
          {item.definition}
        </Text>
        <Text style={[styles.wordMeaning, { color: colors.primary }]}>{item.meaningKr}</Text>
      </View>
    ),
    [colors],
  );

  const showResults = results.length > 0;
  const disabled = loading || !theme.trim();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        {showResults ? (
          <Pressable onPress={handleBack} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
        ) : (
          <View style={{ width: 26 }} />
        )}
        <Text style={[styles.headerTitle, { color: colors.text }]}>AI Theme Generator</Text>
        <View style={{ width: 26 }} />
      </View>

      {!showResults && !loading && (
        <ScrollView
          style={styles.scrollBody}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + 20 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heroSection}>
            <View style={[styles.heroIconWrap, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="sparkles" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.heroTitle, { color: colors.text }]}>
              What do you want to learn?
            </Text>
            <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
              Enter a topic, and AI will create a custom vocabulary list just for you.
            </Text>
          </View>

          <View style={styles.inputSection}>
            <View
              style={[
                styles.inputContainer,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Ionicons name="search-outline" size={20} color={colors.textTertiary} />
              <TextInput
                style={[styles.textInput, { color: colors.text }]}
                placeholder="Enter a theme (e.g., food, travel)"
                placeholderTextColor={colors.textTertiary}
                value={theme}
                onChangeText={setTheme}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={handleGenerate}
                editable={!loading}
              />
            </View>
          </View>

          <View style={styles.optionsSection}>
            <Text style={[styles.optionLabel, { color: colors.textSecondary }]}>난이도</Text>
            <View style={styles.optionRow}>
              {DIFFICULTIES.map((d) => (
                <Pressable
                  key={d.key}
                  onPress={() => { Haptics.selectionAsync(); setDifficulty(d.key); }}
                  style={[
                    styles.optionChip,
                    {
                      backgroundColor: difficulty === d.key ? colors.primary : colors.surfaceSecondary,
                      borderColor: difficulty === d.key ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      { color: difficulty === d.key ? '#FFFFFF' : colors.text },
                    ]}
                  >
                    {d.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.optionLabel, { color: colors.textSecondary, marginTop: 16 }]}>
              단어 수
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.optionRow}>
                {WORD_COUNTS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => { Haptics.selectionAsync(); setWordCount(c); }}
                    style={[
                      styles.optionChip,
                      {
                        backgroundColor: wordCount === c ? colors.accent : colors.surfaceSecondary,
                        borderColor: wordCount === c ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionChipText,
                        { color: wordCount === c ? '#FFFFFF' : colors.text },
                      ]}
                    >
                      {c}개
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={[styles.optionLabel, { color: colors.textSecondary, marginTop: 16 }]}>
              저장할 단어장
            </Text>
            <Pressable
              onPress={() => setListPickerOpen(true)}
              style={[
                styles.listPickerBtn,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Ionicons
                name={targetListId === NEW_LIST_ID ? 'add-circle-outline' : 'book-outline'}
                size={20}
                color={colors.primary}
              />
              <Text style={[styles.listPickerBtnText, { color: colors.text }]} numberOfLines={1}>
                {targetLabel}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.textTertiary} />
            </Pressable>
            {selectedList && selectedList.words.length > 0 && (
              <Text style={[styles.dedupNote, { color: colors.textSecondary }]}>
                기존 {selectedList.words.length}개 단어와 중복 없이 생성됩니다
              </Text>
            )}
          </View>

          <View style={styles.generateSection}>
            <Pressable
              onPress={handleGenerate}
              disabled={disabled}
              style={[
                styles.generateBtn,
                { backgroundColor: disabled ? colors.surfaceSecondary : colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.generateBtnText,
                  { color: disabled ? colors.textTertiary : '#FFFFFF' },
                ]}
              >
                단어 생성하기
              </Text>
            </Pressable>
          </View>

          <View style={styles.chipsSection}>
            <View style={styles.chipsSectionHeader}>
              <Text style={[styles.chipsSectionTitle, { color: colors.text }]}>Popular Themes</Text>
              <Pressable onPress={handleRefreshChips} hitSlop={8}>
                <Ionicons name="refresh" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <View style={styles.chipsWrap}>
              {CHIP_BATCHES[chipBatch].map((label) => (
                <Pressable
                  key={label}
                  onPress={() => handleChipPress(label)}
                  style={[
                    styles.chip,
                    { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.chipText, { color: colors.text }]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {loading && (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            {wordCount}개 단어를 찾고 있습니다...
          </Text>
        </View>
      )}

      {showResults && (
        <FlatList
          data={results}
          renderItem={renderWordCard}
          keyExtractor={(item, index) => `${item.term}-${index}`}
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomInset + 80 }]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={results.length > 0}
          ListHeaderComponent={
            <Text style={[styles.resultCount, { color: colors.textSecondary }]}>
              {results.length}개 단어 생성됨
            </Text>
          }
        />
      )}

      {showResults && (
        <View style={[styles.saveBar, { paddingBottom: bottomInset + 8 }]}>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>
                  {targetListId === NEW_LIST_ID
                    ? '새 단어장으로 저장'
                    : `"${targetLabel}"에 추가`}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}

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
          <View style={[styles.pickerContainer, { backgroundColor: colors.surface }]}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>저장할 단어장 선택</Text>
            <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setTargetListId(NEW_LIST_ID);
                  setListPickerOpen(false);
                }}
                style={[styles.pickerItem, { borderBottomColor: colors.border }]}
              >
                <Ionicons
                  name={targetListId === NEW_LIST_ID ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={targetListId === NEW_LIST_ID ? colors.primary : colors.textTertiary}
                />
                <View style={styles.pickerItemContent}>
                  <Text style={[styles.pickerItemTitle, { color: colors.text }]}>새 단어장 생성</Text>
                  <Text style={[styles.pickerItemSub, { color: colors.textSecondary }]}>
                    테마 이름으로 새 단어장을 만듭니다
                  </Text>
                </View>
              </Pressable>
              {lists.map((list) => (
                <Pressable
                  key={list.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setTargetListId(list.id);
                    setListPickerOpen(false);
                  }}
                  style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                >
                  <Ionicons
                    name={targetListId === list.id ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={targetListId === list.id ? colors.primary : colors.textTertiary}
                  />
                  <View style={styles.pickerItemContent}>
                    <Text style={[styles.pickerItemTitle, { color: colors.text }]}>{list.title}</Text>
                    <Text style={[styles.pickerItemSub, { color: colors.textSecondary }]}>
                      {list.words.length}개 단어
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              onPress={() => setListPickerOpen(false)}
              style={[styles.pickerCloseBtn, { backgroundColor: colors.surfaceSecondary }]}
            >
              <Text style={[styles.pickerCloseBtnText, { color: colors.text }]}>닫기</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  scrollBody: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  heroSection: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 10,
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  heroTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  heroSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  inputSection: { paddingHorizontal: 16, paddingBottom: 16 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    gap: 10,
    height: 50,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    height: '100%',
  },
  optionsSection: { paddingHorizontal: 16, paddingBottom: 16 },
  optionLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  optionRow: { flexDirection: 'row' as const, gap: 8 },
  optionChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  optionChipText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  listPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  listPickerBtnText: { flex: 1, fontSize: 15, fontFamily: 'Inter_500Medium' },
  dedupNote: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 6,
    paddingLeft: 4,
  },
  generateSection: { paddingHorizontal: 16, paddingBottom: 20 },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  generateBtnText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  chipsSection: { paddingHorizontal: 16, gap: 12 },
  chipsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipsSectionTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  resultCount: { fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 8 },
  listContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  wordCard: {
    borderRadius: 14,
    padding: 16,
    gap: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  wordTerm: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  wordDefinition: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  wordMeaning: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  saveBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingTop: 12 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
  },
  saveBtnText: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  toastContainer: {
    position: 'absolute',
    top: 120,
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
  toastText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pickerContainer: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
    borderRadius: 16,
    padding: 20,
  },
  pickerTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', marginBottom: 16 },
  pickerScroll: { maxHeight: 300 },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerItemContent: { flex: 1, gap: 2 },
  pickerItemTitle: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  pickerItemSub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  pickerCloseBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  pickerCloseBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
