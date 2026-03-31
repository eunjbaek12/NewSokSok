import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  PanResponder,
  Animated,
} from 'react-native';
import ModalOverlay from './ui/ModalOverlay';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { VocaList } from '@/lib/types';

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
  const { t } = useTranslation();
  const translateY = useRef(new Animated.Value(0)).current;
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
        Animated.timing(translateY, { toValue: 0, duration: 150, useNativeDriver: false }).start();
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
        Animated.timing(translateY, { toValue: 0, duration: 150, useNativeDriver: false }).start();
      },
    })
  ).current;

  return (
    <Animated.View
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
              <Text style={[styles.manageNewBadgeText, { color: colors.success }]}>{t('manage.newLabel')}</Text>
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
    </Animated.View>
  );
}

interface ManageModalProps {
  visible: boolean;
  onClose: () => void;
  lists: VocaList[];
  createList: (title: string) => Promise<VocaList>;
  deleteList: (id: string) => Promise<void>;
  renameList: (id: string, newTitle: string) => Promise<void>;
  toggleVisibility: (id: string) => Promise<void>;
  reorderLists: (orderedIds: string[]) => Promise<void>;
  refreshData: () => Promise<void>;
}

export default function ManageModal({
  visible,
  onClose,
  lists,
  createList,
  deleteList,
  renameList,
  toggleVisibility,
  reorderLists,
  refreshData,
}: ManageModalProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [managedLists, setManagedLists] = useState<ManagedList[]>([]);
  const [newListName, setNewListName] = useState('');
  const [duplicateError, setDuplicateError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [renamedMap, setRenamedMap] = useState<Map<string, string>>(new Map());
  const [visibilityMap, setVisibilityMap] = useState<Map<string, boolean>>(new Map());

  React.useEffect(() => {
    if (visible) {
      setManagedLists(lists.map(l => ({ id: l.id, title: l.title, isNew: false, isVisible: l.isVisible })));
      setDeletedIds(new Set());
      setRenamedMap(new Map());
      setVisibilityMap(new Map());
      setNewListName('');
      setDuplicateError('');
      setEditingId(null);
    }
  }, [visible, lists]);

  const handleManageAdd = useCallback(() => {
    const trimmed = newListName.trim();
    if (!trimmed) return;
    const allTitles = managedLists.filter(l => !deletedIds.has(l.id)).map(l => {
      const renamed = renamedMap.get(l.id);
      return (renamed || l.title).trim().toLowerCase();
    });
    if (allTitles.includes(trimmed.toLowerCase())) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setDuplicateError(t('manage.duplicateMessage', { name: trimmed }));
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
        setDuplicateError(t('manage.duplicateMessage', { name: trimmed }));
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

    for (const [id, vis] of visibilityMap) {
      if (!deletedIds.has(id)) {
        const original = lists.find(l => l.id === id);
        if (original && original.isVisible !== vis) {
          await toggleVisibility(id);
        }
      }
    }

    const newIdMap = new Map<string, string>();
    let pendingCreateId: string | null = null;

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

    if (pendingCreateId) {
      finalOrder.unshift(pendingCreateId);
    }

    if (finalOrder.length > 0) {
      await reorderLists(finalOrder);
    }

    await refreshData();
    onClose();
    setNewListName('');
    setEditingId(null);
  }, [managedLists, deletedIds, renamedMap, visibilityMap, lists, deleteList, renameList, toggleVisibility, createList, reorderLists, refreshData, newListName, editingId, editingName, onClose]);

  return (
    <ModalOverlay
      visible={visible}
      onClose={onClose}
      variant="dialog"
      maxHeight="80%"
    >
          <View style={styles.manageHeader}>
            <Text style={[styles.manageTitle, { color: colors.text }]}>{t('manage.title')}</Text>
          </View>

          <View style={[styles.manageAddRow, { borderBottomColor: colors.borderLight }]}>
            <TextInput
              style={[styles.manageAddInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
              placeholder={t('manage.newListPlaceholder')}
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
                  {t('manage.emptyMessage')}
                </Text>
              </View>
            )}
          </ScrollView>

          <View style={[styles.manageFooter, { borderTopColor: colors.borderLight }]}>
            <Pressable
              onPress={onClose}
              style={[styles.manageFooterBtn, { backgroundColor: colors.surfaceSecondary }]}
            >
              <Text style={[styles.manageFooterBtnText, { color: colors.text }]}>{t('common.close')}</Text>
            </Pressable>
            <Pressable
              onPress={handleApplyManage}
              style={[styles.manageFooterBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.manageFooterBtnText, { color: '#FFFFFF' }]}>{t('common.apply')}</Text>
            </Pressable>
          </View>
    </ModalOverlay>
  );
}

const styles = StyleSheet.create({
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
});
