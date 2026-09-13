// 단어·번역 오류 알리기 — 공식 단어장 상세의 오른쪽 위 버튼(느낌표 원)이 연다.
//
// 설계 SoT: 목업 아티팩트 «오류 알리기 흐름»(2026-09-14 확정).
//
// 문의하기와 따로 둔 이유: 오류를 알리다가 결제 문의로 넘어갈 일은 없다. 화면이 할 일 하나만
// 보여 준다 — 종류 칩·회신 이메일·진단 정보·대상 지우기가 모두 없다.
//
// 저장은 문의하기와 같은 support_messages 에 한다(답장 경로·하루 5건·알림 웹훅을 그대로 받는다).
// 덱은 본문이 아니라 theme_id·theme_title 칸에 싣는다. 본문에 붙이면 문의하기가 그 본문을
// 인용하면서 내부 id 를 보여 주고, 답장 없는 제보를 «읽고 답장드릴게요»로 띄운다
// (조회 RPC 가 답장 없는 제보를 빼는 것도 이 칸으로 가른다 — 20260914000000).
//
// 답장은 약속하지 않는다. 운영자가 고친 뒤 알리고 싶을 때만 reply_body 를 쓰고, 그러면
// 설정 › 문의하기에 배지와 함께 뜬다.

import React, { useCallback, useMemo, useRef, useState } from 'react';
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
  KeyboardAvoidingView,
  Linking,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { Radius } from '@/constants/tokens';
import {
  sendSupportMessage,
  buildSupportMailto,
  SupportRateLimitError,
  SUPPORT_BODY_MIN,
  SUPPORT_BODY_MAX,
  SUPPORT_EMAIL,
  type SupportTheme,
} from '@/features/support';

/** 라우트 파라미터를 문자열 하나로. expo-router 는 같은 키가 둘이면 배열을 준다. */
function firstParam(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

export default function DeckErrorScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ themeId?: string; themeTitle?: string }>();

  // 대상은 이 화면을 연 덱으로 고정이다. 지우는 버튼이 없는 이유: 대상을 지우면 이 화면이 할 일이 없다.
  const theme = useMemo<SupportTheme | null>(() => {
    const id = firstParam(params.themeId).trim();
    const title = firstParam(params.themeTitle).trim();
    return id && title ? { id, title } : null;
  }, [params.themeId, params.themeTitle]);

  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 전송 실패 후 재시도할 때 같은 id를 다시 쓴다 — 실제로는 저장됐는데 응답만 못 받은 경우
  // 두 번째 시도가 23505로 튕겨 같은 제보가 두 번 들어가지 않는다(문의하기와 같은 규칙).
  const messageIdRef = useRef<string>(Crypto.randomUUID());

  // 덱 없이 열리면(잘못된 주소) 보낼 수 없다. 덱 상세 버튼으로만 들어오는 화면이라 따로 안내하지 않는다.
  const canSubmit = !!theme && body.trim().length >= SUPPORT_BODY_MIN && !submitting;

  const openMailFallback = useCallback(() => {
    const url = buildSupportMailto({
      supportEmail: SUPPORT_EMAIL,
      subject: t('deckError.mailSubject'),
      body,
      theme,
    });
    Linking.openURL(url).catch(() => {
      Alert.alert(t('contact.mailUnavailableTitle'), SUPPORT_EMAIL);
    });
  }, [body, theme, t]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !theme) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      await sendSupportMessage({
        id: messageIdRef.current,
        category: 'content',
        body,
        theme,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmitting(false);
      messageIdRef.current = Crypto.randomUUID();
      setBody('');
      // 답장을 약속하는 말(«읽고 답장드릴게요»)은 쓰지 않는다.
      Alert.alert(t('deckError.successTitle'), t('deckError.successMessage'), [
        { text: t('common.confirm'), onPress: () => router.back() },
      ]);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSubmitting(false);
      if (e instanceof SupportRateLimitError) {
        Alert.alert(t('contact.dailyLimitTitle'), t('contact.dailyLimitMessage'));
        return;
      }
      // 입력은 지우지 않는다 — 다 쓴 글이 날아가는 게 이 화면의 최악이다.
      Alert.alert(t('contact.failTitle'), t('contact.failMessage'), [
        { text: t('contact.failMailto'), onPress: openMailFallback },
        { text: t('contact.failRetry'), style: 'cancel' },
      ]);
    }
  }, [canSubmit, theme, body, t, openMailFallback]);

  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Pressable
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
          hitSlop={12}
          disabled={submitting}
        >
          <Ionicons name="chevron-back" size={26} color={submitting ? colors.textTertiary : colors.text} />
        </Pressable>
        {/* 넘치면 줄바꿈 대신 말줄임 — 헤더 높이가 언어마다 흔들리지 않게. */}
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1} accessibilityRole="header">
          {t('deckError.title')}
        </Text>
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
          {theme && (
            <View style={[styles.targetRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <Ionicons name="library-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.targetLabel, { color: colors.textTertiary }]}>{t('deckError.targetLabel')}</Text>
              <Text style={[styles.targetValue, { color: colors.text }]} numberOfLines={1}>
                {theme.title}
              </Text>
            </View>
          )}

          <Text style={[styles.label, { color: colors.text }]}>{t('deckError.question')}</Text>
          <View style={[styles.inputWrap, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <TextInput
              style={[styles.bodyInput, { color: colors.text }]}
              value={body}
              onChangeText={setBody}
              placeholder={t('deckError.placeholder')}
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel={t('deckError.question')}
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
            accessibilityState={{ disabled: !canSubmit }}
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

// 치수는 문의하기(app/contact.tsx)와 같다 — 같은 앱의 같은 종류 화면이 다르게 생기지 않게.
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
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontFamily: 'Pretendard_700Bold', letterSpacing: -0.3 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 },

  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  targetLabel: { fontSize: 12, fontFamily: 'Pretendard_400Regular' },
  targetValue: { flex: 1, fontSize: 13.5, fontFamily: 'Pretendard_600SemiBold' },

  label: { fontSize: 14, fontFamily: 'Pretendard_700Bold', marginTop: 18, marginBottom: 10 },
  inputWrap: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 6 },
  bodyInput: { fontSize: 14, lineHeight: 21, fontFamily: 'Pretendard_400Regular', minHeight: 168, paddingTop: 6 },
  count: { fontSize: 11, fontFamily: 'Pretendard_400Regular', alignSelf: 'flex-end', marginTop: 6 },

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
