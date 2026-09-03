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
 *
 * 🔑 시트는 **한 벌이고 대상만 갈아 끼운다**(variant). 예문 학습에서 열면 대상이 「예문 없는
 * 단어」가 되고 제목·설명·개수 라벨만 그쪽 낱말이 된다 — 모양·차감·부분 채움 판정·고르기
 * 화면은 그대로다(docs/example-study-consent-spec.md §3).
 *
 * 🔑 ①에도 광고 길이 하나 열려 있다. 잔량이 **일부만** 남았을 때(12개 중 5개) 무료 경로는
 * 주 버튼 그대로 두고 그 아래 「광고 보고 12개 다 채우기」를 놓는다 — 없으면 12개를 다
 * 채우려고 *5개 채우고 → 벽에 부딪히고 → 그제서야 광고* 두 단계를 밟아야 했다. 개수 판정은
 * ad-offer.ts 가 한다(못 받을 보상을 약속하지 않기 위해).
 *
 * 🔑 **얼굴이 셋에서 다섯으로 늘었다**(2026-09-02). 예문 학습 화면에서 배너가 카드의 몫을
 * 먹기 때문에 진행·결과를 칩으로 접었고(chip.ts 머리말), 배너가 지던 말이 전부 이리로 왔다:
 *
 *   ④ 진행   [중단] · 진행바 · 지금 채우는 단어 — 「마무리하는 중」·「기다리는 중」 포함
 *   ⑤ 결과   채운 수 · 남은 수 · [이어서 채우기] — 못 찾은 단어는 이름을 댄다
 *
 * 그래서 **칩을 누르면 언제든 지금이 보인다.** 진행 상황을 보려고 기다릴 필요가 없다.
 */

import React from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { FontSize, FontWeight, Radius } from '@/constants/tokens';
import ModalOverlay from '@/components/ui/ModalOverlay';
import { PopupTokens } from '@/constants/popup';
import { pickAdFillOffer } from './ad-offer';
import { planFill } from './fill-plan';
import type { BannerFace } from './face';

/** 무엇을 채우는 시트인가 — 제목·설명·개수 라벨만 갈린다. */
export type SheetVariant = 'bare' | 'example';

/** 변주별 문구. 갈리는 것은 이 셋뿐이고 버튼·사실 라벨은 공용이다. */
const COPY: Record<SheetVariant, {
  title: string; desc: string; fact: string; runningDesc: string; remaining: string;
}> = {
  bare: {
    title: 'bareWords.sheetTitle', desc: 'bareWords.sheetDesc', fact: 'bareWords.factBare',
    runningDesc: 'bareWords.runningDesc', remaining: 'bareWords.remaining',
  },
  example: {
    title: 'examples.fillSheetTitle', desc: 'examples.fillSheetDesc', fact: 'examples.fillFactMissing',
    runningDesc: 'examples.fillRunningDesc', remaining: 'examples.fillRemaining',
  },
};

export interface BareWordsSheetProps {
  visible: boolean;
  variant?: SheetVariant;
  /**
   * 지금 얼굴. 진행·결과일 때 이 시트가 그 얼굴로 열린다 — 배너가 하던 말을 그대로 받는다.
   * 없거나 권유·한도면 아래 ①②③ 그대로다(그 판정은 quotaLeft 가 한다).
   */
  face?: BannerFace;
  /** 이 시트가 채울 대상 수(변주에 따라 「뜻만 있는 단어」 또는 「예문 없는 단어」). */
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
  /**
   * 잔량이 일부 남은 상태에서 「광고 보고 N개 채우기」를 눌렀다.
   *
   * 🔴 `onWatchAd` 와 갈라 두는 이유: 잔량 0 에서 광고를 보면 시트가 ①의 얼굴로 **돌아오고**
   * 사용자가 어느 것을 채울지 다시 고르지만, 이 버튼은 이미 개수를 약속했으므로 광고가
   * 끝나면 **그대로 채워야** 한다. 같은 콜백을 쓰면 약속과 동작이 어긋난다.
   */
  onFillWithAd?: () => void;
  onSnooze: () => void;
  onOpenPlans: () => void;
  /** 진행 얼굴의 [중단]. */
  onStop?: () => void;
  /** 결과 얼굴의 [이어서 채우기]. */
  onResume?: () => void;
}

