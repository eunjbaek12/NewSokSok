import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { Button } from '@/components/ui/Button';
import { useLists, selectWordsForList, addBatchWords } from '@/features/vocab';
import { parseCsv, CsvParseError, CsvWordRow } from '@/utils/csv';
import { readCsvFile } from '@/lib/csv-file';

type Stage = 'pick' | 'review';

export default function ImportCsvScreen() {
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useTranslation();

  const lists = useLists();
  const list = useMemo(() => lists.find((l) => l.id === listId), [lists, listId]);
  const existingTerms = useMemo(
    () => (listId ? selectWordsForList(lists, listId).map((w) => w.term) : []),
    [lists, listId],
  );

  const [stage, setStage] = useState<Stage>('pick');
  const [rows, setRows] = useState<CsvWordRow[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [fileName, setFileName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const close = () => router.back();

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const text = await readCsvFile(asset.uri);

      let parsed;
      try {
        parsed = parseCsv(text);
      } catch (e) {
        if (e instanceof CsvParseError) {
          Alert.alert(t('importCsv.parseErrorTitle'), t(`importCsv.error_${e.code}`));
        } else {
          Alert.alert(t('importCsv.parseErrorTitle'), t('importCsv.error_unknown'));
        }
        return;
      }

      setRows(parsed.rows);
      setSkipped(parsed.skipped);
      setFileName(asset.name ?? 'CSV');
      setStage('review');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert(t('importCsv.fileReadErrorTitle'), t('importCsv.fileReadErrorMessage'));
    }
  };

  const handleConfirm = async () => {
    if (!listId || rows.length === 0) return;
    setIsSaving(true);
    try {
      // addBatchWords가 기존 단어·배치 내 중복을 제거하고 추가된 단어만 반환한다.
      const added = await addBatchWords(listId, rows);
      const dup = rows.length - added.length;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        t('importCsv.doneTitle'),
        t('importCsv.doneMessage', { added: added.length, dup }),
        [{ text: t('common.confirm'), onPress: close }],
      );
    } catch {
      Alert.alert(t('common.error'), t('importCsv.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  const header = (title: string, onBack: () => void, backIcon: 'close' | 'arrow-back') => (
    <View style={[styles.header, { borderBottomColor: colors.borderLight, paddingTop: Math.max(insets.top, 14) }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={onBack} hitSlop={8} style={styles.headerBtn}>
        <Ionicons name={backIcon} size={22} color={colors.textSecondary} />
      </Pressable>
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
      <View style={styles.headerBtn} />
    </View>
  );

  // ── STAGE 1: 파일 선택 ───────────────────────────────────────
  if (stage === 'pick') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {header(list ? t('importCsv.titleInto', { name: list.title }) : t('importCsv.title'), close, 'close')}
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.infoBox, { backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="information-circle" size={20} color={colors.primary} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>{t('importCsv.instructions')}</Text>
              <Text style={[styles.guideText, { color: colors.textTertiary }]}>{t('importCsv.formatGuide')}</Text>
              <Text style={[styles.guideText, { color: colors.textTertiary }]}>{t('importCsv.noQuotaNote')}</Text>
            </View>
          </View>

          <Pressable
            onPress={handlePickFile}
            style={[styles.pickBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="document-attach-outline" size={22} color={colors.primary} />
            <Text style={[styles.pickBtnText, { color: colors.text }]}>{t('importCsv.pickFile')}</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ── STAGE 2: 미리보기 ────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {header(t('importCsv.previewTitle'), () => setStage('pick'), 'arrow-back')}

      <View style={styles.summaryBox}>
        <Text style={[styles.summaryFile, { color: colors.textTertiary }]} numberOfLines={1}>{fileName}</Text>
        <Text style={[styles.summaryText, { color: colors.text }]}>
          {t('importCsv.summaryAdd', { count: rows.length })}
          {skipped > 0 ? ` · ${t('importCsv.summarySkipped', { count: skipped })}` : ''}
        </Text>
      </View>

      <ScrollView style={styles.listContainer} contentContainerStyle={{ paddingBottom: 16 }}>
        {rows.map((row, i) => {
          const isDup = existingTerms.some((e) => e.trim().toLowerCase() === row.term.trim().toLowerCase());
          return (
            <View key={`${row.term}-${i}`} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTerm, { color: colors.text }]} numberOfLines={1}>{row.term}</Text>
                <Text style={[styles.cardMeaning, { color: colors.textSecondary }]} numberOfLines={1}>{row.meaningKr}</Text>
                {!!row.exampleEn && (
                  <Text style={[styles.cardExample, { color: colors.textTertiary }]} numberOfLines={1}>{row.exampleEn}</Text>
                )}
              </View>
              {isDup && (
                <View style={[styles.dupBadge, { backgroundColor: colors.surfaceSecondary }]}>
                  <Text style={[styles.dupBadgeText, { color: colors.textTertiary }]}>{t('importCsv.dupBadge')}</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.borderLight, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Button title={t('common.back')} variant="secondary" onPress={() => setStage('pick')} style={{ flex: 1 }} disabled={isSaving} />
        <Button
          title={isSaving ? t('importCsv.saving') : t('importCsv.confirm', { count: rows.length })}
          variant="primary"
          onPress={handleConfirm}
          style={{ flex: 2 }}
          loading={isSaving}
          disabled={isSaving || rows.length === 0}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { padding: 4, minWidth: 32 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontFamily: 'Pretendard_600SemiBold' },
  content: { padding: 16, gap: 16 },
  infoBox: { flexDirection: 'row', padding: 12, borderRadius: 12, alignItems: 'flex-start', gap: 8 },
  infoText: { fontSize: 14, fontFamily: 'Pretendard_500Medium', lineHeight: 20 },
  guideText: { fontSize: 13, fontFamily: 'Pretendard_400Regular', lineHeight: 20 },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
    borderWidth: 1,
    borderRadius: 12,
  },
  pickBtnText: { fontSize: 15, fontFamily: 'Pretendard_600SemiBold', textAlign: 'center' },
  summaryBox: { paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  summaryFile: { fontSize: 12, fontFamily: 'Pretendard_400Regular' },
  summaryText: { fontSize: 15, fontFamily: 'Pretendard_600SemiBold' },
  listContainer: { flex: 1, paddingHorizontal: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    gap: 8,
  },
  cardTerm: { fontSize: 15, fontFamily: 'Pretendard_700Bold' },
  cardMeaning: { fontSize: 14, fontFamily: 'Pretendard_400Regular', marginTop: 2 },
  cardExample: { fontSize: 12, fontFamily: 'Pretendard_400Regular', fontStyle: 'italic', marginTop: 2 },
  dupBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  dupBadgeText: { fontSize: 11, fontFamily: 'Pretendard_500Medium' },
  footer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
});
