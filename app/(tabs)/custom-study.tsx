import React, { useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useVocab } from '@/contexts/VocabContext';
import { useSettings } from '@/contexts/SettingsContext';
import { Word } from '@/lib/types';

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function CustomStudyScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { lists } = useVocab();
  const { customStudySettings: settings, updateCustomStudySettings } = useSettings();

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
  }, [visibleLists]);

  const { wordCount, filteredWords } = useMemo(() => {
    const sourceLists = settings.useAllLists
      ? visibleLists
      : visibleLists.filter(l => settings.selectedListIds.includes(l.id));

    let words: Word[] = sourceLists.flatMap(l => l.words);

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
  }, [visibleLists, settings.useAllLists, settings.selectedListIds, settings.wordFilter]);

  const handleStart = useCallback(() => {
    if (wordCount === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const shuffled = shuffleArray(filteredWords);
    const ids = shuffled.map(w => w.id).join(',');
    const pathname = settings.studyMode === 'flashcard'
      ? '/flashcards/[id]'
      : '/quiz/[id]';
    router.push({ pathname: pathname as any, params: { id: '__custom__', ids } });
  }, [wordCount, filteredWords, settings.studyMode]);

  const toggleListSelection = useCallback((listId: string) => {
    const current = settings.selectedListIds;
    const next = current.includes(listId)
      ? current.filter(id => id !== listId)
      : [...current, listId];
    updateCustomStudySettings({ selectedListIds: next });
  }, [settings.selectedListIds, updateCustomStudySettings]);

  const topPadding = Platform.OS === 'web' ? insets.top + 67 : insets.top;
  const bottomPadding = 120 + (insets.bottom || 0);

  const FILTER_OPTIONS: { key: typeof settings.wordFilter; label: string; desc: string; icon: string }[] = [
    { key: 'all', label: '전체 단어', desc: '단어장의 모든 단어', icon: 'layers-outline' },
    { key: 'learning', label: '미암기 단어', desc: '아직 외우지 못한 단어', icon: 'close-circle-outline' },
    { key: 'wrongCount', label: '오답 위주', desc: '자주 틀린 단어 최대 50개', icon: 'alert-circle-outline' },
    { key: 'recent', label: '최근 추가', desc: '최근에 추가된 단어 최대 50개', icon: 'time-outline' },
    { key: 'starred', label: '별표 단어', desc: '별표 표시한 단어만', icon: 'star-outline' },
  ];

  const noLists = visibleLists.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topPadding + 16, paddingBottom: bottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>맞춤 학습</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            원하는 조건으로 단어를 골라 학습하세요
          </Text>
        </View>

        {noLists ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="book-outline" size={56} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              단어장이 없습니다.{'\n'}홈에서 단어장을 먼저 만들어보세요.
            </Text>
          </View>
        ) : (
          <>
            {/* 섹션 1: 학습 범위 */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>학습 범위</Text>
              <View style={[styles.card, { backgroundColor: colors.surface }]}>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleLeft}>
                    <Ionicons name="albums-outline" size={20} color={colors.primary} />
                    <Text style={[styles.toggleLabel, { color: colors.text }]}>전체 단어장</Text>
                  </View>
                  <Switch
                    value={settings.useAllLists}
                    onValueChange={(v) => updateCustomStudySettings({ useAllLists: v })}
                    trackColor={{ false: colors.borderLight, true: colors.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {!settings.useAllLists && (
                  <>
                    <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
                    {visibleLists.map((list, index) => {
                      const selected = settings.selectedListIds.includes(list.id);
                      return (
                        <Pressable
                          key={list.id}
                          onPress={() => toggleListSelection(list.id)}
                          style={({ pressed }) => [
                            styles.listRow,
                            index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
                            pressed && { opacity: 0.6 },
                          ]}
                        >
                          <View style={styles.listRowLeft}>
                            {list.icon ? (
                              <Text style={styles.listIcon}>{list.icon}</Text>
                            ) : (
                              <Ionicons name="book-outline" size={18} color={colors.textTertiary} />
                            )}
                            <View>
                              <Text style={[styles.listTitle, { color: colors.text }]} numberOfLines={1}>
                                {list.title}
                              </Text>
                              <Text style={[styles.listCount, { color: colors.textTertiary }]}>
                                {list.words.length}개 단어
                              </Text>
                            </View>
                          </View>
                          <View style={[
                            styles.checkbox,
                            {
                              backgroundColor: selected ? colors.primary : 'transparent',
                              borderColor: selected ? colors.primary : colors.border,
                            }
                          ]}>
                            {selected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                          </View>
                        </Pressable>
                      );
                    })}
                  </>
                )}
              </View>
            </View>

            {/* 섹션 2: 단어 필터 */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>단어 필터</Text>
              <View style={[styles.card, { backgroundColor: colors.surface }]}>
                {FILTER_OPTIONS.map((opt, index) => (
                  <Pressable
                    key={opt.key}
                    onPress={() => updateCustomStudySettings({ wordFilter: opt.key })}
                    style={({ pressed }) => [
                      styles.filterRow,
                      index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <View style={styles.filterLeft}>
                      <View style={[
                        styles.filterIconBox,
                        { backgroundColor: settings.wordFilter === opt.key ? colors.primaryLight : colors.backgroundSecondary ?? colors.surface }
                      ]}>
                        <Ionicons
                          name={opt.icon as any}
                          size={18}
                          color={settings.wordFilter === opt.key ? colors.primary : colors.textTertiary}
                        />
                      </View>
                      <View>
                        <Text style={[styles.filterLabel, { color: colors.text }]}>{opt.label}</Text>
                        <Text style={[styles.filterDesc, { color: colors.textTertiary }]}>{opt.desc}</Text>
                      </View>
                    </View>
                    <View style={[
                      styles.radio,
                      {
                        borderColor: settings.wordFilter === opt.key ? colors.primary : colors.border,
                        backgroundColor: settings.wordFilter === opt.key ? colors.primary : 'transparent',
                      }
                    ]}>
                      {settings.wordFilter === opt.key && (
                        <View style={styles.radioDot} />
                      )}
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* 섹션 3: 학습 모드 */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>학습 모드</Text>
              <View style={styles.modeRow}>
                <Pressable
                  onPress={() => updateCustomStudySettings({ studyMode: 'flashcard' })}
                  style={({ pressed }) => [
                    styles.modeCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: settings.studyMode === 'flashcard' ? colors.primary : colors.borderLight,
                      borderWidth: settings.studyMode === 'flashcard' ? 2 : 1,
                      opacity: pressed ? 0.7 : 1,
                    }
                  ]}
                >
                  <View style={[
                    styles.modeIconBox,
                    { backgroundColor: settings.studyMode === 'flashcard' ? colors.primaryLight : colors.backgroundSecondary ?? colors.surface }
                  ]}>
                    <Ionicons
                      name="layers-outline"
                      size={28}
                      color={settings.studyMode === 'flashcard' ? colors.primary : colors.textTertiary}
                    />
                  </View>
                  <Text style={[
                    styles.modeName,
                    { color: settings.studyMode === 'flashcard' ? colors.primary : colors.text }
                  ]}>플래시카드</Text>
                  <Text style={[styles.modeDesc, { color: colors.textTertiary }]}>카드 뒤집기</Text>
                </Pressable>

                <Pressable
                  onPress={() => updateCustomStudySettings({ studyMode: 'quiz' })}
                  style={({ pressed }) => [
                    styles.modeCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: settings.studyMode === 'quiz' ? colors.primary : colors.borderLight,
                      borderWidth: settings.studyMode === 'quiz' ? 2 : 1,
                      opacity: pressed ? 0.7 : 1,
                    }
                  ]}
                >
                  <View style={[
                    styles.modeIconBox,
                    { backgroundColor: settings.studyMode === 'quiz' ? colors.primaryLight : colors.backgroundSecondary ?? colors.surface }
                  ]}>
                    <Ionicons
                      name="create-outline"
                      size={28}
                      color={settings.studyMode === 'quiz' ? colors.primary : colors.textTertiary}
                    />
                  </View>
                  <Text style={[
                    styles.modeName,
                    { color: settings.studyMode === 'quiz' ? colors.primary : colors.text }
                  ]}>객관식 퀴즈</Text>
                  <Text style={[styles.modeDesc, { color: colors.textTertiary }]}>4지선다</Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* 하단 고정: 단어 수 미리보기 + 시작 버튼 */}
      {!noLists && (
        <View style={[
          styles.bottomBar,
          {
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + 16,
            borderTopColor: colors.borderLight,
          }
        ]}>
          <View style={styles.wordCountRow}>
            <Ionicons
              name={wordCount > 0 ? 'book' : 'alert-circle-outline'}
              size={16}
              color={wordCount > 0 ? colors.primary : colors.textTertiary}
            />
            <Text style={[
              styles.wordCountText,
              { color: wordCount > 0 ? colors.primary : colors.textTertiary }
            ]}>
              {wordCount > 0
                ? `${wordCount}개 단어로 학습을 시작합니다`
                : '해당 조건의 단어가 없습니다'}
            </Text>
          </View>
          <Pressable
            onPress={handleStart}
            disabled={wordCount === 0}
            style={({ pressed }) => [
              styles.startBtn,
              {
                backgroundColor: wordCount > 0 ? colors.primary : colors.borderLight,
                opacity: pressed ? 0.8 : 1,
              }
            ]}
          >
            <Text style={[
              styles.startBtnText,
              { color: wordCount > 0 ? '#FFFFFF' : colors.textTertiary }
            ]}>
              학습 시작
            </Text>
            {wordCount > 0 && (
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Pretendard_700Bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Pretendard_400Regular',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
    gap: 16,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: 'Pretendard_500Medium',
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'Pretendard_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toggleLabel: {
    fontSize: 15,
    fontFamily: 'Pretendard_600SemiBold',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  listRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  listIcon: {
    fontSize: 20,
  },
  listTitle: {
    fontSize: 14,
    fontFamily: 'Pretendard_600SemiBold',
    maxWidth: 200,
  },
  listCount: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
    marginTop: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  filterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  filterIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterLabel: {
    fontSize: 14,
    fontFamily: 'Pretendard_600SemiBold',
  },
  filterDesc: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
    marginTop: 1,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modeCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  modeIconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeName: {
    fontSize: 14,
    fontFamily: 'Pretendard_700Bold',
  },
  modeDesc: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  wordCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  wordCountText: {
    fontSize: 13,
    fontFamily: 'Pretendard_500Medium',
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
  },
  startBtnText: {
    fontSize: 17,
    fontFamily: 'Pretendard_700Bold',
  },
});
