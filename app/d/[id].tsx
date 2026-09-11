import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { useSettings } from '@/features/settings';
import {
  getSharedDeck,
  bumpShareSave,
  createCuratedList,
  useLists,
  type SharedDeck,
} from '@/features/vocab';
import { getUniqueName, dedupeByTerm } from '@/features/curation/saved-match';
import { clearPendingShare } from '@/features/curation/share-link';
import { getLanguageLabel } from '@/constants/languages';
import { Radius } from '@/constants/tokens';

// 주소로 들어온 단어장을 담는 화면(docs/share-to-friend-spec.md §3-④⑤).
//
// 🔑 **로그인을 묻지 않는다.** 담기는 로컬 SQLite 에 사본을 만드는 일이라 계정이 필요 없다.
// 받는 사람에게 계정을 요구하면 «친구가 준 단어장»이 가입 절차로 바뀐다.
//
// 🔴 **못 연 이유를 단정하지 않는다.** 서버는 만료·삭제·오타를 구분하지 못한다 — 셋 다
// `null` 로 돌아온다. 「기간이 지났어요」라고 단정하면 오타로 온 사람에게 거짓말이 된다.

const PREVIEW_ROWS = 20;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }   // 만료·삭제·오타 — 구분할 수 없다
  | { kind: 'error' }         // 네트워크 등 다시 시도하면 될 수도 있는 실패
  | { kind: 'ready'; deck: SharedDeck };

