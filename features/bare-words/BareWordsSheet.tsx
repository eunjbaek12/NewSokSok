/**
 * "뜻만 있는 단어 채우기" 확인 시트 — 하나의 시트가 상태에 따라 얼굴 셋을 갖는다.
 *
 *   ① 채울 수 있음   [N개 채우기] · [채울 단어 고르기]
 *   ② 잔량 0·광고 남음 [광고 보고 +N단어] · [내일 이어서] · Pro 링크
 *   ③ 잔량 0·광고 소진 [내일 이어서] · Pro 링크 + 자정 안내
 *
 * 🔑 **②·③은 막다른 길이 아니라 ①로 가는 길이다.** 광고를 보든 자정이 지나든 Pro가 되든
 * 도착지는 언제나 ①이고 숫자만 다르다. 그래서 광고가 끝나면 곧장 채우지 않고 이 시트가
 * ①의 얼굴로 다시 그려진다 — 174개 중 20개만 되는 상황에서는 *어느 20개인지가 실제로
 * 중요하고*(별표한 것, 곧 시험 볼 것) ①에 [채울 단어 고르기]가 있다. 그대로 진행할 사람은
 * 버튼을 한 번 더 누르면 그만이다. 앱의 기존 CTA가 "광고 보고 +20단어"인 것도 같은 관점 —
 * 광고는 채워 주는 것이 아니라 **채울 수 있게 만들어 주는 것**이다.
 *
 * 🔑 제목은 배너·⋯ 메뉴와 **같은 낱말**이다("뜻만 있는 단어 채우기"). 세 자리가 한 기능으로
 * 이어지지 않으면 배너를 닫은 사람이 메뉴에서 같은 것을 찾지 못한다.
 */

import React from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { FontSize, FontWeight, Radius } from '@/constants/tokens';
import ModalOverlay from '@/components/ui/ModalOverlay';
import { PopupTokens } from '@/constants/popup';

interface Props {
  visible: boolean;
  /** 이 단어장의 반쪽 전체 수. */
  bareCount: number;
  /**
   * 지금 채울 수 있는 수. `null`은 **"모른다"**(quota 응답이 아직 안 옴)이지 0이 아니다 —
   * 0으로 뭉개면 멀쩡한 사용자가 "0개" 얼굴을 본다. BYOK도 null(무제한)이다.
   */
  quotaLeft: number | null;
  /** BYOK는 앱 차원의 한도가 없다 — 잔량 줄을 그리지 않고 늘 ①이다. */
  unlimited: boolean;
  canWatchAd: boolean;
  adLoading: boolean;
  adError: string | null;
  rewardAmount: number;
  onClose: () => void;
  onFill: (count: number) => void;
  onPick: () => void;
  onWatchAd: () => void;
  onSnooze: () => void;
  onOpenPlans: () => void;
}

