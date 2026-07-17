import React from 'react';
import { StyleSheet, Text, View, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme';
import { Radius } from '@/constants/tokens';

/**
 * 오늘의 복습 진입점 — 홈의 유일한 복습 경로(gentle SRS §5.2).
 *
 * 형태가 컴팩트 배너인 이유: 큰 히어로 카드(~132px)는 홈의 세로 예산을 먹어
 * "학습 중인 단어장" 첫 카드를 화면 밖으로 밀어냈다(§5.2.1 실측). 위계는 크기가
 * 아니라 위치(퀵액션 바로 위)·색(아보카도 그린)·간격(위 넓게/아래 좁게)으로 만든다.
 *
 * `count`는 이미 상한(20)이 적용된 수여야 한다 — 총량("543개")은 노출하지 않는다(P1).
 * 0이면 아무것도 렌더하지 않는다(§5.3): 빈 자리를 빈 상태 카드로 채우는 건 모순이고,
 * 복습이 없는 날의 홈은 지금 앱의 홈과 100% 같아야 한다.
 */
export default function ReviewBanner({
  count,
  onPress,
  style,
}: {
  count: number;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  if (count <= 0) return null;

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={t('home.reviewBannerTitle', { count })}
      accessibilityHint={t('home.reviewBannerSubtitle')}
      style={({ pressed }) => [styles.banner, { opacity: pressed ? 0.85 : 1 }, style]}
    >
      <LinearGradient
        colors={colors.reviewGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      />
      <View style={styles.textArea}>
        <Text style={[styles.title, { color: colors.onPrimary }]} numberOfLines={1}>
          🥑 {t('home.reviewBannerTitle', { count })}
        </Text>
        <Text style={[styles.subtitle, { color: colors.onPrimary }]} numberOfLines={1}>
          {t('home.reviewBannerSubtitle')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.onPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
    overflow: 'hidden',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.lg,
  },
  textArea: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontFamily: 'Pretendard_700Bold',
  },
  subtitle: {
    fontSize: 11,
    fontFamily: 'Pretendard_400Regular',
    marginTop: 2,
    // 흰 텍스트가 그라디언트 위에 두 줄로 쌓이면 부제가 제목과 경쟁한다.
    // 투명도로 낮추면 대비(4.5:1)가 깨지므로 크기로만 위계를 준다.
  },
});
