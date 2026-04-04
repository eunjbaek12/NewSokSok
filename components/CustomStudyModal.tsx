import React, { useMemo, useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { useSettings, type CustomStudySettings } from '@/contexts/SettingsContext';
import { Word } from '@/lib/types';
import ListDayPicker from './ListDayPicker';
import ModalOverlay from './ui/ModalOverlay';

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface CustomStudyModalProps {
  visible: boolean;
  onClose: () => void;
}

const FILTER_OPTION_KEYS: CustomStudySettings['wordFilter'][] = ['all', 'learning', 'wrongCount', 'recent', 'starred'];

export default function CustomStudyModal({ visible, onClose }: CustomStudyModalProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { lists } = useVocab();
  const { customStudySettings: settings, updateCustomStudySettings } = useSettings();
  const [showListPicker, setShowListPicker] = useState(false);

  const filterOptions = useMemo(() => [
    { key: 'all' as const, label: t('customStudy.filterAll') },
    { key: 'learning' as const, label: t('customStudy.filterUnmemorized') },
    { key: 'wrongCount' as const, label: t('customStudy.filterWrong') },
    { key: 'recent' as const, label: t('customStudy.filterRecent') },
    { key: 'starred' as const, label: t('customStudy.filterStarred') },
  ], [t]);

  const visibleLists = useMemo(() => lists.filter(l => l.isVisible), [lists]);

  // 삭제된 단어장 ID 자동 정리
  useEffect(() => {
    if (!settings.useAllLists && settings.selectedListIds.length > 0) {
      const validIds = settings.selectedListIds.filter(id =>
        visibleLists.some(l => l.id === id)
      );
      if (validIds.length !== settings.selectedListIds.length) {
        updateCustomStudySettings({ selectedListIds: validIds });
      }
    }
  }, [visibleLists, settings.useAllLists, settings.selectedListIds, updateCustomStudySettings]);

  const { wordCount, filteredWords } = useMemo(() => {
    const sourceLists = settings.useAllLists
      ? visibleLists
      : visibleLists.filter(l => settings.selectedListIds.includes(l.id));

    let words: Word[] = [];
    for (const list of sourceLists) {
      const daySelection = settings.selectedDaysByList[list.id];
      if (daySelection && daySelection !== 'all' && Array.isArray(daySelection)) {
        words.push(...list.words.filter(w => w.assignedDay != null && daySelection.includes(w.assignedDay)));
      } else {
        words.push(...list.words);
      }
    }

    switch (settings.wordFilter) {
      case 'learning':
        words = words.filter(w => !w.isMemorized);
        break;
      case 'wrongCount':
        words = words
          .filter(w => (w.wrongCount ?? 0) > 0)
          .sort((a, b) => (b.wrongCount ?? 0) - (a.wrongCount ?? 0))
          .slice(0, 50);
        break;
      case 'recent':
        words = [...words]
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
          .slice(0, 50);
        break;
      case 'starred':
        words = words.filter(w => w.isStarred);
        break;
    }

    return { wordCount: words.length, filteredWords: words };
  }, [visibleLists, settings.useAllLists, settings.selectedListIds, settings.selectedDaysByList, settings.wordFilter]);

  const handleStart = useCallback(() => {
    if (wordCount === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const shuffled = shuffleArray(filteredWords);
    const ids = shuffled.map(w => w.id).join(',');
    const pathname = settings.studyMode === 'flashcard'
      ? '/flashcards/[id]'
      : '/quiz/[id]';
    onClose();
    router.push({ pathname: pathname as any, params: { id: '__custom__', ids } });
  }, [wordCount, filteredWords, settings.studyMode, onClose]);

  // 학습 범위 요약 텍스트
  const rangeSummary = useMemo(() => {
    if (settings.useAllLists) {
      return t('customStudy.allLists');
    }
    const selectedNames = visibleLists
      .filter(l => settings.selectedListIds.includes(l.id))
      .map(l => l.title);
    if (selectedNames.length === 0) return t('customStudy.noneSelected');
    if (selectedNames.length === 1) return selectedNames[0];
    return t('customStudy.selectedLists', { first: selectedNames[0], rest: selectedNames.length - 1 });
  }, [settings.useAllLists, settings.selectedListIds, visibleLists, t]);

  const noLists = visibleLists.length === 0;

  return (
    <>
      <ModalOverlay
        visible={visible}
        onClose={onClose}
        variant="settingsPanel"
        scrollable
      >
            {/* 헤더 */}
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>{t('customStudy.title')}</Text>
              <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            {noLists ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="book-outline" size={40} color={colors.textTertiary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  {t('customStudy.noLists')}
                </Text>
              </View>
            ) : (
              <>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  style={styles.scrollView}
                  contentContainerStyle={{ paddingBottom: 8 }}
                >
                  {/* 학습 모드 */}
                  <View style={[styles.card, { backgroundColor: isDark ? colors.surface : '#FFF' }]}>
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('customStudy.studyMode')}</Text>
                    <View style={[styles.segmentedControl, { backgroundColor: isDark ? colors.surfaceSecondary : '#F3F4F6' }]}>
                      {(['flashcard', 'quiz'] as const).map(mode => {
                        const isActive = settings.studyMode === mode;
                        return (
                          <Pressable
                            key={mode}
                            onPress={() => updateCustomStudySettings({ studyMode: mode })}
                            style={[
                              styles.segmentedTab,
                              isActive && [styles.segmentedTabActive, { backgroundColor: isDark ? colors.surface : '#FFF' }],
                            ]}
                          >
                            <Text style={[
                              isActive ? styles.segmentedTabTextActive : styles.segmentedTabText,
                              { color: isActive ? colors.primary : colors.textSecondary },
                            ]}>
                              {mode === 'flashcard' ? t('customStudy.flashcards') : t('customStudy.quiz')}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* 학습 범위 */}
                  <View style={[styles.card, { backgroundColor: isDark ? colors.surface : '#FFF' }]}>
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('customStudy.studyScope')}</Text>
                    <Pressable
                      onPress={() => setShowListPicker(true)}
                      style={({ pressed }) => [styles.rangeRow, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={[styles.rangeText, { color: colors.text }]} numberOfLines={1}>
                        {rangeSummary}
                      </Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                    </Pressable>
                  </View>

                  {/* 단어 필터 */}
                  <View style={[styles.card, { backgroundColor: isDark ? colors.surface : '#FFF' }]}>
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('customStudy.wordFilter')}</Text>
                    <View style={styles.chipRow}>
                      {filterOptions.map(opt => {
                        const isActive = settings.wordFilter === opt.key;
                        return (
                          <Pressable
                            key={opt.key}
                            onPress={() => updateCustomStudySettings({ wordFilter: opt.key })}
                            style={[
                              styles.chip,
                              {
                                backgroundColor: isActive ? (colors.primaryLight ?? `${colors.primary}20`) : 'transparent',
                                borderColor: isActive ? colors.primary : colors.borderLight,
                              },
                            ]}
                          >
                            <Text style={[
                              styles.chipText,
                              { color: isActive ? colors.primary : colors.textSecondary },
                            ]}>
                              {opt.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </ScrollView>

                {/* 하단: 단어 수 + 버튼 */}
                <View style={styles.footer}>
                  <View style={styles.wordCountRow}>
                    <Ionicons
                      name={wordCount > 0 ? 'book' : 'alert-circle-outline'}
                      size={14}
                      color={wordCount > 0 ? colors.primary : colors.textTertiary}
                    />
                    <Text style={[
                      styles.wordCountText,
                      { color: wordCount > 0 ? colors.primary : colors.textTertiary },
                    ]}>
                      {wordCount > 0 ? t('customStudy.wordCount', { count: wordCount }) : t('customStudy.noMatchingWords')}
                    </Text>
                  </View>
                  <View style={styles.btnRow}>
                    <Pressable
                      style={[styles.btnCancel, { backgroundColor: isDark ? colors.surfaceSecondary : '#E5E7EB' }]}
                      onPress={onClose}
                    >
                      <Text style={[styles.btnCancelText, { color: isDark ? colors.textSecondary : '#4B5563' }]}>{t('common.close')}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.btnStart, { backgroundColor: wordCount > 0 ? colors.primary : colors.borderLight }]}
                      onPress={handleStart}
                      disabled={wordCount === 0}
                    >
                      <Text style={[styles.btnStartText, { color: wordCount > 0 ? '#FFF' : colors.textTertiary }]}>
                        {t('customStudy.startStudy')}
                      </Text>
                      {wordCount > 0 && <Ionicons name="arrow-forward" size={16} color="#FFF" />}
                    </Pressable>
                  </View>
                </View>
              </>
            )}
      </ModalOverlay>

      <ListDayPicker
        visible={showListPicker}
        onClose={() => setShowListPicker(false)}
        lists={visibleLists}
        selectedListIds={settings.useAllLists ? visibleLists.map(l => l.id) : settings.selectedListIds}
        selectedDaysByList={settings.selectedDaysByList}
        onApply={(listIds, daysByList) => {
          const isAll = listIds.length === visibleLists.length &&
            listIds.every(id => !daysByList[id] || daysByList[id] === 'all');
          updateCustomStudySettings({
            useAllLists: isAll,
            selectedListIds: isAll ? [] : listIds,
            selectedDaysByList: daysByList,
          });
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
  },
  title: {
    fontSize: 15,
    fontFamily: 'Pretendard_700Bold',
  },
  closeBtn: {
    padding: 6,
    marginRight: -6,
    backgroundColor: 'rgba(150,150,150,0.1)',
    borderRadius: 20,
  },
  scrollView: {
    flexShrink: 1,
    flexGrow: 0,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Pretendard_500Medium',
    textAlign: 'center',
  },
  card: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Pretendard_600SemiBold',
    marginBottom: 6,
    marginLeft: 2,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
  },
  segmentedTab: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  segmentedTabActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentedTabText: {
    fontSize: 13,
    fontFamily: 'Pretendard_500Medium',
  },
  segmentedTabTextActive: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 34,
  },
  rangeText: {
    fontSize: 14,
    fontFamily: 'Pretendard_500Medium',
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontFamily: 'Pretendard_600SemiBold',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 10,
  },
  wordCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  wordCountText: {
    fontSize: 12,
    fontFamily: 'Pretendard_500Medium',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btnCancel: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnCancelText: {
    fontSize: 14,
    fontFamily: 'Pretendard_600SemiBold',
  },
  btnStart: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnStartText: {
    fontSize: 14,
    fontFamily: 'Pretendard_700Bold',
  },
});
