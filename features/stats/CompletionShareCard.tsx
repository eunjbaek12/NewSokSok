import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import CharacterSvg from '@/components/CharacterSvg';
import Colors from '@/constants/colors';

// 공유 이미지는 뷰어의 테마와 무관하게 항상 같은 브랜드 룩이어야 하므로 light 팔레트를
// 고정 사용한다(테마 토큰 대신 Colors.light — hex 리터럴 금지 규칙은 상수 참조로 우회).
const C = Colors.light;

// 마케팅 URL(카드에 새겨 순수 이미지 공유로도 유입되게 함). ShareCard 와 같은 값.
const BRAND_URL = 'eunjbaek12.github.io';

interface CompletionShareCardProps {
  /** 단어장 제목. 최대 40자(LIST_TITLE_MAX)라 두 줄까지 열어 둔다. */
  title: string;
  /** 단어장 아이콘(이모지). 없을 수 있다. */
  icon?: string;
  memorized: number;
  total: number;
  percent: number;
}

/**
 * 단어장 완주 자랑용 1:1 카드. 부모가 react-native-view-shot 으로 캡처하도록 forwardRef.
 * 화면 밖에 렌더된 뒤 1080×1080 PNG 로 스냅샷된다(ShareCard 와 동일 패턴).
 */
const CompletionShareCard = forwardRef<View, CompletionShareCardProps>(
  ({ title, icon, memorized, total, percent }, ref) => {
    const { t } = useTranslation();
    return (
      <View ref={ref} collapsable={false} style={styles.card}>
        <View style={styles.character}>
          <CharacterSvg size={80} wave />
        </View>

        <Text style={styles.done}>{t('completionShare.done')}</Text>

        <Text style={styles.title} numberOfLines={2}>
          {icon ? `${icon} ` : ''}
          {title}
        </Text>

        <View style={styles.statRow}>
          <Text style={styles.percent}>{percent}</Text>
          <Text style={styles.percentUnit}>%</Text>
        </View>
        <Text style={styles.words}>
          {t('completionShare.wordsMastered', { memorized, total })}
        </Text>

        <View style={styles.divider} />

        <View style={styles.brandRow}>
          <Text style={styles.brandName}>🥑 {t('shareCard.appName')}</Text>
          <Text style={styles.brandUrl}>{BRAND_URL}</Text>
        </View>
      </View>
    );
  },
);

CompletionShareCard.displayName = 'CompletionShareCard';

export default CompletionShareCard;

const styles = StyleSheet.create({
  card: {
    width: 340,
    height: 340,
    backgroundColor: C.background,
    borderWidth: 3,
    // 완주는 성취라 초록 계열로 두른다(스트릭 카드의 primaryLight 와 구분된다).
    borderColor: C.successLight,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  character: { marginBottom: 2 },
  done: {
    fontSize: 22,
    fontFamily: 'Pretendard_700Bold',
    color: C.success,
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
    color: C.text,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 2,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  percent: {
    fontSize: 46,
    fontFamily: 'Pretendard_700Bold',
    color: C.success,
    letterSpacing: -2,
    lineHeight: 50,
  },
  percentUnit: {
    fontSize: 20,
    fontFamily: 'Pretendard_700Bold',
    color: C.success,
    marginBottom: 6,
  },
  words: {
    fontSize: 15,
    fontFamily: 'Pretendard_600SemiBold',
    color: C.textSecondary,
    textAlign: 'center',
  },
  divider: {
    width: 60,
    height: 2,
    backgroundColor: C.border,
    borderRadius: 1,
    marginVertical: 10,
  },
  brandRow: { alignItems: 'center', gap: 2 },
  brandName: {
    fontSize: 15,
    fontFamily: 'Pretendard_700Bold',
    color: C.primary,
  },
  brandUrl: {
    fontSize: 12,
    fontFamily: 'Pretendard_500Medium',
    color: C.textTertiary,
  },
});
