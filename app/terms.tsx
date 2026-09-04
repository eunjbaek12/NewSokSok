import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';

interface TermsSection {
  title: string;
  body: string;
}

export default function TermsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors } = useTheme();

  // 스토어명·구독 해지 경로는 플랫폼마다 다르다. i18next는 returnObjects 배열
  // 안의 {{store}}/{{manageSubscription}}도 보간하므로 한 곳에서 주입한다.
  const store = Platform.OS === 'ios' ? 'App Store' : 'Google Play';
  const manageSubscription =
    Platform.OS === 'ios' ? t('terms.manageViaApple') : t('terms.manageViaGoogle');
  const sections = t('terms.sections', {
    returnObjects: true,
    store,
    manageSubscription,
  }) as TermsSection[];
  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Pressable style={styles.backBtn} accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('terms.title')}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.lastUpdated, { color: colors.textTertiary }]}>
          {t('terms.lastUpdated')}
        </Text>

        {sections.map((section, i) => (
          <View key={i} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {`${i + 1}. ${section.title}`}
            </Text>
            <View style={[styles.sectionBody, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
              <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
                {section.body}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Pretendard_700Bold',
    letterSpacing: -0.3,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  lastUpdated: {
    fontSize: 13,
    fontFamily: 'Pretendard_400Regular',
    marginBottom: 20,
    marginLeft: 4,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: 'Pretendard_600SemiBold',
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionBody: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  bodyText: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    lineHeight: 22,
  },
});
