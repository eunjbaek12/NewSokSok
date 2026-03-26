import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
  BackHandler,
  Animated,
} from 'react-native';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { speak } from '@/lib/tts';
import { Word } from '@/lib/types';
import { computePlanStatus, groupWordsByDay } from '@/lib/plan-engine';
import { BlurView } from 'expo-blur';
import { ModalPicker, PickerOption } from '@/components/ui/ModalPicker';
import { Snackbar } from '@/components/ui/Snackbar';
import FastScrollHandle from '@/components/ui/FastScrollHandle';

type FilterStatus = 'all' | 'learning' | 'memorized';
type SortOrder = 'newest' | 'az' | 'za' | 'wrong';

const STUDY_MODES = [
  { key: 'flashcards', icon: 'layers-outline' as const, label: '카드 학습', pathname: '/flashcards/[id]' as const },
  { key: 'quiz', icon: 'create-outline' as const, label: '퀴즈', pathname: '/quiz/[id]' as const },
  { key: 'examples', icon: 'chatbubbles-outline' as const, label: '예문 학습', pathname: '/examples/[id]' as const },
];

export default function ListDetailScreen() {
  const { id, day: initialDay } = useLocalSearchParams<{ id: string; day?: string }>();
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
    addBatchWords,
    updateWord,
    copyWords,
    moveWords,
  } = useVocab();

  // Snackbar & Undo State
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarActionLabel, setSnackbarActionLabel] = useState<string | undefined>(undefined);
  const [lastAction, setLastAction] = useState<{
    type: 'delete' | 'move' | 'copy';
    wordIds: string[];
    backupWords?: any[];
    sourceListId?: string;
    targetListId?: string;
    targetListName?: string;
  } | null>(null);

  const [filterStarred, setFilterStarred] = useState<boolean>(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [speakingWordId, setSpeakingWordId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Initialize selectedDay from route param
  useEffect(() => {
    if (initialDay) setSelectedDay(parseInt(initialDay, 10));
  }, []);

  // Modal State
  const [refreshing, setRefreshing] = useState(false);

  // Scroll indicator + fast scroll handle
  const flatListRef = useRef<FlatList>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [listContentHeight, setListContentHeight] = useState(0);
  const [listVisibleHeight, setListVisibleHeight] = useState(0);

  // Copy/Move State
  const [isPickerVisible, setPickerVisible] = useState(false);
  const [pickerMode, setPickerMode] = useState<'copy' | 'move'>('copy');

  const list = lists.find(l => l.id === id);
  const allWords = getWordsForList(id!);
  const navigation = useNavigation();

  const planStatus = useMemo(
    () => list ? computePlanStatus(list, allWords, Date.now()) : 'none',
    [list, allWords]
  );
  const hasPlan = planStatus !== 'none';
  const daySections = useMemo(() => groupWordsByDay(allWords), [allWords]);

  // FAB 애니메이션 제어 (트리거 방식)
  const fabAnim = useRef(new Animated.Value(0)).current;
  const isTopBtnVisible = useRef(false);

  useEffect(() => {
    const listener = scrollY.addListener(({ value }) => {
      const shouldShow = value > 300;
      if (shouldShow !== isTopBtnVisible.current) {
        isTopBtnVisible.current = shouldShow;
        Animated.spring(fabAnim, {
          toValue: shouldShow ? 1 : 0,
          useNativeDriver: true,
          tension: 60,
          friction: 8,
        }).start();
      }
    });
    return () => scrollY.removeListener(listener);
  }, [scrollY, fabAnim]);

  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

  const learningWords = useMemo(() => allWords.filter(w => !w.isMemorized), [allWords]);

  const memorizedWords = useMemo(() => allWords.filter(w => w.isMemorized), [allWords]);
  const starredWords = useMemo(() => allWords.filter(w => w.isStarred), [allWords]);

  const filteredWords = useMemo(() => {
    const filtered = allWords.filter(w => {
      if (filterStarred && !w.isStarred) return false;
      if (filterStatus === 'learning' && w.isMemorized) return false;
      if (filterStatus === 'memorized' && !w.isMemorized) return false;
      if (selectedDay !== null && w.assignedDay !== selectedDay) return false;
      return true;
    });

    const sorted = [...filtered];
    if (sortOrder === 'az') {
      sorted.sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));
    } else if (sortOrder === 'za') {
      sorted.sort((a, b) => b.term.localeCompare(a.term, 'en', { sensitivity: 'base' }));
    } else if (sortOrder === 'wrong') {
      sorted.sort((a, b) => (b.wrongCount ?? 0) - (a.wrongCount ?? 0));
    } else {
      sorted.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    }
    return sorted;
  }, [filterStarred, filterStatus, sortOrder, allWords, selectedDay]);

  const progress = useMemo(() => {
    const total = allWords.length;
    const mem = memorizedWords.length;
    return { total, memorized: mem, percent: total > 0 ? Math.round((mem / total) * 100) : 0 };
  }, [allWords, memorizedWords]);

  const studyDisabled = filteredWords.length < 2;

  /** Returns a display label for the item at the given index (for FastScrollHandle bubble) */
  const getSectionLabel = useCallback((itemIndex: number): string => {
    const word = filteredWords[Math.min(itemIndex, filteredWords.length - 1)];
    if (!word) return '';
    if (sortOrder === 'az' || sortOrder === 'za') {
      return word.term[0]?.toUpperCase() ?? '#';
    }
    if (sortOrder === 'wrong') {
      const count = word.wrongCount ?? 0;
      return count > 0 ? `×${count}` : '정답';
    }
    // newest by createdAt
    const ts = word.createdAt || word.updatedAt || 0;
    if (!ts) return '날짜 없음';
    const d = new Date(ts);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  }, [filteredWords, sortOrder]);

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
      const newName = prompt('단어장 이름 변경', list.title);
      if (newName && newName.trim()) {
        renameList(list.id, newName.trim());
      }
    } else {
      Alert.prompt(
        '단어장 이름 변경',
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
    router.push({ pathname: '/add-word', params: { listId: id } });
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

  useEffect(() => {
    // Android hardware back button handler
    const onBackPress = () => {
      if (editMode) {
        exitEditMode();
        return true;
      }
      return false;
    };

    // iOS/General navigation handler (swipe back, etc.)
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (editMode) {
        e.preventDefault();
        exitEditMode();
      }
    });

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);

    return () => {
      backHandler.remove();
      unsubscribe();
    };
  }, [navigation, editMode, exitEditMode]);

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

  const toggleSelectAll = useCallback(() => {
    const allFilteredVisibleAreSelected = filteredWords.every(w => selectedIds.has(w.id));
    if (allFilteredVisibleAreSelected) {
      // 모든 필터링된 단어가 선택되어 있다면 -> 모두 해제
      setSelectedIds(new Set());
    } else {
      // 그렇지 않다면 -> 현재 필터링된 모든 단어를 선택
      setSelectedIds(new Set(filteredWords.map(w => w.id)));
    }
    Haptics.selectionAsync();
  }, [filteredWords, selectedIds]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const wordIds = Array.from(selectedIds);
    const backupWords = allWords.filter(w => wordIds.includes(w.id));

    Alert.alert(
      `선택한 ${count}개의 단어를 삭제하시겠습니까?`,
      '이 작업은 되돌릴 수 있지만, 다시 추가하는 방식으로 복구됩니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await deleteWords(id!, wordIds);

            setLastAction({
              type: 'delete',
              wordIds,
              backupWords,
              sourceListId: id,
            });
            setSnackbarMessage(`${count}개의 단어가 삭제되었습니다.`);
            setSnackbarActionLabel('실행 취소');
            setSnackbarVisible(true);

            exitEditMode();
          },
        },
      ]
    );
  }, [selectedIds, id, deleteWords, exitEditMode, allWords]);

  const handleCopyPress = useCallback(() => {
    if (selectedIds.size === 0) return;
    setPickerMode('copy');
    setPickerVisible(true);
  }, [selectedIds]);

  const handleMovePress = useCallback(() => {
    if (selectedIds.size === 0) return;
    setPickerMode('move');
    setPickerVisible(true);
  }, [selectedIds]);

  const handleListSelect = useCallback(async (targetListId: string) => {
    setPickerVisible(false);
    const wordIds = Array.from(selectedIds);
    const targetList = lists.find(l => l.id === targetListId);
    const count = wordIds.length;

    if (pickerMode === 'copy') {
      await copyWords(targetListId, wordIds);
      setLastAction({
        type: 'copy',
        wordIds,
        targetListId,
        targetListName: targetList?.title,
      });
      setSnackbarMessage(`${count}개의 단어가 ${targetList?.title}로 복사되었습니다.`);
      setSnackbarActionLabel(undefined); // Copy undo is complex (ids change)
    } else {
      await moveWords(targetListId, wordIds);
      setLastAction({
        type: 'move',
        wordIds,
        sourceListId: id,
        targetListId,
        targetListName: targetList?.title,
      });
      setSnackbarMessage(`${count}개의 단어가 ${targetList?.title}로 이동되었습니다.`);
      setSnackbarActionLabel('실행 취소');
    }

    setSnackbarVisible(true);
    exitEditMode();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [pickerMode, selectedIds, copyWords, moveWords, exitEditMode, lists, id]);

  const handleUndo = useCallback(async () => {
    if (!lastAction) return;

    try {
      if (lastAction.type === 'delete' && lastAction.backupWords && lastAction.sourceListId) {
        await addBatchWords(lastAction.sourceListId, lastAction.backupWords);
        setSnackbarMessage('삭제가 취소되어 단어들이 복구되었습니다.');
      } else if (lastAction.type === 'move' && lastAction.sourceListId && lastAction.wordIds) {
        await moveWords(lastAction.sourceListId, lastAction.wordIds);
        setSnackbarMessage('이동이 취소되어 단어들이 원래 단어장으로 돌아왔습니다.');
      }

      setSnackbarActionLabel(undefined);
      setSnackbarVisible(true);
      setLastAction(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('오류', '실행 취소 중 문제가 발생했습니다.');
    }
  }, [lastAction, addBatchWords, moveWords]);

  const pickerOptions = useMemo((): PickerOption[] => {
    return lists
      .filter(l => l.id !== id)
      .map(l => ({
        id: l.id,
        title: l.title,
        subtitle: `${l.words.length} words`,
        icon: 'book-outline'
      }));
  }, [lists, id]);

  const handleCardPress = useCallback((word: Word) => {
    if (editMode) {
      toggleSelection(word.id);
    } else {
      router.push({ pathname: '/add-word', params: { listId: id, wordId: word.id } });
    }
  }, [editMode, toggleSelection, id]);

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
            {/* 오답 횟수 배지 */}
            {(item.wrongCount ?? 0) > 0 && (
              <View style={[styles.wrongBadge, { backgroundColor: colors.errorLight }]}>
                <Text style={[styles.wrongBadgeText, { color: colors.error }]}>
                  ×{item.wrongCount}
                </Text>
              </View>
            )}

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

  const renderDayTabs = () => {
    if (!hasPlan) return null;
    return (
      <View style={[styles.dayTabBar, { borderBottomColor: colors.borderLight }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayTabBarContent}
        >
          <Pressable
            onPress={() => { setSelectedDay(null); Haptics.selectionAsync(); }}
            style={[
              styles.dayTab,
              { backgroundColor: selectedDay === null ? colors.primary : colors.surfaceSecondary },
            ]}
          >
            <Text style={[styles.dayTabText, {
              color: selectedDay === null ? '#FFFFFF' : colors.textSecondary,
            }]}>전체</Text>
          </Pressable>
          {daySections.filter(s => s.day > 0).map(section => {
            const isActive = selectedDay === section.day;
            const dayMem = section.data.filter(w => w.isMemorized).length;
            return (
              <Pressable
                key={section.day}
                onPress={() => { setSelectedDay(section.day); Haptics.selectionAsync(); }}
                style={[
                  styles.dayTab,
                  { backgroundColor: isActive ? colors.primary : colors.surfaceSecondary },
                ]}
              >
                <Text style={[styles.dayTabText, {
                  color: isActive ? '#FFFFFF' : colors.textSecondary,
                }]}>Day {section.day}</Text>
                {!isActive && (
                  <Text style={[styles.dayTabCount, { color: colors.textTertiary }]}>
                    {dayMem}/{section.data.length}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const renderFilterHeader = () => {
    if (editMode) {
      const allSelected = filteredWords.length > 0 && filteredWords.every(w => selectedIds.has(w.id));
      return (
        <View style={[styles.visualFilterHeader, { borderBottomColor: colors.borderLight }]}>
          <Pressable
            onPress={toggleSelectAll}
            style={styles.filterContent}
          >
            {/* 전체 선택 체크박스 (별표 필터 위치) */}
            <View style={styles.starBtn}>
              <Ionicons
                name={allSelected ? 'checkbox' : 'square-outline'}
                size={22}
                color={allSelected ? colors.primary : colors.textTertiary}
              />
            </View>

            {/* 전체 선택 텍스트 (중앙 제목 위치) */}
            <View style={styles.cardTextArea}>
              <Text style={[styles.filterCenterText, { color: colors.textSecondary }]}>
                전체 선택 ({selectedIds.size}/{filteredWords.length})
              </Text>
            </View>

            {/* 우측 보정용 공간 (상태 필터 위치) */}
            <View style={[styles.cardActions, { minWidth: 60, justifyContent: 'flex-end', paddingRight: 4 }]}>
              {/* 비워둠: 높이 및 균형 유지 */}
            </View>
          </Pressable>
        </View>
      );
    }

    const cycleStatus = () => {
      setFilterStatus(prev => {
        if (prev === 'all') return 'learning';
        if (prev === 'learning') return 'memorized';
        return 'all';
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const cycleSort = () => {
      setSortOrder(prev =>
        prev === 'newest' ? 'az' : prev === 'az' ? 'za' : prev === 'za' ? 'wrong' : 'newest'
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const sortLabel =
      sortOrder === 'az' ? '사전순' :
      sortOrder === 'za' ? '역순' :
      sortOrder === 'wrong' ? '오답순' : '최신순';
    const sortIconName: React.ComponentProps<typeof Ionicons>['name'] =
      sortOrder === 'az' ? 'arrow-down-outline' :
      sortOrder === 'za' ? 'arrow-up-outline' :
      sortOrder === 'wrong' ? 'alert-circle-outline' : 'time-outline';
    const sortIsActive = sortOrder !== 'newest';

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

          {/* Header for Center (Sort Toggle) */}
          <Pressable
            onPress={cycleSort}
            hitSlop={8}
            style={[styles.cardTextArea, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}
          >
            <Ionicons name={sortIconName} size={13} color={sortIsActive ? colors.primary : colors.textSecondary} />
            <Text style={[styles.filterCenterText, { color: sortIsActive ? colors.primary : colors.textSecondary }]}>
              {sortLabel} ({filteredWords.length})
            </Text>
          </Pressable>

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
      <View style={[styles.emptyIconCircle, { backgroundColor: colors.primaryLight }]}>
        <Ionicons name="book-outline" size={40} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>아직 단어가 없어요</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        단어를 추가하면 플래시카드, 퀴즈, 문장 완성으로{'\n'}학습할 수 있어요
      </Text>
      <Pressable
        onPress={handleAddWord}
        style={[styles.emptyButton, { backgroundColor: colors.primary }]}
      >
        <Ionicons name="add" size={18} color="#FFFFFF" />
        <Text style={styles.emptyButtonText}>첫 단어 추가하기</Text>
      </Pressable>
    </View>
  ), [colors, handleAddWord]);

  if (!list) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text, textAlign: 'center', marginTop: 100, fontFamily: 'Pretendard_500Medium' }}>
          단어장을 찾을 수 없습니다
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Pressable
                onPress={handleCopyPress}
                hitSlop={12}
                style={{ opacity: selectedIds.size === 0 ? 0.4 : 1 }}
              >
                <Ionicons name="copy-outline" size={24} color={colors.primary} />
              </Pressable>
              <Pressable
                onPress={handleMovePress}
                hitSlop={12}
                style={{ opacity: selectedIds.size === 0 ? 0.4 : 1 }}
              >
                <Ionicons name="git-branch-outline" size={24} color={colors.primary} />
              </Pressable>
              <Pressable
                onPress={handleBatchDelete}
                hitSlop={12}
                style={{ opacity: selectedIds.size === 0 ? 0.4 : 1 }}
              >
                <Ionicons name="trash-outline" size={24} color={colors.error} />
              </Pressable>
            </View>
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

        <View
          style={[styles.progressContainer, { opacity: editMode ? 0 : 1 }]}
          pointerEvents={editMode ? 'none' : 'auto'}
        >
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
      </View>

      <View style={{ flex: 1 }}>
        {renderDayTabs()}
        <FlatList
          ref={flatListRef}
          data={filteredWords}
          keyExtractor={(item) => item.id}
          renderItem={renderWordCard}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 100 },
            filteredWords.length === 0 && styles.listContentEmpty,
          ]}
          scrollEnabled={filteredWords.length > 0}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
          scrollEventThrottle={16}
          onContentSizeChange={(_, h) => setListContentHeight(h)}
          onLayout={(e) => setListVisibleHeight(e.nativeEvent.layout.height)}
        />
        <FastScrollHandle
          scrollY={scrollY}
          contentHeight={listContentHeight}
          visibleHeight={listVisibleHeight}
          itemCount={filteredWords.length}
          getSectionLabel={getSectionLabel}
          onScrollTo={(offset) => flatListRef.current?.scrollToOffset({ offset, animated: false })}
        />
      </View>

      {!editMode && (
        <View style={{ position: 'absolute', right: 20, bottom: insets.bottom + 80, alignItems: 'center' }}>
          {/* 단어 추가 버튼 (FAB) */}
          <Animated.View
            style={{
              transform: [{
                translateY: fabAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -64],
                })
              }],
              zIndex: 2,
            }}
          >
            <Pressable
              onPress={handleAddWord}
              style={({ pressed }) => [
                styles.fab,
                {
                  position: 'relative',
                  right: 0,
                  bottom: 0,
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Ionicons name="add" size={28} color="#FFFFFF" />
            </Pressable>
          </Animated.View>

          {/* 위로 가기 버튼 */}
          <Animated.View
            style={{
              position: 'absolute',
              bottom: 0,
              opacity: fabAnim,
              transform: [{
                scale: fabAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.7, 1],
                })
              }],
              zIndex: 1,
            }}
            pointerEvents="box-none"
          >
            <Pressable
              onPress={() => {
                flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={({ pressed }) => [
                styles.fab,
                {
                  position: 'relative',
                  right: 0,
                  bottom: 0,
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.9)',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                  opacity: pressed ? 0.7 : 1,
                  shadowOpacity: 0.15,
                },
              ]}
            >
              <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
              <Ionicons name="arrow-up" size={24} color={colors.text} />
            </Pressable>
          </Animated.View>
        </View>
      )}

      <ModalPicker
        visible={isPickerVisible}
        onClose={() => setPickerVisible(false)}
        title={pickerMode === 'copy' ? '단어 복사' : '단어 이동'}
        options={pickerOptions}
        onSelect={handleListSelect}
      />

      {/* Fixed bottom bar for Study Features */}
      {!editMode && (
        <View style={[styles.bottomBarContainer, {
          backgroundColor: isDark ? "rgba(30, 31, 33, 0.95)" : "rgba(255, 255, 255, 0.95)",
          bottom: 0,
          left: 0,
          right: 0,
          height: 64 + insets.bottom,
          borderTopWidth: 0.5,
          borderTopColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
          paddingBottom: insets.bottom,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 8,
        }]}>
          <BlurView
            intensity={80}
            tint={isDark ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
          />
          {renderStudyButtons()}
        </View>
      )}

      <Snackbar
        visible={snackbarVisible}
        message={snackbarMessage}
        actionLabel={snackbarActionLabel}
        onAction={handleUndo}
        onDismiss={() => setSnackbarVisible(false)}
        topOffset={insets.top + (Platform.OS === 'ios' ? 10 : 20)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 0,
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
  dayTabBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayTabBarContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  dayTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dayTabText: {
    fontSize: 13,
    fontFamily: 'Pretendard_500Medium',
  },
  dayTabCount: {
    fontSize: 11,
    fontFamily: 'Pretendard_400Regular',
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
    fontFamily: 'Pretendard_700Bold',
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
    borderRadius: 12,
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
  wrongBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wrongBadgeText: {
    fontSize: 11,
    fontFamily: 'Pretendard_600SemiBold',
  },
  memorizeBtn: {
    justifyContent: 'center',
    padding: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 60,
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'Pretendard_600SemiBold',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Pretendard_600SemiBold',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
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
