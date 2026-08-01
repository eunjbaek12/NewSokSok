// 문의하기 — 문의 작성 + 답장 확인.
//
// 설계 SoT: 목업 아티팩트(S2·S3·S4·S7·S8·S11).
//
// 새 화면을 여럿 만들지 않는다. 답장이 오면 이 화면 위쪽에 답장 카드가 얹히고,
// 아래 폼은 그대로 남아 이어서 보낼 수 있다(parent_id). 말풍선은 쓰지 않는다 —
// 채팅 모양은 즉답을 약속하는 형태이고, 혼자 운영하는 앱에서는 지키기 어렵다.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { useAuth, isCloudAuthMode } from '@/features/auth';
import { useLists } from '@/features/vocab';
import { useQuota } from '@/features/quota';
import { useLocale } from '@/features/locale';
import { useSettings } from '@/features/settings';
import { localeTag } from '@/i18n';
import { Radius } from '@/constants/tokens';
import {
  useSupportStore,
  sendSupportMessage,
  collectDiagnostics,
  buildSupportMailto,
  SupportRateLimitError,
  SUPPORT_CATEGORIES,
  SUPPORT_BODY_MIN,
  SUPPORT_BODY_MAX,
  type SupportCategory,
} from '@/features/support';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const CATEGORY_ICONS: Record<SupportCategory, IoniconName> = {
  bug: 'bug-outline',
  idea: 'bulb-outline',
  billing: 'card-outline',
  content: 'language-outline',
  account: 'person-circle-outline',
  other: 'ellipsis-horizontal-circle-outline',
};

// 스토어 리스팅에 이미 공개된 주소다(개발자 연락처는 필수 항목). 전송이 실패했을
// 때만 쓰는 폴백 경로라, 평소에는 사용자에게 노출되지 않는다.
const SUPPORT_EMAIL = 'hskimiops@gmail.com';

