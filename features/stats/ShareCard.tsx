import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import CharacterSvg from '@/components/CharacterSvg';
import Colors from '@/constants/colors';

// 공유 이미지는 뷰어의 테마와 무관하게 항상 같은 브랜드 룩이어야 하므로 light 팔레트를
// 고정 사용한다(테마 토큰 대신 Colors.light — hex 리터럴 금지 규칙은 상수 참조로 우회).
const C = Colors.light;

// 마케팅 URL(카드에 새겨 순수 이미지 공유로도 유입되게 함). App Store/Play 링크와 별개.
const BRAND_URL = 'eunjbaek12.github.io';

interface ShareCardProps {
  streak: number;
  memorized: number;
}

/**
 * 자랑하기용 1:1 카드. 부모가 react-native-view-shot으로 캡처하도록 forwardRef.
 * 화면 밖에 렌더된 뒤 1080×1080 PNG로 스냅샷된다.
 */
const ShareCard = forwardRef<View, ShareCardProps>(({ streak, memorized }, ref) => {
  const { t } = useTranslation();
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <View style={styles.character}>
        <CharacterSvg size={96} wave={false} />
      </View>

      <View style={styles.streakRow}>
        <Text style={styles.flame}>🔥</Text>
        <Text style={styles.streakNum}>{streak}</Text>
        <Text style={styles.streakUnit}>{t('stats.dayStreak')}</Text>
      </View>

      <Text style={styles.memorized}>{t('shareCard.memorizedLine', { count: memorized })}</Text>

      <View style={styles.divider} />

      <View style={styles.brandRow}>
        <Text style={styles.brandName}>🥑 {t('shareCard.appName')}</Text>
        <Text style={styles.brandUrl}>{BRAND_URL}</Text>
      </View>
    </View>
  );
});

ShareCard.displayName = 'ShareCard';

export default ShareCard;

const styles = StyleSheet.create({
  card: {
    width: 340,
    height: 340,
    backgroundColor: C.background,
    borderWidth: 3,
    borderColor: C.primaryLight,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 6,
  },
  character: { marginBottom: 4 },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  flame: { fontSize: 34, lineHeight: 40 },
  streakNum: {
    fontSize: 52,
    fontFamily: 'Pretendard_700Bold',
    color: C.warning,
    letterSpacing: -2,
    lineHeight: 56,
  },
  streakUnit: {
    fontSize: 20,
    fontFamily: 'Pretendard_700Bold',
    color: C.warning,
    marginBottom: 6,
  },
  memorized: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
    color: C.text,
    textAlign: 'center',
    marginTop: 2,
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
