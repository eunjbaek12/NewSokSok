import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { Radius } from '@/constants/tokens';
import { PopupTokens } from '@/constants/popup';
import ModalOverlay from '@/components/ui/ModalOverlay';
import type { Announcement } from '@/constants/announcements';

/**
 * 업데이트 직후 한 번 뜨는 소식 시트.
 *
 * 앱을 켜자마자가 아니라 홈에 도달했을 때 띄운다 — 복습 알림을 눌러 들어온 사람은
 * 목적이 있어서 온 것이고, 시작 탭이 단어장인 사용자도 있다.
 */
export default function WhatsNewSheet({
  announcement,
  onDismiss,
}: {
  announcement: Announcement | null;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDismiss();
  };

  return (
    <ModalOverlay
      visible={!!announcement}
      onClose={handleDismiss}
      variant="bottomSheet"
      scrollable={false}
    >
      <View style={styles.body}>
        <View style={[styles.grab, { backgroundColor: colors.border }]} />

        <View style={[styles.versionPill, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.versionText, { color: colors.primary }]}>
            {announcement?.version ?? ''}
          </Text>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>{t('whatsNew.title')}</Text>

        <View style={styles.items}>
          {(announcement?.items ?? []).map(key => (
            <View key={key} style={styles.item}>
              <View style={[styles.bullet, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="sparkles" size={13} color={colors.primary} />
              </View>
              <Text style={[styles.itemText, { color: colors.text }]}>{t(key)}</Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={handleDismiss}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.confirm,
            { backgroundColor: colors.primaryButton, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.confirmText, { color: colors.onPrimary }]}>
            {t('whatsNew.confirm')}
          </Text>
        </Pressable>
      </View>
    </ModalOverlay>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: PopupTokens.padding.container,
    paddingTop: 10,
    paddingBottom: 34,
  },
  grab: {
    width: 40,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 16,
  },
  versionPill: {
    alignSelf: 'flex-start',
    height: 24,
    paddingHorizontal: 11,
    borderRadius: 999,
    justifyContent: 'center',
  },
  versionText: {
    fontSize: 12,
    fontFamily: 'Pretendard_700Bold',
  },
  title: {
    fontSize: 21,
    fontFamily: 'Pretendard_700Bold',
    letterSpacing: -0.5,
    marginTop: 10,
    marginBottom: 6,
  },
  items: {
    gap: 2,
    marginBottom: 18,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    paddingVertical: 9,
  },
  bullet: {
    width: 22,
    height: 22,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    // 배경색 + borderRadius는 Android(Fabric)에서 사각으로 그려질 수 있다.
    // overflow: 'hidden'이 둥근 클리핑을 강제한다(CLAUDE.md UI 체크리스트).
    overflow: 'hidden',
  },
  itemText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: 'Pretendard_400Regular',
  },
  confirm: {
    height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    fontSize: 16,
    fontFamily: 'Pretendard_700Bold',
  },
});
