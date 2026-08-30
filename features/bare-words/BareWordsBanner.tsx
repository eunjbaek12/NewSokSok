/**
 * 단어장 상단의 "뜻만 있는 단어 N개" 배너 — 얼굴 다섯.
 *
 * 🔑 **권유 얼굴에는 한도를 적지 않는다.** "오늘 한도를 다 썼어요"는 읽는 사람에게
 * "그래서 뭐?"다 — 한도는 시스템의 사정이고, 사용자가 알고 싶은 것은 *이 단어들이
 * 어떻게 완성되는가* 하나다. 한도가 남았든 0이든 글자가 같고, 사정은 시트에서 한 번만
 * 말한다. 그래서 진입 화면에 광고 버튼도 경고색도 없다.
 *
 * 나머지 넷은 전부 **사용자의 행동에 대한 응답**이라 성격이 다르다(진행·중단·한도 도달·완료).
 * 같은 "한도 0"이라도 진입 시 잔량 0은 그냥 오늘의 상태이고, 실행하다 닿은 것은 응답이다 —
 * 맥락이 다르면 무게가 다르므로 경고색은 뒤쪽에서만 쓴다.
 */

import React from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { Radius } from '@/constants/tokens';

export type BannerFace =
  | { kind: 'idle'; count: number; added?: number }
  | { kind: 'running'; filled: number; total: number; term: string | null }
  | { kind: 'stopped'; filled: number; remaining: number }
  | { kind: 'quota'; filled: number; remaining: number; canWatchAd: boolean; adLoading: boolean; adError: string | null; rewardAmount: number }
  | { kind: 'done'; filled: number }
  /** 채운 것이 하나도 없고 전부 "AI 가 모르는 단어"였다. terms 는 이름을 대는 데 쓴다. */
  | { kind: 'notFound'; terms: string[] };

interface Props {
  face: BannerFace;
  onOpenSheet: () => void;
  onDismiss: () => void;
  onStop: () => void;
  onResume: () => void;
  onWatchAd: () => void;
  onSnooze: () => void;
  onOpenPlans: () => void;
}

