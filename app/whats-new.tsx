// 새로운 소식 — 지난 업데이트 목록.
//
// 시트를 그냥 닫은 사람과 여러 버전을 건너뛴 사람이 오는 곳이다. 배열을 최신순으로
// 그리는 것뿐이라 화면 로직이 없다(시트는 최신 것 하나만 띄우므로, 건너뛴 소식은
// 여기서 본다).

import React from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { useLocale } from '@/features/locale';
import { ANNOUNCEMENTS } from '@/constants/announcements';

export default function WhatsNewScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { locale } = useLocale();

  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === 'en' ? 'en-US' : 'ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('settings.whatsNew')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {ANNOUNCEMENTS.map(a => (
          <View
            key={a.version}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
          >
            <View style={styles.cardTop}>
              <Text style={[styles.version, { color: colors.text }]}>{a.version}</Text>
              <Text style={[styles.date, { color: colors.textTertiary }]}>{formatDate(a.date)}</Text>
            </View>
            {a.items.map(key => (
              <View key={key} style={styles.item}>
                <Text style={[styles.bullet, { color: colors.primary }]}>·</Text>
                <Text style={[styles.itemText, { color: colors.textSecondary }]}>{t(key)}</Text>
              </View>
            ))}
          </View>
        ))}
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
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'Pretendard_700Bold', letterSpacing: -0.3 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  card: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 15, paddingTop: 14, paddingBottom: 13, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9 },
  version: { fontSize: 15, fontFamily: 'Pretendard_700Bold' },
  date: { fontSize: 11.5, fontFamily: 'Pretendard_400Regular' },
  item: { flexDirection: 'row', gap: 8, paddingVertical: 3 },
  bullet: { fontSize: 13, fontFamily: 'Pretendard_700Bold', lineHeight: 20 },
  itemText: { flex: 1, fontSize: 13, lineHeight: 20, fontFamily: 'Pretendard_400Regular' },
});
