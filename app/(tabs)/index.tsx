import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
  Alert,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Modal,
  TextInput,
  PanResponder,
  Animated as RNAnimated,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { VocaList } from '@/lib/types';
import ScrollIndicator from '@/components/ui/ScrollIndicator';

function getRelativeTime(timestamp?: number): string {
  if (!timestamp) return '학습 기록 없음';
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60 * 1000) return '방금 전';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}분 전`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}시간 전`;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days === 1) return '어제';
  return `${days}일 전`;
}

function ProgressBar({ percent, colors }: { percent: number; colors: any }) {
  const animWidth = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    RNAnimated.timing(animWidth, {
      toValue: percent,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [percent]);

  const widthInterpolated = animWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSecondary }]}>
      <RNAnimated.View
        style={[
          styles.progressFill,
          {
            width: widthInterpolated,
            backgroundColor: percent === 100 ? colors.success : colors.primary,
          },
        ]}
      />
    </View>
  );
}

interface StatusBadgeProps {
  type: 'learning' | 'completed' | 'curated';
}

function StatusBadge({ type }: StatusBadgeProps) {
  const { colors } = useTheme();

  const config = {
    learning: { label: '학습 중', text: colors.primary, bg: colors.primaryLight },
    completed: { label: '완료', text: colors.textTertiary, bg: colors.borderLight },
    curated: { label: '모음', text: colors.secondary, bg: colors.secondaryLight },
  };

  const { label, text, bg } = config[type];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {type === 'curated' && (
        <Ionicons name="sparkles" size={10} color={text} style={{ marginRight: 4 }} />
      )}
      <Text style={[styles.badgeText, { color: text }]}>{label}</Text>
    </View>
  );
}

