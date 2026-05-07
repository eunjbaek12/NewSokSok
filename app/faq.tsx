import React, { useState, useCallback } from 'react';
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
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';

interface FaqItem {
  q: string;
  a: string;
}

interface FaqCategory {
  title: string;
  items: FaqItem[];
}

export default function FaqScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const categories = t('faq.categories', { returnObjects: true }) as FaqCategory[];

  const toggle = useCallback((key: string) => {
    Haptics.selectionAsync();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('faq.title')}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('faq.headerSubtitle')}
        </Text>

        {categories.map((cat, ci) => (
          <View key={ci}>
            <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
              {cat.title}
            </Text>
            <View
              style={[
                styles.section,
                { backgroundColor: colors.surface, borderColor: colors.borderLight },
              ]}
            >
              {cat.items.map((item, ii) => {
                const key = `${ci}-${ii}`;
                const isOpen = expanded.has(key);
                const isLast = ii === cat.items.length - 1;
                return (
                  <View key={key}>
                    <Pressable
                      style={[
                        styles.qRow,
                        !isLast || isOpen
                          ? { borderBottomWidth: 1, borderBottomColor: colors.borderLight }
                          : null,
                      ]}
                      onPress={() => toggle(key)}
                    >
                      <Text style={[styles.qText, { color: colors.text }]}>
                        {item.q}
                      </Text>
                      <Ionicons
                        name={isOpen ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colors.textTertiary}
                      />
                    </Pressable>
                    {isOpen && (
                      <View
                        style={[
                          styles.aWrap,
                          { backgroundColor: colors.surfaceSecondary },
                          !isLast
                            ? { borderBottomWidth: 1, borderBottomColor: colors.borderLight }
                            : null,
                        ]}
                      >
                        <Text style={[styles.aText, { color: colors.textSecondary }]}>
                          {item.a}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
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
  subtitle: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    marginTop: 4,
    marginBottom: 4,
  },
  sectionHeader: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
  },
  section: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  qRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 12,
  },
  qText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Pretendard_500Medium',
    lineHeight: 22,
  },
  aWrap: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  aText: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    lineHeight: 22,
  },
});
