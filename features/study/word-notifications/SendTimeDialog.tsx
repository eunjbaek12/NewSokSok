import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import DialogModal from '@/components/ui/DialogModal';
import { ModalPicker } from '@/components/ui/ModalPicker';
import { PopupTokens } from '@/constants/popup';
import type { WordNotificationSettings } from '@shared/contracts';
import { REVIEW_TIME_OPTIONS, formatReviewTime, reviewTimeId, parseReviewTimeId } from '../review/notify-time';
import { dailyMinutes } from './plan';
import { formatMinuteOfDay } from './labels';

const MIN_PER_DAY = 1;
const MAX_PER_DAY = 12;

interface Props {
  visible: boolean;
  onClose: () => void;
  settings: WordNotificationSettings;
  locale: string;
  onChange: (updates: Partial<WordNotificationSettings>) => void;
}

/** 실제로 올 시각 한 줄 — 숫자라 언어와 무관하게 24시간 표기로 짧게. */
function shortTime(minute: number): string {
  return `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`;
}

/**
 * «보내는 시간» — 시작 · 끝 · 하루 횟수를 한 창에서(목업 ④-차).
 *
 * 시작·끝은 복습 알림 «알림 시간»과 같은 30분 간격 목록이다. 🔴 그 목록 창은 이 창의 **children** 으로
 * 중첩한다 — 형제 모달 둘은 iOS 에서 두 번째가 안 보인다(CLAUDE.md UI 체크리스트).
 * 끝은 시작보다 늦게만 고를 수 있다(자정을 넘는 시간대는 여기서 막는다).
 */
export function SendTimeDialog({ visible, onClose, settings, locale, onChange }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [picking, setPicking] = useState<'start' | 'end' | null>(null);

  const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const minuteOf = (id: string) => {
    const { hour, minute } = parseReviewTimeId(id);
    return hour * 60 + minute;
  };

  const options = REVIEW_TIME_OPTIONS
    .map(o => ({ id: o.id, minute: o.hour * 60 + o.minute, title: formatReviewTime(o.hour, o.minute, locale) }))
    .filter(o => (picking === 'start' ? o.minute < settings.endMinute : o.minute > settings.startMinute))
    .map(({ id, title }) => ({ id, title }));

  const pickedMinute = picking === 'start' ? settings.startMinute : settings.endMinute;
  const times = dailyMinutes(settings.startMinute, settings.endMinute, settings.perDay).map(shortTime).join(' · ');

  const row = (label: string, value: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => { tap(); onPress(); }}
      style={[styles.row, { borderBottomColor: colors.border }]}
    >
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <View style={styles.rowValueWrap}>
        <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{value}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      </View>
    </Pressable>
  );

  const stepBtn = (name: 'remove' | 'add', disabled: boolean, onPress: () => void, label: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => { tap(); onPress(); }}
      hitSlop={6}
      style={[styles.stepBtn, { backgroundColor: colors.surfaceSecondary, opacity: disabled ? 0.4 : 1 }]}
    >
      <Ionicons name={name} size={18} color={colors.text} />
    </Pressable>
  );

  return (
    <DialogModal
      visible={visible}
      onClose={onClose}
      title={t('wordNotif.timeLabel')}
      scrollable={false}
      avoidKeyboard={false}
      bodyPadding={false}
      footer={
        <Pressable
          onPress={onClose}
          style={[styles.closeBtn, { backgroundColor: colors.surfaceSecondary }]}
        >
          <Text style={[styles.closeBtnText, { color: colors.text }]}>{t('common.close')}</Text>
        </Pressable>
      }
    >
      {row(t('wordNotif.timeStart'), formatMinuteOfDay(settings.startMinute, locale), () => setPicking('start'))}
      {row(t('wordNotif.timeEnd'), formatMinuteOfDay(settings.endMinute, locale), () => setPicking('end'))}
      <View style={[styles.row, { borderBottomColor: colors.border }]}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{t('wordNotif.timePerDay')}</Text>
        <View style={styles.stepper}>
          {stepBtn('remove', settings.perDay <= MIN_PER_DAY, () => onChange({ perDay: settings.perDay - 1 }), t('wordNotif.perDayFewer'))}
          <Text style={[styles.stepValue, { color: colors.text }]}>{t('wordNotif.timesPerDay', { count: settings.perDay })}</Text>
          {stepBtn('add', settings.perDay >= MAX_PER_DAY, () => onChange({ perDay: settings.perDay + 1 }), t('wordNotif.perDayMore'))}
        </View>
      </View>
      <Text style={[styles.times, { color: colors.textSecondary }]}>{times}</Text>

      <ModalPicker
        visible={picking !== null}
        onClose={() => setPicking(null)}
        title={picking === 'end' ? t('wordNotif.timeEnd') : t('wordNotif.timeStart')}
        options={options}
        selectedValue={reviewTimeId(Math.floor(pickedMinute / 60), pickedMinute % 60)}
        onSelect={(id) => {
          tap();
          onChange(picking === 'end' ? { endMinute: minuteOf(id) } : { startMinute: minuteOf(id) });
          setPicking(null);
        }}
      />
    </DialogModal>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: PopupTokens.padding.container,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontSize: 15, fontFamily: 'Pretendard_500Medium' },
  rowValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowValue: { fontSize: 15, fontFamily: 'Pretendard_400Regular' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  stepValue: { minWidth: 40, textAlign: 'center', fontSize: 15, fontFamily: 'Pretendard_600SemiBold' },
  times: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
    fontVariant: ['tabular-nums'],
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: PopupTokens.padding.container,
  },
  closeBtn: { alignItems: 'center', paddingVertical: 14, borderRadius: 12 },
  closeBtnText: { fontSize: 15, fontFamily: 'Pretendard_600SemiBold' },
});