export default function BareWordsSheet({
  visible, bareCount, quotaLeft, unlimited, canWatchAd, adLoading, adError, rewardAmount,
  onClose, onFill, onPick, onWatchAd, onSnooze, onOpenPlans,
}: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  // 잔량을 모르면(응답 대기) 막지 않는다 — 화면은 ①로 그리고 실제 자르기는 실행부가 한다.
  const known = unlimited ? bareCount : quotaLeft;
  const fillable = known == null ? bareCount : Math.min(known, bareCount);
  const canFill = known == null || fillable > 0;
  const leftover = bareCount - fillable;

  const tap = (fn: () => void) => () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fn();
  };

  return (
    <ModalOverlay visible={visible} onClose={onClose} variant="bottomSheet" scrollable={false}>
      <View style={styles.body}>
        <View style={[styles.grab, { backgroundColor: colors.border }]} />

        <Text style={[styles.title, { color: colors.text }]}>{t('bareWords.sheetTitle')}</Text>
        <Text style={[styles.desc, { color: colors.textSecondary }]}>{t('bareWords.sheetDesc')}</Text>

        {/*
          사실은 여기서 한 번만 말한다. 숫자 몇 줄이면 충분하고 "한도"라는 낱말은 쓰지 않는다 —
          지금 몇 개가 되는지, 광고를 보면 몇 개가 되는지가 사용자에게 필요한 전부다.
        */}
        <View style={[styles.facts, { backgroundColor: colors.surfaceSecondary }]}>
          <Fact label={t('bareWords.factBare')} value={t('bareWords.countWords', { count: bareCount })} />
          {!unlimited && (
            <Fact
              label={t('bareWords.factFillable')}
              value={known == null ? '—' : t('bareWords.countWords', { count: fillable })}
              highlight={canFill}
              warn={!canFill}
            />
          )}
          {!canFill && canWatchAd && (
            <Fact
              label={t('bareWords.factAfterAd')}
              value={t('bareWords.countWords', { count: rewardAmount })}
              highlight
            />
          )}
        </View>

        {/* ① 남은 것의 행방을 같은 화면에서 답한다 — "174개 채우기"를 눌렀는데 50에서 멈추고
            한도까지 사라지면 속았다고 느낀다. 그래서 버튼에도 174가 아니라 50이 찍힌다. */}
        {canFill && leftover > 0 && (
          <Text style={[styles.note, { color: colors.warning }]}>
            {t('bareWords.leftoverNote', { count: leftover })}
          </Text>
        )}

        {/* ③ 자정 안내. 🔴 인라인이라 보상형 모달을 경유하지 못하므로 여기 직접 적는다 —
            안 적으면 결제가 유일한 길처럼 보인다(basic-notice-copy.ts 주석의 그 오해). */}
        {!canFill && !canWatchAd && (
          <Text style={[styles.note, { color: colors.warning }]}>{t('ads.rewardedExhausted')}</Text>
        )}

        {!!adError && <Text style={[styles.note, { color: colors.error }]}>{adError}</Text>}

        {canFill ? (
          <View style={styles.actions}>
            <Pressable onPress={tap(() => onFill(fillable))} style={[styles.btn, { backgroundColor: colors.primaryButton }]}>
              <Text style={[styles.btnText, { color: colors.onPrimary }]}>
                {t('bareWords.fillCount', { count: fillable })}
              </Text>
            </Pressable>
            <Pressable onPress={tap(onPick)} style={[styles.btn, styles.ghost]}>
              <Text style={[styles.btnText, styles.ghostText, { color: colors.textSecondary }]}>
                {t('bareWords.pick')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
          <View style={styles.actions}>
            {canWatchAd && (
              <Pressable
                onPress={tap(onWatchAd)}
                disabled={adLoading}
                style={[styles.btn, { backgroundColor: colors.primaryButton, opacity: adLoading ? 0.6 : 1 }]}
              >
                {adLoading
                  ? <ActivityIndicator size="small" color={colors.onPrimary} />
                  : <Text style={[styles.btnText, { color: colors.onPrimary }]}>
                      {t('ads.rewardedCta', { amount: rewardAmount })}
                    </Text>}
              </Pressable>
            )}
            <Pressable
              onPress={tap(onSnooze)}
              style={[
                styles.btn,
                canWatchAd ? styles.ghost : { backgroundColor: colors.primaryButton },
              ]}
            >
              {/* ③(광고까지 소진)에서는 이것이 유일한 버튼이라 주 버튼으로 승격된다 —
                  그때는 글자도 주 버튼 값(16/600)으로 돌아와야 한다. */}
              <Text
                style={[
                  styles.btnText,
                  canWatchAd ? styles.ghostText : null,
                  { color: canWatchAd ? colors.textSecondary : colors.onPrimary },
                ]}
              >
                {t('bareWords.tomorrow')}
              </Text>
            </Pressable>
            {/* 🔴 알림이 아니다 — 내일 이 단어장에 들어왔을 때 배너가 다시 뜰 뿐이다.
                버튼의 각주라서 버튼 묶음 안에 둔다(붙어 있어야 각주로 읽힌다). */}
            <Text style={[styles.undertext, { color: colors.textTertiary }]}>{t('bareWords.tomorrowNote')}</Text>
          </View>
            <Pressable onPress={tap(onOpenPlans)} hitSlop={8}>
              <Text style={[styles.link, { color: colors.primary }]}>{t('bareWords.proLink')}</Text>
            </Pressable>
          </>
        )}
      </View>
    </ModalOverlay>
  );
}

