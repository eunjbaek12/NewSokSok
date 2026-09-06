import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import CharacterSvg from '@/components/CharacterSvg';
import Colors, { CERT_GOLD } from '@/constants/colors';
import { CARD, deckType, sealType, deckGap, splitEmphasis } from './completion';

// 공유 이미지는 뷰어의 테마와 무관하게 항상 같은 브랜드 룩이어야 하므로 light 팔레트를
// 고정 사용한다(테마 토큰 대신 Colors.light — hex 리터럴 금지 규칙은 상수 참조로 우회).
const C = Colors.light;

// 마케팅 URL(카드에 새겨 순수 이미지 공유로도 유입되게 함). ShareCard 와 같은 값.
const BRAND_URL = 'eunjbaek12.github.io';

// 명조는 한글 스킨이 이미 싣고 있는 Gowun Batang 을 그대로 쓴다(app/_layout.tsx 에서
// 로드됨). 상장의 격식을 지는 건 머리글·덱 이름·날짜뿐이고, 본문은 앱 서체 그대로
// 두어 읽히게 한다 — 전부 명조면 촌스러워진다.
const SERIF = 'GowunBatang_700Bold';
const SERIF_REGULAR = 'GowunBatang_400Regular';

/** `*강조*` 구간만 굵게 그린다(가르는 규칙은 completion.ts). */
function emphasized(text: string, strongStyle: object): React.ReactNode[] {
  return splitEmphasis(text).map((seg, i) => (
    <Text key={i} style={seg.strong ? strongStyle : undefined}>{seg.text}</Text>
  ));
}

interface CompletionShareCardProps {
  /** 단어장 제목. 최대 40자(LIST_TITLE_MAX). 길면 작아지고 두 줄까지 열린다. */
  title: string;
  /** 단어장의 총 단어 수. 완주라 곧 외운 수이기도 하다. */
  total: number;
  /** 실제로 외운 날 수. 0이면 「N일 동안」을 뺀다(017 이전 완주). */
  studyDays: number;
  /** 마지막으로 외운 단어. 없으면 그 줄을 통째로 뺀다. */
  lastTerm: string | null;
  /** 완주한 날(ms). 상장 날짜와 도장에 새긴다. */
  completedAt: number;
  /** 화면에 쓰는 로케일 태그(ko-KR 등). 날짜 표기에만 쓴다. */
  localeTag: string;
}

/**
 * 단어장 완주 상장. 1:1 카드이고 부모가 react-native-view-shot 으로 캡처하도록 forwardRef.
 * 화면 밖에 렌더된 뒤 1080×1080 PNG 로 스냅샷된다(ShareCard 와 동일 패턴).
 *
 * 상장으로 읽히게 하는 건 색이 아니라 짜임이다 — 이중 괘선, 자간 벌린 머리글, 가운데
 * 정렬, 기울인 도장, 하단 괘선(서명란). 종이 비율이 아니라 정사각인 건 SNS 규격이라
 * 그렇고, 그래서 비율 대신 짜임으로 상장을 만든다.
 *
 * 여기 있는 수치는 1080² 로 실제 렌더해 정본과 맞춰 정한 것이다. 눈대중으로 바꾸지 말 것.
 */
