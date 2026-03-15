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
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { speak } from '@/lib/tts';
import { Word } from '@/lib/types';
import { BlurView } from 'expo-blur';
import WordDetailModal, { WordModalMode } from '@/components/WordDetailModal';

type FilterStatus = 'all' | 'learning' | 'memorized';

const STUDY_MODES = [
  { key: 'flashcards', icon: 'layers-outline' as const, label: '카드 학습', pathname: '/flashcards/[id]' as const },
  { key: 'quiz', icon: 'create-outline' as const, label: '퀴즈', pathname: '/quiz/[id]' as const },
  { key: 'examples', icon: 'chatbubbles-outline' as const, label: '예문 학습', pathname: '/examples/[id]' as const },
];

export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const {
    lists,
    getWordsForList,
    renameList,
    deleteWords,
    toggleMemorized,
    toggleStarred,
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
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              Haptics.selectionAsync();
              toggleStarred(id!, item.id);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.starBtn}
            activeOpacity={0.6}
          >
            <Ionicons
              name={item.isStarred ? 'star' : 'star-outline'}
              size={22}
              color={item.isStarred ? '#FFD700' : colors.textTertiary}
            />
          </TouchableOpacity>

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
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                Haptics.selectionAsync();
                toggleMemorized(id!, item.id);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.memorizeBtn}
              activeOpacity={0.6}
            >
              <Ionicons
                name={item.isMemorized ? 'checkmark-circle' : 'checkmark-circle-outline'}
                size={24}
                color={item.isMemorized ? colors.success : colors.textTertiary}
              />
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    );
  }, [speakingWordId, colors, editMode, selectedIds, handleCardPress, handleCardLongPress, handleSpeak, toggleMemorized, toggleStarred, id]);

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
        <View style={styles.filterContent}>
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
              <Text style={{ fontSize: 11, fontFamily: 'Pretendard_600SemiBold', color: statusIconColor, textTransform: 'uppercase' }}>
                {statusLabel}
              </Text>
              <Ionicons
                name={statusIconName}
                size={20}
                color={statusIconColor}
              />
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  const renderStudyButtons = () => {
    const iconColor = isDark ? "#6B7684" : "#6B7684";
    const activeColor = isDark ? "#4B96FF" : "#3182F6";

    return (
      <View style={styles.studyRow}>
        <Pressable
          onPress={() => {
            if (studyDisabled) return;
            router.push({ pathname: '/flashcards/[id]', params: { id: id!, filter: filterStatus, isStarred: filterStarred ? 'true' : 'false' } });
          }}
          style={({ pressed }) => [
            styles.studyBtn,
            studyDisabled && styles.studyBtnDisabled,
            pressed && { opacity: 0.7 }
          ]}
        >
          <View style={styles.iconBox}>
            <View style={{ position: 'relative', width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="card-outline" size={22} color={iconColor} />
              <View style={{ position: 'absolute', right: -2, bottom: -2, backgroundColor: isDark ? "#1E1F21" : "#F8F9FA", borderRadius: 6 }}>
                <Ionicons name="sync" size={10} color={iconColor} />
              </View>
            </View>
          </View>
          <Text style={[styles.studyLabel, { color: iconColor }]}>카드학습</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            if (studyDisabled) return;
            router.push({ pathname: '/quiz/[id]', params: { id: id!, filter: filterStatus, isStarred: filterStarred ? 'true' : 'false' } });
          }}
          style={({ pressed }) => [
            styles.studyBtn,
            studyDisabled && styles.studyBtnDisabled,
            pressed && { opacity: 0.7 }
          ]}
        >
          <View style={styles.iconBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: iconColor, fontWeight: '600' }}>?</Text>
              <Ionicons name="checkmark" size={14} color={iconColor} style={{ marginLeft: -2, marginTop: 4 }} />
            </View>
          </View>
          <Text style={[styles.studyLabel, { color: iconColor }]}>단어퀴즈</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            if (studyDisabled) return;
            router.push({ pathname: '/examples/[id]', params: { id: id!, filter: filterStatus, isStarred: filterStarred ? 'true' : 'false' } });
          }}
          style={({ pressed }) => [
            styles.studyBtn,
            studyDisabled && styles.studyBtnDisabled,
            pressed && { opacity: 0.7 }
          ]}
        >
          <View style={styles.iconBox}>
            <View style={{ gap: 2, alignItems: 'center' }}>
              <View style={{ width: 14, height: 1.5, backgroundColor: iconColor }} />
              <View style={{ width: 14, height: 1.5, backgroundColor: iconColor }} />
              <Text style={{ fontSize: 8, color: iconColor, marginTop: -2, fontWeight: '900' }}>___</Text>
            </View>
          </View>
          <Text style={[styles.studyLabel, { color: iconColor }]}>문장완성</Text>
        </Pressable>
      </View>
    );
  };

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
        <Text style={{ color: colors.text, textAlign: 'center', marginTop: 100, fontFamily: 'Pretendard_500Medium' }}>
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
          {!editMode && (
            <Pressable
              onPress={() => router.push({ pathname: '/autoplay/[id]' as const, params: { id: id!, filter: filterStatus, isStarred: filterStarred ? 'true' : 'false' } })}
              hitSlop={12}
              style={{ marginLeft: 'auto' }}
            >
              <Ionicons name="play-circle" size={28} color={colors.primary} />
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
          { paddingBottom: insets.bottom + 140 },
          filteredWords.length === 0 && styles.listContentEmpty,
        ]}
        scrollEnabled={filteredWords.length > 0}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      />

      <Pressable
        onPress={handleAddWord}
        style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 84 }]}
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
        <View style={[styles.bottomBarContainer, {
          backgroundColor: isDark ? "rgba(30, 31, 33, 0.85)" : "rgba(180, 200, 220, 0.75)",
          bottom: 0,
          height: 64 + insets.bottom,
          paddingBottom: insets.bottom,
          borderTopColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
          borderTopWidth: 0.5,
          overflow: 'hidden',
        }]}>
          <BlurView
            intensity={80}
            tint={isDark ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
          />
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
    fontFamily: 'Pretendard_700Bold',
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
    fontFamily: 'Pretendard_500Medium',
    minWidth: 70,
    textAlign: 'right',
  },
  visualFilterHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 2,
    backgroundColor: 'transparent',
  },
  filterContent: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 12,
    alignItems: 'center',
  },
  filterCenterText: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
    marginLeft: 4,
  },
  studyRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 0,
    height: 64,
    alignItems: 'center',
  },
  studyBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studyBtnDisabled: {
    opacity: 0.5,
  },
  iconBox: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studyLabel: {
    fontSize: 12,
    fontFamily: 'Pretendard_600SemiBold',
    marginTop: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  card: {
    borderRadius: 20,
    marginBottom: 12,
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
    fontFamily: 'Pretendard_700Bold',
  },
  wordTextMemorized: {
    textDecorationLine: 'line-through',
  },
  meaningText: {
    fontSize: 14,
    fontFamily: 'Pretendard_500Medium',
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Pretendard_600SemiBold',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
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
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 20,
    justifyContent: 'center',
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
    borderRadius: 20,
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
    fontFamily: 'Pretendard_700Bold',
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
    fontFamily: 'Pretendard_600SemiBold',
    marginTop: 14,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: 'Pretendard_400Regular',
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
    fontFamily: 'Pretendard_600SemiBold',
  },
});
