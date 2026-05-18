import React, { useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { useAuth } from '@/features/auth';
import { useSettings } from '@/features/settings';
import { useQuota } from '@/features/quota';
import { usePurchaseFlow } from '@/features/billing';
import { SKU_PRO_MONTHLY, SKU_PRO_YEARLY } from '@/lib/billing/skus';

export default function PlansScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { authMode } = useAuth();
  const { apiKey } = useSettings();
  const { status, refresh } = useQuota();
  const flow = usePurchaseFlow();

  const isLoggedIn = authMode === 'google';
  const isByok = !!apiKey;
  const isPro = status?.tier === 'pro';

  useEffect(() => {
    if (isLoggedIn) refresh();
  }, [isLoggedIn, refresh]);

  // 결제 성공/실패 알림
  useEffect(() => {
    if (flow.stage === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t('plans.purchaseSuccessTitle'), t('plans.purchaseSuccessMessage'), [
        { text: t('common.done'), onPress: flow.resetStage },
      ]);
    } else if (flow.stage === 'failed' && flow.error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t('plans.purchaseFailedTitle'), t('plans.purchaseFailedMessage'), [
        { text: t('common.done'), onPress: flow.resetStage },
      ]);
    }
  }, [flow.stage, flow.error, flow.resetStage, t]);

  const handleBuy = (sku: typeof SKU_PRO_MONTHLY | typeof SKU_PRO_YEARLY) => {
    if (!isLoggedIn) {
      Alert.alert(t('plans.loginRequiredTitle'), t('plans.loginRequiredMessage'));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    flow.buy(sku);
  };

  const handleRestore = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    flow.restore();
  };

  const handleByokShortcut = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/advanced-settings?openApiKey=1' as any);
  };

  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const busy = flow.stage === 'purchasing' || flow.stage === 'verifying';

  const currentBadge = (() => {
    if (!isLoggedIn) return t('plans.tierGuest');
    if (isPro) {
      const onTrial = status?.pro_until == null && status?.trial_ends_at != null;
      return onTrial ? t('plans.tierTrial') : t('plans.tierPro');
    }
    return t('plans.tierFree');
  })();

  const monthlyPrice = flow.priceFor(SKU_PRO_MONTHLY) ?? t('plans.proPrice');
  const yearlyPrice = flow.priceFor(SKU_PRO_YEARLY) ?? t('plans.proSubPrice');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('plans.title')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 현재 상태 카드 */}
        <View style={[styles.currentCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={[styles.badge, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.badgeText, { color: colors.primary }]}>{currentBadge}</Text>
          </View>
          <Text style={[styles.currentTitle, { color: colors.text }]}>
            {isLoggedIn
              ? t('plans.currentLoggedIn', { used: status?.used ?? 0, limit: status?.limit ?? 100 })
              : t('plans.currentGuest')}
          </Text>
          {isByok && (
            <Text style={[styles.currentDesc, { color: colors.textSecondary }]}>
              {t('plans.byokActive')}
            </Text>
          )}
        </View>

        {/* Free 카드 */}
        <View style={[styles.planCard, { backgroundColor: colors.surface, borderColor: colors.borderLight, borderWidth: 1 }]}>
          <Text style={[styles.planTitle, { color: colors.text }]}>{t('plans.freeTitle')}</Text>
          <View style={styles.priceRow}>
            <Text style={[styles.planPrice, { color: colors.text }]}>{t('plans.freePrice')}</Text>
          </View>
          <View style={styles.featureList}>
            {[t('plans.freeFeat1'), t('plans.freeFeat2'), t('plans.freeFeat3')].map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.textSecondary} />
                <Text style={[styles.featureText, { color: colors.textSecondary }]}>{f}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Pro 카드 */}
        <View style={[styles.planCard, { backgroundColor: colors.primaryLight, borderColor: colors.primary, borderWidth: 1.5 }]}>
          <Text style={[styles.planTitle, { color: colors.primary }]}>{t('plans.proTitle')}</Text>
          <View style={styles.featureList}>
            {[t('plans.proFeat1'), t('plans.proFeat2'), t('plans.proFeat3'), t('plans.proFeat4')].map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                <Text style={[styles.featureText, { color: colors.textSecondary }]}>{f}</Text>
              </View>
            ))}
          </View>

          {isPro ? (
            <View style={[styles.proActiveBadge, { backgroundColor: colors.surface }]}>
              <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
              <Text style={[styles.proActiveText, { color: colors.primary }]}>
                {t('plans.proActiveNote')}
              </Text>
            </View>
          ) : (
            <View style={styles.ctaColumn}>
              <Pressable
                onPress={() => handleBuy(SKU_PRO_YEARLY)}
                disabled={busy || !flow.connected}
                style={[styles.cta, { backgroundColor: colors.primaryButton, opacity: (busy || !flow.connected) ? 0.6 : 1 }]}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <>
                    <Text style={[styles.ctaLabel, { color: colors.onPrimary }]}>
                      {t('plans.subscribeYearlyCta', { price: yearlyPrice })}
                    </Text>
                    <Text style={[styles.ctaSubLabel, { color: colors.onPrimary }]}>
                      {t('plans.subscribeYearlySubCta')}
                    </Text>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={() => handleBuy(SKU_PRO_MONTHLY)}
                disabled={busy || !flow.connected}
                style={[styles.ctaSecondary, { borderColor: colors.primary, opacity: (busy || !flow.connected) ? 0.6 : 1 }]}
              >
                <Text style={[styles.ctaSecondaryLabel, { color: colors.primary }]}>
                  {t('plans.subscribeMonthlyCta', { price: monthlyPrice })}
                </Text>
              </Pressable>

              {!flow.connected && (
                <Text style={[styles.connectingNote, { color: colors.textTertiary }]}>
                  {t('plans.billingConnecting')}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* 복원 */}
        {isLoggedIn && !isPro && (
          <Pressable
            onPress={handleRestore}
            disabled={busy}
            style={[styles.restoreRow, { borderColor: colors.borderLight, backgroundColor: colors.surface, opacity: busy ? 0.6 : 1 }]}
          >
            <Ionicons name="refresh" size={16} color={colors.textSecondary} />
            <Text style={[styles.restoreText, { color: colors.textSecondary }]}>{t('plans.restoreCta')}</Text>
          </Pressable>
        )}

        {/* BYOK 단축 */}
        <Pressable onPress={handleByokShortcut} style={[styles.byokRow, { borderColor: colors.borderLight, backgroundColor: colors.surface }]}>
          <View style={styles.rowLeft}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="key-outline" size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.byokTitle, { color: colors.text }]}>{t('plans.byokRowTitle')}</Text>
              <Text style={[styles.byokDesc, { color: colors.textTertiary }]}>{t('plans.byokRowDesc')}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </Pressable>

        <Text style={[styles.footnote, { color: colors.textTertiary }]}>
          {t('plans.footnote')}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'Pretendard_700Bold', letterSpacing: -0.3 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  currentCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { fontSize: 12, fontFamily: 'Pretendard_600SemiBold' },
  currentTitle: { fontSize: 16, fontFamily: 'Pretendard_600SemiBold' },
  currentDesc: { fontSize: 13, fontFamily: 'Pretendard_400Regular', lineHeight: 18 },
  planCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    gap: 10,
  },
  planTitle: { fontSize: 18, fontFamily: 'Pretendard_700Bold' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  planPrice: { fontSize: 22, fontFamily: 'Pretendard_700Bold' },
  featureList: { gap: 6, marginTop: 4 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { flex: 1, fontSize: 14, fontFamily: 'Pretendard_400Regular', lineHeight: 19 },
  ctaColumn: { gap: 8, marginTop: 8 },
  cta: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaSecondary: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  ctaLabel: { fontSize: 15, fontFamily: 'Pretendard_600SemiBold' },
  ctaSubLabel: { fontSize: 12, fontFamily: 'Pretendard_400Regular', marginTop: 2 },
  ctaSecondaryLabel: { fontSize: 14, fontFamily: 'Pretendard_500Medium' },
  connectingNote: { fontSize: 12, fontFamily: 'Pretendard_400Regular', textAlign: 'center', marginTop: 4 },
  proActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginTop: 6,
  },
  proActiveText: { fontSize: 13, fontFamily: 'Pretendard_600SemiBold' },
  restoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  restoreText: { fontSize: 13, fontFamily: 'Pretendard_500Medium' },
  byokRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 4,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconCircle: {
    width: 28, height: 28, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  byokTitle: { fontSize: 14, fontFamily: 'Pretendard_500Medium' },
  byokDesc: { fontSize: 12, fontFamily: 'Pretendard_400Regular', marginTop: 2 },
  footnote: {
    fontSize: 11,
    fontFamily: 'Pretendard_400Regular',
    lineHeight: 17,
    marginTop: 12,
    marginHorizontal: 4,
  },
});
