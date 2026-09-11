import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { useAuth } from '@/features/auth';
import { useSettings } from '@/features/settings';
import { toSharedThemePreview, resolveShareCreatorName, type ShareListOptions } from '@/features/vocab';
import CurationCardView from './CurationCardView';
import { communityToCard } from './types';
import type { VocaList } from '@/lib/types';
import { PopupTokens } from '@/constants/popup';
import DialogModal from '@/components/ui/DialogModal';

// 공유 단어장에 올리는 창. 단어장 탭의 ⋯ 메뉴와 단어 모음의 공유 단어장 탭이 함께 쓴다 —
// 입구가 둘이어도 창은 하나여야 두 곳의 규칙이 갈라지지 않는다.
//
// 🔑 **닉네임을 여기서 받는다.** 예전에는 닉네임이 비면 Google 계정 실명 전체로 올렸는데, 이
// 창은 그 이름을 보여 주지 않았다. 이제 닉네임 칸이 늘 보이고(있으면 채워진 채로), 비어 있으면
// 올릴 수 없다. 여기서 고친 닉네임은 설정의 닉네임으로 저장된다(홈 인사말과 같은 값).

const NICKNAME_MAX = 10; // 설정의 닉네임 창과 같은 상한(app/(tabs)/settings.tsx)

/**
 * 게스트를 로그인으로 보낸다. 설정의 「구글로 연결하기」와 같은 호출이다 — 데이터를 유지한 채
 * 클라우드 계정으로 올린다.
 *
 * 예전 게스트는 공유 창이 그대로 열리고 끝까지 가서야 `GUEST_CANNOT_SHARE` 코드 원문을 봤다.
 */
export function useShareSignIn() {
  const { t } = useTranslation();
  const { signInWithGoogle } = useAuth();

  const signIn = useCallback(async () => {
    try {
      await signInWithGoogle();
    } catch (error: any) {
      if (error?.message !== 'GOOGLE_CLIENT_ID_MISSING') {
        Alert.alert(t('login.loginFailed'), t('login.loginFailedMessage'));
      }
    }
  }, [signInWithGoogle, t]);

  /** 입구가 설명 없이 눌린 자리(⋯ 메뉴)에서 쓴다 — 왜 막히는지를 먼저 말한다. */
  const promptSignIn = useCallback(() => {
    Alert.alert(t('contextMenu.shareLoginTitle'), t('contextMenu.shareLoginMessage'), [
      { text: t('common.later'), style: 'cancel' },
      { text: t('settings.googleUpgrade'), onPress: () => { void signIn(); } },
    ]);
  }, [signIn, t]);

  return { signIn, promptSignIn };
}

interface Props {
  visible: boolean;
  list: VocaList | null;
  onClose: () => void;
  onShare: (listId: string, options?: ShareListOptions) => Promise<void>;
  /** 새로 올리거나 갱신한 뒤. 공유 탭이 목록을 다시 받는 데 쓴다. */
  onShared?: () => void;
}

