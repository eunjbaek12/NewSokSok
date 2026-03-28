import React, { useCallback, useRef, useState, useEffect } from 'react';
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
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { VocaList } from '@/lib/types';
import ScrollIndicator from '@/components/ui/ScrollIndicator';
import ListCard from '@/components/ListCard';
import ManageModal from '@/components/ManageModal';
import ListContextMenu from '@/components/ListContextMenu';

export default function VocabListsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();

  const scrollRef = useRef<FlatList>(null);
  useScrollToTop(scrollRef);
  const scrollY = useRef(new RNAnimated.Value(0)).current;
  const [listContentHeight, setListContentHeight] = useState(0);
  const [listVisibleHeight, setListVisibleHeight] = useState(0);

  const {
    lists,
    loading,
    refreshData,
    createList,
    deleteList,
    toggleVisibility,
    getListProgress,
    getWordsForList,
    renameList,
    mergeLists,
    reorderLists,
    shareList,
  } = useVocab();

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
  const bottomPadding = Platform.OS === 'web' ? 120 + 34 : 120;
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
          style={[styles.emptyButton, { backgroundColor: colors.primary }]}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.emptyButtonText}>{t('vocabLists.createList')}</Text>
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

  const renderHeader = useCallback(() => {
    return (
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('vocabLists.title')}</Text>
          {visibleLists.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.countBadgeText, { color: colors.primary }]}>
                {visibleLists.length}
              </Text>
            </View>
          )}
        </View>
        <Pressable
          onPress={openManageModal}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
        </Pressable>
      </View>
    );
  }, [visibleLists.length, colors, openManageModal, t]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('vocabLists.title')}</Text>
      </View>

      {/* Fixed Search Bar */}
      <View style={[styles.searchBarWrapper, { backgroundColor: colors.background }]}>
        <Pressable
          onPress={() => router.push('/search-modal')}
          style={({ pressed }) => [
            styles.searchTrigger,
            { backgroundColor: colors.surface, borderColor: colors.borderLight },
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
              onRefresh={refreshData}
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

      {/* FABs */}
      {visibleLists.length > 0 && (
        <View style={{ position: 'absolute', right: 20, bottom: insets.bottom + 84, alignItems: 'center' }}>
          <RNAnimated.View
            style={{
              transform: [{
                translateY: fabAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -64],
                })
              }],
              zIndex: 2,
            }}
          >
            <Pressable
              onPress={() => router.push('/add-word')}
              style={({ pressed }) => [
                styles.fab,
                {
                  position: 'relative',
                  right: 0,
                  bottom: 0,
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Ionicons name="add" size={28} color="#FFFFFF" />
            </Pressable>
          </RNAnimated.View>

          <RNAnimated.View
            style={{
              position: 'absolute',
              bottom: 0,
              opacity: fabAnim,
              transform: [{
                scale: fabAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.7, 1],
                })
              }],
              zIndex: 1,
            }}
            pointerEvents="box-none"
          >
            <Pressable
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
        </View>
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
        refreshData={refreshData}
      />
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
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: 'Pretendard_700Bold',
    letterSpacing: -0.5,
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
    shadowColor: '#000',
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
    color: '#FFFFFF',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
});
