import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, Alert, ActivityIndicator, Share, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { useSettings } from '@/features/settings';
import {
  toSharedThemePreview,
  resolveShareCreatorName,
  useSendListToFriend,
  MAX_WORDS_PER_CURATION,
  type SentShare,
} from '@/features/vocab';
import CurationCardView from './CurationCardView';
import { communityToCard } from './types';
import { buildShareUrl, formatExpiryDate } from './share-link';
import type { VocaList } from '@/lib/types';
import { PopupTokens } from '@/constants/popup';
import DialogModal from '@/components/ui/DialogModal';

// 친구에게 단어장을 보내는 창(docs/share-to-friend-spec.md §3-②).
//
// 🔴 **「공유 단어장에 올리기」(ShareListDialog)와 한 창으로 묶지 않는다.** 한 시트에
// 라디오로 묶으면 «같은 일의 두 설정»으로 읽히는데, 결과(목록에 실리는가)도 수명(30일인가)도
// 다르다. 한 번 합쳤다가 되돌린 자리다.
//
// 이 창이 하는 일은 «보낼 것을 한 번 보여 주는 것»이다. 고칠 수 있는 것은 이름 하나이고,
// 설명 칸이 없다 — 받는 사람은 이미 누가 왜 보냈는지 알고 있다(카톡 대화가 맥락이다).

const NAME_MAX = 10; // 공유 창의 닉네임 칸과 같은 상한

interface Props {
  visible: boolean;
  list: VocaList | null;
  onClose: () => void;
  /** 서버에 올리고 OS 공유 창까지 연 뒤. 부모가 스낵바를 띄운다. */
  onSent?: (result: SentShare) => void;
}

