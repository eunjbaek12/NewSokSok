import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, Platform, ScrollView, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useThemeGenerator } from '@/hooks/useThemeGenerator';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { ModalPicker, PickerOption } from '@/components/ui/ModalPicker';
import { AIWordResult } from '@/lib/types';
import { useVocab } from '@/contexts/VocabContext';

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

export default function ThemeGeneratorScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { lists } = useVocab();
  const { initialTheme } = useLocalSearchParams<{ initialTheme?: string }>();

  const {
    theme, setTheme,
    difficulty, setDifficulty,
    wordCount, setWordCount,
    targetListId, setTargetListId,
    results, selectedList,
    handleGenerate,
    handleSaveTheme,
    isPendingGen,
    isPendingSave,
    NEW_LIST_ID,
  } = useThemeGenerator(initialTheme);

  const [chipBatch, setChipBatch] = useState(0);
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

  const targetLabel = targetListId === NEW_LIST_ID ? '새 단어장 생성' : (selectedList?.title || '새 단어장 생성');

  const onSave = () => {
    handleSaveTheme(() => {
      router.dismissAll();
    });
  };

  const handleRefreshChips = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setChipBatch((prev) => (prev === 0 ? 1 : 0));
  }, []);

  const handleChipPress = useCallback((label: string) => {
    Haptics.selectionAsync();
    setTheme(label);
  }, [setTheme]);

  const renderWordCard = useCallback(({ item }: { item: AIWordResult }) => (
    <Card style={styles.wordCard}>
      <Text style={[styles.wordTerm, { color: colors.text }]}>{item.term}</Text>
      <Text style={[styles.wordDefinition, { color: colors.textSecondary }]}>{item.definition}</Text>
      <Text style={[styles.wordMeaning, { color: colors.primary }]}>{item.meaningKr}</Text>
    </Card>
  ), [colors]);

  const showResults = results.length > 0;
  const disabled = isPendingGen || !theme.trim();

  const pickerOptions: PickerOption[] = [
    {
      id: NEW_LIST_ID,
      title: '새 단어장 생성',
      subtitle: '테마 이름으로 새 단어장을 만듭니다',
    },
    ...lists.map(list => ({
      id: list.id,
      title: list.title,
      subtitle: `${list.words.length}개 단어`,
    }))
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>AI Theme Generator</Text>
        <View style={{ width: 26 }} />
      </View>

      {!showResults && !isPendingGen && (
        <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.heroSection}>
            <View style={[styles.heroIconWrap, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="sparkles" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.heroTitle, { color: colors.text }]}>What do you want to learn?</Text>
            <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>Enter a topic, and AI will create a custom vocabulary list just for you.</Text>
          </View>

          <View style={styles.inputSection}>
            <Input
              leftIcon="search-outline"
              placeholder="Enter a theme (e.g., food, travel)"
              value={theme}
              onChangeText={setTheme}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleGenerate}
              editable={!isPendingGen}
              containerStyle={{ marginBottom: 16 }}
            />
          </View>

          <View style={styles.optionsSection}>
            <Text style={[styles.optionLabel, { color: colors.textSecondary }]}>난이도</Text>
            <View style={styles.optionRow}>
              {DIFFICULTIES.map((d) => (
                <Pressable
                  key={d.key}
                  onPress={() => { Haptics.selectionAsync(); setDifficulty(d.key); }}
                  style={[styles.optionChip, { backgroundColor: difficulty === d.key ? colors.primary : colors.surfaceSecondary, borderColor: difficulty === d.key ? colors.primary : colors.border }]}
                >
                  <Text style={[styles.optionChipText, { color: difficulty === d.key ? '#FFFFFF' : colors.text }]}>{d.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.optionLabel, { color: colors.textSecondary, marginTop: 16 }]}>단어 수</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.countScroll}>
              <View style={styles.optionRow}>
                {WORD_COUNTS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => { Haptics.selectionAsync(); setWordCount(c); }}
                    style={[styles.optionChip, { backgroundColor: wordCount === c ? colors.accent : colors.surfaceSecondary, borderColor: wordCount === c ? colors.accent : colors.border }]}
                  >
                    <Text style={[styles.optionChipText, { color: wordCount === c ? '#FFFFFF' : colors.text }]}>{c}개</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={[styles.optionLabel, { color: colors.textSecondary, marginTop: 16 }]}>저장할 단어장</Text>
            <Pressable onPress={() => setListPickerOpen(true)} style={[styles.listPickerBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name={targetListId === NEW_LIST_ID ? 'add-circle-outline' : 'book-outline'} size={20} color={colors.primary} />
              <Text style={[styles.listPickerBtnText, { color: colors.text }]} numberOfLines={1}>{targetLabel}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.textTertiary} />
            </Pressable>
            {selectedList && selectedList.words.length > 0 && (
              <Text style={[styles.dedupNote, { color: colors.textSecondary }]}>기존 {selectedList.words.length}개 단어와 중복 없이 생성됩니다</Text>
            )}
          </View>

          <View style={styles.generateSection}>
            <Button
              onPress={handleGenerate}
              disabled={disabled}
              loading={isPendingGen}
              title="단어 생성하기"
              variant="primary"
              style={{ paddingVertical: 14 }}
            />
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
                  style={[styles.chip, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                >
                  <Text style={[styles.chipText, { color: colors.text }]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {isPendingGen && (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{wordCount}개 단어를 찾고 있습니다...</Text>
        </View>
      )}

      {showResults && (
        <FlatList
          data={results}
          renderItem={renderWordCard}
          keyExtractor={(item, index) => `${item.term}-${index}`}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={[styles.resultCount, { color: colors.textSecondary }]}>{results.length}개 단어 생성됨</Text>
          }
        />
      )}

      {showResults && (
        <View style={[styles.saveBar, { paddingBottom: insets.bottom + 20 }]}>
          <Button
            onPress={onSave}
            loading={isPendingSave}
            disabled={isPendingSave}
            icon="add-circle-outline"
            title={targetListId === NEW_LIST_ID ? '새 단어장으로 저장' : `"${targetLabel}"에 추가`}
            style={{ paddingVertical: 16 }}
          />
        </View>
      )}

      <ModalPicker
        visible={listPickerOpen}
        onClose={() => setListPickerOpen(false)}
        title="저장할 단어장 선택"
        options={pickerOptions}
        selectedValue={targetListId}
        onSelect={(id) => {
          Haptics.selectionAsync();
          setTargetListId(id);
          setListPickerOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  scrollBody: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  heroSection: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 16, paddingBottom: 20, gap: 10 },
  heroIconWrap: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  heroTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  heroSubtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  inputSection: { paddingHorizontal: 16 },
  optionsSection: { paddingHorizontal: 16, paddingBottom: 16 },
  optionLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  optionRow: { flexDirection: 'row', gap: 8 },
  optionChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  optionChipText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  countScroll: { marginBottom: 0 },
  listPickerBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  listPickerBtnText: { flex: 1, fontSize: 15, fontFamily: 'Inter_500Medium' },
  dedupNote: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 6, paddingLeft: 4 },
  generateSection: { paddingHorizontal: 16, paddingBottom: 20 },
  chipsSection: { paddingHorizontal: 16, gap: 12 },
  chipsSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chipsSectionTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  resultCount: { fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 8 },
  listContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  wordCard: { gap: 6 },
  wordTerm: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  wordDefinition: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  wordMeaning: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  saveBar: { paddingHorizontal: 24, paddingTop: 12 },
});
