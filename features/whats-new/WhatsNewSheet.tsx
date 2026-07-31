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

        {/*
          버전 칩과 제목을 한 줄에 둔다 — 항목이 세 줄뿐인 시트에서 큰 제목을 따로
          쌓으면 위가 무겁고, 칩 옆이 비어 버전 숫자만 덩그러니 남는다.
        */}
        <View style={styles.head}>
          <View style={[styles.versionPill, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.versionText, { color: colors.primary }]}>
              {announcement?.version ?? ''}
            </Text>
          </View>
          {/* numberOfLines를 걸지 않는다 — 좁은 화면·긴 로케일에서 제목이 잘리느니
              두 줄로 접히는 편이 낫다(영어 "What's new in Avocado"가 경계에 가깝다). */}
          <Text style={[styles.title, { color: colors.text }]}>{t('whatsNew.title')}</Text>
        </View>

        <View style={styles.items}>
          {(announcement?.items ?? []).map(item => (
            <View key={item.key} style={styles.item}>
              <View style={[styles.bullet, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name={item.icon} size={13} color={colors.primary} />
              </View>
              <Text style={[styles.itemText, { color: colors.text }]}>{t(item.key)}</Text>
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
    // 시스템 바만큼의 여백은 ModalOverlay(bottomSheet)가 더해 준다 — 여기서 34 같은
    // 숫자를 직접 쓰면 iOS 홈 인디케이터에만 맞고 Android 3버튼 바(48dp)엔 모자란다.
    paddingBottom: 16,
  },
  grab: {
    width: 40,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 16,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 14,
  },
  versionPill: {
    height: 24,
    paddingHorizontal: 11,
    borderRadius: 999,
    justifyContent: 'center',
    // 배경색 + borderRadius는 Android(Fabric)에서 사각으로 그려질 수 있다.
    overflow: 'hidden',
  },
  versionText: {
    fontSize: 12,
    fontFamily: 'Pretendard_700Bold',
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontFamily: 'Pretendard_700Bold',
    letterSpacing: -0.4,
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
