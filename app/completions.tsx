import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, Pressable, Modal, Alert, ActivityIndicator, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/features/theme';
import { useLocale } from '@/features/locale';
import { localeTag } from '@/i18n';
import { CERT_GOLD } from '@/constants/colors';
import { getCompletions, shareStatsCard, type CompletionRecord } from '@/features/stats';
import CompletionShareCard from '@/features/stats/CompletionShareCard';
import { CARD } from '@/features/stats/completion';

/**
 * 완주한 단어장 — 상장 보관함.
 *
 * 여기 있는 값은 전부 `completions`(022) 의 스냅숏이다. 살아 있는 단어장을 다시 세지 않는다:
 * 완주 뒤에 단어를 더 넣었다고 지난 상장의 "2,800개"가 바뀌면 그건 기록이 아니다.
 * 제목만 예외로 살아 있는 단어장을 따라간다(이름을 바꿔도 같은 단어장이므로).
 */
export default function CompletionsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { locale } = useLocale();

  const [records, setRecords] = useState<CompletionRecord[] | null>(null);
  const [selected, setSelected] = useState<CompletionRecord | null>(null);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<View>(null);

  // 포커스마다 다시 읽는다 — 이 화면을 열어 둔 채 다른 데서 완주하거나 단어장을 지울 수 있고,
  // 첫 렌더에 얼린 값을 들고 있으면 돌아왔을 때 화면이 거짓말을 한다.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getCompletions()
        .then(r => { if (alive) setRecords(r); })
        .catch(() => { if (alive) setRecords([]); });
      return () => { alive = false; };
    }, []),
  );

  const totals = useMemo(() => {
    const list = records ?? [];
    return {
      books: list.length,
      words: list.reduce((n, r) => n + r.totalWords, 0),
      days: list.reduce((n, r) => n + r.studyDays, 0),
    };
  }, [records]);

  const fmtDate = (ms: number) => {
    const d = new Date(ms);
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('.');
  };

  // 카드는 340dp 고정이라 좁은 기기에서는 넘친다. 캡처용(화면 밖)은 원래 크기 그대로 두고
  // 보이는 쪽만 줄인다 — 공유되는 PNG 는 기기 폭과 무관해야 한다.
  const previewScale = Math.min(1, (Dimensions.get('window').width - 40) / CARD);

  const handleShare = async () => {
    if (sharing || !selected) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSharing(true);
    const outcome = await shareStatsCard(
      cardRef,
      t('completionShare.shareMessage', { title: selected.title, count: selected.totalWords }),
    );
    setSharing(false);
    if (outcome === 'unavailable') Alert.alert(t('completionShare.share'), t('shareCard.unavailable'));
    else if (outcome === 'error') Alert.alert(t('completionShare.share'), t('shareCard.shareError'));
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('completions.title')}</Text>
        <View style={styles.backBtn} />
      </View>

      {records === null ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : records.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('completions.emptyTitle')}</Text>
          <Text style={[styles.emptyBody, { color: colors.textTertiary }]}>{t('completions.emptyBody')}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.sum, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            {[
              { n: totals.books.toLocaleString(), l: t('completions.unitBooks') },
              { n: totals.words.toLocaleString(), l: t('completions.unitWords') },
              { n: totals.days.toLocaleString(), l: t('completions.unitDays') },
            ].map((cell, i) => (
              <React.Fragment key={cell.l}>
                {i > 0 && <View style={[styles.sumSep, { backgroundColor: colors.borderLight }]} />}
                <View style={styles.sumCell}>
                  <Text style={[styles.sumNum, { color: colors.primary }]}>{cell.n}</Text>
                  <Text style={[styles.sumLabel, { color: colors.textTertiary }]}>{cell.l}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>

          {records.map(rec => (
            <Pressable
              key={`${rec.listId}-${rec.startedAt}`}
              accessibilityRole="button"
              accessibilityLabel={t('completions.openCertificate', { title: rec.title })}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelected(rec);
              }}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: colors.surface, borderColor: colors.borderLight, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View style={[styles.ribbon, { borderColor: CERT_GOLD }]}>
                <Text style={[styles.ribbonText, { color: CERT_GOLD }]}>
                  {t('completionShare.certSeal').slice(0, 1)}
                </Text>
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>{rec.title}</Text>
                <Text style={[styles.rowMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                  {fmtDate(rec.completedAt)}
                  {' · '}
                  {t('completions.metaWords', { count: rec.totalWords })}
                  {rec.studyDays > 0 ? ` · ${t('completions.metaDays', { count: rec.studyDays })}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* 상장 다시 보기. 이 화면은 모달이 아니라 라우트라 여기서 모달을 띄워도 겹치지 않는다. */}
      <Modal
        visible={selected !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.sheetRoot}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
            onPress={() => setSelected(null)}
          />
          <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.borderLight }]} />

            {selected && (
              <View style={[styles.preview, { height: CARD * previewScale }]}>
                <View style={{ transform: [{ scale: previewScale }] }}>
                  <CompletionShareCard
                    title={selected.title}
                    total={selected.totalWords}
                    studyDays={selected.studyDays}
                    lastTerm={selected.lastTerm}
                    completedAt={selected.completedAt}
                    localeTag={localeTag(locale)}
                  />
                </View>
              </View>
            )}

            <Pressable
              onPress={handleShare}
              disabled={sharing}
              accessibilityRole="button"
              accessibilityLabel={t('completionShare.share')}
              style={({ pressed }) => [
                styles.shareBtn,
                { borderColor: colors.primary, opacity: pressed || sharing ? 0.7 : 1 },
              ]}
            >
              {sharing
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Ionicons name="share-social-outline" size={17} color={colors.primary} />}
              <Text style={[styles.shareText, { color: colors.primary }]}>{t('completionShare.share')}</Text>
            </Pressable>

            {selected?.listAlive && (
              <Pressable
                onPress={() => {
                  const id = selected.listId;
                  setSelected(null);
                  router.push({ pathname: '/list/[id]', params: { id } });
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.openBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.openText, { color: colors.textSecondary }]}>
                  {t('completions.openList')}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>

      {/* 캡처 전용 — 화면 밖에 원래 크기로. 보이는 쪽(위)은 기기 폭에 맞춰 줄여 둔 사본이다. */}
      <View style={styles.offscreen} pointerEvents="none">
        {selected && (
          <CompletionShareCard
            ref={cardRef}
            title={selected.title}
            total={selected.totalWords}
            studyDays={selected.studyDays}
            lastTerm={selected.lastTerm}
            completedAt={selected.completedAt}
            localeTag={localeTag(locale)}
          />
        )}
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
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'Pretendard_700Bold' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontFamily: 'Pretendard_700Bold', textAlign: 'center' },
  emptyBody: { fontSize: 13.5, fontFamily: 'Pretendard_500Medium', textAlign: 'center', lineHeight: 20 },

  scroll: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },

  sum: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 4,
  },
  sumCell: { flex: 1, alignItems: 'center' },
  sumSep: { width: 1, alignSelf: 'stretch', marginVertical: 4 },
  sumNum: { fontSize: 22, fontFamily: 'Pretendard_700Bold' },
  sumLabel: { fontSize: 12, fontFamily: 'Pretendard_500Medium', marginTop: 2 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  ribbon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // 배경 없이 테두리만 있는 원은 안드로이드에서도 둥글게 그려진다(배경이 있으면
    // overflow:'hidden' 이 필요하다 — CLAUDE.md 의 달력 마커 항목).
  },
  ribbonText: { fontSize: 14, fontFamily: 'GowunBatang_700Bold' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontFamily: 'Pretendard_600SemiBold' },
  rowMeta: { fontSize: 12.5, fontFamily: 'Pretendard_500Medium', marginTop: 3 },

  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 8,
    alignItems: 'center',
  },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  // 카드의 «레이아웃» 폭은 340 그대로고 transform 으로만 줄어든다. overflow:'hidden' 을 주면
  // 좁은 기기에서 레이아웃 폭 기준으로 잘릴 수 있으므로 주지 않는다 — 축소된 그림은 어차피
  // 컨테이너 안에 들어온다.
  preview: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },

  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 16,
  },
  shareText: { fontSize: 15, fontFamily: 'Pretendard_700Bold' },
  openBtn: { paddingVertical: 12 },
  openText: { fontSize: 13.5, fontFamily: 'Pretendard_600SemiBold' },

  offscreen: { position: 'absolute', left: -9999, top: 0 },
});
