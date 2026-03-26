import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { VocaList } from '@/lib/types';

type MenuPos = { x: number; y: number; width: number; height: number };

interface ListContextMenuProps {
  menuList: VocaList | null;
  menuPos: MenuPos | null;
  lists: VocaList[];
  onClose: () => void;
  onRenameList: (id: string, newTitle: string) => Promise<void>;
  onDeleteList: (id: string) => Promise<void>;
  onToggleVisibility: (id: string) => Promise<void>;
  onMergeLists: (sourceId: string, targetId: string, deleteSource: boolean) => Promise<void>;
  onShareList: (listId: string) => Promise<void>;
}

export default function ListContextMenu({
  menuList,
  menuPos,
  lists,
  onClose,
  onRenameList,
  onDeleteList,
  onToggleVisibility,
  onMergeLists,
  onShareList,
}: ListContextMenuProps) {
  const { colors } = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [sharing, setSharing] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameTargetList, setRenameTargetList] = useState<VocaList | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTargetList, setDeleteTargetList] = useState<VocaList | null>(null);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [mergeSourceList, setMergeSourceList] = useState<VocaList | null>(null);

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

  const handleMenuRename = useCallback(() => {
    if (!menuList) return;
    setRenameTargetList(menuList);
    setRenameValue(menuList.title);
    onClose();
    setTimeout(() => setRenameModalOpen(true), 100);
  }, [menuList, onClose]);

  const handleRenameSubmit = useCallback(async () => {
    if (!renameTargetList) return;
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== renameTargetList.title) {
      try {
        await onRenameList(renameTargetList.id, trimmed);
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
  }, [renameTargetList, renameValue, onRenameList]);

  const handleRenameClose = useCallback(() => {
    setRenameModalOpen(false);
    setRenameValue('');
    setRenameTargetList(null);
  }, []);

  const handleMenuShare = useCallback(async () => {
    if (!menuList) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSharing(true);
    try {
      await onShareList(menuList.id);
      Alert.alert('공유 완료', `"${menuList.title}" 단어장이 성공적으로 공유되었습니다!`);
    } catch (e: any) {
      Alert.alert('공유 실패', e.message || '단어장을 공유하는 중 오류가 발생했습니다.');
    } finally {
      setSharing(false);
      onClose();
    }
  }, [menuList, onShareList, onClose]);

  const handleMenuMerge = useCallback(() => {
    if (!menuList) return;
    const targets = lists.filter((l) => l.id !== menuList.id);
    if (targets.length === 0) {
      onClose();
      Alert.alert('대상 없음', '단어를 보낼 다른 단어장이 없습니다.');
      return;
    }
    setMergeSourceList(menuList);
    setMergeTargetId(null);
    onClose();
    setTimeout(() => setMergeModalOpen(true), 100);
  }, [menuList, lists, onClose]);

  const handleMergeSubmit = useCallback(() => {
    if (!mergeSourceList || !mergeTargetId) return;
    onMergeLists(mergeSourceList.id, mergeTargetId, false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMergeModalOpen(false);
    setMergeTargetId(null);
    setMergeSourceList(null);
  }, [mergeSourceList, mergeTargetId, onMergeLists]);

  const handleMergeClose = useCallback(() => {
    setMergeModalOpen(false);
    setMergeTargetId(null);
    setMergeSourceList(null);
  }, []);

  const handleMenuHide = useCallback(() => {
    if (!menuList) return;
    onToggleVisibility(menuList.id);
    onClose();
  }, [menuList, onToggleVisibility, onClose]);

  const handleMenuDelete = useCallback(() => {
    if (!menuList) return;
    setDeleteTargetList(menuList);
    onClose();
    setTimeout(() => setDeleteModalOpen(true), 100);
  }, [menuList, onClose]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTargetList) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await onDeleteList(deleteTargetList.id);
    setDeleteModalOpen(false);
    setDeleteTargetList(null);
  }, [deleteTargetList, onDeleteList]);

  const handleDeleteClose = useCallback(() => {
    setDeleteModalOpen(false);
    setDeleteTargetList(null);
  }, []);

  return (
    <>
      {/* Context Menu Popup */}
      <Modal
        visible={menuList !== null && menuPos !== null}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <Pressable style={styles.popupOverlay} onPress={onClose}>
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

      {/* Rename Modal */}
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

      {/* Delete Confirmation Modal */}
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

      {/* Merge Modal */}
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
    </>
  );
}

const styles = StyleSheet.create({
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
