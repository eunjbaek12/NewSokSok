import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, Image, Alert } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/features/theme';
import ShareCard from './ShareCard';
import { shareStatsCard } from './share';
import type { StreakMilestone } from './milestones';

// 마일스톤별 히어로 이미지 — 신입생→교수님 성장 서사(2026-07 Gemini 생성, 512px).
// 아트 교체는 파일 교체 + 이 맵 갱신만으로 끝난다.
const MILESTONE_IMAGES: Record<StreakMilestone, number> = {
  3: require('../../assets/images/milestone-3.png'),
  7: require('../../assets/images/milestone-7.png'),
  30: require('../../assets/images/milestone-30.png'),
  100: require('../../assets/images/milestone-100.png'),
  365: require('../../assets/images/milestone-365.png'),
};

interface MilestoneCelebrationProps {
  visible: boolean;
  milestone: StreakMilestone;
  /** 현재 스트릭(자랑카드 공유 문구용 — milestone보다 클 수 있다). */
  streak: number;
  /** 총 외운 단어 수(자랑카드용). */
  memorized: number;
  onClose: () => void;
}

/**
 * 스트릭 마일스톤 축하 팝업. 학습 결과 화면 위에 1회 뜬다(판정은 milestones.ts).
 * 자랑하기는 통계 화면과 동일한 ShareCard 캡처→OS 공유 시트 재사용.
 */
export default function MilestoneCelebration({
  visible,
  milestone,
  streak,
  memorized,
  onClose,
}: MilestoneCelebrationProps) {
  const { colors, isDark, fontFamily } = useTheme();
  const { t } = useTranslation();
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);

  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      scale.value = withSpring(1, { damping: 14, stiffness: 140 });
      opacity.value = withTiming(1, { duration: 300 });
    } else {
      scale.value = 0.8;
      opacity.value = 0;
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const handleShare = async () => {
    if (busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(true);
    const outcome = await shareStatsCard(cardRef, t('shareCard.shareMessage', { days: streak }));
    setBusy(false);
    if (outcome === 'unavailable') Alert.alert(t('stats.share'), t('shareCard.unavailable'));
    else if (outcome === 'error') Alert.alert(t('stats.share'), t('shareCard.shareError'));
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <BlurView
        intensity={isDark ? 80 : 40}
        tint={isDark ? 'dark' : 'light'}
        style={styles.container}
      >
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface + 'F2',
              borderColor: colors.borderLight,
              shadowColor: colors.cardShadow,
            },
            animatedStyle,
          ]}
        >
          <Image source={MILESTONE_IMAGES[milestone]} style={styles.heroImg} />

          <Text style={[styles.title, { color: colors.warning, fontFamily: fontFamily.bold }]}>
            {t('milestone.daysReached', { count: milestone })}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t(`milestone.stage${milestone}`)}
          </Text>

          <View style={styles.actions}>
            <Pressable
              onPress={handleShare}
              disabled={busy}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.primaryButton, opacity: pressed || busy ? 0.8 : 1 },
              ]}
            >
              <Ionicons name="share-social-outline" size={18} color={colors.onPrimary} />
              <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                {t('milestone.share')}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
              style={({ pressed }) => [styles.tertiaryButton, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.tertiaryButtonText, { color: colors.textTertiary }]}>
                {t('milestone.continue')}
              </Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* 캡처 전용 화면 밖 카드(통계 화면과 동일 패턴). */}
        <View style={styles.offscreen} pointerEvents="none">
          <ShareCard ref={cardRef} streak={streak} memorized={memorized} />
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  heroImg: {
    width: 180,
    height: 180,
    borderRadius: 24,
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Pretendard_500Medium',
    textAlign: 'center',
    marginBottom: 24,
  },
  actions: {
    width: '100%',
    gap: 10,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    borderRadius: 16,
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: 'Pretendard_600SemiBold',
  },
  tertiaryButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  tertiaryButtonText: {
    fontSize: 15,
    fontFamily: 'Pretendard_500Medium',
  },
  offscreen: {
    position: 'absolute',
    left: -9999,
    top: 0,
  },
});
