import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { useSettings } from '@/features/settings';
import { useLists } from '@/features/vocab';
import { Radius } from '@/constants/tokens';
import { PRESET_LIMIT } from '@/features/study/pick/filter';
import { wordFilterLabel } from '@/features/study/pick/labels';
import type { WordNotificationSettings } from '@shared/contracts';
import { resolveSourceList } from '@/features/study/word-notifications/plan';
import { wordNotifConditionLabel, wordNotifConditionDesc } from '@/features/study/word-notifications/labels';

type WordFilter = WordNotificationSettings['wordFilter'];

const STATUS_KEYS: WordFilter[] = ['learning', 'memorized'];
const PRESET_KEYS: WordFilter[] = ['wrongCount', 'recent'];
const DEFAULT_FILTER: WordFilter = 'learning';

/**
 * «알림에 나올 단어» — 단어장 하나(처음 값 «자동») + 상세 설정(조건 칩 하나 + 별표).
 * 목업 ⑥ «알림에 나올 단어», docs/word-notifications-design.md §6.3.
 *
 * 칩 이름·계산은 «골라서 학습»(app/search-modal.tsx) 그대로다. «전체»·«복습» 칩은 없다 — 알림은
 * 복습할 단어를 보내지 않아서 알림의 «기본»이 곧 «미암기»다(N2).
 * 바꾼 값은 저장만 한다. 다시 예약은 앱 루트의 스케줄러가 설정 변화를 보고 한다.
 */
export default function WordNotificationSourceScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const lists = useLists();
  const { wordNotificationSettings: settings, updateWordNotificationSettings } = useSettings();
  const [open, setOpen] = useState(false);

  const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const visible = lists.filter(l => l.isVisible);
  const { list: current, auto } = resolveSourceList(lists, settings.listId);
  // 고른 단어장이 숨김·삭제돼 «자동»으로 떨어졌으면 라디오도 «자동»에 둔다.
  const selectedId = auto ? null : current?.id ?? null;
  // «자동» 줄의 «지금: …»은 지금 고른 값과 무관하게 «자동이면 무엇이 나올지»를 말한다 —
  // 다른 단어장을 고른 동안 이 줄이 비면 «자동»이 무엇을 뜻하는지 알 길이 없다.
  const autoPick = auto ? current : resolveSourceList(lists, null).list;

  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const radioRow = (key: string, title: string, subtitle: string, selected: boolean, disabled: boolean, onPress: () => void, last: boolean) => (
    <Pressable
      key={key}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={() => { tap(); onPress(); }}
      style={[
        styles.pickRow,
        !last && { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
        selected && { backgroundColor: colors.primaryLight },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.primary : colors.textTertiary} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.pickTitle, { color: colors.text }]} numberOfLines={2}>{title}</Text>
        <Text style={[styles.pickSub, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
      </View>
    </Pressable>
  );

  const chipStyle = (active: boolean) => [
    styles.chip,
    active
      ? { backgroundColor: colors.primary, borderColor: colors.primary }
      : { backgroundColor: colors.surface, borderColor: colors.border },
  ];
  const chipText = (active: boolean) => (active ? colors.onPrimary : colors.textSecondary);
  // 켜진 칩을 한 번 더 누르면 처음 값(미암기)으로 — «골라서 학습»과 같은 손.
  const setFilter = (key: WordFilter) => {
    tap();
    void updateWordNotificationSettings({ wordFilter: settings.wordFilter === key ? DEFAULT_FILTER : key });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Pressable style={styles.backBtn} accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {t('wordNotif.sourceTitle')}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>{t('wordNotif.listSection')}</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          {radioRow(
            'auto',
            t('wordNotif.auto'),
            autoPick ? t('wordNotif.autoSub', { name: autoPick.title }) : t('wordNotif.autoSubNone'),
            selectedId === null,
            false,
            () => { void updateWordNotificationSettings({ listId: null }); },
            visible.length === 0,
          )}
          {visible.map((l, i) => {
            const empty = l.words.length === 0;
            const unlearned = l.words.filter(w => !w.isMemorized).length;
            return radioRow(
              l.id,
              l.title,
              empty ? t('wordNotif.noWords') : t('wordNotif.unlearnedCount', { count: unlearned }),
              selectedId === l.id,
              empty,
              () => { void updateWordNotificationSettings({ listId: l.id }); },
              i === visible.length - 1,
            );
          })}
        </View>

        <View style={[styles.section, styles.fold, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => { tap(); setOpen(o => !o); }}
            style={styles.foldHead}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.foldTitle, { color: colors.text }]}>{t('wordNotif.detailSection')}</Text>
              <Text style={[styles.pickSub, { color: colors.textSecondary }]}>{wordNotifConditionLabel(settings, t)}</Text>
            </View>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
          </Pressable>

          {open && (
            <View style={[styles.foldBody, { borderTopColor: colors.borderLight }]}>
              <View style={styles.chips}>
                {STATUS_KEYS.map(key => {
                  const active = settings.wordFilter === key;
                  return (
                    <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setFilter(key)} style={chipStyle(active)}>
                      <Text style={[styles.chipText, { color: chipText(active) }]}>{wordFilterLabel(key, t)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.chips}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: settings.starredOnly }}
                  onPress={() => { tap(); void updateWordNotificationSettings({ starredOnly: !settings.starredOnly }); }}
                  style={[
                    styles.chip,
                    settings.starredOnly
                      ? { backgroundColor: colors.warningLight, borderColor: colors.warning }
                      : { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Ionicons name={settings.starredOnly ? 'star' : 'star-outline'} size={13} color={settings.starredOnly ? colors.warning : colors.textSecondary} />
                  <Text style={[styles.chipText, { color: settings.starredOnly ? colors.warning : colors.textSecondary }]}>{t('search.starredChip')}</Text>
                </Pressable>
                <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
                {PRESET_KEYS.map(key => {
                  const active = settings.wordFilter === key;
                  return (
                    <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setFilter(key)} style={chipStyle(active)}>
                      <Text style={[styles.chipText, { color: chipText(active) }]}>
                        {key === 'wrongCount' ? t('search.presetWrong') : t('search.presetRecent')}
                      </Text>
                      <Text style={[styles.chipCap, { color: chipText(active) }]}>{PRESET_LIMIT}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.desc, { color: colors.textSecondary }]}>{wordNotifConditionDesc(settings, t)}</Text>
            </View>
          )}
        </View>
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
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontFamily: 'Pretendard_700Bold', letterSpacing: -0.3 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  sectionHeader: {
    fontSize: 13,
    fontFamily: 'Pretendard_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 8,
    marginLeft: 4,
  },
  section: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  pickTitle: { fontSize: 15, fontFamily: 'Pretendard_500Medium' },
  pickSub: { fontSize: 12, fontFamily: 'Pretendard_400Regular', marginTop: 2 },
  fold: { marginTop: 12 },
  foldHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 14 },
  foldTitle: { fontSize: 15, fontFamily: 'Pretendard_600SemiBold' },
  foldBody: { borderTopWidth: 1, paddingVertical: 12, paddingHorizontal: 14, gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pillSm,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontFamily: 'Pretendard_500Medium' },
  chipCap: { fontSize: 10, fontFamily: 'Pretendard_700Bold', opacity: 0.7, marginLeft: -2 },
  divider: { width: 1, height: 20, marginHorizontal: 2 },
  desc: { fontSize: 12, fontFamily: 'Pretendard_400Regular', lineHeight: 18 },
});