export default function ContactScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user, authMode } = useAuth();
  const isCloud = isCloudAuthMode(authMode);
  const lists = useLists();
  const { status: quotaStatus } = useQuota();
  const { locale } = useLocale();
  const { apiKey } = useSettings();

  const messages = useSupportStore(s => s.messages);
  const refresh = useSupportStore(s => s.refresh);
  const markRead = useSupportStore(s => s.markRead);

  const [category, setCategory] = useState<SupportCategory | null>(null);
  const [body, setBody] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 전송 실패 후 재시도할 때 같은 id를 다시 쓴다 — insert가 실제로는 성공했는데
  // 응답만 못 받은 경우, 두 번째 시도가 23505로 튕겨 중복 문의가 생기지 않는다.
  const messageIdRef = useRef<string>(Crypto.randomUUID());

  useEffect(() => {
    // 화면에 들어올 때마다 다시 조회한다(앱 시작 1회 조회 뒤 답장이 왔을 수 있다).
    void refresh(true);
  }, [refresh]);

  const replied = useMemo(() => messages.find(m => !!m.reply_body) ?? null, [messages]);
  const pending = useMemo(() => messages.find(m => !m.reply_body) ?? null, [messages]);

  useEffect(() => {
    // 답장을 화면에 띄운 순간이 곧 읽은 시점이다 → 설정 행의 배지가 꺼진다.
    if (replied && !replied.read_at) void markRead();
  }, [replied, markRead]);

  const tier = apiKey ? 'byok' : !isCloud ? 'guest' : (quotaStatus?.tier ?? 'free');
  const wordCount = useMemo(
    () => lists.reduce((sum, l) => sum + (l.words?.length ?? 0), 0),
    [lists],
  );
  const diagnostics = useMemo(
    () => collectDiagnostics({ locale, tier, listCount: lists.length, wordCount }),
    [locale, tier, lists.length, wordCount],
  );

  const trimmedLength = body.trim().length;
  const canSubmit = trimmedLength >= SUPPORT_BODY_MIN && !submitting;

  const openMailFallback = useCallback(() => {
    const url = buildSupportMailto({
      supportEmail: SUPPORT_EMAIL,
      subject: t('contact.mailSubject'),
      body,
      diagnostics: includeDiagnostics ? diagnostics : null,
    });
    Linking.openURL(url).catch(() => {
      Alert.alert(t('contact.mailUnavailableTitle'), SUPPORT_EMAIL);
    });
  }, [body, diagnostics, includeDiagnostics, t]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      await sendSupportMessage({
        id: messageIdRef.current,
        category: category ?? 'other',
        body,
        replyEmail: email,
        diagnostics: includeDiagnostics ? diagnostics : null,
        parentId: replied?.id ?? null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmitting(false);
      // 다음 문의는 새 id로. 이 화면에 머문 채 한 번 더 보낼 수 있다.
      messageIdRef.current = Crypto.randomUUID();
      setBody('');
      setCategory(null);
      void refresh(true);
      Alert.alert(t('contact.successTitle'), t('contact.successMessage'), [
        { text: t('common.confirm'), onPress: () => router.back() },
      ]);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSubmitting(false);
      if (e instanceof SupportRateLimitError) {
        Alert.alert(t('contact.dailyLimitTitle'), t('contact.dailyLimitMessage'));
        return;
      }
      // 입력은 절대 지우지 않는다 — 다 쓴 글이 날아가는 게 이 화면의 최악이다.
      Alert.alert(t('contact.failTitle'), t('contact.failMessage'), [
        { text: t('contact.failMailto'), onPress: openMailFallback },
        { text: t('contact.failRetry'), style: 'cancel' },
      ]);
    }
  }, [
    canSubmit, category, body, email, includeDiagnostics, diagnostics,
    replied, refresh, t, openMailFallback,
  ]);

  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const formatDate = useCallback(
    (iso: string) => new Date(iso).toLocaleDateString(localeTag(locale), {
      month: 'long', day: 'numeric',
    }),
    [locale],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12} disabled={submitting}>
          <Ionicons name="chevron-back" size={26} color={submitting ? colors.textTertiary : colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('contact.title')}</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 44}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          // 멀티라인 입력이라 키보드에 "완료"가 없다. 스크롤로 내릴 수 있게 한다.
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          {replied && (
            <View style={[styles.replyCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
              <View style={[styles.replyHead, { backgroundColor: colors.warningLight }]}>
                <Ionicons name="chatbubble-ellipses" size={15} color={colors.warning} />
                <Text style={[styles.replyWho, { color: colors.warning }]}>{t('contact.replyHeader')}</Text>
                {replied.replied_at && (
                  <Text style={[styles.replyWhen, { color: colors.warning }]}>{formatDate(replied.replied_at)}</Text>
                )}
              </View>
              <Text style={[styles.replyBody, { color: colors.text }]}>{replied.reply_body}</Text>
              <View style={[styles.quoted, { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.borderLight }]}>
                <Text style={[styles.quotedLabel, { color: colors.textTertiary }]}>
                  {t('contact.myMessageLabel', { date: formatDate(replied.created_at) })}
                  {' · '}
                  {t(`contact.category.${replied.category}`)}
                </Text>
                <Text style={[styles.quotedText, { color: colors.textSecondary }]}>{replied.body}</Text>
              </View>
            </View>
          )}

          {!replied && pending && (
            <View style={[styles.replyCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
              <View style={[styles.replyHead, { backgroundColor: colors.surfaceSecondary }]}>
                <Ionicons name="mail-outline" size={15} color={colors.textTertiary} />
                <Text style={[styles.replyWho, { color: colors.textSecondary }]}>{t('contact.waitingHeader')}</Text>
                <Text style={[styles.replyWhen, { color: colors.textTertiary }]}>{formatDate(pending.created_at)}</Text>
              </View>
              <View style={[styles.quoted, { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.borderLight }]}>
                <Text style={[styles.quotedLabel, { color: colors.textTertiary }]}>
                  {t(`contact.category.${pending.category}`)}
                </Text>
                <Text style={[styles.quotedText, { color: colors.textSecondary }]}>{pending.body}</Text>
              </View>
            </View>
          )}

          <Text style={[styles.label, { color: colors.text }]}>
            {replied ? t('contact.moreLabel') : t('contact.categoryLabel')}
          </Text>
          <View style={styles.chips}>
            {SUPPORT_CATEGORIES.map(c => {
              const selected = category === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => { Haptics.selectionAsync(); setCategory(selected ? null : c); }}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? colors.primaryLight : colors.surfaceSecondary,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={CATEGORY_ICONS[c]}
                    size={16}
                    color={selected ? colors.primary : colors.textTertiary}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: selected ? colors.text : colors.textSecondary,
                        fontFamily: selected ? 'Pretendard_700Bold' : 'Pretendard_500Medium',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {t(`contact.category.${c}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, { color: colors.text }]}>{t('contact.bodyLabel')}</Text>
          <View style={[styles.inputWrap, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <TextInput
              style={[styles.bodyInput, { color: colors.text }]}
              value={body}
              onChangeText={setBody}
              placeholder={t('contact.bodyPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={SUPPORT_BODY_MAX}
              textAlignVertical="top"
              editable={!submitting}
            />
          </View>
          <Text
            style={[
              styles.count,
              { color: body.length > SUPPORT_BODY_MAX - 200 ? colors.warning : colors.textTertiary },
            ]}
          >
            {body.length} / {SUPPORT_BODY_MAX}
          </Text>

          <Text style={[styles.label, { color: colors.text }]}>
            {t('contact.emailLabel')}
            <Text style={[styles.optional, { color: colors.textTertiary }]}> {t('contact.optional')}</Text>
          </Text>
          <View style={[styles.inputWrap, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <TextInput
              style={[styles.emailInput, { color: colors.text }]}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              maxLength={254}
              editable={!submitting}
            />
          </View>
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            {isCloud ? t('contact.emailHintAuthed') : t('contact.emailHintGuest')}
          </Text>

          <View style={[styles.diagCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <Pressable
              style={styles.diagHead}
              onPress={() => { Haptics.selectionAsync(); setDiagnosticsOpen(o => !o); }}
              accessibilityRole="button"
            >
              <Ionicons name="construct-outline" size={18} color={colors.textSecondary} />
              <Text style={[styles.diagTitle, { color: colors.text }]}>{t('contact.diagnosticsLabel')}</Text>
              <Ionicons
                name={diagnosticsOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.textTertiary}
              />
              <Switch
                value={includeDiagnostics}
                onValueChange={v => { Haptics.selectionAsync(); setIncludeDiagnostics(v); }}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.onPrimary}
                disabled={submitting}
              />
            </Pressable>
            {diagnosticsOpen && (
              <View style={[styles.diagBody, { borderTopColor: colors.borderLight }]}>
                <DiagRow first label={t('contact.diagApp')} value={`${diagnostics.appVersion}`} colors={colors} />
                <DiagRow label={t('contact.diagDevice')} value={`${diagnostics.platform} ${diagnostics.osVersion}`} colors={colors} />
                <DiagRow label={t('contact.diagLocale')} value={diagnostics.locale} colors={colors} />
                <DiagRow label={t('contact.diagAccount')} value={t(`contact.tier.${tier}`)} colors={colors} />
                <DiagRow
                  label={t('contact.diagWords')}
                  value={t('contact.diagWordsValue', { lists: diagnostics.listCount, words: diagnostics.wordCount })}
                  colors={colors}
                />
              </View>
            )}
          </View>
          <Text style={[styles.hint, { color: colors.textTertiary }]}>{t('contact.diagnosticsHint')}</Text>
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.borderLight,
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.submit,
              {
                backgroundColor: colors.primaryButton,
                opacity: !canSubmit ? 0.45 : pressed ? 0.85 : 1,
              },
            ]}
          >
            {submitting && <ActivityIndicator size="small" color={colors.onPrimary} />}
            <Text style={[styles.submitText, { color: colors.onPrimary }]}>
              {submitting ? t('contact.submitting') : t('contact.submit')}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function DiagRow({ label, value, colors, first }: { label: string; value: string; colors: any; first?: boolean }) {
  return (
    <View style={[styles.diagRow, { borderTopColor: colors.borderLight, borderTopWidth: first ? 0 : StyleSheet.hairlineWidth }]}>
      <Text style={[styles.diagKey, { color: colors.textTertiary }]}>{label}</Text>
      <Text style={[styles.diagValue, { color: colors.textSecondary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'Pretendard_700Bold', letterSpacing: -0.3 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 },

  replyCard: { borderWidth: 1, borderRadius: 18, overflow: 'hidden', marginBottom: 8 },
  replyHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  replyWho: { flex: 1, fontSize: 13.5, fontFamily: 'Pretendard_700Bold' },
  replyWhen: { fontSize: 11.5, fontFamily: 'Pretendard_400Regular' },
  replyBody: { fontSize: 14, lineHeight: 22, fontFamily: 'Pretendard_400Regular', paddingHorizontal: 14, paddingVertical: 13 },
  quoted: { borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 11 },
  quotedLabel: { fontSize: 11, fontFamily: 'Pretendard_400Regular', marginBottom: 4 },
  quotedText: { fontSize: 12.5, lineHeight: 19, fontFamily: 'Pretendard_400Regular' },

  label: { fontSize: 14, fontFamily: 'Pretendard_700Bold', marginTop: 18, marginBottom: 10 },
  optional: { fontSize: 12.5, fontFamily: 'Pretendard_400Regular' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    // 폭을 반씩 나눠 2열. gap 8을 감안해 조금 덜 잡는다.
    width: '48%',
    flexGrow: 1,
  },
  chipText: { flex: 1, fontSize: 13.5 },

  inputWrap: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 6 },
  bodyInput: { fontSize: 14, lineHeight: 21, fontFamily: 'Pretendard_400Regular', minHeight: 132, paddingTop: 6 },
  emailInput: { fontSize: 14, fontFamily: 'Pretendard_400Regular', paddingVertical: 7 },
  count: { fontSize: 11, fontFamily: 'Pretendard_400Regular', alignSelf: 'flex-end', marginTop: 6 },
  hint: { fontSize: 11.5, lineHeight: 17, fontFamily: 'Pretendard_400Regular', marginTop: 7 },

  diagCard: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', marginTop: 22 },
  diagHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  diagTitle: { flex: 1, fontSize: 14, fontFamily: 'Pretendard_600SemiBold' },
  diagBody: { borderTopWidth: 1, paddingHorizontal: 14, paddingBottom: 6 },
  diagRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth },
  diagKey: { fontSize: 12.5, fontFamily: 'Pretendard_400Regular' },
  diagValue: { flex: 1, fontSize: 12.5, fontFamily: 'Pretendard_600SemiBold', textAlign: 'right' },

  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1 },
  submit: {
    height: 52,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  submitText: { fontSize: 16, fontFamily: 'Pretendard_700Bold' },
});
