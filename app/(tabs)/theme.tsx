import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { CURATED_THEMES, CuratedTheme } from '@/lib/curation-data';

export default function CurationTabScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { createCuratedList } = useVocab();

  const [viewMode, setViewMode] = useState<'detailed' | 'compact'>('detailed');
  const [selectedTheme, setSelectedTheme] = useState<CuratedTheme | null>(null);
  const [saving, setSaving] = useState(false);

  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 84 + 34 : 84;

  const handleToggleViewMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMode((prev) => (prev === 'detailed' ? 'compact' : 'detailed'));
  };

  const handleSelectTheme = (theme: CuratedTheme) => {
    Haptics.selectionAsync();
    setSelectedTheme(theme);
  };

  const handleBack = () => {
    Haptics.selectionAsync();
    setSelectedTheme(null);
  };

  const handleMasterTheme = async (theme: CuratedTheme) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      const newList = await createCuratedList(theme.title, theme.icon, theme.words);
      setSaving(false);
      setSelectedTheme(null);
      router.replace('/');
      setTimeout(() => {
        router.push({ pathname: '/list/[id]', params: { id: newList.id } });
      }, 100);
    } catch (e: any) {
      setSaving(false);
      if (e?.message === 'DUPLICATE_LIST') {
        alert('이 테마와 동일한 이름의 단어장이 이미 존재합니다.');
      } else {
        alert('테마를 추가하는 중 오류가 발생했습니다.');
      }
    }
  };

  if (selectedTheme) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={{ paddingBottom: bottomInset + 80 }} showsVerticalScrollIndicator={false}>
          <View style={[styles.detailHero, { backgroundColor: colors.surfaceSecondary, paddingTop: topInset + 16 }]}>
            <Pressable onPress={handleBack} style={[styles.backBtn, { backgroundColor: 'rgba(255,255,255,0.7)' }]}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </Pressable>

            <View style={styles.heroContent}>
              <Text style={styles.heroIcon}>{selectedTheme.icon}</Text>
            </View>

            <View style={styles.heroTextContainer}>
              <View style={styles.heroBadges}>
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.badgeText, { color: '#FFF' }]}>{selectedTheme.category}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                  <Text style={[styles.badgeText, { color: colors.text }]}>LV. {selectedTheme.level}</Text>
                </View>
              </View>
              <Text style={[styles.detailTitle, { color: colors.text }]}>{selectedTheme.title}</Text>
              <Text style={[styles.detailDesc, { color: colors.textSecondary }]}>{selectedTheme.description}</Text>
            </View>
          </View>

          <View style={[styles.detailBody, { backgroundColor: colors.background }]}>
            <Text style={[styles.sectionTitle, { color: colors.text, borderBottomColor: colors.borderLight }]}>테마 학습 정보</Text>

            <View style={styles.statsGrid}>
              <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.statLabel, { color: colors.textTertiary }]}>TOTAL WORDS</Text>
                <Text style={[styles.statValue, { color: colors.text }]}>{selectedTheme.count}</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.statLabel, { color: colors.textTertiary }]}>EXPERTISE</Text>
                <Text style={[styles.statValue, { color: colors.primary }]}>{selectedTheme.level}</Text>
              </View>
            </View>

            <View style={[styles.guideBox, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Ionicons name="sparkles" size={16} color={colors.primary} />
                <Text style={[styles.guideTitle, { color: colors.primary }]}>학습 가이드</Text>
              </View>
              <Text style={[styles.guideText, { color: colors.text }]}>
                이 테마를 리스트에 등록하면 {selectedTheme.count}개의 실전 전문 어휘를 홈 화면에서 관리하고 학습할 수 있습니다.
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.masterBar, { paddingBottom: bottomInset + 8, backgroundColor: colors.surface }]}>
          <Pressable
            onPress={() => handleMasterTheme(selectedTheme)}
            disabled={saving}
            style={[styles.masterBtn, { backgroundColor: colors.primary }]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
                <Text style={styles.masterBtnText}>이 테마 마스터하기</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>큐레이션</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>전문가가 엄선한 명품 테마 💎</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleToggleViewMode}
            style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name={viewMode === 'detailed' ? 'list' : 'grid'} size={22} color={colors.textSecondary} />
          </Pressable>
          <Pressable style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.listContainer,
          { paddingBottom: bottomInset + 20 },
          viewMode === 'compact' && { flexDirection: 'column', gap: 12 }
        ]}
      >
        {CURATED_THEMES.map((theme) => (
          <Pressable
            key={theme.id}
            onPress={() => handleSelectTheme(theme)}
            style={({ pressed }) => [
              styles.themeCard,
              { backgroundColor: colors.surface, borderColor: colors.borderLight },
              viewMode === 'detailed' ? styles.cardDetailed : styles.cardCompact,
              pressed && { opacity: 0.95, transform: [{ scale: 0.98 }] }
            ]}
          >
            <View style={[
              styles.cardIconBox,
              { backgroundColor: colors.surfaceSecondary },
              viewMode === 'detailed' ? styles.iconBoxDetailed : styles.iconBoxCompact
            ]}>
              <Text style={{ fontSize: viewMode === 'detailed' ? 32 : 24 }}>{theme.icon}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: colors.text }, viewMode === 'compact' && { fontSize: 16 }]} numberOfLines={1}>
                  {theme.title}
                </Text>
                <Text style={[styles.cardLevel, { color: colors.textTertiary }]}>{theme.level}</Text>
              </View>

              {viewMode === 'detailed' && (
                <>
                  <View style={[styles.cardDescBox, { backgroundColor: colors.surfaceSecondary }]}>
                    <Text style={[styles.cardDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                      "{theme.description}"
                    </Text>
                  </View>
                  <View style={styles.cardFooter}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="sparkles" size={12} color={colors.accent} />
                      <Text style={[styles.cardCount, { color: colors.primary }]}>{theme.count} 단어 수록</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <Text style={[styles.cardViewMore, { color: colors.primary }]}>상세보기</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                    </View>
                  </View>
                </>
              )}

              {viewMode === 'compact' && (
                <View style={styles.cardFooterCompact}>
                  <Text style={[styles.cardCountCompact, { color: colors.textTertiary }]}>
                    {theme.count} 단어 • {theme.category}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </View>
              )}
            </View>
          </Pressable>
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
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 28, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, fontFamily: 'Inter_500Medium', marginTop: 4 },
  headerActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContainer: { paddingHorizontal: 24, gap: 20 },
  themeCard: {
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardDetailed: { padding: 20 },
  cardCompact: { padding: 16, alignItems: 'center' },
  cardIconBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxDetailed: { width: 64, height: 64, borderRadius: 20 },
  iconBoxCompact: { width: 48, height: 48, borderRadius: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitle: { flex: 1, fontSize: 18, fontFamily: 'Inter_700Bold' },
  cardLevel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  cardDescBox: { padding: 12, borderRadius: 16, marginBottom: 16 },
  cardDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', fontStyle: 'italic', lineHeight: 20 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardCount: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  cardViewMore: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  cardFooterCompact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  cardCountCompact: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },

  detailHero: {
    height: 320,
    position: 'relative',
    padding: 24,
    justifyContent: 'flex-end',
  },
  backBtn: {
    position: 'absolute',
    top: 60,
    left: 24,
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  heroContent: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.1,
  },
  heroIcon: {
    fontSize: 140,
  },
  heroTextContainer: { zIndex: 1 },
  heroBadges: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  detailTitle: { fontSize: 28, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  detailDesc: { fontSize: 14, fontFamily: 'Inter_500Medium', lineHeight: 22 },

  detailBody: {
    flex: 1,
    padding: 24,
    marginTop: -24,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    minHeight: 400,
  },
  sectionTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', borderBottomWidth: 1, paddingBottom: 16, marginBottom: 24 },
  statsGrid: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  statBox: { flex: 1, padding: 20, borderRadius: 24, borderWidth: 1 },
  statLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 8 },
  statValue: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  guideBox: { padding: 20, borderRadius: 24, borderWidth: 1 },
  guideTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  guideText: { fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 22 },

  masterBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 10,
  },
  masterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 20,
    gap: 12,
  },
  masterBtnText: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
});
