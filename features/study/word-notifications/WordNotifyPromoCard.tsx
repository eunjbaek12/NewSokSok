import React, { useCallback } from 'react';
import { StyleSheet, Text, View, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useTheme } from '@/features/theme';
import { useLocale } from '@/features/locale';
import { Radius } from '@/constants/tokens';
import { useSettingsStore } from '@/features/settings';
import { formatMinuteOfDay } from './labels';
import type { WordNotifyPromo } from './use-word-notify-promo';

/**
 * 홈의 «단어 알림» 권유 카드 — 이 기능이 있다는 걸 알리는 자리(§10).
 *
 * 창이 아니라 카드인 이유와 띄우는 조건은 `./promo` 주석에 있다. 자리는 퀵액션 아래·
 * 학습 계획 위다: 복습 배너·퀵액션은 «학습 액션»이고 이건 소개라, 액션 묶음을 가르지 않는다.
 *
 * 색은 `primaryLight` 면 — 복습 배너(브랜드 그린)·맞춤 학습(티일 그라디언트)과 같은 무게로
 * 서면 «또 하나의 학습 버튼»으로 읽힌다. 한 단계 낮춰 소개로 보이게 한다.
 */
export default function WordNotifyPromoCard({
  promo,
  style,
}: {
  promo: WordNotifyPromo;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { locale } = useLocale();
  const settings = useSettingsStore(s => s.wordNotificationSettings);

  const handleEnable = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void promo.enable();
  }, [promo]);

  const handleDismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void promo.dismiss();
  }, [promo]);

  if (!promo.visible) return null;

  const startLabel = formatMinuteOfDay(settings.startMinute, locale);

  // 켠 직후 — 무엇이 언제 오는지 실제 값으로 되돌려 준다. 홈을 떠나면 사라진다.
  if (promo.justEnabled) {
    return (
      <View
        style={[
          styles.card,
          styles.doneCard,
          { backgroundColor: colors.surface, borderColor: colors.primary + '33' },
          style,
        ]}
      >
        <View style={styles.titleRow}>
          <Ionicons name="checkmark-circle" size={17} color={colors.primary} />
          <Text style={[styles.title, { color: colors.primary }]}>{t('wordNotif.promoDoneTitle')}</Text>
        </View>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          {promo.listTitle
            ? t('wordNotif.promoDoneBody', { time: startLabel, count: settings.perDay, list: promo.listTitle })
            : t('wordNotif.promoBody', { time: startLabel, count: settings.perDay })}
        </Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/word-notification-source' as any);
          }}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.changeRow, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.changeText, { color: colors.primary }]}>{t('wordNotif.promoChange')}</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.primary} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.primaryLight }, style]}>
      <Pressable
        onPress={handleDismiss}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        hitSlop={10}
        style={({ pressed }) => [styles.close, { opacity: pressed ? 0.5 : 0.7 }]}
      >
        <Ionicons name="close" size={16} color={colors.primary} />
      </Pressable>

      <View style={styles.titleRow}>
        <Ionicons name="notifications-outline" size={17} color={colors.primary} />
        {/* 제목이 ✕ 아래로 흘러들지 않게 오른쪽을 비워 둔다. */}
        <Text style={[styles.title, styles.titleInset, { color: colors.primary }]}>
          {t('wordNotif.promoTitle')}
        </Text>
      </View>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        {t('wordNotif.promoBody', { time: startLabel, count: settings.perDay })}
      </Text>

      <Pressable
        onPress={handleEnable}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.primaryButton, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{t('wordNotif.promoEnable')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 6,
  },
  doneCard: {
    borderWidth: 1,
  },
  close: {
    position: 'absolute',
    top: 9,
    right: 10,
    zIndex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontFamily: 'Pretendard_700Bold',
    flexShrink: 1,
  },
  /** ✕ 자리(16 + 여백). 제목이 두 줄로 접히더라도 아이콘을 침범하지 않는다. */
  titleInset: {
    marginRight: 22,
  },
  body: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Pretendard_400Regular',
  },
  button: {
    alignSelf: 'flex-start',
    borderRadius: Radius.md,
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  buttonText: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingVertical: 4,
  },
  changeText: {
    fontSize: 12,
    fontFamily: 'Pretendard_600SemiBold',
  },
});
