import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
  RefreshControl,
  ActivityIndicator,
  Animated as RNAnimated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import CharacterSvg from '@/components/CharacterSvg';
import { SkinBackdrop } from '@/components/SkinBackdrop';
import { AppBannerAd, useTabContentBottomInset, useAdsBottomInset } from '@/components/ads/AppBannerAd';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import {
  useLists,
  useBootstrapLoading,
  useListProgress,
  useListWords,
  useShareList,
  invalidateLists,
  createList,
  deleteList,
  toggleVisibility,
  renameList,
  mergeLists,
  reorderLists,
  selectWordsForList,
  selectListProgress,
} from '@/features/vocab';
import { VocaList } from '@/lib/types';
import ScrollIndicator from '@/components/ui/ScrollIndicator';
import ListCard from '@/components/ListCard';
import ManageModal from '@/components/ManageModal';
import ListContextMenu from '@/components/ListContextMenu';

export default function VocabListsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors, isDark, skinId, fontFamily } = useTheme();

  const dailyTip = useMemo(() => {
    const tips = t('vocabLists.tips', { returnObjects: true }) as string[];
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return tips[dayOfYear % tips.length];
  }, [t]);

  const scrollRef = useRef<FlatList>(null);
  useScrollToTop(scrollRef);
  const scrollY = useRef(new RNAnimated.Value(0)).current;
  const [listContentHeight, setListContentHeight] = useState(0);
  const [listVisibleHeight, setListVisibleHeight] = useState(0);

  const lists = useLists();
  const loading = useBootstrapLoading();
  const getListProgress = (listId: string) => selectListProgress(lists, listId);
  const getWordsForList = (listId: string) => selectWordsForList(lists, listId);
  const shareList = useShareList();

  const [menuList, setMenuList] = useState<VocaList | null>(null);
  type MenuPos = { x: number; y: number; width: number; height: number };
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  const fabAnim = useRef(new RNAnimated.Value(0)).current;
  const isTopBtnVisible = useRef(false);

  useEffect(() => {
    const listener = scrollY.addListener(({ value }) => {
      const shouldShow = value > 300;
      if (shouldShow !== isTopBtnVisible.current) {
        isTopBtnVisible.current = shouldShow;
        RNAnimated.spring(fabAnim, {
          toValue: shouldShow ? 1 : 0,
          useNativeDriver: true,
          tension: 60,
          friction: 8,
        }).start();
      }
    });
    return () => scrollY.removeListener(listener);
  }, [scrollY, fabAnim]);

  const topPadding = Platform.OS === 'web' ? insets.top + 67 : insets.top;
  const bottomPadding = useTabContentBottomInset(16);
  const adsInset = useAdsBottomInset();
  const visibleLists = lists.filter((l) => l.isVisible);

  const handleOpenMenu = useCallback((list: VocaList, pos: MenuPos) => {
    setMenuList(list);
    setMenuPos(pos);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setMenuList(null);
    setMenuPos(null);
  }, []);

  const openManageModal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setManageOpen(true);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: VocaList }) => (
      <ListCard
        item={item}
        getListProgress={getListProgress}
        getWordsForList={getWordsForList}
        onOpenMenu={handleOpenMenu}
      />
    ),
    [getListProgress, getWordsForList, handleOpenMenu]
  );

  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyIconCircle, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="library-outline" size={48} color={colors.primary} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('vocabLists.emptyTitle')}</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          {t('vocabLists.emptySubtitle')}
        </Text>
        <Pressable
          onPress={openManageModal}
          style={[styles.emptyButton, { backgroundColor: colors.primaryButton }]}
        >
          <Ionicons name="add" size={20} color={colors.onPrimary} />
          <Text style={[styles.emptyButtonText, { color: colors.onPrimary }]}>{t('vocabLists.createList')}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.navigate('/(tabs)/curation')}
          style={styles.emptySecondaryLink}
        >
          <Ionicons name="sparkles-outline" size={14} color={colors.secondary} />
          <Text style={[styles.emptySecondaryText, { color: colors.secondary }]}>
            {t('vocabLists.browseCuration')}
          </Text>
        </Pressable>
      </View>
    ),
    [colors, openManageModal, t]
  );

  const renderHeader = useCallback(() => null, []);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 스킨 배경 그림 — 홈과 같은 자리·같은 규칙(맨 뒤 레이어, 터치 통과).
          네 탭에 다 깐다: 배경이 홈에만 있으면 스킨이 아니라 홈 장식이 된다.
          🔑 홈용으로 그린 구도가 여기서도 맞는 이유는 세 탭의 «열린 자리»가 같기
             때문이다(실측: 헤더 띠 87~97%% 열림 · 좌우 60px 레일 99%% · 가운데는
             카드가 덮는다). 그림의 무게가 정확히 그 배분이다 — docs/skin-art-brief.md §1. */}
      <SkinBackdrop skinId={skinId} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <CharacterSvg size={56} isDark={isDark} />
        <View style={styles.headerTextArea}>
          <View style={styles.headerTitleRow}>
            <Text style={[styles.headerTitle, { color: colors.text, fontFamily: fontFamily.bold }]}>{t('vocabLists.title')}</Text>
            {visibleLists.length > 0 && (
              <View style={[styles.countBadge, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.countBadgeText, { color: colors.primary }]}>
                  {visibleLists.length}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
            {dailyTip}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('manage.title')}
          onPress={openManageModal}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          <Ionicons name="pencil-outline" size={18} color={colors.primary} />
        </Pressable>
      </View>

      {/* Fixed Search Bar */}
      {/* 🔴 배경색을 칠하지 않는다. 목록(FlatList)은 이 띠 «아래» 형제로 놓여 밑으로
          스크롤되지 않고(scrollY 는 FAB 만 움직인다) 헤더도 안 접히므로, 여기 칠하는
          colors.background 는 컨테이너와 같은 색이라 원래 아무 일도 안 했다. 그런데
          스킨 배경 그림이 깔리는 순간 **그림 위에 불투명 띠**가 되어 무늬가 그 줄에서만
          끊긴다. 안 보이던 중복이 배경이 생기자 결함이 됐다. */}
      <View style={styles.searchBarWrapper}>
        <Pressable
          onPress={() => router.push('/search-modal')}
          style={({ pressed }) => [
            styles.searchTrigger,
            { backgroundColor: colors.surface, borderColor: colors.borderLight, shadowColor: colors.shadow },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="search" size={20} color={colors.textTertiary} />
          <Text style={[styles.searchTriggerText, { color: colors.textTertiary }]}>{t('vocabLists.searchPlaceholder')}</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        <FlatList
          ref={scrollRef}
          data={visibleLists}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomPadding },
            visibleLists.length === 0 && styles.listContentEmpty,
          ]}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={invalidateLists}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
          scrollEnabled={visibleLists.length > 0}
          onScroll={RNAnimated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
          scrollEventThrottle={16}
          onContentSizeChange={(_, h) => setListContentHeight(h)}
          onLayout={(e) => setListVisibleHeight(e.nativeEvent.layout.height)}
        />
        <ScrollIndicator
          scrollY={scrollY}
          contentHeight={listContentHeight}
          visibleHeight={listVisibleHeight}
        />
      </View>

      {/* Scroll to top FAB */}
      {visibleLists.length > 0 && (
        <RNAnimated.View
          style={{
            position: 'absolute',
            right: 20,
            bottom: insets.bottom + 84 + adsInset,
            opacity: fabAnim,
            transform: [{
              scale: fabAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.7, 1],
              })
            }],
          }}
          pointerEvents="box-none"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.scrollToTop')}
            onPress={() => {
              scrollRef.current?.scrollToOffset({ offset: 0, animated: true });
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            style={({ pressed }) => [
              styles.fab,
              {
                position: 'relative',
                right: 0,
                bottom: 0,
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.9)',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                opacity: pressed ? 0.7 : 1,
                shadowColor: colors.shadow,
                shadowOpacity: 0.15,
              },
            ]}
          >
            {Platform.OS === 'ios' && (
              <View style={[StyleSheet.absoluteFill, { borderRadius: 24, overflow: 'hidden' }]}>
                <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
              </View>
            )}
            <Ionicons name="arrow-up" size={24} color={colors.text} />
          </Pressable>
        </RNAnimated.View>
      )}

      {/* Modals */}
      <ListContextMenu
        menuList={menuList}
        menuPos={menuPos}
        lists={lists}
        onClose={handleCloseMenu}
        onRenameList={renameList}
        onDeleteList={deleteList}
        onToggleVisibility={toggleVisibility}
        onMergeLists={mergeLists}
        onShareList={shareList}
      />

      <ManageModal
        visible={manageOpen}
        onClose={() => setManageOpen(false)}
        lists={lists}
        createList={createList}
        deleteList={deleteList}
        renameList={renameList}
        toggleVisibility={toggleVisibility}
        reorderLists={reorderLists}
        refreshData={invalidateLists}
      />

      <AppBannerAd mode="tab-anchor" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTextArea: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: 'Pretendard_700Bold',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
    marginTop: 2,
    lineHeight: 20,
  },
  searchBarWrapper: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  searchTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  searchTriggerText: {
    fontSize: 15,
    fontFamily: 'Pretendard_400Regular',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Pretendard_700Bold',
    letterSpacing: -0.3,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
  },
  countBadgeText: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'Pretendard_600SemiBold',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    fontFamily: 'Pretendard_400Regular',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  emptyButtonText: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
  },
  emptySecondaryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 16,
    paddingVertical: 4,
  },
  emptySecondaryText: {
    fontSize: 14,
    fontFamily: 'Pretendard_500Medium',
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
});
