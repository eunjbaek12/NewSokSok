import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
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
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { VocaList } from '@/lib/types';
import { getLanguageFlag, getLanguageLabel } from '@/constants/languages';
import { PopupTokens } from '@/constants/popup';
import ModalOverlay from './ui/ModalOverlay';
import DialogModal from './ui/DialogModal';
import ConfirmDialog from './ui/ConfirmDialog';

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
  onShareList: (listId: string, options?: { force?: boolean; updateId?: string; description?: string }) => Promise<void>;
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
  const { t } = useTranslation();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareTargetList, setShareTargetList] = useState<VocaList | null>(null);
  const [shareDescription, setShareDescription] = useState('');
  const [shareSubmitting, setShareSubmitting] = useState(false);
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
          Alert.alert(t('contextMenu.duplicateName'), t('contextMenu.duplicateNameMessage', { name: trimmed }));
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

  const handleMenuShare = useCallback(() => {
    if (!menuList) return;
    setShareTargetList(menuList);
    setShareDescription('');
    onClose();
    setTimeout(() => setShareModalOpen(true), 100);
  }, [menuList, onClose]);

  const handleShareSubmit = useCallback(async () => {
    if (!shareTargetList) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShareSubmitting(true);
    const desc = shareDescription.trim() || undefined;
    try {
      await onShareList(shareTargetList.id, { description: desc });
      setShareModalOpen(false);
      Alert.alert(t('contextMenu.shareSuccess'), t('contextMenu.shareSuccessMessage', { name: shareTargetList.title }));
    } catch (e: any) {
      setShareModalOpen(false);
      if (e.message === 'DUPLICATE_SHARE') {
        const captured = shareTargetList;
        Alert.alert(
          t('contextMenu.alreadyShared'),
          t('contextMenu.alreadySharedMessage', { name: captured.title }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('contextMenu.createNew'),
              onPress: async () => {
                try {
                  await onShareList(captured.id, { force: true, description: desc });
                  Alert.alert(t('contextMenu.shareSuccess'), t('contextMenu.newShareCreated'));
                } catch (err: any) {
                  Alert.alert(t('contextMenu.shareFailed'), err.message || t('common.error'));
                }
              },
            },
            {
              text: t('common.update'),
              style: 'default',
              onPress: async () => {
                try {
                  await onShareList(captured.id, { updateId: e.existingId, description: desc });
                  Alert.alert(t('contextMenu.updateComplete'), t('contextMenu.updateCompleteMessage'));
                } catch (err: any) {
                  Alert.alert(t('contextMenu.updateFailed'), err.message || t('common.error'));
                }
              },
            },
          ],
        );
      } else {
        Alert.alert(t('contextMenu.shareFailed'), e.message || t('contextMenu.shareError'));
      }
    } finally {
      setShareSubmitting(false);
    }
  }, [shareTargetList, shareDescription, onShareList, t]);

  const handleShareClose = useCallback(() => {
    setShareModalOpen(false);
    setShareDescription('');
    setShareTargetList(null);
  }, []);

  const handleMenuMerge = useCallback(() => {
    if (!menuList) return;
    const targets = lists.filter((l) => l.id !== menuList.id);
    if (targets.length === 0) {
      onClose();
      Alert.alert(t('contextMenu.noTarget'), t('contextMenu.noTargetMessage'));
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
    setDeleteTargetList(null);
  }, [deleteTargetList, onDeleteList]);

  const handleDeleteClose = useCallback(() => {
    setDeleteModalOpen(false);
    setDeleteTargetList(null);
  }, []);

  const btn = PopupTokens.button.standard;

  return (
    <>
      {/* Context Menu Popup */}
      <ModalOverlay
        visible={menuList !== null && menuPos !== null}
        onClose={onClose}
        variant="contextMenu"
        style={{ position: 'absolute', top: popupTop, left: popupLeft }}
      >
        <Pressable
          onPress={handleMenuRename}
          style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.surfaceSecondary }]}
        >
          <Ionicons name="pencil-outline" size={16} color={colors.text} />
          <Text style={[styles.menuItemText, { color: colors.text }]}>{t('contextMenu.rename')}</Text>
        </Pressable>

        <Pressable
          onPress={handleMenuMerge}
          style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.surfaceSecondary }]}
        >
          <Ionicons name="albums-outline" size={16} color={colors.text} />
          <Text style={[styles.menuItemText, { color: colors.text }]}>{t('contextMenu.sendToList')}</Text>
        </Pressable>

        <Pressable
          onPress={handleMenuShare}
          style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.surfaceSecondary }]}
        >
          <Ionicons name="share-social-outline" size={16} color={colors.primary} />
          <Text style={[styles.menuItemText, { color: colors.primary }]}>{t('contextMenu.share')}</Text>
        </Pressable>

        <View style={[styles.menuDivider, { backgroundColor: colors.borderLight }]} />

        <Pressable
          onPress={handleMenuHide}
          style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.surfaceSecondary }]}
        >
          <Ionicons name="eye-off-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.menuItemText, { color: colors.text }]}>{t('contextMenu.hide')}</Text>
        </Pressable>

        <Pressable
          onPress={handleMenuDelete}
          style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.surfaceSecondary }]}
        >
          <Ionicons name="trash-outline" size={16} color={colors.error} />
          <Text style={[styles.menuItemText, { color: colors.error }]}>{t('common.delete')}</Text>
        </Pressable>
      </ModalOverlay>

      {/* Rename Dialog */}
      <DialogModal
        visible={renameModalOpen}
        onClose={handleRenameClose}
        title={t('contextMenu.renameTitle')}
        scrollable={false}
        footer={
          <View style={styles.actions}>
            <Pressable
              onPress={handleRenameClose}
              style={[styles.btn, { backgroundColor: colors.surfaceSecondary, paddingVertical: btn.paddingVertical, borderRadius: btn.borderRadius }]}
            >
              <Text style={[styles.btnText, { color: colors.text, fontSize: btn.fontSize }]}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={handleRenameSubmit}
              disabled={!renameValue.trim()}
              style={[styles.btn, { backgroundColor: renameValue.trim() ? colors.primary : colors.surfaceSecondary, paddingVertical: btn.paddingVertical, borderRadius: btn.borderRadius }]}
            >
              <Text style={[styles.btnText, { color: renameValue.trim() ? '#FFFFFF' : colors.textTertiary, fontSize: btn.fontSize }]}>{t('common.change')}</Text>
            </Pressable>
          </View>
        }
      >
        <View style={styles.dialogBody}>
          <TextInput
            style={[styles.renameInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            value={renameValue}
            onChangeText={setRenameValue}
            onSubmitEditing={handleRenameSubmit}
            autoFocus
            returnKeyType="done"
            selectTextOnFocus
            placeholder={t('contextMenu.listNameLabel')}
            placeholderTextColor={colors.textTertiary}
          />
        </View>
      </DialogModal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        visible={deleteModalOpen}
        onClose={handleDeleteClose}
        title={t('contextMenu.deleteTitle')}
        message={t('contextMenu.deleteConfirm', { name: deleteTargetList?.title })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        confirmVariant="destructive"
        onConfirm={handleDeleteConfirm}
      />

      {/* Share Dialog */}
      <DialogModal
        visible={shareModalOpen}
        onClose={handleShareClose}
        title={t('contextMenu.shareTitle')}
        scrollable={false}
        footer={
          <View style={styles.actions}>
            <Pressable
              onPress={handleShareClose}
              style={[styles.btn, { backgroundColor: colors.surfaceSecondary, paddingVertical: btn.paddingVertical, borderRadius: btn.borderRadius }]}
            >
              <Text style={[styles.btnText, { color: colors.text, fontSize: btn.fontSize }]}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={handleShareSubmit}
              disabled={shareSubmitting || (shareTargetList?.words.length ?? 0) === 0}
              style={[styles.btn, {
                backgroundColor: (shareSubmitting || (shareTargetList?.words.length ?? 0) === 0) ? colors.surfaceSecondary : colors.primary,
                paddingVertical: btn.paddingVertical,
                borderRadius: btn.borderRadius,
              }]}
            >
              {shareSubmitting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.btnText, {
                  color: (shareTargetList?.words.length ?? 0) === 0 ? colors.textTertiary : '#FFFFFF',
                  fontSize: btn.fontSize,
                }]}>{t('contextMenu.shareConfirm')}</Text>
              )}
            </Pressable>
          </View>
        }
      >
        <View style={styles.dialogBody}>
          {/* Info card */}
          <View style={[styles.shareInfoCard, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.shareInfoTitle, { color: colors.text }]} numberOfLines={1}>
              {shareTargetList?.icon ?? '✨'} {shareTargetList?.title}
            </Text>
            <Text style={[styles.shareInfoMeta, { color: colors.textSecondary }]}>
              {t('contextMenu.sharePreviewWords', { count: shareTargetList?.words.length ?? 0 })}
            </Text>
            <Text style={[styles.shareInfoMeta, { color: colors.textSecondary }]}>
              {t('contextMenu.sharePreviewLang', {
                source: `${getLanguageFlag(shareTargetList?.sourceLanguage ?? 'en')} ${getLanguageLabel(shareTargetList?.sourceLanguage ?? 'en', t)}`,
                target: `${getLanguageFlag(shareTargetList?.targetLanguage ?? 'ko')} ${getLanguageLabel(shareTargetList?.targetLanguage ?? 'ko', t)}`,
              })}
            </Text>
            {(shareTargetList?.words.length ?? 0) === 0 && (
              <Text style={[styles.shareEmptyWarning, { color: colors.error }]}>
                {t('contextMenu.shareEmptyList')}
              </Text>
            )}
          </View>
          {/* Description input */}
          <TextInput
            style={[styles.shareDescInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            value={shareDescription}
            onChangeText={setShareDescription}
            placeholder={t('contextMenu.shareDescriptionPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            multiline
            returnKeyType="done"
            blurOnSubmit
          />
        </View>
      </DialogModal>

      {/* Merge Dialog */}
      <DialogModal
        visible={mergeModalOpen}
        onClose={handleMergeClose}
        title={t('contextMenu.sendTitle')}
        scrollable={false}
        maxHeight="70%"
        footer={
          <View style={styles.actions}>
            <Pressable
              onPress={handleMergeClose}
              style={[styles.btn, { backgroundColor: colors.surfaceSecondary, paddingVertical: btn.paddingVertical, borderRadius: btn.borderRadius }]}
            >
              <Text style={[styles.btnText, { color: colors.text, fontSize: btn.fontSize }]}>{t('common.close')}</Text>
            </Pressable>
            <Pressable
              onPress={handleMergeSubmit}
              disabled={!mergeTargetId}
              style={[styles.btn, { backgroundColor: mergeTargetId ? colors.primary : colors.surfaceSecondary, paddingVertical: btn.paddingVertical, borderRadius: btn.borderRadius }]}
            >
              <Text style={[styles.btnText, { color: mergeTargetId ? '#FFFFFF' : colors.textTertiary, fontSize: btn.fontSize }]}>{t('common.send')}</Text>
            </Pressable>
          </View>
        }
      >
        <View style={styles.dialogBody}>
          <Text style={[styles.mergeSubtitle, { color: colors.textSecondary }]}>
            {t('contextMenu.sendDesc', { name: mergeSourceList?.title })}
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
                        <Text style={[styles.mergeHiddenText, { color: colors.textTertiary }]}>{t('contextMenu.hidden')}</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              ))}
          </ScrollView>
        </View>
      </DialogModal>
    </>
  );
}

const styles = StyleSheet.create({
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
    marginVertical: 2,
  },
  dialogBody: {
    paddingHorizontal: PopupTokens.padding.container,
    paddingBottom: 8,
  },
  renameInput: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: 'Pretendard_400Regular',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
  },
  btnText: {
    fontFamily: 'Pretendard_600SemiBold',
  },
  mergeSubtitle: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    marginBottom: 12,
  },
  mergeListScroll: {
    maxHeight: 280,
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
  shareInfoCard: {
    borderRadius: 10,
    padding: 14,
    gap: 4,
    marginBottom: 12,
  },
  shareInfoTitle: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
    marginBottom: 2,
  },
  shareInfoMeta: {
    fontSize: 13,
    fontFamily: 'Pretendard_400Regular',
  },
  shareEmptyWarning: {
    fontSize: 13,
    fontFamily: 'Pretendard_500Medium',
    marginTop: 6,
  },
  shareDescInput: {
    minHeight: 80,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    textAlignVertical: 'top',
  },
});