export default function BareWordsSheet({
  visible, variant = 'bare', face, bareCount, quotaLeft, unlimited, canWatchAd, adLoading, adError, rewardAmount,
  onClose, onFill, onPick, onWatchAd, onFillWithAd, onSnooze, onOpenPlans, onStop, onResume,
}: BareWordsSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const copy = COPY[variant];

  /*
   * 숫자와 갈래는 **순수 함수가 한 벌로** 정한다(fill-plan.ts).
   * 🔴 「다 채웠다」와 「한도가 막았다」가 **둘 다 `fillable` 0** 이라, 이 계산이 컴포넌트 안에
   *    있던 동안 그 둘을 못 갈라 다 채운 사람에게 「광고 보고 +20단어」를 권했다(2026-09-03 실기).
   *    테스트가 물어볼 손잡이가 없어 1,565건이 전부 지나쳤다 — 그래서 밖으로 뺐다.
   */
  const { fillable, leftover, canFill, quotaUnknown } = planFill({ bareCount, quotaLeft, unlimited });
  // 광고로 한 번에 끝낼 수 있는가. 판정과 개수는 순수 함수가 정한다(ad-offer.ts).
  const adOffer = onFillWithAd
    ? pickAdFillOffer({ target: bareCount, fillable, rewardAmount, canWatchAd, unlimited })
    : null;

  const tap = (fn: () => void) => () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fn();
  };

  // ④ 도는 중 — 「채우는 중」·「기다리는 중」·「마무리하는 중」이 한 몸이다(진행바 + 다음 수단).
  if (face && (face.kind === 'running' || face.kind === 'waiting' || face.kind === 'stopping')) {
    return (
      <ModalOverlay visible={visible} onClose={onClose} variant="bottomSheet" scrollable={false}>
        <ProgressBody face={face} copy={copy} onStop={onStop} onClose={onClose} />
      </ModalOverlay>
    );
  }

  // ⑤ 끝난 뒤 — 성과와 남은 것. 못 찾았으면 이름을 댄다.
  if (face && (face.kind === 'stopped' || face.kind === 'partial' || face.kind === 'done' || face.kind === 'notFound')) {
    return (
      <ModalOverlay visible={visible} onClose={onClose} variant="bottomSheet" scrollable={false}>
        <ResultBody face={face} copy={copy} onResume={onResume} onPick={onPick} onClose={onClose} />
      </ModalOverlay>
    );
  }

  return (
    <ModalOverlay visible={visible} onClose={onClose} variant="bottomSheet" scrollable={false}>
      <View style={styles.body}>
        <View style={[styles.grab, { backgroundColor: colors.border }]} />

        <Text style={[styles.title, { color: colors.text }]}>{t(copy.title)}</Text>
        <Text style={[styles.desc, { color: colors.textSecondary }]}>{t(copy.desc)}</Text>

        {/*
          사실은 여기서 한 번만 말한다. 숫자 몇 줄이면 충분하고 "한도"라는 낱말은 쓰지 않는다 —
          지금 몇 개가 되는지, 광고를 보면 몇 개가 되는지가 사용자에게 필요한 전부다.
        */}
        <View style={[styles.facts, { backgroundColor: colors.surfaceSecondary }]}>
          <Fact label={t(copy.fact)} value={t('bareWords.countWords', { count: bareCount })} />
          {!unlimited && (
            <Fact
              label={t('bareWords.factFillable')}
              value={quotaUnknown ? '—' : t('bareWords.countWords', { count: fillable })}
              highlight={canFill}
              warn={!canFill}
            />
          )}
          {/* 잔량 0(②)이든 일부 남았든(①+광고) 광고가 무엇을 주는지는 같은 줄로 말한다. */}
          {((!canFill && canWatchAd) || adOffer) && (
            <Fact
              label={t('bareWords.factAfterAd')}
              value={t('bareWords.countWords', { count: rewardAmount })}
              highlight
            />
          )}
        </View>

        {/* ① 남은 것의 행방을 같은 화면에서 답한다 — "174개 채우기"를 눌렀는데 50에서 멈추고
            한도까지 사라지면 속았다고 느낀다. 그래서 버튼에도 174가 아니라 50이 찍힌다. */}
        {/* 🔑 광고 길이 열려 있으면 이 줄을 내지 않는다 — 바로 아래 버튼이 「지금 다 채우기」인데
            그 위에서 「나머지는 내일」이라고 하면 두 문장이 서로를 배반한다. 광고를 볼 수 없을
            때(상한 소진)는 그대로 내일이 유일한 길이므로 다시 나온다. */}
        {canFill && leftover > 0 && !adOffer && (
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
            {/* 🔴 개수는 ad-offer.ts 가 준 값 그대로 적는다 — 남은 한도 + 보상을 넘는 수를
                약속하면 안 된다(대상 30·잔량 5 면 「다 채우기」가 아니라 「25개 채우기」). */}
            {adOffer && (
              <Pressable
                onPress={tap(onFillWithAd!)}
                disabled={adLoading}
                style={[styles.btn, styles.adBtn, { borderColor: colors.primary, opacity: adLoading ? 0.6 : 1 }]}
              >
                {adLoading
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Text style={[styles.btnText, { color: colors.primary }]}>
                      {t(adOffer.coversAll ? 'bareWords.fillAllWithAd' : 'bareWords.fillWithAd', { count: adOffer.count })}
                    </Text>}
              </Pressable>
            )}
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

type SheetCopy = (typeof COPY)[SheetVariant];

/**
 * ④ 도는 중.
 *
 * 🔴 **「마무리하는 중」에는 [중단]을 두지 않는다.** 이미 멈춘 뒤라 멈출 것이 없는데 버튼이
 * 남아 있으면 «아직 안 멈췄나»로 읽힌다 — 회색으로 죽여 놔도 마찬가지다. 닫는 길만 주고,
 * 닫아도 저장은 계속된다는 사실을 한 줄로 적는다(안 적으면 닫기를 취소로 읽는다).
 */
function ProgressBody({
  face, copy, onStop, onClose,
}: {
  face: Extract<BannerFace, { kind: 'running' | 'waiting' | 'stopping' }>;
  copy: SheetCopy;
  onStop?: () => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const stopping = face.kind === 'stopping';
  const waiting = face.kind === 'waiting';

  // 🔑 남은 초는 **여기서만** 센다. 얼굴 판정에 초를 넣으면 도는 내내 화면 전체가 초당 한 번씩
  // 다시 그려진다(face.ts 의 waitingUntil 주석).
  const until = waiting ? face.waitingUntil : 0;
  const [left, setLeft] = React.useState(() => secondsLeft(until));
  React.useEffect(() => {
    if (!waiting) return;
    setLeft(secondsLeft(until));
    const timer = setInterval(() => setLeft(secondsLeft(until)), 1000);
    return () => clearInterval(timer);
  }, [waiting, until]);

  const pct = face.total > 0 ? Math.round((face.filled / face.total) * 100) : 0;
  const accent = waiting ? colors.warning : colors.primary;

  return (
    <View style={styles.body}>
      <View style={[styles.grab, { backgroundColor: colors.border }]} />

      <Text style={[styles.title, { color: waiting ? colors.warning : colors.text }]}>
        {stopping ? t('bareWords.stoppingTitle')
          : waiting ? t('bareWords.waitingTitle')
          : t('bareWords.running', { filled: face.filled, total: face.total })}
      </Text>
      <Text style={[styles.desc, { color: colors.textSecondary }]}>
        {stopping ? t('bareWords.stoppingDesc')
          : waiting ? t('bareWords.waitingDesc')
          : t(copy.runningDesc)}
      </Text>

      <View style={[styles.facts, { backgroundColor: colors.surfaceSecondary }]}>
        <Fact
          label={stopping ? t('bareWords.factReceiving') : t('bareWords.factFilled')}
          value={t('bareWords.progressOf', { filled: face.filled, total: face.total })}
          highlight
        />
        {waiting && (
          <Fact label={t('bareWords.waitingFact')} value={t('bareWords.waitingSec', { count: left })} warn />
        )}
      </View>

      <View style={[styles.progTrack, { backgroundColor: colors.surfaceSecondary }]}>
        <View style={[styles.progFill, { width: `${pct}%`, backgroundColor: accent }]} />
      </View>

      {face.kind === 'running' && !!face.term && (
        <Text style={[styles.note, { color: colors.textSecondary, textAlign: 'center' }]} numberOfLines={1}>
          {t('bareWords.runningTerm', { term: face.term })}
        </Text>
      )}

      <View style={styles.actions}>
        {!stopping && !!onStop && (
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onStop(); }}
            style={[styles.btn, { backgroundColor: colors.surfaceSecondary }]}
          >
            <Text style={[styles.btnText, { color: colors.textSecondary }]}>{t('common.stop')}</Text>
          </Pressable>
        )}
        <Pressable onPress={onClose} style={[styles.btn, styles.ghost]}>
          <Text style={[styles.btnText, styles.ghostText, { color: colors.textSecondary }]}>{t('common.close')}</Text>
        </Pressable>
        {stopping && (
          <Text style={[styles.undertext, { color: colors.textTertiary }]}>{t('bareWords.stoppingNote')}</Text>
        )}
      </View>
    </View>
  );
}

/** 남은 초. 지났으면 0 — 음수를 그리면 「-3초」가 뜬다. */
function secondsLeft(until: number): number {
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

/**
 * ⑤ 끝난 뒤.
 *
 * 🔴 성과가 없으면 성과를 말하지 않는다 — 못 찾은 것뿐이면 **이름을 댄다.** 이름 없이
 * 「철자를 확인해 보세요」라고 하면 확인할 방법이 없다(BareWordsBanner 의 같은 판단).
 */
function ResultBody({
  face, copy, onResume, onPick, onClose,
}: {
  face: Extract<BannerFace, { kind: 'stopped' | 'partial' | 'done' | 'notFound' }>;
  copy: SheetCopy;
  onResume?: () => void;
  onPick: () => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const notFound = face.kind === 'notFound';
  const remaining = face.kind === 'stopped' || face.kind === 'partial' ? face.remaining : 0;

  return (
    <View style={styles.body}>
      <View style={[styles.grab, { backgroundColor: colors.border }]} />

      <Text style={[styles.title, { color: notFound ? colors.warning : colors.text }]}>
        {notFound ? t('bareWords.notFoundTitle', { count: face.terms.length })
          : face.kind === 'stopped' ? t('bareWords.stoppedTitle', { count: face.filled })
          : face.kind === 'done' ? t(copy === COPY.example ? 'examples.fillDoneTitle' : 'bareWords.doneTitle', { count: face.filled })
          : t('bareWords.filledTitle', { count: face.filled })}
      </Text>
      <Text style={[styles.desc, { color: colors.textSecondary }]}>
        {notFound ? t('bareWords.notFoundBody')
          : face.kind === 'stopped' ? t('bareWords.stoppingDesc')
          : t(copy === COPY.example ? 'examples.fillDoneBody' : 'bareWords.doneBody')}
      </Text>

      {notFound ? (
        // 이름을 대고, 눌러서 철자를 고치러 갈 수 있게 한다(고르기 화면이 그 자리다).
        <View style={[styles.facts, { backgroundColor: colors.surfaceSecondary }]}>
          {face.terms.slice(0, 5).map(term => (
            <Pressable key={term} onPress={onPick} style={styles.fact}>
              <Text style={[styles.factLabel, { color: colors.text }]} numberOfLines={1}>{term}</Text>
              <Text style={[styles.factLabel, { color: colors.textTertiary, flex: 0 }]}>
                {t('bareWords.fixSpelling')} ›
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={[styles.facts, { backgroundColor: colors.surfaceSecondary }]}>
          <Fact label={t('bareWords.factFilled')} value={t('bareWords.countWords', { count: face.filled })} highlight />
          {remaining > 0 && (
            <Fact label={t(copy.fact)} value={t('bareWords.countWords', { count: remaining })} />
          )}
        </View>
      )}

      <View style={styles.actions}>
        {!!onResume && (remaining > 0 || notFound) && (
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onResume(); }}
            style={[styles.btn, { backgroundColor: colors.primaryButton }]}
          >
            <Text style={[styles.btnText, { color: colors.onPrimary }]}>{t('bareWords.resume')}</Text>
          </Pressable>
        )}
        <Pressable onPress={onClose} style={[styles.btn, styles.ghost]}>
          <Text style={[styles.btnText, styles.ghostText, { color: colors.textSecondary }]}>{t('common.close')}</Text>
        </Pressable>
      </View>
    </View>
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
  // 🔑 광고 경로는 **주 버튼과 부차 글자 사이**의 무게다. 채워진 상자면 무료 경로와 무게가
  // 같아져 어느 쪽이 기본인지 사라지고, 상자가 아예 없으면 [채울 단어 고르기]와 구분되지
  // 않는다. 테두리만 두르고 높이는 공유한다.
  adBtn: { backgroundColor: 'transparent', borderWidth: 1 },
  btnText: { fontSize: FontSize.action, fontFamily: FontWeight.semibold },
  // 14/500 은 앱의 부차 버튼 관례를 따른 값이다(사진 가져오기 [분석 취소] 15/500,
  // 학습 설정 [닫기] 14/600). 13/400 까지 내리지 않는 이유: 이 시트의 설명글이
  // 정확히 13/400 이고 Pro 링크가 13/500 이라, 상자 없는 글자가 그 급이 되면
  // 버튼이 아니라 문장으로 읽힌다.
  ghostText: { fontSize: FontSize.body, fontFamily: FontWeight.medium },
  undertext: { fontSize: FontSize.caption, fontFamily: FontWeight.regular, textAlign: 'center' },
  link: { fontSize: FontSize.small, fontFamily: FontWeight.medium, textAlign: 'center', paddingVertical: 4 },
  // 진행바. 배너의 것과 같은 치수다 — 두 자리가 같은 일을 말하므로 모양도 같아야 한다.
  progTrack: { height: 5, borderRadius: Radius.xs, overflow: 'hidden' },
  progFill: { height: '100%', borderRadius: Radius.xs },
});
