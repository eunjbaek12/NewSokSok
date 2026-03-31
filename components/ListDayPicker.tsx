import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { groupWordsByDay } from '@/lib/plan-engine';
import type { VocaList } from '@/lib/types';
import ModalOverlay from './ui/ModalOverlay';

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
  const { t } = useTranslation();

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

  const isAllSelected = lists.length > 0 && tempListIds.length === lists.length && lists.every(list => {
    const sections = daySectionsMap[list.id];
    if (sections && sections.length > 0) {
      return tempDaysByList[list.id] === 'all';
    }
    return true;
  });

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
    const current = tempDaysByList[listId];
    if (current === 'all' || !current) {
      setTempDaysByList(prev => ({ ...prev, [listId]: totalDays.filter(d => d !== day) }));
      return;
    }
    if (current.includes(day)) {
      const next = current.filter(d => d !== day);
      if (next.length === 0) {
        setTempListIds(prev => prev.filter(id => id !== listId));
        setTempDaysByList(prev => {
          const nextDays = { ...prev };
          delete nextDays[listId];
          return nextDays;
        });
      } else {
        setTempDaysByList(prev => ({ ...prev, [listId]: next }));
      }
      return;
    }
    const next = [...current, day];
    setTempDaysByList(prev => ({ ...prev, [listId]: next.length === totalDays.length ? 'all' : next }));
  };

  const selectAllDays = (listId: string) => {
    if (tempDaysByList[listId] === 'all') {
      setTempListIds(prev => prev.filter(id => id !== listId));
      setTempDaysByList(prev => {
        const next = { ...prev };
        delete next[listId];
        return next;
      });
    } else {
      setTempDaysByList(prev => ({ ...prev, [listId]: 'all' }));
    }
  };

  const handleApply = () => {
    onApply(tempListIds, tempDaysByList);
    onClose();
  };

  return (
    <ModalOverlay
      visible={visible}
      onClose={onClose}
      variant="settingsPanel"
      maxHeight="80%"
    >
          {/* 헤더 */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{t('dayPicker.title')}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* 전체 선택 */}
          <Pressable
            onPress={toggleAll}
            style={[styles.allRow, { backgroundColor: isDark ? colors.surface : '#FFF', marginHorizontal: 12, borderRadius: 10, marginBottom: 6 }]}
          >
            <Text style={[styles.allText, { color: colors.text }]}>{t('dayPicker.selectAll')}</Text>
            <View style={[
              styles.checkbox,
              {
                backgroundColor: isAllSelected ? colors.primary : 'transparent',
                borderColor: isAllSelected ? colors.primary : colors.border,
              },
            ]}>
              {isAllSelected && <Ionicons name="checkmark" size={12} color="#FFF" />}
            </View>
          </Pressable>

          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {lists.map(list => {
              const selected = tempListIds.includes(list.id);
              const hasDays = !!daySectionsMap[list.id] && daySectionsMap[list.id].length > 0;
              const expanded = expandedIds.has(list.id);
              const daySections = daySectionsMap[list.id] || [];
              const daySelection = tempDaysByList[list.id];
              const allDayNums = daySections.map(s => s.day);
              
              const isIndeterminate = selected && hasDays && daySelection !== 'all' && Array.isArray(daySelection) && daySelection.length > 0;

              return (
                <View key={list.id} style={[styles.listItem, { backgroundColor: isDark ? colors.surface : '#FFF' }]}>
                  <Pressable style={styles.listRow} onPress={() => toggleList(list.id)}>
                    <View style={styles.listRowLeft}>
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
                          {t('common.nWords', { count: list.words.length })}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      {hasDays && selected && (
                        <Pressable onPress={(e) => { e.stopPropagation(); toggleExpand(list.id); }} hitSlop={8} style={styles.expandBtn}>
                          <Ionicons
                            name={expanded ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color={colors.textTertiary}
                          />
                        </Pressable>
                      )}
                      <View style={[
                        styles.checkbox,
                        {
                          backgroundColor: isIndeterminate ? (colors.primaryLight ?? `${colors.primary}20`) : (selected ? colors.primary : 'transparent'),
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}>
                        {!isIndeterminate && selected && <Ionicons name="checkmark" size={12} color="#FFF" />}
                        {isIndeterminate && <Ionicons name="remove" size={12} color={colors.primary} />}
                      </View>
                    </View>
                  </Pressable>

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
                        ]}>{t('dayPicker.allWords')}</Text>
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
                              {t('dayPicker.dayLabel', { day: section.day })}
                            </Text>
                            <Text style={[styles.dayChipCount, { color: isDayActive ? colors.primary : colors.textTertiary }]}>
                              {t('dayPicker.countLabel', { count: section.count })}
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
              <Text style={styles.applyBtnText}>{t('common.apply')}</Text>
            </Pressable>
          </View>
    </ModalOverlay>
  );
}

const styles = StyleSheet.create({
  container: {
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
    flex: 1,
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