export default function SendToFriendDialog({ visible, list, onClose, onSent }: Props) {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const { profileSettings, updateProfileSettings } = useSettings();
  const send = useSendListToFriend();
  const [senderName, setSenderName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const btn = PopupTokens.button.standard;

  // 열 때마다 새로 채운다 — 닉네임은 동기화로 늦게 도착할 수 있어 첫 렌더에 굳히지 않는다.
  // 기본값만 닉네임에서 온다: 여기서 고친 값은 senderName 으로 따로 남아 홈 인사말을
  // 바꾸지 않는다(§2-10).
  useEffect(() => {
    if (!visible) return;
    setSenderName((profileSettings.senderName || profileSettings.nickname).trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, list?.id]);

  const resolvedName = resolveShareCreatorName(senderName);
  const wordCount = list?.words.length ?? 0;
  const canSubmit = !submitting && wordCount > 0 && resolvedName !== null;

  // 받는 사람이 보게 될 카드 — 공유 탭이 서버에서 받아 그리는 것과 같은 변환·같은 카드.
  const previewCard = useMemo(
    () => (list ? communityToCard(toSharedThemePreview(list, senderName)) : null),
    [list, senderName],
  );

  /** OS 공유 창을 띄운다. iOS 에서 사용자가 닫기만 했으면 false. */
  const openShareSheet = useCallback(
    async (result: SentShare, title: string): Promise<boolean> => {
      const message = t('sendToFriend.shareMessage', {
        title,
        count: result.wordCount,
        date: formatExpiryDate(result.expiresAt, i18n.language),
        url: buildShareUrl(result.themeId),
      });
      try {
        const res = await Share.share({ message });
        return res.action !== Share.dismissedAction;
      } catch {
        // 공유 창을 못 열어도 사본은 이미 서버에 있다. 주소를 복사해 갈 수 있게 알린다.
        Alert.alert(t('sendToFriend.shareSheetFailedTitle'), buildShareUrl(result.themeId));
        return false;
      }
    },
    [t, i18n.language],
  );

  const upload = useCallback(
    async (target: VocaList, name: string) => {
      setSubmitting(true);
      try {
        if (name !== profileSettings.senderName) {
          await updateProfileSettings({ senderName: name });
        }
        const result = await send(target.id, name);
        // 🔑 공유 창은 **이 창이 열린 채로** 띄우고, 끝난 뒤에 닫는다. 먼저 닫으면 iOS 가 닫히는
        //    중인 모달 위에 시트를 올리려다 조용히 실패할 수 있다 — 사본은 올라갔는데 주소를 보낼
        //    길이 없어진다. 시트는 맨 위 화면에서 뜨므로 모달 위에서도 된다(완주 공유가 결과 모달
        //    위에서 같은 방식으로 띄운다 — app/(tabs)/index.tsx).
        const shared = await openShareSheet(result, target.title);
        onClose();
        // 시트를 닫기만 했으면 «공유했어요»라고 하지 않는다. 사본은 서버에 남아 30일 뒤 스스로
        // 닫히고, 다시 누르면 새 주소가 나가므로 따로 거둘 일은 없다.
        if (shared) onSent?.(result);
      } catch (e: any) {
        onClose();
        Alert.alert(t('sendToFriend.failedTitle'), e?.message || t('contextMenu.shareError'));
      } finally {
        setSubmitting(false);
      }
    },
    [send, onClose, onSent, openShareSheet, profileSettings.senderName, updateProfileSettings, t],
  );

  const handleSubmit = () => {
    if (!list || !resolvedName || !canSubmit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const target = list;

    // 2,000을 넘는 단어장은 실측상 없다(최대 1,730). 생기면 나눠 보내기 화면을 만드는 대신
    // 앞 2,000단어만 보낸다 — 나눠 보내면 주소가 둘이 되어 받는 쪽이 단어장을 쪼갠다(§2-9).
    if (target.words.length > MAX_WORDS_PER_CURATION) {
      Alert.alert(
        t('sendToFriend.tooManyTitle'),
        t('sendToFriend.tooManyMessage', { max: MAX_WORDS_PER_CURATION, count: target.words.length }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('sendToFriend.tooManyConfirm', { max: MAX_WORDS_PER_CURATION }), onPress: () => { void upload(target, resolvedName); } },
        ],
      );
      return;
    }
    void upload(target, resolvedName);
  };

  return (
    <DialogModal
      visible={visible}
      onClose={onClose}
      title={t('sendToFriend.title')}
      scrollable={true}
      footer={
        <View style={styles.actions}>
          <Pressable
            onPress={onClose}
            style={[styles.btn, { backgroundColor: colors.surfaceSecondary, paddingVertical: btn.paddingVertical, borderRadius: btn.borderRadius }]}
          >
            <Text style={[styles.btnText, { color: colors.text, fontSize: btn.fontSize }]}>{t('common.cancel')}</Text>
          </Pressable>
          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={[styles.btn, {
              backgroundColor: canSubmit ? colors.primaryButton : colors.surfaceSecondary,
              paddingVertical: btn.paddingVertical,
              borderRadius: btn.borderRadius,
            }]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.btnText, { color: canSubmit ? colors.onPrimary : colors.textTertiary, fontSize: btn.fontSize }]}>
                {t('sendToFriend.confirm')}
              </Text>
            )}
          </Pressable>
        </View>
      }
    >
      <View style={styles.body}>
        <Text style={[styles.previewLabel, { color: colors.textTertiary }]}>{t('sendToFriend.previewLabel')}</Text>
        {previewCard && (
          <CurationCardView
            theme={previewCard}
            viewMode="detailed"
            showLangPair
            creatorPlaceholder={t('sendToFriend.namePending')}
          />
        )}
        {wordCount === 0 && (
          <Text style={[styles.emptyWarning, { color: colors.error }]}>{t('contextMenu.shareEmptyList')}</Text>
        )}

        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('sendToFriend.nameLabel')}</Text>
        <TextInput
          style={[styles.nameInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: resolvedName ? colors.border : colors.primary }]}
          value={senderName}
          onChangeText={setSenderName}
          placeholder={t('settings.nicknamePlaceholder')}
          placeholderTextColor={colors.textTertiary}
          maxLength={NAME_MAX}
          returnKeyType="done"
          accessibilityLabel={t('sendToFriend.nameLabel')}
        />
        <Text style={[styles.count, { color: colors.textTertiary }]}>{senderName.trim().length} / {NAME_MAX}</Text>
        <Text style={[styles.hint, { color: colors.textTertiary }]}>{t('sendToFriend.expiryHint')}</Text>
      </View>
    </DialogModal>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 8 },
  previewLabel: { fontSize: 12, fontFamily: 'Pretendard_500Medium', marginBottom: 6 },
  emptyWarning: { fontSize: 13, fontFamily: 'Pretendard_500Medium', marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontFamily: 'Pretendard_600SemiBold', marginBottom: 6, marginTop: 14 },
  nameInput: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: 'Pretendard_400Regular',
  },
  count: { fontSize: 12, fontFamily: 'Pretendard_400Regular', textAlign: 'right', marginTop: 4 },
  hint: { fontSize: 12, fontFamily: 'Pretendard_400Regular', lineHeight: 17, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, alignItems: 'center' },
  btnText: { fontFamily: 'Pretendard_600SemiBold' },
});
