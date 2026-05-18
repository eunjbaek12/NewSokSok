import React, { useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
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

export default function PlansScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { authMode } = useAuth();
  const { apiKey } = useSettings();
  const { status, refresh } = useQuota();

  const isLoggedIn = authMode === 'google';
  const isByok = !!apiKey;

  useEffect(() => {
    if (isLoggedIn) refresh();
  }, [isLoggedIn, refresh]);

  const handleSubscribe = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(t('plans.comingSoonTitle'), t('plans.comingSoonMessage'));
  };

  const handleByokShortcut = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/advanced-settings?openApiKey=1' as any);
  };

  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const currentBadge = (() => {
    if (!isLoggedIn) return t('plans.tierGuest');
    if (status?.tier === 'pro') {
      const onTrial = status.pro_until == null && status.trial_ends_at != null;
      return onTrial ? t('plans.tierTrial') : t('plans.tierPro');
    }
    return t('plans.tierFree');
  })();

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
        <PlanCard
          title={t('plans.freeTitle')}
          price={t('plans.freePrice')}
          features={[
            t('plans.freeFeat1'),
            t('plans.freeFeat2'),
            t('plans.freeFeat3'),
          ]}
          highlight={false}
          colors={colors}
        />

        {/* Pro 카드 */}
        <PlanCard
          title={t('plans.proTitle')}
          price={t('plans.proPrice')}
          subPrice={t('plans.proSubPrice')}
          features={[
            t('plans.proFeat1'),
            t('plans.proFeat2'),
            t('plans.proFeat3'),
            t('plans.proFeat4'),
          ]}
          highlight
          colors={colors}
          ctaLabel={t('plans.subscribeCta')}
          ctaSubLabel={t('plans.subscribeSubCta')}
          ctaDisabled
          onCta={handleSubscribe}
        />

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

interface PlanCardProps {
  title: string;
  price: string;
  subPrice?: string;
  features: string[];
  highlight: boolean;
  colors: any;
  ctaLabel?: string;
  ctaSubLabel?: string;
  ctaDisabled?: boolean;
  onCta?: () => void;
}

function PlanCard({ title, price, subPrice, features, highlight, colors, ctaLabel, ctaSubLabel, ctaDisabled, onCta }: PlanCardProps) {
  return (
    <View style={[
      styles.planCard,
      {
        backgroundColor: highlight ? colors.primaryLight : colors.surface,
        borderColor: highlight ? colors.primary : colors.borderLight,
        borderWidth: highlight ? 1.5 : 1,
      },
    ]}>
      <Text style={[styles.planTitle, { color: highlight ? colors.primary : colors.text }]}>{title}</Text>
      <View style={styles.priceRow}>
        <Text style={[styles.planPrice, { color: colors.text }]}>{price}</Text>
        {subPrice ? <Text style={[styles.planSubPrice, { color: colors.textSecondary }]}>· {subPrice}</Text> : null}
      </View>
      <View style={styles.featureList}>
        {features.map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={16} color={highlight ? colors.primary : colors.textSecondary} />
            <Text style={[styles.featureText, { color: colors.textSecondary }]}>{f}</Text>
          </View>
        ))}
      </View>
      {ctaLabel && (
        <Pressable
          onPress={ctaDisabled ? onCta : onCta}
          style={[styles.cta, { backgroundColor: colors.primaryButton, opacity: ctaDisabled ? 0.6 : 1 }]}
        >
          <Text style={[styles.ctaLabel, { color: colors.onPrimary }]}>{ctaLabel}</Text>
          {ctaSubLabel && <Text style={[styles.ctaSubLabel, { color: colors.onPrimary }]}>{ctaSubLabel}</Text>}
        </Pressable>
      )}
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
  planSubPrice: { fontSize: 13, fontFamily: 'Pretendard_500Medium' },
  featureList: { gap: 6, marginTop: 4 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { flex: 1, fontSize: 14, fontFamily: 'Pretendard_400Regular', lineHeight: 19 },
  cta: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaLabel: { fontSize: 15, fontFamily: 'Pretendard_600SemiBold' },
  ctaSubLabel: { fontSize: 12, fontFamily: 'Pretendard_400Regular', marginTop: 2 },
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