export default function ShareListDialog({ visible, list, onClose, onShare, onShared }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { profileSettings, updateProfileSettings } = useSettings();
  const [description, setDescription] = useState('');
  const [nickname, setNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const btn = PopupTokens.button.standard;

  // 열 때마다 새로 채운다 — 닉네임은 동기화로 늦게 도착할 수 있어 첫 렌더에 굳히지 않는다.
  useEffect(() => {
    if (!visible) return;
    setDescription('');
    setNickname(profileSettings.nickname.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, list?.id]);

  const creatorName = resolveShareCreatorName(nickname);
  const wordCount = list?.words.length ?? 0;
  const canSubmit = !submitting && wordCount > 0 && creatorName !== null;

  // 올라갈 모습 — 공유 탭이 서버에서 받아 그리는 것과 같은 변환·같은 카드.
  const previewCard = useMemo(
    () => (list ? communityToCard(toSharedThemePreview(list, nickname)) : null),
    [list, nickname],
  );

  const shareWith = async (options: ShareListOptions) => {
    if (!list || !creatorName) return;
    await onShare(list.id, { ...options, creatorName });
    onShared?.();
  };

  const handleSubmit = async () => {
    if (!list || !creatorName || !canSubmit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    const desc = description.trim() || undefined;
    const target = list;
    try {
      if (creatorName !== profileSettings.nickname.trim()) {
        await updateProfileSettings({ nickname: creatorName });
      }
      await shareWith({ description: desc });
      onClose();
      Alert.alert(t('contextMenu.shareSuccess'), t('contextMenu.shareSuccessMessage', { name: target.title }));
    } catch (e: any) {
      onClose();
      if (e?.message === 'DUPLICATE_SHARE') {
        Alert.alert(
          t('contextMenu.alreadyShared'),
          t('contextMenu.alreadySharedMessage', { name: target.title }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('contextMenu.createNew'),
              onPress: async () => {
                try {
                  await shareWith({ force: true, description: desc });
                  Alert.alert(t('contextMenu.shareSuccess'), t('contextMenu.newShareCreated'));
                } catch (err: any) {
                  Alert.alert(t('contextMenu.shareFailed'), err?.message || t('common.error'));
                }
              },
            },
            {
              text: t('common.update'),
              style: 'default',
              onPress: async () => {
                try {
                  await shareWith({ updateId: e.existingId, description: desc });
                  Alert.alert(t('contextMenu.updateComplete'), t('contextMenu.updateCompleteMessage'));
                } catch (err: any) {
                  Alert.alert(t('contextMenu.updateFailed'), err?.message || t('common.error'));
                }
              },
            },
          ],
        );
      } else {
        Alert.alert(t('contextMenu.shareFailed'), e?.message || t('contextMenu.shareError'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogModal
      visible={visible}
      onClose={onClose}
      title={t('contextMenu.shareTitle')}
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
                {t('contextMenu.shareConfirm')}
              </Text>
            )}
          </Pressable>
        </View>
      }
    >
      <View style={styles.body}>
        <Text style={[styles.previewLabel, { color: colors.textTertiary }]}>{t('contextMenu.sharePreviewLabel')}</Text>
        {previewCard && (
          <CurationCardView
            theme={previewCard}
            viewMode="detailed"
            showLangPair
            creatorPlaceholder={t('contextMenu.shareNicknamePending')}
          />
        )}
        {wordCount === 0 && (
          <Text style={[styles.emptyWarning, { color: colors.error }]}>{t('contextMenu.shareEmptyList')}</Text>
        )}

        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('contextMenu.shareNicknameLabel')}</Text>
        <TextInput
          style={[styles.nicknameInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: creatorName ? colors.border : colors.primary }]}
          value={nickname}
          onChangeText={setNickname}
          placeholder={t('settings.nicknamePlaceholder')}
          placeholderTextColor={colors.textTertiary}
          maxLength={NICKNAME_MAX}
          returnKeyType="done"
          accessibilityLabel={t('contextMenu.shareNicknameLabel')}
        />
        <Text style={[styles.count, { color: colors.textTertiary }]}>{nickname.trim().length} / {NICKNAME_MAX}</Text>
        <Text style={[styles.hint, { color: colors.textTertiary }]}>{t('contextMenu.shareNicknameHint')}</Text>

        <TextInput
          style={[styles.descInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          value={description}
          onChangeText={setDescription}
          placeholder={t('contextMenu.shareDescriptionPlaceholder')}
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={300}
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
        />
      </View>
    </DialogModal>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 8 },
  previewLabel: { fontSize: 12, fontFamily: 'Pretendard_500Medium', marginBottom: 6 },
  emptyWarning: { fontSize: 13, fontFamily: 'Pretendard_500Medium', marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontFamily: 'Pretendard_600SemiBold', marginBottom: 6 },
  nicknameInput: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: 'Pretendard_400Regular',
  },
  count: { fontSize: 12, fontFamily: 'Pretendard_400Regular', textAlign: 'right', marginTop: 4 },
  hint: { fontSize: 12, fontFamily: 'Pretendard_400Regular', lineHeight: 17, marginTop: 2, marginBottom: 12 },
  descInput: {
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
  actions: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, alignItems: 'center' },
  btnText: { fontFamily: 'Pretendard_600SemiBold' },
});
