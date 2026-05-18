import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
  Linking,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import DialogModal from '@/components/ui/DialogModal';
import { useSettings } from '@/features/settings';
import { PopupTokens } from '@/constants/popup';

export default function AdvancedSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { apiKey, updateApiKey } = useSettings();

  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  // 외부 화면(예: 큐레이션)에서 ?openApiKey=1로 진입하면 모달 자동 오픈
  // 저장 시 자동 복귀.
  const params = useLocalSearchParams<{ openApiKey?: string }>();
  const autoOpenedRef = useRef(false);
  const enteredForApiKeyRef = useRef(false);
  useEffect(() => {
    if (params.openApiKey === '1' && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      enteredForApiKeyRef.current = true;
      setApiKeyInput(apiKey || '');
      setApiKeyVisible(false);
      setApiKeyModalOpen(true);
      router.setParams({ openApiKey: undefined } as any);
    }
  }, [params.openApiKey, apiKey]);

  const handleOpenApiKeyModal = () => {
    setApiKeyInput(apiKey || '');
    setApiKeyVisible(false);
    setApiKeyModalOpen(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveApiKey = async () => {
    await updateApiKey(apiKeyInput.trim());
    setApiKeyModalOpen(false);
    if (enteredForApiKeyRef.current && router.canGoBack()) {
      enteredForApiKeyRef.current = false;
      router.back();
    }
  };

  const maskedApiKey = apiKey ? apiKey.slice(0, 8) + '••••••••••••••••' : '';

  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const btn = PopupTokens.button.standard;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('advancedSettings.title')}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.notice, { backgroundColor: colors.primaryLight, borderColor: colors.borderLight }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
          <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
            {t('advancedSettings.notice')}
          </Text>
        </View>

        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
          {t('advancedSettings.aiSection')}
        </Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <Pressable style={styles.row} onPress={handleOpenApiKeyModal}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="key-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>
                  {t('settings.geminiApiKey')}
                </Text>
                <Text style={[styles.rowSubtitle, { color: apiKey ? colors.success : colors.textTertiary }]} numberOfLines={1}>
                  {apiKey ? maskedApiKey : t('settings.geminiApiKeyNotSet')}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>

        <Text style={[styles.footnote, { color: colors.textTertiary }]}>
          {t('advancedSettings.footnote')}
        </Text>
      </ScrollView>

      <DialogModal
        visible={apiKeyModalOpen}
        onClose={() => setApiKeyModalOpen(false)}
        title={t('settings.geminiApiKeyTitle')}
        scrollable={false}
        footer={
          <View style={styles.modalActions}>
            <Pressable
              onPress={() => setApiKeyModalOpen(false)}
              style={[styles.modalBtn, { backgroundColor: colors.surfaceSecondary, paddingVertical: btn.paddingVertical, borderRadius: btn.borderRadius }]}
            >
              <Text style={[styles.modalBtnText, { color: colors.text, fontSize: btn.fontSize }]}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={handleSaveApiKey}
              style={[styles.modalBtn, { backgroundColor: colors.primaryButton, paddingVertical: btn.paddingVertical, borderRadius: btn.borderRadius }]}
            >
              <Text style={[styles.modalBtnText, { color: colors.onPrimary, fontSize: btn.fontSize }]}>{t('common.save')}</Text>
            </Pressable>
          </View>
        }
      >
        <View style={styles.modalBody}>
          <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
            {t('settings.geminiApiKeyDesc')}
          </Text>
          <Pressable onPress={() => Linking.openURL('https://aistudio.google.com/apikey')}>
            <Text style={{ color: colors.primary, fontSize: 13, fontFamily: 'Pretendard_500Medium', marginBottom: 4 }}>
              {t('settings.geminiApiKeyLink')} →
            </Text>
          </Pressable>
          <View style={[styles.apiKeyInputRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <TextInput
              style={[styles.apiKeyInput, { color: colors.text }]}
              value={apiKeyInput}
              onChangeText={setApiKeyInput}
              placeholder="AIza..."
              placeholderTextColor={colors.textTertiary}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!apiKeyVisible}
              returnKeyType="done"
              onSubmitEditing={handleSaveApiKey}
            />
            <Pressable onPress={() => setApiKeyVisible(v => !v)} style={{ padding: 4 }}>
              <Ionicons name={apiKeyVisible ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textTertiary} />
            </Pressable>
          </View>
          {apiKey ? (
            <Pressable onPress={() => { setApiKeyInput(''); updateApiKey(''); setApiKeyModalOpen(false); }}>
              <Text style={{ color: colors.error, fontSize: 13, fontFamily: 'Pretendard_400Regular', marginTop: 4 }}>
                {t('settings.geminiApiKeyRemove')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </DialogModal>
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
  headerTitle: { fontSize: 18, fontFamily: 'Pretendard_700Bold', letterSpacing: -0.3 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Pretendard_400Regular',
    lineHeight: 19,
  },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconCircle: {
    width: 34, height: 34, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontFamily: 'Pretendard_500Medium', letterSpacing: -0.2 },
  rowSubtitle: { fontSize: 12, fontFamily: 'Pretendard_400Regular', marginTop: 2 },
  footnote: {
    fontSize: 12,
    fontFamily: 'Pretendard_400Regular',
    lineHeight: 18,
    marginTop: 16,
    marginHorizontal: 4,
  },
  modalActions: { flexDirection: 'row', gap: 8 },
  modalBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { fontFamily: 'Pretendard_600SemiBold' },
  modalBody: { gap: 8 },
  modalDesc: { fontSize: 13, fontFamily: 'Pretendard_400Regular', lineHeight: 19 },
  apiKeyInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
  },
  apiKeyInput: { flex: 1, fontSize: 14, fontFamily: 'Pretendard_400Regular', paddingVertical: 8 },
});
