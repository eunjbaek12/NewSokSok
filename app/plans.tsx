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
import { useQuota, getProMode, getTrialDaysLeft } from '@/features/quota';
import { usePurchaseFlow } from '@/features/billing';
import { SKU_PRO_MONTHLY, SKU_PRO_YEARLY } from '@/lib/billing/skus';

export default function PlansScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { authMode, signInWithGoogle } = useAuth();
  const { apiKey } = useSettings();
  const { status, refresh } = useQuota();
  const flow = usePurchaseFlow();

  const isLoggedIn = authMode === 'google';
  const isByok = !!apiKey;
  const isPro = status?.tier === 'pro';
  // 서버는 트라이얼/유료를 모두 tier='pro'로 내려보낸다(같은 한도·동일 기능).
  // UI에선 둘을 구분해야 사용자가 "이미 결제했다"고 오해하지 않는다.
  const proMode = getProMode(status);
  const trialDaysLeft = getTrialDaysLeft(status);
  // 체험을 한 번도 받지 않은 신규 후보(로그인 + 비Pro + trial_ends_at 부재)에게만 7일 체험 배너 노출
  const showTrialBanner = isLoggedIn && !isPro && (status?.trial_ends_at == null);

  useEffect(() => {
    if (isLoggedIn) refresh();
  }, [isLoggedIn, refresh]);

  // 결제 성공/실패 알림. 실패 메시지는 expo-iap 에러 코드별로 세분화 —
  // "이미 구독중", "결제 취소", "네트워크 오류" 등 사용자가 자가 진단할 수
  // 있는 카피로 분기 (features/billing/error-mapping.ts).
  useEffect(() => {
    if (flow.stage === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t('plans.purchaseSuccessTitle'), t('plans.purchaseSuccessMessage'), [
        { text: t('common.done'), onPress: flow.resetStage },
      ]);
    } else if (flow.stage === 'failed' && flow.error && !flow.error.silent) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = t(`plans.errors.${flow.error.key}`, t('plans.purchaseFailedMessage'));
      // "이미 구독중"·"verify 실패" 등은 복원이 정답 — Alert에 복원 버튼을 직접 노출.
      const buttons = flow.error.suggestRestore
        ? [
            { text: t('common.done'), onPress: flow.resetStage, style: 'cancel' as const },
            { text: t('plans.restoreCta'), onPress: () => { flow.resetStage(); flow.restore(); } },
          ]
        : [
            { text: t('common.done'), onPress: flow.resetStage },
          ];
      Alert.alert(t('plans.purchaseFailedTitle'), message, buttons);
    }
  }, [flow.stage, flow.error, flow.resetStage, flow.restore, flow, t]);

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

  const handleGuestSignIn = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await signInWithGoogle();
    } catch {
      // 로그인 실패는 SDK 측 alert에 의존
    }
  };

  const handleOpenTerms = () => {
    Haptics.selectionAsync();
    router.push('/terms' as any);
  };

  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const busy = flow.stage === 'purchasing' || flow.stage === 'verifying';

  const monthlyPrice = flow.priceFor(SKU_PRO_MONTHLY) ?? t('plans.proPrice');
  const yearlyPrice = flow.priceFor(SKU_PRO_YEARLY) ?? t('plans.proSubPrice');

  // 진행률 (Free/Pro 사용자만 의미 있음 — BYOK/게스트는 별도 표시)
  const used = status?.used ?? 0;
  const limit = status?.limit ?? 100;
  const totalCap = limit + (status?.bonus ?? 0);
  const progressRatio = totalCap > 0 ? Math.min(1, used / totalCap) : 0;
  const progressColor = progressRatio >= 0.9 ? colors.error : progressRatio >= 0.7 ? colors.warning : colors.primary;

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
        {/* 사용량 카드 — tier 식별은 계정 행/플랜 카드 배지가 담당. 여기선 사용량·CTA만 */}
        {!isLoggedIn ? (
          // 게스트: /plans 유일 로그인 동선이라 CTA 유지
          <View style={[styles.currentCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <Text style={[styles.currentTitle, { color: colors.text }]}>
              {t('plans.currentGuestTitle')}
            </Text>
            <Text style={[styles.currentDesc, { color: colors.textSecondary }]}>
              {t('plans.currentGuestDesc')}
            </Text>
            <Pressable
              onPress={handleGuestSignIn}
              style={[styles.guestCta, { backgroundColor: colors.primaryButton }]}
            >
              <Ionicons name="logo-google" size={16} color={colors.onPrimary} />
              <Text style={[styles.guestCtaText, { color: colors.onPrimary }]}>
                {t('plans.currentGuestCta')}
              </Text>
            </Pressable>
          </View>
        ) : isByok ? (
          // BYOK: 사용량 없음 → 한 줄 안내만
          <View style={[styles.currentCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <Text style={[styles.currentDesc, { color: colors.textSecondary }]}>
              {t('plans.currentByokDesc')}
            </Text>
          </View>
        ) : (
          // Free/Pro: 사용량 미터 (한도 초과 진입 경로에서 중요)
          <View style={[styles.currentCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <Text style={[styles.usageLabel, { color: colors.textTertiary }]}>
              {t('plans.currentUsageLabel')}
            </Text>
            <Text style={[styles.usageValue, { color: colors.text }]}>
              {t('plans.currentUsageValue', { used, limit: isPro ? limit : totalCap })}
            </Text>
            <View style={[styles.progressTrack, { backgroundColor: colors.borderLight }]}>
              <View style={[styles.progressFill, { width: `${progressRatio * 100}%`, backgroundColor: progressColor }]} />
            </View>
            <Text style={[styles.usageNote, { color: colors.textTertiary }]}>
              {t('plans.currentResetNote')}
            </Text>
          </View>
        )}

        {/* 7일 무료 체험 배너 — 신규 사용자 한정 */}
        {showTrialBanner && (
          <View style={[styles.trialBanner, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
            <View style={[styles.trialIcon, { backgroundColor: colors.surface }]}>
              <Ionicons name="gift" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.trialTitle, { color: colors.primary }]}>
                {t('plans.trialBannerTitle')}
              </Text>
              <Text style={[styles.trialBody, { color: colors.text }]}>
                {t('plans.trialBannerBody')}
              </Text>
              <Text style={[styles.trialNote, { color: colors.textSecondary }]}>
                {t('plans.trialBannerNote')}
              </Text>
            </View>
          </View>
        )}

        {/* Pro 카드 — 최상단, 추천 배지 */}
        <View style={[styles.planCard, styles.planCardPro, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
          {proMode === 'trial' ? (
            <View style={[styles.recommendedBadge, { backgroundColor: colors.primary }]}>
              <Ionicons name="hourglass" size={11} color={colors.onPrimary} />
              <Text style={[styles.recommendedBadgeText, { color: colors.onPrimary }]}>
                {t('plans.planCardTrial', { daysLeft: trialDaysLeft ?? 0 })}
              </Text>
            </View>
          ) : isPro ? (
            <View style={[styles.recommendedBadge, { backgroundColor: colors.primary }]}>
              <Ionicons name="checkmark-circle" size={11} color={colors.onPrimary} />
              <Text style={[styles.recommendedBadgeText, { color: colors.onPrimary }]}>
                {t('plans.planCardCurrent')}
              </Text>
            </View>
          ) : (
            <View style={[styles.recommendedBadge, { backgroundColor: colors.primary }]}>
              <Ionicons name="star" size={11} color={colors.onPrimary} />
              <Text style={[styles.recommendedBadgeText, { color: colors.onPrimary }]}>
                {t('plans.recommendedBadge')}
              </Text>
            </View>
          )}

          <Text style={[styles.planTitle, { color: colors.primary }]}>{t('plans.proTitle')}</Text>

          <View style={styles.priceBlock}>
            <Text style={[styles.planPrice, { color: colors.text }]}>{t('plans.proPrice')}</Text>
            <Text style={[styles.priceOr, { color: colors.textTertiary }]}>또는</Text>
            <Text style={[styles.planSubPrice, { color: colors.text }]}>{t('plans.proSubPrice')}</Text>
            <Text style={[styles.priceSaveBadge, { color: colors.primary, backgroundColor: colors.primaryLight }]}>
              {t('plans.proMonthlyEquivalent')}
            </Text>
          </View>

          <View style={styles.featureList}>
            {[t('plans.proFeat1'), t('plans.proFeat2'), t('plans.proFeat3')].map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                <Text style={[styles.featureText, { color: colors.text }]}>{f}</Text>
              </View>
            ))}
          </View>

          {proMode === 'trial' ? (
            <View style={[styles.proActiveBadge, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="hourglass" size={16} color={colors.primary} />
              <Text style={[styles.proActiveText, { color: colors.primary }]}>
                {t('plans.trialActiveNote', { daysLeft: trialDaysLeft ?? 0 })}
              </Text>
            </View>
          ) : isPro ? (
            <View style={[styles.proActiveBadge, { backgroundColor: colors.primaryLight }]}>
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

        {/* Free 카드 — Pro 아래. 로그인 + 비Pro면 "현재 사용 중" */}
        {(() => {
          const isCurrentFree = isLoggedIn && !isPro;
          return (
        <View style={[styles.planCard, { backgroundColor: colors.surface, borderColor: isCurrentFree ? colors.primary : colors.borderLight }]}>
          {isCurrentFree && (
            <View style={[styles.recommendedBadge, { backgroundColor: colors.primary }]}>
              <Ionicons name="checkmark-circle" size={11} color={colors.onPrimary} />
              <Text style={[styles.recommendedBadgeText, { color: colors.onPrimary }]}>
                {t('plans.planCardCurrent')}
              </Text>
            </View>
          )}
          <Text style={[styles.planTitle, { color: colors.text }]}>{t('plans.freeTitle')}</Text>
          <Text style={[styles.planPrice, { color: colors.text }]}>{t('plans.freePrice')}</Text>

          <View style={styles.featureList}>
            {[t('plans.freeFeat1'), t('plans.freeFeat2'), t('plans.freeFeat3')].map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.textSecondary} />
                <Text style={[styles.featureText, { color: colors.textSecondary }]}>{f}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.freeAdNote, { backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textTertiary} />
            <Text style={[styles.freeAdNoteText, { color: colors.textTertiary }]}>
              {t('plans.freeIncludesAd')}
            </Text>
          </View>
        </View>
          );
        })()}

        {/* 복원 — Pro/트라이얼 상태에서도 노출: 미승인 구매 정리·기기 변경 복원 경로 */}
        {isLoggedIn && (
          <Pressable
            onPress={handleRestore}
            disabled={busy}
            style={[styles.restoreRow, { borderColor: colors.borderLight, backgroundColor: colors.surface, opacity: busy ? 0.6 : 1 }]}
          >
            <Ionicons name="refresh" size={16} color={colors.textSecondary} />
            <Text style={[styles.restoreText, { color: colors.textSecondary }]}>{t('plans.restoreCta')}</Text>
          </Pressable>
        )}

        {/* 신뢰 카드 — 결제·해지·약관 안내 */}
        <View style={[styles.trustCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <Text style={[styles.trustTitle, { color: colors.text }]}>{t('plans.trustTitle')}</Text>
          <View style={styles.trustRow}>
            <Ionicons name="card-outline" size={15} color={colors.textSecondary} />
            <Text style={[styles.trustText, { color: colors.textSecondary }]}>{t('plans.trustBilling')}</Text>
          </View>
          <View style={styles.trustRow}>
            <Ionicons name="close-circle-outline" size={15} color={colors.textSecondary} />
            <Text style={[styles.trustText, { color: colors.textSecondary }]}>{t('plans.trustCancel')}</Text>
          </View>
          <View style={styles.trustRow}>
            <Ionicons name="calendar-outline" size={15} color={colors.textSecondary} />
            <Text style={[styles.trustText, { color: colors.textSecondary }]}>{t('plans.trustGrace')}</Text>
          </View>
          <Pressable onPress={handleOpenTerms} style={styles.trustLinkRow}>
            <Ionicons name="document-text-outline" size={15} color={colors.primary} />
            <Text style={[styles.trustLinkText, { color: colors.primary }]}>{t('plans.trustTerms')}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </Pressable>
        </View>
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

  // 현재 상태 카드
  currentCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  currentTitle: { fontSize: 16, fontFamily: 'Pretendard_600SemiBold' },
  currentDesc: { fontSize: 13, fontFamily: 'Pretendard_400Regular', lineHeight: 18 },
  usageLabel: { fontSize: 12, fontFamily: 'Pretendard_500Medium', marginTop: 4 },
  usageValue: { fontSize: 20, fontFamily: 'Pretendard_700Bold' },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  usageNote: { fontSize: 11, fontFamily: 'Pretendard_400Regular', marginTop: 4 },
  guestCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  guestCtaText: { fontSize: 14, fontFamily: 'Pretendard_600SemiBold' },

  // 7일 체험 배너
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  trialIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  trialTitle: { fontSize: 12, fontFamily: 'Pretendard_700Bold' },
  trialBody: { fontSize: 15, fontFamily: 'Pretendard_600SemiBold', marginTop: 2 },
  trialNote: { fontSize: 11, fontFamily: 'Pretendard_400Regular', marginTop: 2, lineHeight: 15 },

  // 플랜 카드 공통
  planCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    gap: 10,
  },
  planCardPro: {
    borderWidth: 1.5,
  },
  recommendedBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  recommendedBadgeText: { fontSize: 11, fontFamily: 'Pretendard_700Bold' },
  planTitle: { fontSize: 18, fontFamily: 'Pretendard_700Bold' },
  priceBlock: { gap: 4 },
  planPrice: { fontSize: 22, fontFamily: 'Pretendard_700Bold' },
  priceOr: { fontSize: 11, fontFamily: 'Pretendard_400Regular', marginTop: 2 },
  planSubPrice: { fontSize: 16, fontFamily: 'Pretendard_600SemiBold' },
  priceSaveBadge: {
    fontSize: 11,
    fontFamily: 'Pretendard_600SemiBold',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 2,
    overflow: 'hidden',
  },
  featureList: { gap: 6, marginTop: 4 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { flex: 1, fontSize: 14, fontFamily: 'Pretendard_400Regular', lineHeight: 19 },
  freeAdNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 4,
  },
  freeAdNoteText: { flex: 1, fontSize: 12, fontFamily: 'Pretendard_400Regular' },

  // CTA
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

  // 복원
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

  // 신뢰 카드
  trustCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
    gap: 8,
  },
  trustTitle: { fontSize: 13, fontFamily: 'Pretendard_700Bold', marginBottom: 2 },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trustText: { flex: 1, fontSize: 12, fontFamily: 'Pretendard_400Regular', lineHeight: 17 },
  trustLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 6,
    marginTop: 2,
  },
  trustLinkText: { flex: 1, fontSize: 12, fontFamily: 'Pretendard_500Medium' },
});
