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
import WordDetailModal, { WordModalMode } from '@/components/WordDetailModal';

type FilterStatus = 'all' | 'learning' | 'memorized';

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
    deleteWords,
    toggleMemorized,
    refreshData,
    updateWord,
  } = useVocab();

  const [filterStarred, setFilterStarred] = useState<boolean>(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [speakingWordId, setSpeakingWordId] = useState<string | null>(null);

  // Modal State
  const [isWordModalVisible, setWordModalVisible] = useState(false);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<WordModalMode>('read');
  const [refreshing, setRefreshing] = useState(false);

  const list = lists.find(l => l.id === id);
  const allWords = getWordsForList(id!);

  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

  const learningWords = useMemo(() => allWords.filter(w => !w.isMemorized), [allWords]);
  const memorizedWords = useMemo(() => allWords.filter(w => w.isMemorized), [allWords]);
  const starredWords = useMemo(() => allWords.filter(w => w.isStarred), [allWords]);

  const filteredWords = useMemo(() => {
    return allWords.filter(w => {
      if (filterStarred && !w.isStarred) return false;
      if (filterStatus === 'learning' && w.isMemorized) return false;
      if (filterStatus === 'memorized' && !w.isMemorized) return false;
      return true;
    });
  }, [filterStarred, filterStatus, allWords]);

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
    setSelectedWordId(null);
    setModalMode('add');
    setWordModalVisible(true);
  }, []);

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

  const handleCardPress = useCallback((word: Word) => {
    if (editMode) {
      toggleSelection(word.id);
    } else {
      setSelectedWordId(word.id);
      setModalMode('read');
      setWordModalVisible(true);
    }
  }, [editMode, toggleSelection]);

  const handleCardLongPress = useCallback((word: Word) => {
    if (!editMode) {
      enterEditMode(word.id);
    }
  }, [editMode, enterEditMode]);


  const renderWordCard = useCallback(({ item }: { item: Word }) => {
    const isSpeaking = speakingWordId === item.id;
    const isSelected = editMode && selectedIds.has(item.id);
    const borderColor = item.isStarred ? '#FFD700' : (item.isMemorized ? colors.success : colors.primary);

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

          {/* 1. 별표 (가장 왼쪽) - 항상 표시되며 클릭 시 상태 토글 */}
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              Haptics.selectionAsync();
              updateWord(id!, item.id, { isStarred: !item.isStarred });
            }}
            hitSlop={8}
            style={styles.starBtn}
          >
            <Ionicons
              name={item.isStarred ? 'star' : 'star-outline'}
              size={22}
              color={item.isStarred ? '#FFD700' : colors.textTertiary}
            />
          </Pressable>

          {/* 2. 단어와 뜻 (중앙, 왼쪽 정렬) */}
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

          {/* 우측 아이콘 영역 */}
          <View style={styles.cardActions}>
            {/* 3. 스피커 (단어 바로 다음 우측 부분) */}
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

            {/* 4. 학습 상태 (가장 우측) */}
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

  const renderFilterHeader = () => {
    const cycleStatus = () => {
      setFilterStatus(prev => {
        if (prev === 'all') return 'learning';
        if (prev === 'learning') return 'memorized';
        return 'all';
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const toggleStarredFilter = () => {
      setFilterStarred(prev => !prev);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    let statusIconName: React.ComponentProps<typeof Ionicons>['name'] = 'filter-outline';
    let statusIconColor = colors.textTertiary;
    let statusLabel = 'All';

    if (filterStatus === 'learning') {
      statusIconName = 'ellipse-outline'; // Or something that means "in progress"
      statusIconColor = colors.primary;
      statusLabel = 'Learning';
    } else if (filterStatus === 'memorized') {
      statusIconName = 'checkmark-circle';
      statusIconColor = colors.success;
      statusLabel = 'Memorized';
    }

    return (
      <View style={[styles.visualFilterHeader, { borderBottomColor: colors.borderLight }]}>
        <View style={styles.cardContent}>
          {/* Header for Star (Left) */}
          <Pressable
            onPress={toggleStarredFilter}
            hitSlop={8}
            style={styles.starBtn}
          >
            <Ionicons
              name={filterStarred ? 'star' : 'star-outline'}
              size={22}
              color={filterStarred ? '#FFD700' : colors.textTertiary}
            />
          </Pressable>

          {/* Header for Center (Title/Info) */}
          <View style={styles.cardTextArea}>
            <Text style={[styles.filterCenterText, { color: colors.textSecondary }]}>
              {filterStarred ? 'Starred ' : 'All '}({filteredWords.length})
            </Text>
          </View>

          {/* Header for Right Side (Speaker space + Status Filter) */}
          <View style={[styles.cardActions, { minWidth: 60, justifyContent: 'flex-end', paddingRight: 4 }]}>
            {/* Invisible placeholder for speaker alignment, though not strictly necessary if flexbox is used. */}

            <Pressable
              onPress={cycleStatus}
              hitSlop={8}
              style={[styles.memorizeBtn, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}
            >
              <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: statusIconColor, textTransform: 'uppercase' }}>
                {statusLabel}
              </Text>
              <Ionicons
                name={statusIconName}
                size={24}
                color={statusIconColor}
              />
            </Pressable>
          </View>
        </View>
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
            // Map the new filter state to standard strings for study modes if needed, 
            // or pass them separately. For now just pass filterStatus as 'filter' to keep compatibility.
            router.push({ pathname: mode.pathname, params: { id: id!, filter: filterStatus, isStarred: filterStarred ? 'true' : 'false' } });
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
      {renderFilterHeader()}
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
        style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 100 }]}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>

      <WordDetailModal
        visible={isWordModalVisible}
        mode={modalMode}
        listId={id as string}
        wordId={selectedWordId}
        onClose={() => setWordModalVisible(false)}
        onModeChange={(newMode) => setModalMode(newMode)}
      />

      {/* Fixed bottom bar for Study Features */}
      {!editMode && (
        <View style={[styles.bottomBarContainer, { paddingBottom: insets.bottom || 16, backgroundColor: colors.background, borderTopColor: colors.borderLight }]}>
          {renderStudyButtons()}
        </View>
      )}
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
  visualFilterHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    backgroundColor: 'transparent',
  },
  filterCenterText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginLeft: 4,
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
  starBtn: {
    padding: 4,
    marginRight: 4,
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
  bottomBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 10,
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
