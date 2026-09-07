import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, Alert, useWindowDimensions } from 'react-native';
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
import { useLocale } from '@/features/locale';
import { localeTag } from '@/i18n';
import CompletionShareCard from './CompletionShareCard';
import { CARD } from './completion';
import { shareStatsCard } from './share';
import type { PendingCompletion } from './db';

/** 모달 컨테이너의 좌우 여백(styles.container). */
const SCREEN_PAD = 24;
/** 카드 안쪽 패딩(styles.card). */
const CARD_PAD = 28;
/** 카드 최대 폭(MilestoneCelebration 과 같은 값). 태블릿에서 상장이 무한정 커지지 않게 한다. */
const CARD_MAX = 400;

interface CompletionCelebrationProps {
  visible: boolean;
  completion: PendingCompletion;
  onClose: () => void;
}

/**
 * 단어장 완주 축하 팝업. 학습 결과 화면 위에 한 계획당 한 번 뜬다(판정은 023 celebratedAt).
 *
 * **상장을 그대로 보여준다.** 완주 상장은 지금까지 화면 밖에만 그려져(캡처 전용) 사용자가
 * 공유 시트에 가서야 처음 봤다 — 무엇이 나가는지 모른 채 「자랑하기」를 누르는 버튼이었다.
 * 여기서 상장을 앞에 놓으면 그 버튼이 «이걸 보낸다»가 된다.
 *
 * 🔴 상장은 두 벌 그린다. 보이는 쪽은 모달 안쪽 폭에 맞춰 배율을 걸고, 캡처용은 화면 밖에
 * 340dp 원본 그대로 둔다 — 공유 이미지는 1080² 로 찍히므로 축소본을 캡처하면 그만큼 흐려진다.
 * 상장의 치수는 1080² 로 실제 렌더해 맞춘 값이라 여기서 손대지 않고 배율만 건다.
 */
export default function CompletionCelebration({
  visible,
  completion,
  onClose,
}: CompletionCelebrationProps) {
  const { colors, isDark, fontFamily } = useTheme();
  const { locale } = useLocale();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);

  // 375dp 기기에서 안쪽 폭은 271dp → 0.80배. 넓은 기기에서도 1배를 넘기지 않는다(원본이 상한).
  const inner = Math.min(width - SCREEN_PAD * 2, CARD_MAX) - CARD_PAD * 2;
  const scale = Math.min(1, inner / CARD);

  const scaleAnim = useSharedValue(0.8);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      scaleAnim.value = withSpring(1, { damping: 14, stiffness: 140 });
      opacity.value = withTiming(1, { duration: 300 });
    } else {
      scaleAnim.value = 0.8;
      opacity.value = 0;
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scaleAnim.value }],
  }));

  const handleShare = async () => {
    if (busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(true);
    const outcome = await shareStatsCard(
      cardRef,
      t('completionShare.shareMessage', { title: completion.title, count: completion.totalWords }),
    );
    setBusy(false);
    if (outcome === 'unavailable') Alert.alert(t('completionShare.share'), t('shareCard.unavailable'));
    else if (outcome === 'error') Alert.alert(t('completionShare.share'), t('shareCard.shareError'));
  };

  if (!visible) return null;

  // 보이는 쪽과 캡처용은 같은 상장이지만 크기가 달라야 해서 두 번 그린다. ref 는 캡처용에만
  // 단다 — 공유 이미지는 captureRef 가 1080² 로 늘리므로 축소본을 뜨면 그만큼 흐려진다.
  const renderCard = (ref?: React.Ref<View>) => (
    <CompletionShareCard
      ref={ref}
      title={completion.title}
      total={completion.totalWords}
      studyDays={completion.studyDays}
      lastTerm={completion.lastTerm}
      completedAt={completion.completedAt}
      localeTag={localeTag(locale)}
    />
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <BlurView
        intensity={isDark ? 80 : 40}
        tint={isDark ? 'dark' : 'light'}
        style={styles.container}
      >
        <Animated.View
          accessibilityViewIsModal
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
          <Text style={[styles.lead, { color: colors.text, fontFamily: fontFamily.bold }]}>
            {t('completionCelebrate.title')}
          </Text>

          {/*
            상장은 그림이라 스크린리더가 읽을 것이 없다 — 안에 쓰인 문장을 라벨로 따로 준다.
            (♿ 검토에서 발음 버튼 11곳이 빈 문자열로 나갔던 것과 같은 함정)
          */}
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={[
              completion.title,
              t('completionShare.certTitle'),
              completion.studyDays > 0
                ? t('completionShare.certBody1', { count: completion.totalWords, days: completion.studyDays })
                : t('completionShare.certBody1NoDays', { count: completion.totalWords }),
            ].join(', ').replace(/\*/g, '')}
            style={{ width: CARD * scale, height: CARD * scale }}
          >
            <View style={[styles.scaled, { transform: [{ scale }] }]}>{renderCard()}</View>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={handleShare}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('completionShare.share')}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.primaryButton, opacity: pressed || busy ? 0.8 : 1 },
              ]}
            >
              <Ionicons name="share-social-outline" size={18} color={colors.onPrimary} />
              <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                {t('completionShare.share')}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.tertiaryButton, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.tertiaryButtonText, { color: colors.textTertiary }]}>
                {t('milestone.continue')}
              </Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* 캡처 전용 원본(340dp). 보이는 쪽과 달리 배율이 걸리지 않는다. */}
        <View style={styles.offscreen} pointerEvents="none">
          {renderCard(cardRef)}
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
    maxWidth: CARD_MAX,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  lead: {
    fontSize: 20,
    lineHeight: 24,
    marginBottom: 16,
    textAlign: 'center',
  },
  // 340dp 원본을 왼쪽 위 기준으로 줄인다 — 부모가 이미 줄어든 크기라 가운데 기준으로 줄이면
  // 레이아웃상 넘친 만큼이 Android 에서 잘릴 수 있다.
  scaled: {
    position: 'absolute',
    top: 0,
    left: 0,
    transformOrigin: 'top left',
  },
  actions: {
    width: '100%',
    gap: 10,
    marginTop: 20,
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