function Fact({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  const { colors } = useTheme();
  const color = warn ? colors.warning : highlight ? colors.primary : colors.text;
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.factValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // 🔴 ModalOverlay 는 DialogModal 과 달리 본문을 패딩해 주지 않는다 — 넣지 않으면
  // 글자가 화면 좌우 끝에 붙는다(실기에서 확인). 아래 16 은 본문 여백이고, 시스템 바
  // 만큼은 ModalOverlay 가 따로 더해 준다 — 여기서 34 같은 숫자를 직접 쓰면 iOS 홈
  // 인디케이터에만 맞고 Android 3버튼 바(48dp)엔 모자란다.
  //
  // 치수는 홈의 완주 결과 시트(app/(tabs)/index.tsx 의 resultSheet)에 맞춘 것이다 —
  // 같은 바텀시트인데 제목·버튼·모서리가 한 단계씩 작아서 카드가 아니라 라벨로 읽혔다.
  // 🔑 간격이 묶음을 만든다. 제목·설명·숫자 상자·버튼 묶음은 서로 16 만큼 떨어뜨리고,
  // 한 묶음 안(버튼끼리, 버튼과 그 각주)은 6 으로 붙인다. 전부 12 로 균등했을 때는
  // [채울 단어 고르기]가 위 버튼이 아니라 숫자 상자에 붙은 것처럼 보였다.
  body: { gap: 16, paddingHorizontal: PopupTokens.padding.container, paddingTop: 12, paddingBottom: 16 },
  grab: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  actions: { gap: 6 },
  // 글자는 FontSize/FontWeight 스케일만 쓴다(DESIGN.md §9). 이 시트에 12.5·13.5·11.5 가
  // 섞여 있었는데, 그렇게 눈으로 맞춘 값은 다음 화면에서 재현되지 않는다.
  title: { fontSize: FontSize.titleLg, fontFamily: FontWeight.bold, letterSpacing: -0.3 },
  desc: { fontSize: FontSize.small, fontFamily: FontWeight.regular, lineHeight: 19 },
  facts: { borderRadius: Radius.md, paddingVertical: 4, paddingHorizontal: 12, marginTop: 2 },
  fact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, gap: 12 },
  factLabel: { fontSize: FontSize.label, fontFamily: FontWeight.regular, flex: 1 },
  factValue: { fontSize: FontSize.body, fontFamily: FontWeight.semibold },
  note: { fontSize: FontSize.small, fontFamily: FontWeight.regular, lineHeight: 18 },
  btn: { borderRadius: Radius.xl, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  // 🔑 부차 버튼은 **상자를 걷어내되 높이는 그대로 둔다**(paddingVertical 16 을 공유).
  // 테두리를 두르면 주 버튼과 덩치가 같아 무게까지 같아지고, 높이를 줄이면 위아래로
  // 쌓인 두 버튼의 크기만 어긋나 보인다. 터치 타겟(51dp)도 그대로 남는다.
  ghost: { backgroundColor: 'transparent' },
  btnText: { fontSize: FontSize.action, fontFamily: FontWeight.semibold },
  // 14/500 은 앱의 부차 버튼 관례를 따른 값이다(사진 가져오기 [분석 취소] 15/500,
  // 학습 설정 [닫기] 14/600). 13/400 까지 내리지 않는 이유: 이 시트의 설명글이
  // 정확히 13/400 이고 Pro 링크가 13/500 이라, 상자 없는 글자가 그 급이 되면
  // 버튼이 아니라 문장으로 읽힌다.
  ghostText: { fontSize: FontSize.body, fontFamily: FontWeight.medium },
  undertext: { fontSize: FontSize.caption, fontFamily: FontWeight.regular, textAlign: 'center' },
  link: { fontSize: FontSize.small, fontFamily: FontWeight.medium, textAlign: 'center', paddingVertical: 4 },
});