export default function SharedDeckScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const { inputSettings } = useSettings();
  const lists = useLists();

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [saving, setSaving] = useState(false);
  const [forceNew, setForceNew] = useState(false);

  const load = useCallback(async () => {
    if (!id) { setState({ kind: 'unavailable' }); return; }
    setState({ kind: 'loading' });
    try {
      const deck = await getSharedDeck(id);
      setState(deck ? { kind: 'ready', deck } : { kind: 'unavailable' });
    } catch {
      setState({ kind: 'error' });
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  // 이 화면이 열렸으면 레이아웃이 기억해 둔 주소를 다시 열 이유가 없다(share-link.ts).
  useEffect(() => { if (id) clearPendingShare(id); }, [id]);

  // 이미 담은 적이 있는가. 출처 id 로 판정한다 — 제목으로 세면 이름을 바꾼 순간 틀린다.
  // 값이 없는 옛 단어장은 여기 걸리지 않는다(§4.3: 그때는 안내 없이 그냥 담긴다).
  const savedCopy = state.kind === 'ready'
    ? lists.find(l => l.sourceThemeId === state.deck.id)
    : undefined;

  const deck = state.kind === 'ready' ? state.deck : null;
  const langMismatch = Boolean(
    deck?.targetLanguage && deck.targetLanguage !== inputSettings.targetLang,
  );

  const handleSave = async () => {
    if (!deck || saving) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      const words = dedupeByTerm(deck.words);
      const title = getUniqueName(deck.title, lists.map(l => l.title));
      // 주소로 받은 단어에는 내용 필드만 있고 학습 상태(isStarred 등)가 없다. createCuratedList 는
      // 내용 필드만 읽고 id·학습 상태를 새로 매기므로 이 모양으로 충분하다 — 공유 탭의 담기
      // (features/curation/screen.tsx)도 fetchCloudCurations 의 같은 모양을 넘긴다.
      const newList = await createCuratedList(title, deck.icon || '✨', words as unknown as Parameters<typeof createCuratedList>[2], {
        sourceLanguage: deck.sourceLanguage,
        targetLanguage: deck.targetLanguage,
        sourceThemeId: deck.id,
        savedAt: Date.now(),
      });
      // 담긴 수는 서버에만 쌓는다(§2-6). 실패해도 담기는 이미 끝났으므로 기다리지 않는다.
      void bumpShareSave(deck.id);
      router.replace(`/list/${newList.id}`);
    } catch (e: any) {
      setSaving(false);
      // 덱은 멀쩡히 불러와져 있다. 「불러오지 못했어요」 화면으로 바꾸면 거짓말이 된다.
      Alert.alert(t('sharedDeck.saveFailed'), e?.message || t('common.error'));
    }
  };

  const renderBody = () => {
    if (state.kind === 'loading') {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (state.kind === 'unavailable' || state.kind === 'error') {
      const isUnavailable = state.kind === 'unavailable';
      return (
        <View style={styles.center}>
          <Ionicons
            name={isUnavailable ? 'mail-open-outline' : 'cloud-offline-outline'}
            size={48}
            color={colors.textTertiary}
          />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t(isUnavailable ? 'sharedDeck.unavailableTitle' : 'sharedDeck.errorTitle')}
          </Text>
          <Text style={[styles.emptyMessage, { color: colors.textSecondary }]}>
            {t(isUnavailable ? 'sharedDeck.unavailableMessage' : 'sharedDeck.errorMessage')}
          </Text>
          <Pressable
            onPress={() => (isUnavailable ? router.replace('/') : void load())}
            style={[styles.primaryBtn, { backgroundColor: colors.primaryButton }]}
          >
            <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>
              {t(isUnavailable ? 'sharedDeck.goHome' : 'sharedDeck.retry')}
            </Text>
          </Pressable>
        </View>
      );
    }

    const { deck: d } = state;
    const shown = d.words.slice(0, PREVIEW_ROWS);
    const rest = d.wordCount - shown.length;
    const alreadySaved = savedCopy && !forceNew;

    return (
      <ScrollView contentContainerStyle={styles.scrollBody}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <Text style={styles.icon}>{d.icon || '✨'}</Text>
          <Text style={[styles.title, { color: colors.text }]}>{d.title}</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {t('sharedDeck.sentBy', { name: d.creatorName })} · {t('sharedDeck.wordCount', { count: d.wordCount })}
          </Text>
          {d.sourceLanguage && d.targetLanguage && (
            <Text style={[styles.meta, { color: colors.textTertiary }]}>
              {getLanguageLabel(d.sourceLanguage, t)} → {getLanguageLabel(d.targetLanguage, t)}
            </Text>
          )}
        </View>

        {alreadySaved && (
          <View style={[styles.notice, { backgroundColor: colors.surfaceSecondary, borderColor: colors.borderLight }]}>
            <Text style={[styles.noticeText, { color: colors.text }]}>
              {savedCopy?.savedAt
                ? t('sharedDeck.alreadySavedOn', { date: formatSavedDate(savedCopy.savedAt, i18n.language) })
                : t('sharedDeck.alreadySaved')}
            </Text>
            <View style={styles.noticeActions}>
              <Pressable
                onPress={() => router.replace(`/list/${savedCopy!.id}`)}
                style={[styles.noticeBtn, { backgroundColor: colors.primaryButton }]}
              >
                <Text style={[styles.noticeBtnText, { color: colors.onPrimary }]}>{t('sharedDeck.openMyList')}</Text>
              </Pressable>
              <Pressable
                onPress={() => setForceNew(true)}
                style={[styles.noticeBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
              >
                <Text style={[styles.noticeBtnText, { color: colors.text }]}>{t('sharedDeck.saveAnyway')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {langMismatch && (
          <View style={[styles.notice, { backgroundColor: colors.surfaceSecondary, borderColor: colors.borderLight }]}>
            <Text style={[styles.noticeText, { color: colors.text }]}>
              {t('sharedDeck.langMismatch', {
                deckLang: getLanguageLabel(d.targetLanguage!, t),
                myLang: getLanguageLabel(inputSettings.targetLang, t),
              })}
            </Text>
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t('sharedDeck.previewLabel')}</Text>
        <View style={[styles.wordBox, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          {shown.map((w, i) => (
            <View
              key={w.id ?? i}
              style={[styles.wordRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.borderLight }]}
            >
              <Text style={[styles.term, { color: colors.text }]} numberOfLines={1}>{w.term}</Text>
              <Text style={[styles.meaning, { color: colors.textSecondary }]} numberOfLines={1}>
                {w.meaningKr || w.definition}
              </Text>
            </View>
          ))}
          {rest > 0 && (
            <Text style={[styles.more, { color: colors.textTertiary }]}>
              {t('sharedDeck.moreWords', { count: rest })}
            </Text>
          )}
        </View>
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/')} hitSlop={10} accessibilityLabel={t('common.close')}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('sharedDeck.headerTitle')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {renderBody()}

      {state.kind === 'ready' && (!savedCopy || forceNew) && (
        <View style={[styles.footer, { borderTopColor: colors.borderLight, backgroundColor: colors.background }]}>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={[styles.primaryBtn, styles.footerBtn, { backgroundColor: saving ? colors.surfaceSecondary : colors.primaryButton }]}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>{t('sharedDeck.saveButton')}</Text>
            )}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

/** 「8월 12일에 이미 담았어요」. 로케일 데이터가 없으면 숫자 표기로 떨어뜨린다. */
function formatSavedDate(ts: number, localeTag: string): string {
  try {
    return new Date(ts).toLocaleDateString(localeTag, { month: 'long', day: 'numeric' });
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 16, fontFamily: 'Pretendard_600SemiBold' },
  headerSpacer: { width: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 10 },
  emptyTitle: { fontSize: 18, fontFamily: 'Pretendard_600SemiBold', marginTop: 6 },
  emptyMessage: { fontSize: 14, fontFamily: 'Pretendard_400Regular', textAlign: 'center', lineHeight: 20 },
  scrollBody: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
  card: { borderRadius: Radius.lg, borderWidth: 1, padding: 16, alignItems: 'center', gap: 4 },
  icon: { fontSize: 36 },
  title: { fontSize: 20, fontFamily: 'Pretendard_700Bold', textAlign: 'center' },
  meta: { fontSize: 13, fontFamily: 'Pretendard_400Regular' },
  notice: { borderRadius: Radius.md, borderWidth: 1, padding: 12, gap: 10 },
  noticeText: { fontSize: 14, fontFamily: 'Pretendard_500Medium', lineHeight: 20 },
  noticeActions: { flexDirection: 'row', gap: 8 },
  noticeBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: Radius.sm },
  noticeBtnText: { fontSize: 14, fontFamily: 'Pretendard_600SemiBold' },
  sectionLabel: { fontSize: 12, fontFamily: 'Pretendard_500Medium' },
  wordBox: { borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden' },
  wordRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  term: { fontSize: 15, fontFamily: 'Pretendard_600SemiBold', flexShrink: 1 },
  meaning: { fontSize: 14, fontFamily: 'Pretendard_400Regular', flexShrink: 1, textAlign: 'right' },
  more: { fontSize: 13, fontFamily: 'Pretendard_400Regular', textAlign: 'center', paddingVertical: 10 },
  footer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, borderTopWidth: 1 },
  primaryBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: Radius.md, paddingHorizontal: 24 },
  footerBtn: { width: '100%' },
  primaryBtnText: { fontSize: 16, fontFamily: 'Pretendard_600SemiBold' },
});
