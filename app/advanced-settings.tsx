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
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import DialogModal from '@/components/ui/DialogModal';
import { useSettings } from '@/features/settings';
import { validateApiKey, type ApiKeyCheck } from '@/lib/ai/gemini-client';
import { PopupTokens } from '@/constants/popup';

export default function AdvancedSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { apiKey, updateApiKey } = useSettings();

  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  // 저장 전 키 검증. 'invalid'면 저장을 막고, 'unknown'(네트워크 실패 등)이면 한 번 더
  // 누를 때 그대로 저장한다 — 확인하지 못한 것을 나쁜 키로 취급하면 비행기 모드에서
  // 정당한 키를 넣을 수 없다.
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<Exclude<ApiKeyCheck, 'valid'> | null>(null);

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
      setCheckResult(null);
      setApiKeyModalOpen(true);
      router.setParams({ openApiKey: undefined } as any);
    }
  }, [params.openApiKey, apiKey]);

  const handleOpenApiKeyModal = () => {
    setApiKeyInput(apiKey || '');
    setApiKeyVisible(false);
    setCheckResult(null);
    setApiKeyModalOpen(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const commitApiKey = async (key: string) => {
    await updateApiKey(key);
    setApiKeyModalOpen(false);
    setCheckResult(null);
    if (enteredForApiKeyRef.current && router.canGoBack()) {
      enteredForApiKeyRef.current = false;
      router.back();
    }
  };

  // 저장 전에 키를 한 번 확인한다. 예전에는 입력값을 그대로 저장해서, 오타가 나도
  // 여기서는 아무 일 없이 닫히고 한참 뒤 AI를 쓸 때에야 실패했다 — 단어 추가 쪽은
  // 무료 사전으로 조용히 대체돼 실패한 줄조차 몰랐다.
  const handleSaveApiKey = async () => {
    if (checking) return;
    const key = apiKeyInput.trim();
    // 비우는 것은 해제라 검증 대상이 아니다.
    if (!key) { await commitApiKey(''); return; }
    // 확인하지 못한 상태에서 한 번 더 누른 것 = "그래도 저장".
    if (checkResult === 'unknown') { await commitApiKey(key); return; }

    setChecking(true);
    const verdict = await validateApiKey(key);
    setChecking(false);
    if (verdict === 'valid') { await commitApiKey(key); return; }
    setCheckResult(verdict);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
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
        scrollable={true}
        avoidKeyboard
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
              disabled={checking || checkResult === 'invalid'}
              style={[styles.modalBtn, {
                backgroundColor: checking || checkResult === 'invalid' ? colors.border : colors.primaryButton,
                paddingVertical: btn.paddingVertical,
                borderRadius: btn.borderRadius,
              }]}
            >
              {checking ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text style={[styles.modalBtnText, { color: colors.onPrimary, fontSize: btn.fontSize, textAlign: 'center' }]}>
                  {checkResult === 'unknown' ? t('settings.geminiApiKeySaveAnyway') : t('common.save')}
                </Text>
              )}
            </Pressable>
          </View>
        }
      >
        <View style={styles.modalBody}>
          <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
            {t('settings.geminiApiKeyDesc')}
          </Text>
          <Pressable
            onPress={() => Linking.openURL('https://aistudio.google.com/apikey')}
            hitSlop={8}
            style={{ alignSelf: 'flex-start' }}
          >
            <Text style={{ color: colors.primary, fontSize: 13, fontFamily: 'Pretendard_500Medium' }}>
              {t('settings.geminiApiKeyLink')} →
            </Text>
          </Pressable>
          <View style={[styles.apiKeyInputRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <TextInput
              style={[styles.apiKeyInput, { color: colors.text }]}
              value={apiKeyInput}
              onChangeText={(v) => { setApiKeyInput(v); if (checkResult) setCheckResult(null); }}
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
          {checking || checkResult ? (
            <View style={styles.apiKeyStatusRow}>
              {checking ? (
                <>
                  <ActivityIndicator size="small" color={colors.textTertiary} />
                  <Text style={[styles.apiKeyStatusText, { color: colors.textSecondary }]}>
                    {t('settings.geminiApiKeyChecking')}
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons
                    name={checkResult === 'invalid' ? 'close-circle' : 'alert-circle-outline'}
                    size={15}
                    color={checkResult === 'invalid' ? colors.error : colors.warning}
                  />
                  <Text
                    style={[
                      styles.apiKeyStatusText,
                      { color: checkResult === 'invalid' ? colors.error : colors.textSecondary },
                    ]}
                  >
                    {checkResult === 'invalid'
                      ? t('settings.geminiApiKeyInvalid')
                      : t('settings.geminiApiKeyUnverified')}
                  </Text>
                </>
              )}
            </View>
          ) : null}
          {apiKey ? (
            <Pressable
              onPress={() => { setApiKeyInput(''); updateApiKey(''); setApiKeyModalOpen(false); }}
              hitSlop={8}
              style={{ alignSelf: 'flex-start', marginTop: 4 }}
            >
              <Text style={{ color: colors.error, fontSize: 13, fontFamily: 'Pretendard_500Medium' }}>
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
  modalBody: { gap: 10, paddingBottom: 8 },
  apiKeyStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -4 },
  apiKeyStatusText: { flex: 1, fontSize: 12.5, fontFamily: 'Pretendard_500Medium', lineHeight: 17 },
  modalDesc: { fontSize: 13, fontFamily: 'Pretendard_400Regular', lineHeight: 19, marginBottom: 2 },
  apiKeyInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 2,
    marginTop: 2,
  },
  apiKeyInput: { flex: 1, fontSize: 14, fontFamily: 'Pretendard_400Regular', paddingVertical: 10 },
});