function ListCard({
  item,
  colors,
  isDark,
  getListProgress,
  getWordsForList,
  onOpenMenu,
}: {
  item: VocaList;
  colors: any;
  isDark: boolean;
  getListProgress: (id: string) => { total: number; memorized: number; percent: number };
  getWordsForList: (id: string) => any[];
  onOpenMenu: (list: VocaList, pos: { x: number; y: number; width: number; height: number }) => void;
}) {
  const progress = getListProgress(item.id);
  const relativeTime = getRelativeTime(item.lastStudiedAt);

  const statusType = React.useMemo(() => {
    if (item.isCurated) return 'curated';
    if (progress.percent === 100 && progress.total > 0) return 'completed';
    return 'learning';
  }, [item.isCurated, progress.percent, progress.total]);

  const topTags = React.useMemo(() => {
    const words = getWordsForList(item.id);
    const counts: Record<string, number> = {};
    for (const w of words) {
      if (w.tags) {
        for (const t of w.tags) {
          counts[t] = (counts[t] || 0) + 1;
        }
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(entry => entry[0]);
  }, [item.id, getWordsForList]);

  const handlePress = () => {
    router.push({ pathname: '/list/[id]', params: { id: item.id } });
  };

  const menuBtnRef = useRef<View>(null);

  const handleContextMenu = () => {
    menuBtnRef.current?.measure((x, y, width, height, pageX, pageY) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onOpenMenu(item, { x: pageX, y: pageY, width, height });
    });
  };

  const handleLongPress = () => {
    handleContextMenu();
  };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: isDark ? colors.border : 'rgba(49, 130, 246, 0.1)',
          shadowColor: colors.cardShadow,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <View style={styles.cardTopRow}>
        <View style={styles.cardTitleArea}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {item.icon && (
              <Text style={{ fontSize: 16 }}>{item.icon}</Text>
            )}
            <Text style={[styles.cardTitle, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>
              {item.title}
            </Text>
          </View>
          <Text style={[styles.lastStudied, { color: colors.textTertiary }]}>
            마지막 학습: {relativeTime}
          </Text>
        </View>
        <View style={styles.cardActions}>
          <StatusBadge type={statusType} />
          <Pressable
            ref={menuBtnRef}
            onPress={handleContextMenu}
            hitSlop={8}
            style={({ pressed }) => [
              styles.menuBtn,
              { opacity: pressed ? 0.4 : 0.55 },
            ]}
          >
            <Ionicons name="ellipsis-vertical" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>
      </View>

      <ProgressBar percent={progress.percent} colors={colors} />

      {topTags.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {topTags.map((tag, idx) => (
            <View key={idx} style={{ backgroundColor: colors.surfaceSecondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: 'Pretendard_500Medium' }}>#{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.cardFooter}>
        <Text style={[styles.wordCountText, { color: colors.textSecondary }]}>
          {progress.memorized} / {progress.total} 단어
        </Text>
        <Text
          style={[
            styles.percentText,
            { color: progress.percent === 100 ? colors.success : colors.primary },
          ]}
        >
          {progress.percent}%
        </Text>
      </View>
    </Pressable>
  );
}

interface ManagedList {
  id: string;
  title: string;
  isNew: boolean;
  isVisible: boolean;
}

const MANAGE_ROW_HEIGHT = 46;

function ManageRowItem({
  ml,
  index,
  totalCount,
  colors,
  editingId,
  editingName,
  onChangeEditingName,
  onFinishRename,
  onStartRename,
  onToggleVisibility,
  onDelete,
  onReorder,
}: {
  ml: ManagedList;
  index: number;
  totalCount: number;
  colors: any;
  editingId: string | null;
  editingName: string;
  onChangeEditingName: (t: string) => void;
  onFinishRename: () => void;
  onStartRename: (id: string, title: string) => void;
  onToggleVisibility: (id: string, visible: boolean) => void;
  onDelete: (id: string, isNew: boolean) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const translateY = useRef(new RNAnimated.Value(0)).current;
  const indexRef = useRef(index);
  const totalRef = useRef(totalCount);
  const onReorderRef = useRef(onReorder);
  indexRef.current = index;
  totalRef.current = totalCount;
  onReorderRef.current = onReorder;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 5,
      onPanResponderGrant: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      },
      onPanResponderMove: (_, gs) => {
        translateY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        const positions = Math.round(gs.dy / MANAGE_ROW_HEIGHT);
        RNAnimated.timing(translateY, { toValue: 0, duration: 150, useNativeDriver: false }).start();
        if (positions !== 0) {
          const cur = indexRef.current;
          const next = Math.max(0, Math.min(totalRef.current - 1, cur + positions));
          if (next !== cur) {
            Haptics.selectionAsync();
            onReorderRef.current(cur, next);
          }
        }
      },
      onPanResponderTerminate: () => {
        RNAnimated.timing(translateY, { toValue: 0, duration: 150, useNativeDriver: false }).start();
      },
    })
  ).current;

  return (
    <RNAnimated.View
      style={[
        styles.manageRow,
        {
          transform: [{ translateY }],
          zIndex: 100,
          backgroundColor: ml.isVisible ? colors.primary + '08' : 'transparent',
          borderColor: ml.isVisible ? colors.primary + '40' : colors.borderLight,
          borderWidth: ml.isVisible ? 1.5 : 1,
          borderRadius: 12,
          marginBottom: 6,
        },
      ]}
    >
      <View {...panResponder.panHandlers} style={styles.manageDragHandle}>
        <Ionicons name="reorder-three" size={22} color={colors.textSecondary} />
      </View>

      {editingId === ml.id ? (
        <TextInput
          style={[styles.manageEditInput, { color: colors.text, backgroundColor: colors.surfaceSecondary }]}
          value={editingName}
          onChangeText={onChangeEditingName}
          onBlur={onFinishRename}
          onSubmitEditing={onFinishRename}
          autoFocus
          returnKeyType="done"
          selectTextOnFocus
        />
      ) : (
        <Pressable
          onPress={() => onStartRename(ml.id, ml.title)}
          style={[styles.manageNameArea, !ml.isVisible && { opacity: 0.5 }]}
        >
          <Text style={[styles.manageName, { color: colors.text }]} numberOfLines={1}>
            {ml.title}
          </Text>
          {ml.isNew && (
            <View style={[styles.manageNewBadge, { backgroundColor: colors.successLight }]}>
              <Text style={[styles.manageNewBadgeText, { color: colors.success }]}>새로운</Text>
            </View>
          )}
        </Pressable>
      )}

      <View style={styles.manageRowActions}>
        <Pressable onPress={() => onToggleVisibility(ml.id, ml.isVisible)} hitSlop={6}>
          <Ionicons
            name={ml.isVisible ? 'eye-outline' : 'eye-off-outline'}
            size={18}
            color={ml.isVisible ? colors.primary : colors.textTertiary}
          />
        </Pressable>
        {editingId !== ml.id && (
          <Pressable onPress={() => onStartRename(ml.id, ml.title)} hitSlop={6}>
            <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
          </Pressable>
        )}
        <Pressable onPress={() => onDelete(ml.id, ml.isNew)} hitSlop={6}>
          <Ionicons name="trash-outline" size={18} color={colors.error} />
        </Pressable>
      </View>
    </RNAnimated.View>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme } = useTheme();

  const scrollRef = useRef<FlatList>(null);
  useScrollToTop(scrollRef);
  const scrollY = useRef(new RNAnimated.Value(0)).current;
  const [listContentHeight, setListContentHeight] = useState(0);
  const [listVisibleHeight, setListVisibleHeight] = useState(0);
  const {
    lists,
    loading,
    refreshData,
    createList,
    deleteList,
    toggleVisibility,
    getListProgress,
    getWordsForList,
    renameList,
    mergeLists,
    reorderLists,
    shareList,
  } = useVocab();

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [menuList, setMenuList] = useState<VocaList | null>(null);
  type MenuPos = { x: number; y: number; width: number; height: number };
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const [sharing, setSharing] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [managedLists, setManagedLists] = useState<ManagedList[]>([]);
  const [newListName, setNewListName] = useState('');
  const [duplicateError, setDuplicateError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [renamedMap, setRenamedMap] = useState<Map<string, string>>(new Map());
  const [visibilityMap, setVisibilityMap] = useState<Map<string, boolean>>(new Map());
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameTargetList, setRenameTargetList] = useState<VocaList | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTargetList, setDeleteTargetList] = useState<VocaList | null>(null);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [mergeSourceList, setMergeSourceList] = useState<VocaList | null>(null);

  // FAB 애니메이션 제어 (트리거 방식)
  const fabAnim = useRef(new RNAnimated.Value(0)).current;
  const isTopBtnVisible = useRef(false);

  useEffect(() => {
    const listener = scrollY.addListener(({ value }) => {
      const shouldShow = value > 300;
      if (shouldShow !== isTopBtnVisible.current) {
        isTopBtnVisible.current = shouldShow;
        RNAnimated.spring(fabAnim, {
          toValue: shouldShow ? 1 : 0,
          useNativeDriver: true,
          tension: 60,
          friction: 8,
        }).start();
      }
    });
    return () => scrollY.removeListener(listener);
  }, [scrollY, fabAnim]);

  const topPadding = Platform.OS === 'web' ? insets.top + 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 120 + 34 : 120;
  const visibleLists = lists.filter((l) => l.isVisible);

  const POPUP_WIDTH = 192;
  const POPUP_ESTIMATED_HEIGHT = 250;
  const popupLeft = menuPos
    ? Math.max(8, Math.min(menuPos.x + menuPos.width - POPUP_WIDTH, screenWidth - POPUP_WIDTH - 8))
    : 0;
  const popupTop = menuPos
    ? (menuPos.y + menuPos.height + 4 + POPUP_ESTIMATED_HEIGHT > screenHeight - 40
      ? menuPos.y - POPUP_ESTIMATED_HEIGHT - 4
      : menuPos.y + menuPos.height + 4)
    : 0;

  const handleOpenMenu = useCallback((list: VocaList, pos: { x: number; y: number; width: number; height: number }) => {
    setMenuList(list);
    setMenuPos(pos);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setMenuList(null);
    setMenuPos(null);
  }, []);

  const handleMenuRename = useCallback(() => {
    if (!menuList) return;
    setRenameTargetList(menuList);
    setRenameValue(menuList.title);
    handleCloseMenu();
    setTimeout(() => setRenameModalOpen(true), 100);
  }, [menuList, handleCloseMenu]);

  const handleRenameSubmit = useCallback(async () => {
    if (!renameTargetList) return;
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== renameTargetList.title) {
      try {
        await renameList(renameTargetList.id, trimmed);
      } catch (e: any) {
        if (e?.message === 'DUPLICATE_LIST') {
          Alert.alert('중복된 이름', `"${trimmed}" 단어장이 이미 있습니다. 다른 이름을 사용해 주세요.`);
          return;
        }
      }
    }
    setRenameModalOpen(false);
    setRenameValue('');
    setRenameTargetList(null);
  }, [renameTargetList, renameValue, renameList]);

  const handleMenuShare = useCallback(async () => {
    if (!menuList) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSharing(true);
    try {
      await shareList(menuList.id);
      Alert.alert('공유 완료', `"${menuList.title}" 단어장이 성공적으로 공유되었습니다!`);
    } catch (e: any) {
      Alert.alert('공유 실패', e.message || '단어장을 공유하는 중 오류가 발생했습니다.');
      console.error(e);
    } finally {
      setSharing(false);
      handleCloseMenu();
    }
  }, [menuList, shareList, handleCloseMenu]);

  const handleRenameClose = useCallback(() => {
    setRenameModalOpen(false);
    setRenameValue('');
    setRenameTargetList(null);
  }, []);

  const handleMenuMerge = useCallback(() => {
    if (!menuList) return;
    const targets = lists.filter((l) => l.id !== menuList.id);
    if (targets.length === 0) {
      handleCloseMenu();
      Alert.alert('대상 없음', '단어를 보낼 다른 단어장이 없습니다.');
      return;
    }
    setMergeSourceList(menuList);
    setMergeTargetId(null);
    handleCloseMenu();
    setTimeout(() => setMergeModalOpen(true), 100);
  }, [menuList, lists, handleCloseMenu]);

  const handleMergeSubmit = useCallback(() => {
    if (!mergeSourceList || !mergeTargetId) return;
    mergeLists(mergeSourceList.id, mergeTargetId, false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMergeModalOpen(false);
    setMergeTargetId(null);
    setMergeSourceList(null);
  }, [mergeSourceList, mergeTargetId, mergeLists]);

  const handleMergeClose = useCallback(() => {
    setMergeModalOpen(false);
    setMergeTargetId(null);
    setMergeSourceList(null);
  }, []);

  const handleMenuHide = useCallback(() => {
    if (!menuList) return;
    toggleVisibility(menuList.id);
    handleCloseMenu();
  }, [menuList, toggleVisibility, handleCloseMenu]);

  const handleMenuDelete = useCallback(() => {
    if (!menuList) return;
    setDeleteTargetList(menuList);
    handleCloseMenu();
    setTimeout(() => setDeleteModalOpen(true), 100);
  }, [menuList, handleCloseMenu]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTargetList) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await deleteList(deleteTargetList.id);
    setDeleteModalOpen(false);
    setDeleteTargetList(null);
  }, [deleteTargetList, deleteList]);

  const handleDeleteClose = useCallback(() => {
    setDeleteModalOpen(false);
    setDeleteTargetList(null);
  }, []);

  const openManageModal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setManagedLists(lists.map(l => ({ id: l.id, title: l.title, isNew: false, isVisible: l.isVisible })));
    setDeletedIds(new Set());
    setRenamedMap(new Map());
    setVisibilityMap(new Map());
    setNewListName('');
    setDuplicateError('');
    setEditingId(null);
    setManageOpen(true);
  }, [lists]);

  const closeManageModal = useCallback(() => {
    setManageOpen(false);
    setEditingId(null);
  }, []);

  const handleManageAdd = useCallback(() => {
    const trimmed = newListName.trim();
    if (!trimmed) return;
    const allTitles = managedLists.filter(l => !deletedIds.has(l.id)).map(l => {
      const renamed = renamedMap.get(l.id);
      return (renamed || l.title).trim().toLowerCase();
    });
    if (allTitles.includes(trimmed.toLowerCase())) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setDuplicateError(`"${trimmed}" 단어장이 이미 있습니다.`);
      return;
    }
    setDuplicateError('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const tempId = `new_${Date.now()}`;
    setManagedLists(prev => [{ id: tempId, title: trimmed, isNew: true, isVisible: true }, ...prev]);
    setNewListName('');
  }, [newListName, managedLists, deletedIds, renamedMap]);

  const handleManageToggleVisibility = useCallback((id: string, currentVisible: boolean) => {
    Haptics.selectionAsync();
    setManagedLists(prev => prev.map(l => l.id === id ? { ...l, isVisible: !l.isVisible } : l));
    setVisibilityMap(prev => {
      const next = new Map(prev);
      next.set(id, !currentVisible);
      return next;
    });
  }, []);

  const handleReorderItem = useCallback((fromIndex: number, toIndex: number) => {
    setManagedLists(prev => {
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  }, []);

  const handleManageDelete = useCallback((id: string, isNew: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isNew) {
      setManagedLists(prev => prev.filter(l => l.id !== id));
    } else {
      setDeletedIds(prev => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setManagedLists(prev => prev.filter(l => l.id !== id));
    }
  }, []);

  const handleStartRename = useCallback((id: string, currentTitle: string) => {
    setEditingId(id);
    setEditingName(currentTitle);
  }, []);

  const handleFinishRename = useCallback(() => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (trimmed) {
      const otherTitles = managedLists
        .filter(l => l.id !== editingId && !deletedIds.has(l.id))
        .map(l => {
          const renamed = renamedMap.get(l.id);
          return (renamed || l.title).trim().toLowerCase();
        });
      if (otherTitles.includes(trimmed.toLowerCase())) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setDuplicateError(`"${trimmed}" 단어장이 이미 있습니다.`);
        return;
      }
      setDuplicateError('');
      setManagedLists(prev => prev.map(l => l.id === editingId ? { ...l, title: trimmed } : l));
      const original = lists.find(l => l.id === editingId);
      if (original && original.title !== trimmed) {
        setRenamedMap(prev => {
          const next = new Map(prev);
          next.set(editingId, trimmed);
          return next;
        });
      }
    }
    setEditingId(null);
    setEditingName('');
  }, [editingId, editingName, lists, managedLists, deletedIds, renamedMap]);

  const handleApplyManage = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // If we're currently editing a name, capture it as a pending rename
    const finalRenamedMap = new Map(renamedMap);
    if (editingId) {
      const trimmed = editingName.trim();
      if (trimmed) {
        const original = lists.find(l => l.id === editingId);
        if (original && original.title !== trimmed) {
          finalRenamedMap.set(editingId, trimmed);
        }
      }
    }

    for (const id of deletedIds) {
      await deleteList(id);
    }

    for (const [id, newTitle] of finalRenamedMap) {
      if (!deletedIds.has(id)) {
        await renameList(id, newTitle);
      }
    }

    for (const [id, visible] of visibilityMap) {
      if (!deletedIds.has(id)) {
        const original = lists.find(l => l.id === id);
        if (original && original.isVisible !== visible) {
          await toggleVisibility(id);
        }
      }
    }

    const newIdMap = new Map<string, string>();
    let pendingCreateId: string | null = null;

    // IF there's unsubmitted text in the input box, treat it as a new list
    const trimmedNew = newListName.trim();
    if (trimmedNew) {
      const allTitles = managedLists.filter(l => !deletedIds.has(l.id)).map(l => {
        const renamed = finalRenamedMap.get(l.id);
        return (renamed || l.title).trim().toLowerCase();
      });
      if (!allTitles.includes(trimmedNew.toLowerCase())) {
        const created = await createList(trimmedNew);
        pendingCreateId = created.id;
      }
    }

    for (const ml of managedLists) {
      if (ml.isNew) {
        const created = await createList(ml.title);
        newIdMap.set(ml.id, created.id);
      }
    }

    const finalOrder = managedLists
      .filter(l => !deletedIds.has(l.id))
      .map(l => l.isNew ? newIdMap.get(l.id)! : l.id)
      .filter(Boolean);

    // If an implicit list was created, put it at the top
    if (pendingCreateId) {
      finalOrder.unshift(pendingCreateId);
    }

    if (finalOrder.length > 0) {
      await reorderLists(finalOrder);
    }

    await refreshData();
    setManageOpen(false);
    setNewListName('');
    setEditingId(null);
  }, [managedLists, deletedIds, renamedMap, visibilityMap, lists, deleteList, renameList, toggleVisibility, createList, reorderLists, refreshData, newListName, editingId, editingName]);

  const handleCreateList = useCallback(() => {
    openManageModal();
  }, [openManageModal]);

  const renderItem = useCallback(
    ({ item }: { item: VocaList }) => (
      <ListCard
        item={item}
        colors={colors}
        isDark={isDark}
        getListProgress={getListProgress}
        getWordsForList={getWordsForList}
        onOpenMenu={handleOpenMenu}
      />
    ),
    [colors, getListProgress, getWordsForList, handleOpenMenu]
  );

  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyIconCircle, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="library-outline" size={48} color={colors.primary} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>단어장이 없습니다</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          나만의 단어장을 만들거나{'\n'}모음집에서 단어를 가져와보세요
        </Text>
        <Pressable
          onPress={handleCreateList}
          style={[styles.emptyButton, { backgroundColor: colors.primary }]}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.emptyButtonText}>단어장 만들기</Text>
        </Pressable>
        <Pressable
          onPress={() => router.navigate('/(tabs)/curation')}
          style={styles.emptySecondaryLink}
        >
          <Ionicons name="sparkles-outline" size={14} color={colors.secondary} />
          <Text style={[styles.emptySecondaryText, { color: colors.secondary }]}>
            모음집 구경하기
          </Text>
        </Pressable>
      </View>
    ),
    [colors, handleCreateList]
  );

  const renderFooter = useCallback(() => {
    return null;
  }, []);

  const renderHeader = useCallback(() => {
    return (
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>나의 단어장</Text>
          {visibleLists.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.countBadgeText, { color: colors.primary }]}>
                {visibleLists.length}
              </Text>
            </View>
          )}
        </View>
        <Pressable
          onPress={openManageModal}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
        </Pressable>
      </View>
    );
  }, [visibleLists.length, colors, openManageModal]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greeting, { color: colors.text }]}>
              안녕하세요, <Text style={{ color: colors.primary }}>학습자</Text>
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              스마트 복습 시스템 활성화
            </Text>
          </View>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <Pressable
          onPress={() => router.push('/search-modal')}
          style={({ pressed }) => [
            styles.searchTrigger,
            { backgroundColor: colors.surface, borderColor: colors.borderLight, marginHorizontal: 20, marginBottom: 8 },
            pressed && { opacity: 0.7 }
          ]}
        >
          <Ionicons name="search" size={20} color={colors.textTertiary} />
          <Text style={[styles.searchTriggerText, { color: colors.textTertiary }]}>단어, 뜻, 태그로 통합 검색...</Text>
        </Pressable>
        <FlatList
          ref={scrollRef}
          data={visibleLists}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomPadding },
            visibleLists.length === 0 && styles.listContentEmpty,
          ]}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={refreshData}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
          scrollEnabled={visibleLists.length > 0}
          onScroll={RNAnimated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
          scrollEventThrottle={16}
          onContentSizeChange={(_, h) => setListContentHeight(h)}
          onLayout={(e) => setListVisibleHeight(e.nativeEvent.layout.height)}
        />
        <ScrollIndicator
          scrollY={scrollY}
          contentHeight={listContentHeight}
          visibleHeight={listVisibleHeight}
        />
      </View>

      {visibleLists.length > 0 && (
        <View style={{ position: 'absolute', right: 20, bottom: insets.bottom + 84, alignItems: 'center' }}>
          {/* 단어 추가 버튼 (FAB) */}
          <RNAnimated.View
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
              onPress={() => router.push('/add-word')}
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
          </RNAnimated.View>

          {/* 위로 가기 버튼 */}
          <RNAnimated.View
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
                scrollRef.current?.scrollToOffset({ offset: 0, animated: true });
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
              {Platform.OS === 'ios' && (
                <View style={[StyleSheet.absoluteFill, { borderRadius: 24, overflow: 'hidden' }]}>
                  <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
                </View>
              )}
              <Ionicons name="arrow-up" size={24} color={colors.text} />
            </Pressable>
          </RNAnimated.View>
        </View>
      )}

      <Modal
        visible={menuList !== null}
        transparent
        animationType="fade"
        onRequestClose={handleCloseMenu}
      >
        <Pressable style={styles.popupOverlay} onPress={handleCloseMenu}>
          <View style={[styles.popupMenu, { backgroundColor: colors.surface, top: popupTop, left: popupLeft }]}>
            <Pressable
              onPress={handleMenuRename}
              style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.surfaceSecondary }]}
            >
              <Ionicons name="pencil-outline" size={16} color={colors.text} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>이름 변경</Text>
            </Pressable>

            <Pressable
              onPress={handleMenuMerge}
              style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.surfaceSecondary }]}
            >
              <Ionicons name="albums-outline" size={16} color={colors.text} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>단어장으로 보내기</Text>
            </Pressable>

            <Pressable
              onPress={handleMenuShare}
              disabled={sharing}
              style={({ pressed }) => [styles.menuItem, (pressed || sharing) && { backgroundColor: colors.surfaceSecondary }]}
            >
              {sharing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="share-social-outline" size={16} color={colors.primary} />
              )}
              <Text style={[styles.menuItemText, { color: colors.primary }]}>단어장 공유하기</Text>
            </Pressable>

            <View style={[styles.menuDivider, { backgroundColor: colors.borderLight }]} />

            <Pressable
              onPress={handleMenuHide}
              style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.surfaceSecondary }]}
            >
              <Ionicons name="eye-off-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>숨기기</Text>
            </Pressable>

            <Pressable
              onPress={handleMenuDelete}
              style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.surfaceSecondary }]}
            >
              <Ionicons name="trash-outline" size={16} color={colors.error} />
              <Text style={[styles.menuItemText, { color: colors.error }]}>삭제</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={manageOpen}
        transparent
        animationType="slide"
        onRequestClose={closeManageModal}
      >
        <View style={[styles.manageOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.manageSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.manageHeader}>
              <Text style={[styles.manageTitle, { color: colors.text }]}>나의 단어장 관리</Text>
            </View>

            <View style={[styles.manageAddRow, { borderBottomColor: colors.borderLight }]}>
              <TextInput
                style={[styles.manageAddInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                placeholder="새로운 단어장 이름"
                placeholderTextColor={colors.textTertiary}
                value={newListName}
                onChangeText={(t) => { setNewListName(t); if (duplicateError) setDuplicateError(''); }}
                onSubmitEditing={handleManageAdd}
                returnKeyType="done"
              />
              <Pressable
                onPress={handleManageAdd}
                disabled={!newListName.trim()}
                style={[styles.manageAddBtn, { backgroundColor: newListName.trim() ? colors.primary : colors.surfaceSecondary }]}
              >
                <Ionicons name="add" size={22} color={newListName.trim() ? '#FFFFFF' : colors.textTertiary} />
              </Pressable>
            </View>

            {duplicateError !== '' && (
              <View style={styles.duplicateErrorRow}>
                <Ionicons name="alert-circle" size={16} color={colors.error || '#FF3B30'} />
                <Text style={[styles.duplicateErrorText, { color: colors.error || '#FF3B30' }]}>
                  {duplicateError}
                </Text>
              </View>
            )}

            <ScrollView style={styles.manageListScroll} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
              {managedLists.map((ml, index) => (
                <ManageRowItem
                  key={ml.id}
                  ml={ml}
                  index={index}
                  totalCount={managedLists.length}
                  colors={colors}
                  editingId={editingId}
                  editingName={editingName}
                  onChangeEditingName={setEditingName}
                  onFinishRename={handleFinishRename}
                  onStartRename={handleStartRename}
                  onToggleVisibility={handleManageToggleVisibility}
                  onDelete={handleManageDelete}
                  onReorder={handleReorderItem}
                />
              ))}

              {managedLists.length === 0 && (
                <View style={styles.manageEmpty}>
                  <Text style={[styles.manageEmptyText, { color: colors.textTertiary }]}>
                    단어장이 없습니다. 위에서 추가해 보세요.
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={[styles.manageFooter, { borderTopColor: colors.borderLight }]}>
              <Pressable
                onPress={closeManageModal}
                style={[styles.manageFooterBtn, { backgroundColor: colors.surfaceSecondary }]}
              >
                <Text style={[styles.manageFooterBtnText, { color: colors.text }]}>닫기</Text>
              </Pressable>
              <Pressable
                onPress={handleApplyManage}
                style={[styles.manageFooterBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.manageFooterBtnText, { color: '#FFFFFF' }]}>적용</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={renameModalOpen}
        transparent
        animationType="fade"
        onRequestClose={handleRenameClose}
      >
        <Pressable style={[styles.menuOverlay, { justifyContent: 'center', alignItems: 'center' }]} onPress={handleRenameClose}>
          <Pressable style={[styles.renameSheet, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.menuHeader}>
              <Text style={[styles.menuTitle, { color: colors.text }]}>단어장 이름 변경</Text>
              <Pressable onPress={handleRenameClose} hitSlop={12} style={styles.menuCloseBtn}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>
            <TextInput
              style={[styles.renameInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
              value={renameValue}
              onChangeText={setRenameValue}
              onSubmitEditing={handleRenameSubmit}
              autoFocus
              returnKeyType="done"
              selectTextOnFocus
              placeholder="단어장 이름"
              placeholderTextColor={colors.textTertiary}
            />
            <View style={styles.renameActions}>
              <Pressable
                onPress={handleRenameClose}
                style={[styles.renameBtn, { backgroundColor: colors.surfaceSecondary }]}
              >
                <Text style={[styles.renameBtnText, { color: colors.text }]}>취소</Text>
              </Pressable>
              <Pressable
                onPress={handleRenameSubmit}
                disabled={!renameValue.trim()}
                style={[styles.renameBtn, { backgroundColor: renameValue.trim() ? colors.primary : colors.surfaceSecondary }]}
              >
                <Text style={[styles.renameBtnText, { color: renameValue.trim() ? '#FFFFFF' : colors.textTertiary }]}>변경</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={deleteModalOpen}
        transparent
        animationType="fade"
        onRequestClose={handleDeleteClose}
      >
        <Pressable style={[styles.menuOverlay, { justifyContent: 'center', alignItems: 'center' }]} onPress={handleDeleteClose}>
          <Pressable style={[styles.renameSheet, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.menuHeader}>
              <Text style={[styles.menuTitle, { color: colors.text }]}>단어장 삭제</Text>
              <Pressable onPress={handleDeleteClose} hitSlop={12} style={styles.menuCloseBtn}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={[styles.deleteConfirmText, { color: colors.textSecondary }]}>
              &quot;{deleteTargetList?.title}&quot;을(를) 삭제하시겠습니까?{'\n'}이 작업은 되돌릴 수 없습니다.
            </Text>
            <View style={styles.renameActions}>
              <Pressable
                onPress={handleDeleteClose}
                style={[styles.renameBtn, { backgroundColor: colors.surfaceSecondary }]}
              >
                <Text style={[styles.renameBtnText, { color: colors.text }]}>취소</Text>
              </Pressable>
              <Pressable
                onPress={handleDeleteConfirm}
                style={[styles.renameBtn, { backgroundColor: '#FF3B30' }]}
              >
                <Text style={[styles.renameBtnText, { color: '#FFFFFF' }]}>삭제</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={mergeModalOpen}
        transparent
        animationType="fade"
        onRequestClose={handleMergeClose}
      >
        <Pressable style={[styles.menuOverlay, { justifyContent: 'center', alignItems: 'center' }]} onPress={handleMergeClose}>
          <Pressable style={[styles.mergeSheet, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.menuHeader}>
              <Text style={[styles.menuTitle, { color: colors.text }]}>단어장으로 보내기</Text>
              <Pressable onPress={handleMergeClose} hitSlop={12} style={styles.menuCloseBtn}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={[styles.mergeSubtitle, { color: colors.textSecondary }]}>
              &quot;{mergeSourceList?.title}&quot;에서 다음 단어장으로 보내기:
            </Text>
            <ScrollView style={styles.mergeListScroll} showsVerticalScrollIndicator={false}>
              {lists
                .filter((l) => l.id !== mergeSourceList?.id)
                .map((l) => (
                  <Pressable
                    key={l.id}
                    onPress={() => setMergeTargetId(l.id)}
                    style={[
                      styles.mergeOption,
                      {
                        borderColor: mergeTargetId === l.id ? colors.primary : colors.border,
                        backgroundColor: mergeTargetId === l.id ? colors.primaryLight : colors.surfaceSecondary,
                      },
                    ]}
                  >
                    <View style={styles.mergeOptionRow}>
                      <Ionicons
                        name={mergeTargetId === l.id ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={mergeTargetId === l.id ? colors.primary : colors.textTertiary}
                      />
                      <Text style={[styles.mergeOptionText, { color: colors.text }]} numberOfLines={1}>
                        {l.title}
                      </Text>
                      {!l.isVisible && (
                        <View style={[styles.mergeHiddenBadge, { backgroundColor: colors.surfaceSecondary }]}>
                          <Ionicons name="eye-off-outline" size={12} color={colors.textTertiary} />
                          <Text style={[styles.mergeHiddenText, { color: colors.textTertiary }]}>숨김</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                ))}
            </ScrollView>
            <View style={styles.renameActions}>
              <Pressable
                onPress={handleMergeClose}
                style={[styles.renameBtn, { backgroundColor: colors.surfaceSecondary }]}
              >
                <Text style={[styles.renameBtnText, { color: colors.text }]}>닫기</Text>
              </Pressable>
              <Pressable
                onPress={handleMergeSubmit}
                disabled={!mergeTargetId}
                style={[styles.renameBtn, { backgroundColor: mergeTargetId ? colors.primary : colors.surfaceSecondary }]}
              >
                <Text style={[styles.renameBtnText, { color: mergeTargetId ? '#FFFFFF' : colors.textTertiary }]}>보내기</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 26,
    fontFamily: 'Pretendard_700Bold',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    marginTop: 4,
  },
  themeToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  searchTriggerText: {
    fontSize: 15,
    fontFamily: 'Pretendard_400Regular',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Pretendard_700Bold',
    letterSpacing: -0.3,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
  },
  countBadgeText: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitleArea: {
    flex: 1,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 17,
    fontFamily: 'Pretendard_700Bold',
  },
  lastStudied: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
    marginTop: 4,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'Pretendard_600SemiBold',
  },
  menuBtn: {
    padding: 4,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  wordCountText: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
  },
  percentText: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
  },
  themesSection: {
    marginTop: 16,
    marginBottom: 8,
  },
  themesTitle: {
    fontSize: 18,
    fontFamily: 'Pretendard_600SemiBold',
    marginBottom: 12,
  },
  chipsRow: {
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontFamily: 'Pretendard_500Medium',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
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
    fontSize: 15,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
  },
  emptySecondaryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 16,
    paddingVertical: 4,
  },
  emptySecondaryText: {
    fontSize: 14,
    fontFamily: 'Pretendard_500Medium',
  },
  aiLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  aiLinkText: {
    fontSize: 14,
    fontFamily: 'Pretendard_500Medium',
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
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  popupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  popupMenu: {
    position: 'absolute',
    width: 192,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  menuTitle: {
    fontSize: 18,
    fontFamily: 'Pretendard_700Bold',
    flex: 1,
    marginRight: 12,
  },
  menuCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  menuItemText: {
    fontSize: 14,
    fontFamily: 'Pretendard_500Medium',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 0,
    marginVertical: 2,
  },
  manageOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  manageSheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  manageHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  manageTitle: {
    fontSize: 20,
    fontFamily: 'Pretendard_700Bold',
    textAlign: 'center',
  },
  manageAddRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  manageAddInput: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: 'Pretendard_400Regular',
  },
  manageAddBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  duplicateErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 2,
  },
  duplicateErrorText: {
    fontSize: 13,
    fontFamily: 'Pretendard_500Medium',
  },
  manageListScroll: {
    maxHeight: 340,
    paddingTop: 8,
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 12,
    gap: 8,
    borderWidth: 1,
  },
  manageDragHandle: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  manageNameArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  manageName: {
    fontSize: 15,
    fontFamily: 'Pretendard_500Medium',
    flexShrink: 1,
  },
  manageNewBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  manageNewBadgeText: {
    fontSize: 10,
    fontFamily: 'Pretendard_600SemiBold',
  },
  manageEditInput: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    borderWidth: 0,
    paddingHorizontal: 10,
    fontSize: 15,
    fontFamily: 'Pretendard_500Medium',
  },
  manageRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  manageEmpty: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  manageEmptyText: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
  },
  manageFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  manageFooterBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  manageFooterBtnText: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
  },
  renameSheet: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 16,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  renameInput: {
    marginHorizontal: 20,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: 'Pretendard_400Regular',
  },
  deleteConfirmText: {
    fontSize: 15,
    fontFamily: 'Pretendard_400Regular',
    lineHeight: 22,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  renameActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 16,
  },
  renameBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
  },
  renameBtnText: {
    fontSize: 15,
    fontFamily: 'Pretendard_600SemiBold',
  },
  mergeSheet: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 16,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
    maxHeight: '70%',
  },
  mergeSubtitle: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  mergeListScroll: {
    maxHeight: 280,
    paddingHorizontal: 20,
  },
  mergeOption: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  mergeOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mergeOptionText: {
    fontSize: 15,
    fontFamily: 'Pretendard_500Medium',
    flex: 1,
  },
  mergeHiddenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  mergeHiddenText: {
    fontSize: 10,
    fontFamily: 'Pretendard_500Medium',
  },
});
