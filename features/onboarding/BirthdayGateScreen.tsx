import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/features/theme';
import { validateBirthday, isUnder14From } from '@/lib/age';

interface Props {
  context: 'onboarding' | 'migration';
  onSubmit: (birthday: string, isUnder14: boolean) => void | Promise<void>;
}

// 3-input neutral age screen — Google Play Families Policy 준수 (기본값 미리 채우기 X, 연령 힌트 X).
export function BirthdayGateScreen({ context, onSubmit }: Props) {
  const { t } = useTranslation();
  const { colors, fontFamily } = useTheme();
  const insets = useSafeAreaInsets();

  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [error, setError] = useState<'invalid' | 'future' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const monthRef = useRef<TextInput>(null);
  const dayRef = useRef<TextInput>(null);

  const birthdayISO = useMemo(() => {
    if (year.length !== 4 || !month || !day) return null;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }, [year, month, day]);

  const isComplete = year.length === 4 && month.length >= 1 && day.length >= 1;

  const handleConfirm = async () => {
    if (!birthdayISO || submitting) return;
    const v = validateBirthday(birthdayISO);
    if (v !== 'ok') {
      setError(v);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    setError(null);
    Keyboard.dismiss();
    setSubmitting(true);
    try {
      await onSubmit(birthdayISO, isUnder14From(birthdayISO));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setSubmitting(false);
    }
  };

  const handleYearChange = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 4);
    setYear(clean);
    setError(null);
    if (clean.length === 4) monthRef.current?.focus();
  };

  const handleMonthChange = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 2);
    setMonth(clean);
    setError(null);
    if (clean.length === 2) dayRef.current?.focus();
  };

  const handleDayChange = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 2);
    setDay(clean);
    setError(null);
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top + 32 },
      ]}
    >
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text, fontFamily: fontFamily.bold }]}>
          {t('onboarding.birthday.title')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary, fontFamily: fontFamily.regular }]}>
          {context === 'migration'
            ? t('onboarding.birthday.migrationNotice')
            : t('onboarding.birthday.subtitle')}
        </Text>

        <View style={styles.inputsRow}>
          <View style={styles.inputCol}>
            <TextInput
              style={[
                styles.input,
                styles.inputYear,
                {
                  color: colors.text,
                  backgroundColor: colors.surface,
                  borderColor: error ? colors.error : colors.borderLight,
                },
              ]}
              value={year}
              onChangeText={handleYearChange}
              placeholder="YYYY"
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
              maxLength={4}
              returnKeyType="next"
              autoFocus
            />
            <Text style={[styles.unit, { color: colors.textTertiary }]}>{t('onboarding.birthday.year')}</Text>
          </View>
          <View style={styles.inputCol}>
            <TextInput
              ref={monthRef}
              style={[
                styles.input,
                {
                  color: colors.text,
                  backgroundColor: colors.surface,
                  borderColor: error ? colors.error : colors.borderLight,
                },
              ]}
              value={month}
              onChangeText={handleMonthChange}
              placeholder="MM"
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
              maxLength={2}
              returnKeyType="next"
            />
            <Text style={[styles.unit, { color: colors.textTertiary }]}>{t('onboarding.birthday.month')}</Text>
          </View>
          <View style={styles.inputCol}>
            <TextInput
              ref={dayRef}
              style={[
                styles.input,
                {
                  color: colors.text,
                  backgroundColor: colors.surface,
                  borderColor: error ? colors.error : colors.borderLight,
                },
              ]}
              value={day}
              onChangeText={handleDayChange}
              placeholder="DD"
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
              maxLength={2}
              returnKeyType="done"
              onSubmitEditing={handleConfirm}
            />
            <Text style={[styles.unit, { color: colors.textTertiary }]}>{t('onboarding.birthday.day')}</Text>
          </View>
        </View>

        {error && (
          <Text style={[styles.error, { color: colors.error }]}>
            {error === 'future'
              ? t('onboarding.birthday.future')
              : t('onboarding.birthday.invalid')}
          </Text>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <TouchableOpacity
          style={[
            styles.confirmBtn,
            { backgroundColor: isComplete ? colors.primary : colors.borderLight },
          ]}
          disabled={!isComplete || submitting}
          onPress={handleConfirm}
          activeOpacity={0.85}
        >
          <Text style={[styles.confirmText, { color: '#FFFFFF', fontFamily: fontFamily.semiBold }]}>
            {t('onboarding.birthday.confirm')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
  },
  body: {
    alignItems: 'center',
    gap: 12,
    marginTop: 40,
  },
  title: {
    fontSize: 26,
    letterSpacing: -0.5,
    lineHeight: 36,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  inputsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
  },
  inputCol: {
    alignItems: 'center',
    gap: 6,
  },
  input: {
    width: 72,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    textAlign: 'center',
    fontSize: 22,
    fontFamily: 'Pretendard_600SemiBold',
  },
  inputYear: {
    width: 96,
  },
  unit: {
    fontSize: 13,
    fontFamily: 'Pretendard_400Regular',
  },
  error: {
    fontSize: 13,
    fontFamily: 'Pretendard_500Medium',
    marginTop: 8,
    textAlign: 'center',
  },
  footer: {
    paddingTop: 16,
  },
  confirmBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    fontSize: 17,
  },
});