const CompletionShareCard = forwardRef<View, CompletionShareCardProps>(
  ({ title, total, studyDays, lastTerm, completedAt, localeTag }, ref) => {
    const { t } = useTranslation();
    const when = new Date(completedAt);

    // 로케일 데이터가 없는 런타임에서 Intl 이 던지면 숫자 표기로 떨어뜨린다
    // (features/study/review/notify-time.ts 와 같은 방어).
    let dateLabel: string;
    try {
      dateLabel = when.toLocaleDateString(localeTag, {
        year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch {
      dateLabel = when.toISOString().slice(0, 10);
    }
    const sealDate = [
      when.getFullYear(),
      String(when.getMonth() + 1).padStart(2, '0'),
      String(when.getDate()).padStart(2, '0'),
    ].join('.');

    const deckSize = deckType(title);

    // 자릿수 구분은 기기가 아니라 앱 언어를 따라야 한다 — 카드 전체가 앱 언어로 쓰였는데
    // 숫자만 기기 로케일을 따르면 한 문장 안에서 표기가 갈린다.
    let count: string;
    try {
      count = total.toLocaleString(localeTag);
    } catch {
      count = String(total);
    }
    const body1 = studyDays > 0
      ? t('completionShare.certBody1', { count, days: studyDays })
      : t('completionShare.certBody1NoDays', { count });

    const sealWord = t('completionShare.certSeal');

    return (
      <View ref={ref} collapsable={false} style={styles.card}>
        {/* 이중 괘선 — 이게 상장으로 읽히게 하는 첫 번째 장치다. */}
        <View style={styles.frameOuter} pointerEvents="none" />
        <View style={styles.frameGold} pointerEvents="none" />

        <Text allowFontScaling={false} style={styles.caption}>
          {t('completionShare.certTitle')}
        </Text>
        <View style={styles.captionRule} />

        <Text allowFontScaling={false} numberOfLines={2} style={[styles.deck, deckSize, { marginTop: deckGap(!!lastTerm) }]}>
          {title}
        </Text>

        <Text allowFontScaling={false} style={[styles.body, styles.bodyFirst]}>
          {emphasized(body1, styles.bodyStrong)}
        </Text>
        <Text allowFontScaling={false} style={styles.body}>
          {t('completionShare.certBody2')}
        </Text>

        {!!lastTerm && (
          <Text allowFontScaling={false} numberOfLines={1} style={styles.last}>
            {emphasized(t('completionShare.certLastWord', { term: lastTerm }), styles.lastStrong)}
          </Text>
        )}

        <View style={styles.spacer} />

        {/* 서명란 — 아래를 괘선으로 닫아야 종이가 끝난 것처럼 보인다. */}
        <View style={styles.signRule} />
        <Text allowFontScaling={false} style={styles.date}>{dateLabel}</Text>
        <View style={styles.brandRow}>
          <CharacterSvg size={17} />
          <View>
            <Text allowFontScaling={false} style={styles.brandName}>{t('shareCard.appName')}</Text>
            <Text allowFontScaling={false} style={styles.brandUrl}>{BRAND_URL}</Text>
          </View>
        </View>

        {/* 도장은 살짝 기울여 찍는다 — 반듯하면 인쇄물이고, 기울면 찍은 것이다. */}
        <View style={styles.seal}>
          <View style={styles.sealRing} pointerEvents="none" />
          <Text allowFontScaling={false} style={[styles.sealWord, sealType(sealWord)]}>{sealWord}</Text>
          <Text allowFontScaling={false} style={styles.sealDate}>{sealDate}</Text>
        </View>
      </View>
    );
  },
);

CompletionShareCard.displayName = 'CompletionShareCard';

export default CompletionShareCard;

const styles = StyleSheet.create({
  card: {
    width: CARD,
    height: CARD,
    backgroundColor: C.surface,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    paddingTop: 21.3,
    paddingHorizontal: 29,
    paddingBottom: 34.8,
  },

  frameOuter: {
    position: 'absolute',
    top: 12, right: 12, bottom: 12, left: 12,
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: 8,
  },
  frameGold: {
    position: 'absolute',
    top: 16.4, right: 16.4, bottom: 16.4, left: 16.4,
    borderWidth: 0.95,
    borderColor: CERT_GOLD,
    opacity: 0.34,
    borderRadius: 5,
  },

  caption: {
    fontFamily: SERIF,
    fontSize: 16.4,
    lineHeight: 19.7,
    letterSpacing: 7.1,
    // 자간은 마지막 글자 뒤에도 붙어 가운데 정렬을 왼쪽으로 민다. 같은 값을 왼쪽에 넣어 되돌린다.
    paddingLeft: 7.1,
    color: C.primary,
  },
  captionRule: {
    width: 30,
    height: 0.7,
    backgroundColor: CERT_GOLD,
    opacity: 0.55,
    marginTop: 5.6,
  },

  deck: {
    fontFamily: SERIF,
    color: C.text,
    textAlign: 'center',
  },

  body: {
    fontFamily: 'Pretendard_500Medium',
    fontSize: 14,
    lineHeight: 22,
    color: C.textSecondary,
    textAlign: 'center',
  },
  bodyFirst: { marginTop: 16.7 },
  bodyStrong: {
    fontFamily: 'Pretendard_700Bold',
    color: C.text,
  },
  last: {
    fontFamily: 'Pretendard_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: C.textTertiary,
    textAlign: 'center',
    marginTop: 12,
  },
  lastStrong: {
    fontFamily: 'Pretendard_600SemiBold',
    color: C.primary,
  },

  spacer: { flex: 1 },

  signRule: {
    alignSelf: 'stretch',
    height: 0.5,
    backgroundColor: C.borderLight,
  },
  date: {
    alignSelf: 'flex-start',
    fontFamily: SERIF_REGULAR,
    fontSize: 12,
    lineHeight: 16,
    color: C.text,
    marginTop: 21.2,
  },
  brandRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  brandName: {
    fontFamily: 'Pretendard_700Bold',
    fontSize: 13,
    lineHeight: 15,
    color: C.primary,
  },
  brandUrl: {
    fontFamily: 'Pretendard_500Medium',
    fontSize: 7,
    lineHeight: 9.5,
    color: C.textTertiary,
  },

  seal: {
    position: 'absolute',
    right: 29,
    bottom: 21.7,
    width: 63.6,
    height: 63.6,
    borderWidth: 0.95,
    borderColor: CERT_GOLD,
    borderRadius: 63.6 / 2,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
  },
  sealRing: {
    position: 'absolute',
    top: 4.3, right: 4.3, bottom: 4.3, left: 4.3,
    borderWidth: 0.35,
    borderColor: CERT_GOLD,
    opacity: 0.6,
    borderRadius: (63.6 - 8.6) / 2,
  },
  sealWord: {
    fontFamily: SERIF,
    color: CERT_GOLD,
  },
  sealDate: {
    fontFamily: 'Pretendard_500Medium',
    fontSize: 7,
    lineHeight: 11,
    color: CERT_GOLD,
  },
});
