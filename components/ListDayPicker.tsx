import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { groupWordsByDay } from '@/lib/plan-engine';
import type { VocaList } from '@/lib/types';

interface ListDayPickerProps {
  visible: boolean;
  onClose: () => void;
  lists: VocaList[];
  selectedListIds: string[];
  selectedDaysByList: Record<string, number[] | 'all'>;
  onApply: (listIds: string[], daysByList: Record<string, number[] | 'all'>) => void;
}

export default function ListDayPicker({
  visible,
  onClose,
  lists,
  selectedListIds,
  selectedDaysByList,
  onApply,
}: ListDayPickerProps) {
  const { colors, isDark } = useTheme();

  // 로컬 임시 state
  const [tempListIds, setTempListIds] = useState<string[]>([]);
  const [tempDaysByList, setTempDaysByList] = useState<Record<string, number[] | 'all'>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) {
      setTempListIds([...selectedListIds]);
      setTempDaysByList({ ...selectedDaysByList });
      setExpandedIds(new Set());
    }
  }, [visible, selectedListIds, selectedDaysByList]);

  const isAllSelected = tempListIds.length === lists.length;

  const toggleAll = () => {
    if (isAllSelected) {
      setTempListIds([]);
      setTempDaysByList({});
    } else {
      setTempListIds(lists.map(l => l.id));
      const days: Record<string, number[] | 'all'> = {};
      for (const l of lists) {
        days[l.id] = 'all';
      }
      setTempDaysByList(days);
    }
  };

  const toggleList = (listId: string) => {
    if (tempListIds.includes(listId)) {
      setTempListIds(prev => prev.filter(id => id !== listId));
      setTempDaysByList(prev => {
        const next = { ...prev };
        delete next[listId];
        return next;
      });
    } else {
      setTempListIds(prev => [...prev, listId]);
      setTempDaysByList(prev => ({ ...prev, [listId]: 'all' }));
    }
  };

  const toggleExpand = (listId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(listId)) {
        next.delete(listId);
      } else {
        next.add(listId);
      }
      return next;
    });
  };

  const toggleDay = (listId: string, day: number, totalDays: number[]) => {
    setTempDaysByList(prev => {
      const current = prev[listId];
      if (current === 'all' || !current) {
        // 전체에서 하나를 해제 → 나머지만 선택
        return { ...prev, [listId]: totalDays.filter(d => d !== day) };
      }
      if (current.includes(day)) {
        const next = current.filter(d => d !== day);
        return { ...prev, [listId]: next.length === 0 ? 'all' : next };
      }
      const next = [...current, day];
      return { ...prev, [listId]: next.length === totalDays.length ? 'all' : next };
    });
  };

  const selectAllDays = (listId: string) => {
    setTempDaysByList(prev => ({ ...prev, [listId]: 'all' }));
  };

  const handleApply = () => {
    onApply(tempListIds, tempDaysByList);
    onClose();
  };

  // 각 리스트별 Day 섹션 캐시
  const daySectionsMap = useMemo(() => {
    const map: Record<string, { day: number; count: number }[]> = {};
    for (const list of lists) {
      if (list.planTotalDays && list.planTotalDays > 0) {
        const sections = groupWordsByDay(list.words);
        map[list.id] = sections
          .filter(s => s.day > 0)
          .map(s => ({ day: s.day, count: s.data.length }));
      }
    }
    return map;
  }, [lists]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.container, { backgroundColor: isDark ? colors.background : '#F3F4F6' }]}>
          {/* 헤더 */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>학습 범위 선택</Text>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* 전체 선택 */}
          <Pressable
            onPress={toggleAll}
            style={[styles.allRow, { backgroundColor: isDark ? colors.surface : '#FFF', marginHorizontal: 12, borderRadius: 10, marginBottom: 6 }]}
          >
            <View style={[
              styles.checkbox,
              {
                backgroundColor: isAllSelected ? colors.primary : 'transparent',
                borderColor: isAllSelected ? colors.primary : colors.border,
              },
            ]}>
              {isAllSelected && <Ionicons name="checkmark" size={12} color="#FFF" />}
            </View>
            <Text style={[styles.allText, { color: colors.text }]}>전체 선택</Text>
          </Pressable>

          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {lists.map(list => {
              const selected = tempListIds.includes(list.id);
              const hasDays = !!daySectionsMap[list.id] && daySectionsMap[list.id].length > 0;
              const expanded = expandedIds.has(list.id);
              const daySections = daySectionsMap[list.id] || [];
              const daySelection = tempDaysByList[list.id];
              const allDayNums = daySections.map(s => s.day);

              return (
                <View key={list.id} style={[styles.listItem, { backgroundColor: isDark ? colors.surface : '#FFF' }]}>
                  <View style={styles.listRow}>
                    <Pressable
                      onPress={() => toggleList(list.id)}
                      style={styles.listRowLeft}
                    >
                      <View style={[
                        styles.checkbox,
                        {
                          backgroundColor: selected ? colors.primary : 'transparent',
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}>
                        {selected && <Ionicons name="checkmark" size={12} color="#FFF" />}
                      </View>
                      {list.icon ? (
                        <Text style={styles.listIcon}>{list.icon}</Text>
                      ) : (
                        <Ionicons name="book-outline" size={16} color={colors.textTertiary} />
                      )}
                      <View style={styles.listInfo}>
                        <Text style={[styles.listTitle, { color: colors.text }]} numberOfLines={1}>
                          {list.title}
                        </Text>
                        <Text style={[styles.listCount, { color: colors.textTertiary }]}>
                          {list.words.length}개
                        </Text>
                      </View>
                    </Pressable>
                    {hasDays && selected && (
                      <Pressable onPress={() => toggleExpand(list.id)} hitSlop={8} style={styles.expandBtn}>
                        <Ionicons
                          name={expanded ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color={colors.textTertiary}
                        />
                      </Pressable>
                    )}
                  </View>

                  {/* Day 칩 */}
                  {hasDays && selected && expanded && (
                    <View style={styles.dayChipRow}>
                      <Pressable
                        onPress={() => selectAllDays(list.id)}
                        style={[
                          styles.dayChip,
                          {
                            backgroundColor: daySelection === 'all' ? (colors.primaryLight ?? `${colors.primary}20`) : 'transparent',
                            borderColor: daySelection === 'all' ? colors.primary : colors.borderLight,
                          },
                        ]}
                      >
                        <Text style={[
                          styles.dayChipText,
                          { color: daySelection === 'all' ? colors.primary : colors.textSecondary },
                        ]}>전체</Text>
                      </Pressable>
                      {daySections.map(section => {
                        const isDayActive = daySelection === 'all' || (Array.isArray(daySelection) && daySelection.includes(section.day));
                        return (
                          <Pressable
                            key={section.day}
                            onPress={() => toggleDay(list.id, section.day, allDayNums)}
                            style={[
                              styles.dayChip,
                              {
                                backgroundColor: isDayActive ? (colors.primaryLight ?? `${colors.primary}20`) : 'transparent',
                                borderColor: isDayActive ? colors.primary : colors.borderLight,
                              },
                            ]}
                          >
                            <Text style={[
                              styles.dayChipText,
                              { color: isDayActive ? colors.primary : colors.textSecondary },
                            ]}>
                              Day{section.day}
                            </Text>
                            <Text style={[styles.dayChipCount, { color: isDayActive ? colors.primary : colors.textTertiary }]}>
                              {section.count}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {/* 적용 버튼 */}
          <View style={styles.footer}>
            <Pressable style={[styles.applyBtn, { backgroundColor: colors.primary }]} onPress={handleApply}>
              <Text style={styles.applyBtnText}>적용</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
    paddingTop: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 44,
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
  allRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  allText: {
    fontSize: 14,
    fontFamily: 'Pretendard_600SemiBold',
  },
  scrollView: {
    flexShrink: 1,
    paddingHorizontal: 12,
  },
  listItem: {
    borderRadius: 10,
    marginBottom: 4,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  listRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listIcon: {
    fontSize: 18,
  },
  listInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  listTitle: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
    flexShrink: 1,
  },
  listCount: {
    fontSize: 11,
    fontFamily: 'Pretendard_400Regular',
  },
  expandBtn: {
    padding: 4,
  },
  dayChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 2,
  },
  dayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 3,
  },
  dayChipText: {
    fontSize: 11,
    fontFamily: 'Pretendard_600SemiBold',
  },
  dayChipCount: {
    fontSize: 10,
    fontFamily: 'Pretendard_400Regular',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
  },
  applyBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'Pretendard_600SemiBold',
  },
});
