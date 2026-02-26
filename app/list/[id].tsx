import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Alert,
  Platform,
  StyleSheet,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { speak } from '@/lib/tts';
import { Word } from '@/lib/types';

type FilterTab = 'all' | 'learning' | 'memorized';

interface EditForm {
  term: string;
  meaningKr: string;
  definition: string;
  exampleEn: string;
}

const STUDY_MODES = [
  { key: 'flashcards', icon: 'albums-outline' as const, label: 'Flashcard', pathname: '/flashcards/[id]' as const },
  { key: 'quiz', icon: 'help-circle-outline' as const, label: 'Quiz', pathname: '/quiz/[id]' as const },
  { key: 'examples', icon: 'document-text-outline' as const, label: 'Examples', pathname: '/examples/[id]' as const },
  { key: 'shadowing', icon: 'mic-outline' as const, label: 'Shadowing', pathname: '/shadowing/[id]' as const },
];

export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const {
    lists,
    getWordsForList,
    renameList,
    deleteWord,
    deleteWords,
    toggleMemorized,
    refreshData,
    updateWord,
  } = useVocab();

  const [filter, setFilter] = useState<FilterTab>('all');
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ term: '', meaningKr: '', definition: '', exampleEn: '' });
  const [speakingWordId, setSpeakingWordId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const list = lists.find(l => l.id === id);
  const allWords = getWordsForList(id!);

  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

  const learningWords = useMemo(() => allWords.filter(w => !w.isMemorized), [allWords]);
  const memorizedWords = useMemo(() => allWords.filter(w => w.isMemorized), [allWords]);

  const filteredWords = useMemo(() => {
    if (filter === 'learning') return learningWords;
    if (filter === 'memorized') return memorizedWords;
    return allWords;
  }, [filter, allWords, learningWords, memorizedWords]);

  const progress = useMemo(() => {
    const total = allWords.length;
    const mem = memorizedWords.length;
    return { total, memorized: mem, percent: total > 0 ? Math.round((mem / total) * 100) : 0 };
  }, [allWords, memorizedWords]);

  const studyDisabled = filteredWords.length < 2;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  const handleSpeak = useCallback(async (word: Word) => {
    setSpeakingWordId(word.id);
    await speak(word.term);
    setSpeakingWordId(null);
  }, []);

  const handleEditTitle = useCallback(() => {
    if (!list) return;
    if (Platform.OS === 'web') {
      const newName = prompt('Rename list', list.title);
      if (newName && newName.trim()) {
        renameList(list.id, newName.trim());
      }
    } else {
      Alert.prompt(
        'Rename list',
        '',
        (newName) => {
          if (newName && newName.trim()) {
            renameList(list.id, newName.trim());
          }
        },
        'plain-text',
        list.title
      );
    }
  }, [list, renameList]);

  const handleAddWord = useCallback(() => {
    router.push({ pathname: '/add-word', params: { listId: id! } });
  }, [id]);

  const enterEditMode = useCallback((wordId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEditMode(true);
    setSelectedIds(new Set([wordId]));
  }, []);

  const exitEditMode = useCallback(() => {
    setEditMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelection = useCallback((wordId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(wordId)) {
        next.delete(wordId);
      } else {
        next.add(wordId);
      }
      return next;
    });
  }, []);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    Alert.alert(
      `Delete ${count} ${count === 1 ? 'word' : 'words'}?`,
      'This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await deleteWords(id!, Array.from(selectedIds));
            exitEditMode();
          },
        },
      ]
    );
  }, [selectedIds, id, deleteWords, exitEditMode]);

  const openWordDetail = useCallback((word: Word) => {
    setSelectedWordId(word.id);
    setEditForm({
      term: word.term,
      meaningKr: word.meaningKr,
      definition: word.definition,
      exampleEn: word.exampleEn,
    });
  }, []);

  const closeWordDetail = useCallback(() => {
    setSelectedWordId(null);
    setEditForm({ term: '', meaningKr: '', definition: '', exampleEn: '' });
  }, []);

  const handleSaveWord = useCallback(async () => {
    if (!selectedWordId || !id) return;
    setSaving(true);
    await updateWord(id, selectedWordId, {
      term: editForm.term,
      definition: editForm.definition,
      meaningKr: editForm.meaningKr,
      exampleEn: editForm.exampleEn,
    });
    setSaving(false);
    closeWordDetail();
  }, [selectedWordId, id, editForm, updateWord, closeWordDetail]);

  const handleCardPress = useCallback((word: Word) => {
    if (editMode) {
      toggleSelection(word.id);
    } else {
      openWordDetail(word);
    }
  }, [editMode, toggleSelection, openWordDetail]);

  const handleCardLongPress = useCallback((word: Word) => {
    if (!editMode) {
      enterEditMode(word.id);
    }
  }, [editMode, enterEditMode]);

  const selectedWord = useMemo(() => {
    if (!selectedWordId) return null;
    return allWords.find(w => w.id === selectedWordId) ?? null;
  }, [selectedWordId, allWords]);

  const renderWordCard = useCallback(({ item }: { item: Word }) => {
    const isSpeaking = speakingWordId === item.id;
    const isSelected = editMode && selectedIds.has(item.id);
    const borderColor = item.isMemorized ? colors.success : colors.primary;

    return (
      <Pressable
        onPress={() => handleCardPress(item)}
        onLongPress={() => handleCardLongPress(item)}
        style={[
          styles.card,
          {
            backgroundColor: isSelected ? colors.primaryLight : colors.surface,
            shadowColor: colors.cardShadow,
            borderLeftColor: borderColor,
            borderLeftWidth: 3,
          },
        ]}
      >
        <View style={styles.cardContent}>
          {editMode && (
            <View style={styles.checkboxArea}>
              <Ionicons
                name={isSelected ? 'checkbox' : 'square-outline'}
                size={22}
                color={isSelected ? colors.primary : colors.textTertiary}
              />
            </View>
          )}
          <View style={styles.cardTextArea}>
            <Text
              style={[
                styles.wordText,
                { color: item.isMemorized ? colors.textTertiary : colors.text },
                item.isMemorized && styles.wordTextMemorized,
              ]}
            >
              {item.term}
            </Text>
            <Text style={[styles.meaningText, { color: colors.textSecondary }]}>{item.meaningKr}</Text>
          </View>
          <View style={styles.cardActions}>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                handleSpeak(item);
              }}
              hitSlop={8}
              style={styles.speakerBtn}
            >
              <Ionicons
                name="volume-medium-outline"
                size={22}
                color={isSpeaking ? colors.primary : colors.textSecondary}
              />
            </Pressable>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                Haptics.selectionAsync();
                toggleMemorized(id!, item.id);
              }}
              hitSlop={8}
              style={styles.memorizeBtn}
            >
              <Ionicons
                name={item.isMemorized ? 'checkmark-circle' : 'checkmark-circle-outline'}
                size={24}
                color={item.isMemorized ? colors.success : colors.textTertiary}
              />
            </Pressable>
          </View>
        </View>
      </Pressable>
    );
  }, [speakingWordId, colors, editMode, selectedIds, handleCardPress, handleCardLongPress, handleSpeak, toggleMemorized, id]);

  const renderFilterTabs = () => {
    const tabs: { key: FilterTab; label: string; count: number }[] = [
      { key: 'all', label: 'All', count: allWords.length },
      { key: 'learning', label: 'Learning', count: learningWords.length },
      { key: 'memorized', label: 'Memorized', count: memorizedWords.length },
    ];

    return (
      <View style={[styles.filterRow, { borderBottomColor: colors.borderLight }]}>
        {tabs.map(tab => {
          const active = filter === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setFilter(tab.key)}
              style={[
                styles.filterTab,
                active && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
              ]}
            >
              <Text
                style={[
                  styles.filterTabText,
                  { color: active ? colors.primary : colors.textSecondary },
                  active && styles.filterTabTextActive,
                ]}
              >
                {tab.label} ({tab.count})
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  const renderStudyButtons = () => (
    <View style={[styles.studyRow, { backgroundColor: colors.background }]}>
      {STUDY_MODES.map(mode => (
        <Pressable
          key={mode.key}
          onPress={() => {
            if (studyDisabled) return;
            router.push({ pathname: mode.pathname, params: { id: id!, filter } });
          }}
          style={[styles.studyBtn, studyDisabled && styles.studyBtnDisabled]}
        >
          <View style={[styles.studyIconCircle, { backgroundColor: studyDisabled ? colors.surfaceSecondary : colors.primaryLight }]}>
            <Ionicons name={mode.icon} size={20} color={studyDisabled ? colors.textTertiary : colors.primary} />
          </View>
          <Text style={[styles.studyLabel, { color: studyDisabled ? colors.textTertiary : colors.textSecondary }]}>
            {mode.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const renderListHeader = () => (
    <View>
      {renderFilterTabs()}
      {renderStudyButtons()}
    </View>
  );

  const renderEmpty = useCallback(() => (
    <View style={styles.emptyContainer}>
      <Ionicons name="book-outline" size={64} color={colors.textTertiary} />
      <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No words yet</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
        Tap + to add your first word
      </Text>
    </View>
  ), [colors]);

  if (!list) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text, textAlign: 'center', marginTop: 100, fontFamily: 'Inter_500Medium' }}>
          List not found
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          {editMode ? (
            <Pressable onPress={exitEditMode} hitSlop={12}>
              <Ionicons name="close" size={28} color={colors.text} />
            </Pressable>
          ) : (
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="chevron-back" size={28} color={colors.text} />
            </Pressable>
          )}

          {editMode ? (
            <View style={styles.titlePressable}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>
                {selectedIds.size} Selected
              </Text>
            </View>
          ) : (
            <Pressable onPress={handleEditTitle} style={styles.titlePressable}>
              <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                {list.title}
              </Text>
            </Pressable>
          )}

          {editMode && (
            <Pressable
              onPress={handleBatchDelete}
              hitSlop={12}
              style={{ opacity: selectedIds.size === 0 ? 0.4 : 1 }}
            >
              <Ionicons name="trash-outline" size={24} color={colors.error} />
            </Pressable>
          )}
        </View>

        {!editMode && (
          <View style={styles.progressContainer}>
            <View style={[styles.progressBarBg, { backgroundColor: colors.surfaceSecondary }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: colors.success,
                    width: `${progress.percent}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: colors.textTertiary }]}>
              {progress.memorized}/{progress.total} ({progress.percent}%)
            </Text>
          </View>
        )}
      </View>

      <FlatList
        data={filteredWords}
        keyExtractor={(item) => item.id}
        renderItem={renderWordCard}
        ListHeaderComponent={editMode ? undefined : renderListHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[
          styles.listContent,
          filteredWords.length === 0 && styles.listContentEmpty,
        ]}
        scrollEnabled={filteredWords.length > 0}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      />

      <Pressable
        onPress={handleAddWord}
        style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 24 }]}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>

      <Modal
        visible={selectedWordId !== null}
        transparent
        animationType="fade"
        onRequestClose={closeWordDetail}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]} onPress={closeWordDetail} />
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Text style={[styles.modalWordTitle, { color: colors.text }]} numberOfLines={1}>
                  {editForm.term || selectedWord?.term}
                </Text>
                <Pressable
                  onPress={() => selectedWord && handleSpeak(selectedWord)}
                  hitSlop={8}
                >
                  <Ionicons name="volume-medium-outline" size={24} color={colors.primary} />
                </Pressable>
              </View>
              <Pressable onPress={closeWordDetail} hitSlop={12} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Term</Text>
              <TextInput
                style={[styles.fieldInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                value={editForm.term}
                onChangeText={(t) => setEditForm(prev => ({ ...prev, term: t }))}
                placeholderTextColor={colors.textTertiary}
                placeholder="English word"
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Korean Meaning</Text>
              <TextInput
                style={[styles.fieldInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                value={editForm.meaningKr}
                onChangeText={(t) => setEditForm(prev => ({ ...prev, meaningKr: t }))}
                placeholderTextColor={colors.textTertiary}
                placeholder="Korean meaning"
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Definition</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldInputMulti, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                value={editForm.definition}
                onChangeText={(t) => setEditForm(prev => ({ ...prev, definition: t }))}
                placeholderTextColor={colors.textTertiary}
                placeholder="English definition"
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Example Sentence</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldInputMulti, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                value={editForm.exampleEn}
                onChangeText={(t) => setEditForm(prev => ({ ...prev, exampleEn: t }))}
                placeholderTextColor={colors.textTertiary}
                placeholder="Example sentence in English"
                multiline
                numberOfLines={3}
              />
            </ScrollView>

            <Pressable
              onPress={handleSaveWord}
              style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titlePressable: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  progressContainer: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    minWidth: 70,
    textAlign: 'right',
  },
  filterRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  filterTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterTabText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  filterTabTextActive: {
    fontFamily: 'Inter_600SemiBold',
  },
  studyRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 20,
  },
  studyBtn: {
    alignItems: 'center',
    gap: 6,
  },
  studyBtnDisabled: {
    opacity: 0.5,
  },
  studyIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studyLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    borderRadius: 12,
    marginBottom: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  cardContent: {
    flexDirection: 'row',
    padding: 14,
    gap: 12,
    alignItems: 'center',
  },
  checkboxArea: {
    justifyContent: 'center',
  },
  cardTextArea: {
    flex: 1,
    gap: 4,
  },
  wordText: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
  },
  wordTextMemorized: {
    textDecorationLine: 'line-through',
  },
  meaningText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  speakerBtn: {
    justifyContent: 'center',
    padding: 4,
  },
  memorizeBtn: {
    justifyContent: 'center',
    padding: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    width: '90%',
    maxWidth: 420,
    borderRadius: 16,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  modalTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: 8,
  },
  modalWordTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    flexShrink: 1,
  },
  modalCloseBtn: {
    padding: 2,
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 14,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  fieldInputMulti: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  saveBtn: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
});
