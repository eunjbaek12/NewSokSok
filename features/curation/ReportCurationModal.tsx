// Community curation moderation report modal.
//
// Mounted from features/curation/screen.tsx when a logged-in non-owner taps
// the flag icon in the detail header. Lets the user pick a reason (radio
// list) and optionally write up to 500 characters of detail. Submission goes
// through features/vocab/api.ts reportCuration which surfaces the duplicate
// constraint as AlreadyReportedError so we can show "이미 신고하셨어요"
// instead of a generic error.

import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import DialogModal from '@/components/ui/DialogModal';
import { PopupTokens } from '@/constants/popup';
import { reportCuration, AlreadyReportedError, type CurationReportReason } from '@/features/vocab';

interface Props {
  visible: boolean;
  onClose: () => void;
  themeId: string;
  themeTitle: string;
}

const REASONS: CurationReportReason[] = [
  'inappropriate', 'copyright', 'spam', 'misinformation', 'other',
];

export default function ReportCurationModal({ visible, onClose, themeId, themeTitle }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [reason, setReason] = useState<CurationReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const btn = PopupTokens.button.standard;

  // Reset state on close so reopening starts fresh.
  const handleClose = () => {
    if (submitting) return;
    setReason(null);
    setDetail('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await reportCuration(themeId, reason, detail);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmitting(false);
      setReason(null);
      setDetail('');
      onClose();
      Alert.alert(t('curation.report.successTitle'), t('curation.report.successMessage'));
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSubmitting(false);
      if (e instanceof AlreadyReportedError) {
        Alert.alert(t('curation.report.alreadyTitle'), t('curation.report.alreadyMessage'));
        onClose();
        setReason(null);
        setDetail('');
      } else {
        Alert.alert(t('common.error'), t('curation.report.failedMessage'));
      }
    }
  };

  return (
    <DialogModal
      visible={visible}
      onClose={handleClose}
      title={t('curation.report.title')}
      avoidKeyboard
      footer={
        <View style={styles.modalActions}>
          <Pressable
            onPress={handleClose}
            disabled={submitting}
            style={[styles.modalBtn, { backgroundColor: colors.surfaceSecondary, paddingVertical: btn.paddingVertical, borderRadius: btn.borderRadius, opacity: submitting ? 0.6 : 1 }]}
          >
            <Text style={[styles.modalBtnText, { color: colors.text, fontSize: btn.fontSize }]}>
              {t('common.cancel')}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleSubmit}
            disabled={!reason || submitting}
            style={[styles.modalBtn, { backgroundColor: colors.primaryButton, paddingVertical: btn.paddingVertical, borderRadius: btn.borderRadius, opacity: (!reason || submitting) ? 0.5 : 1 }]}
          >
            <Text style={[styles.modalBtnText, { color: colors.onPrimary, fontSize: btn.fontSize }]}>
              {t('curation.report.submit')}
            </Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.body}>
        <Text style={[styles.targetLabel, { color: colors.textTertiary }]} numberOfLines={1}>
          {t('curation.report.targetPrefix')}{themeTitle}
        </Text>
        <Text style={[styles.sectionLabel, { color: colors.text }]}>
          {t('curation.report.reasonLabel')}
        </Text>

        {REASONS.map((r) => {
          const selected = reason === r;
          return (
            <Pressable
              key={r}
              onPress={() => { Haptics.selectionAsync(); setReason(r); }}
              style={[
                styles.reasonRow,
                {
                  backgroundColor: selected ? colors.primaryLight : colors.surfaceSecondary,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={selected ? colors.primary : colors.textTertiary}
              />
              <Text style={[styles.reasonText, { color: colors.text }]}>
                {t(`curation.report.reason.${r}`)}
              </Text>
            </Pressable>
          );
        })}

        <Text style={[styles.sectionLabel, { color: colors.text, marginTop: 12 }]}>
          {t('curation.report.detailLabel')}
        </Text>
        <View style={[styles.detailInputWrap, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <TextInput
            style={[styles.detailInput, { color: colors.text }]}
            value={detail}
            onChangeText={setDetail}
            placeholder={t('curation.report.detailPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
        </View>
        <Text style={[styles.charCount, { color: colors.textTertiary }]}>
          {detail.length} / 500
        </Text>
      </View>
    </DialogModal>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 8, gap: 8 },
  targetLabel: { fontSize: 12, fontFamily: 'Pretendard_400Regular' },
  sectionLabel: { fontSize: 14, fontFamily: 'Pretendard_600SemiBold', marginTop: 4 },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  reasonText: { flex: 1, fontSize: 14, fontFamily: 'Pretendard_500Medium' },
  detailInputWrap: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 80,
  },
  detailInput: { fontSize: 14, fontFamily: 'Pretendard_400Regular', minHeight: 72 },
  charCount: { fontSize: 11, fontFamily: 'Pretendard_400Regular', alignSelf: 'flex-end' },
  modalActions: { flexDirection: 'row', gap: 8 },
  modalBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { fontFamily: 'Pretendard_600SemiBold' },
});