export default function BareWordsBanner({
  face, onOpenSheet, onDismiss, onStop, onResume, onWatchAd, onSnooze, onOpenPlans,
}: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  // ── 권유 ──────────────────────────────────────────────────────────────
  // 배너 전체가 시트를 여는 하나의 터치 타깃이고, ✕ 만 따로 선다.
  // 🔴 화살표(›)와 ✕ 가 나란히 서므로 hitSlop 이 겹치지 않게 ✕ 쪽만 넓힌다.
  if (face.kind === 'idle') {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
        <Pressable onPress={onOpenSheet} style={styles.idleRow} hitSlop={4}>
          <View style={[styles.dot, { backgroundColor: colors.warning }]} />
          <View style={styles.idleText}>
            <Text style={[styles.title, { color: colors.text }]}>
              {t('bareWords.bannerTitle', { count: face.count })}
            </Text>
            {/*
              🔴 다시 뜰 때는 큰 수가 앞이고 늘어난 수는 둘째 줄이다. "새로 86개"만 쓰면
              86개만 채워진다고 읽히는데, 채우기는 언제나 그 단어장의 반쪽 전부가 대상이다 —
              둘을 같게 만들면 먼저 밀린 174개가 영원히 대상에서 빠진다.
            */}
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              {face.added
                ? t('bareWords.bannerAdded', { count: face.added })
                : t('bareWords.bannerSubtitle')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>
        <Pressable onPress={onDismiss} hitSlop={12} style={styles.close}>
          <Ionicons name="close" size={18} color={colors.textTertiary} />
        </Pressable>
      </View>
    );
  }

  // ── 진행 ──────────────────────────────────────────────────────────────
  // 화면을 막지 않는다. 사진 스캔과 달리 결과를 기다릴 이유가 없으므로 전체 화면을
  // 덮지 않고, 채워진 단어는 그 자리에서 주황 점이 사라지고 발음이 붙는다.
  if (face.kind === 'running') {
    const pct = face.total > 0 ? Math.round((face.filled / face.total) * 100) : 0;
    return (
      <View style={[styles.wrap, styles.column, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
        <View style={styles.headRow}>
          <Text style={[styles.title, { color: colors.text }]}>
            {t('bareWords.running', { filled: face.filled, total: face.total })}
          </Text>
          <Pressable onPress={onStop} hitSlop={10}>
            <Text style={[styles.linkSmall, { color: colors.textSecondary }]}>{t('common.stop')}</Text>
          </Pressable>
        </View>
        <Progress percent={pct} color={colors.primary} track={colors.surfaceSecondary} />
        {!!face.term && (
          <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
            {t('bareWords.runningTerm', { term: face.term })}
          </Text>
        )}
      </View>
    );
  }

  // ── 완료 ──────────────────────────────────────────────────────────────
  // 며칠에 걸쳐 채운 사람에게 끝을 알리는 자리. 새 화면도 새 저장 상태도 없다 —
  // 진행 배너가 그 자리에서 얼굴만 바꾸고, ✕ 를 누르면 대상이 0이라 다시 오지 않는다.
  if (face.kind === 'done') {
    return (
      <View style={[styles.wrap, styles.column, { backgroundColor: colors.successLight, borderColor: colors.success }]}>
        <View style={styles.headRow}>
          <View style={styles.titleWithIcon}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={[styles.title, { color: colors.success }]}>
              {t('bareWords.doneTitle', { count: face.filled })}
            </Text>
          </View>
          <Pressable onPress={onDismiss} hitSlop={12}>
            <Ionicons name="close" size={18} color={colors.textTertiary} />
          </Pressable>
        </View>
        <Progress percent={100} color={colors.success} track={colors.surfaceSecondary} />
        <Text style={[styles.sub, { color: colors.textSecondary }]}>{t('bareWords.doneBody')}</Text>
      </View>
    );
  }

  // ── 못 찾음 ──────────────────────────────────────────────────────────
  // 🔴 성과가 없으면 성과를 말하지 않는다. "0개를 채웠어요" + 꽉 찬 진행바는 거짓이다.
  // 대신 **어느 단어인지 이름을 댄다** — 이름 없이 "철자를 확인해 보세요"라고 하면
  // 확인할 방법이 없다. 이 단어들은 다음 배치부터 대상에서 빠진다.
  if (face.kind === 'notFound') {
    const shown = face.terms.slice(0, 3).join(' · ');
    const rest = face.terms.length - 3;
    return (
      <View style={[styles.wrap, styles.column, { backgroundColor: colors.warningLight, borderColor: colors.warning }]}>
        <View style={styles.headRow}>
          <Text style={[styles.title, { color: colors.warning, flex: 1 }]}>
            {t('bareWords.notFoundTitle', { count: face.terms.length })}
          </Text>
          <Pressable onPress={onDismiss} hitSlop={12}>
            <Ionicons name="close" size={18} color={colors.textTertiary} />
          </Pressable>
        </View>
        <Text style={[styles.terms, { color: colors.text }]} numberOfLines={2}>
          {rest > 0 ? t('bareWords.notFoundMore', { terms: shown, count: rest }) : shown}
        </Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>{t('bareWords.notFoundBody')}</Text>
      </View>
    );
  }

  // ── 중단 · 한도 도달 ──────────────────────────────────────────────────
  // 둘 다 "몇 개까지 채웠고 몇 개가 남았다"를 말하는 같은 틀이다. 다른 것은 다음 수단뿐:
  // 중단은 사용자가 멈춘 것이라 [이어서 채우기] 하나면 되고, 한도 도달은 오늘 더 못 하니
  // 광고·내일·Pro 로 갈린다.
  const warn = face.kind === 'quota';
  const accent = warn ? colors.warning : colors.primary;

  return (
    <View style={[styles.wrap, styles.column, { backgroundColor: warn ? colors.warningLight : colors.surface, borderColor: accent }]}>
      <View style={styles.headRow}>
        <Text style={[styles.title, { color: accent, flex: 1 }]}>
          {face.kind === 'stopped'
            ? t('bareWords.stoppedTitle', { count: face.filled })
            : t('bareWords.quotaTitle', { count: face.filled })}
        </Text>
        <Pressable onPress={onDismiss} hitSlop={12}>
          <Ionicons name="close" size={18} color={colors.textTertiary} />
        </Pressable>
      </View>

      <Progress
        percent={warn ? 100 : Math.min(100, Math.round((face.filled / Math.max(1, face.filled + face.remaining)) * 100))}
        color={accent}
        track={colors.surfaceSecondary}
      />

      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        {t('bareWords.remaining', { count: face.remaining })}
      </Text>

      {face.kind === 'stopped' ? (
        <Pressable onPress={onResume} style={[styles.btn, { backgroundColor: colors.primaryButton }]}>
          <Text style={[styles.btnText, { color: colors.onPrimary }]}>{t('bareWords.resume')}</Text>
        </Pressable>
      ) : (
        <QuotaActions
          canWatchAd={face.canWatchAd}
          adLoading={face.adLoading}
          adError={face.adError}
          rewardAmount={face.rewardAmount}
          onWatchAd={onWatchAd}
          onSnooze={onSnooze}
          onOpenPlans={onOpenPlans}
        />
      )}
    </View>
  );
}

/**
 * 한도 도달의 다음 수단.
 *
 * 🔴 판정은 `canWatchAd` **하나로** 갈린다. rewarded-copy.ts 주석의 사고가
 * *제목·본문·버튼이 각자 판정하다 제목만 소진 분기를 빠뜨린 것*이었다 — 광고를 2회 다 본
 * 사용자에게 못 받을 보상을 약속했다. 여기서 판정을 복제하지 않는다.
 *
 * 🔴 자정 안내를 이 자리에 직접 적는다. 자동완성 배너는 'pro'를 눌러도 보상형 모달을
 * 거치고 그 모달에만 자정 안내가 있는데(basic-notice-copy.ts 주석), 이 배너는 인라인이라
 * 그 모달을 못 띄운다 — 경유지가 없어진 만큼 안내가 본문으로 내려와야 같은 오해를 막는다.
 *
 * 🔑 Pro 는 주 버튼이 아니라 아래 한 줄 링크다. 이 화면은 이미 채운 뒤라 급하지 않고,
 * 광고를 상한까지 쓴 사용자 중 Pro 전환은 0명이었다. 지우지는 않는다 — 없으면 존재를 모른다.
 */
function QuotaActions({
  canWatchAd, adLoading, adError, rewardAmount, onWatchAd, onSnooze, onOpenPlans,
}: {
  canWatchAd: boolean;
  adLoading: boolean;
  adError: string | null;
  rewardAmount: number;
  onWatchAd: () => void;
  onSnooze: () => void;
  onOpenPlans: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.actions}>
      {!canWatchAd && (
        <Text style={[styles.sub, { color: colors.warning }]}>{t('ads.rewardedExhausted')}</Text>
      )}
      {!!adError && <Text style={[styles.sub, { color: colors.error }]}>{adError}</Text>}

      <View style={styles.btnRow}>
        {canWatchAd && (
          <Pressable
            onPress={onWatchAd}
            disabled={adLoading}
            style={[styles.btn, styles.btnGrow, { backgroundColor: colors.warning, opacity: adLoading ? 0.6 : 1 }]}
          >
            {adLoading
              ? <ActivityIndicator size="small" color={colors.onPrimary} />
              : <Text style={[styles.btnText, { color: colors.onPrimary }]}>
                  {t('ads.rewardedCta', { amount: rewardAmount })}
                </Text>}
          </Pressable>
        )}
        <Pressable
          onPress={onSnooze}
          style={[
            styles.btn,
            canWatchAd ? styles.btnShrink : styles.btnGrow,
            { backgroundColor: canWatchAd ? colors.surfaceSecondary : colors.primaryButton },
          ]}
        >
          <Text style={[styles.btnText, { color: canWatchAd ? colors.textSecondary : colors.onPrimary }]}>
            {t('bareWords.tomorrow')}
          </Text>
        </Pressable>
      </View>

      {/* 🔴 "내일 이어서"는 알림이 아니다. 내일 이 단어장에 들어왔을 때 배너가 다시 뜰
          뿐이므로 그 사실을 한 줄로 적는다 — 안 적으면 푸시를 기다린다. */}
      <Text style={[styles.undertext, { color: colors.textTertiary }]}>{t('bareWords.tomorrowNote')}</Text>

      <Pressable onPress={onOpenPlans} hitSlop={8}>
        <Text style={[styles.link, { color: colors.primary }]}>{t('bareWords.proLink')}</Text>
      </Pressable>
    </View>
  );
}

function Progress({ percent, color, track }: { percent: number; color: string; track: string }) {
  return (
    <View style={[styles.progTrack, { backgroundColor: track }]}>
      <View style={[styles.progFill, { width: `${percent}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 11,
    paddingHorizontal: 13,
    // 🔴 위아래를 같이 준다. 이 배너는 FlatList 헤더의 첫 요소인데 listContent 에
    // paddingTop 이 없어서, marginBottom 만 주면 위는 헤더 경계선에 딱 붙고 아래만
    // 떠 "아래 여백만 과하다"로 읽힌다(실기 지적).
    marginVertical: 10,
  },
  column: { flexDirection: 'column', alignItems: 'stretch', gap: 7 },
  idleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  idleText: { flex: 1, gap: 2 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleWithIcon: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  // 🔴 배경색 + borderRadius 만으로는 Android(Fabric)가 사각형으로 그린다.
  // overflow:'hidden' 이 둥근 클리핑을 강제한다 — borderWidth 로는 안 고쳐진다.
  dot: { width: 8, height: 8, borderRadius: 4, overflow: 'hidden' },
  close: { padding: 2 },
  title: { fontSize: 13.5, fontFamily: 'Pretendard_600SemiBold' },
  sub: { fontSize: 12, fontFamily: 'Pretendard_400Regular', lineHeight: 17 },
  linkSmall: { fontSize: 12, fontFamily: 'Pretendard_500Medium' },
  terms: { fontSize: 12.5, fontFamily: 'Pretendard_600SemiBold', lineHeight: 18 },
  link: { fontSize: 12, fontFamily: 'Pretendard_500Medium', textAlign: 'center', paddingVertical: 2 },
  undertext: { fontSize: 11, fontFamily: 'Pretendard_400Regular', textAlign: 'center' },
  progTrack: { height: 5, borderRadius: Radius.xs, overflow: 'hidden' },
  progFill: { height: '100%', borderRadius: Radius.xs },
  actions: { gap: 6 },
  btnRow: { flexDirection: 'row', gap: 7 },
  btn: { borderRadius: Radius.sm, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  btnGrow: { flex: 1 },
  btnShrink: { flex: 0, paddingHorizontal: 14 },
  btnText: { fontSize: 12.5, fontFamily: 'Pretendard_600SemiBold' },
});
