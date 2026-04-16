import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { OnboardingDots } from '@/components/onboarding/OnboardingDots';
import { AvocadoCharacter } from '@/components/onboarding/AvocadoCharacter';
import { WordListDemo } from '@/components/onboarding/demos/WordListDemo';
import { FlashcardDemo } from '@/components/onboarding/demos/FlashcardDemo';
import { CurationDemo } from '@/components/onboarding/demos/CurationDemo';
import { useOnboarding } from '@/hooks/useOnboarding';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SLIDES = [
  {
    titleKey: 'onboarding.slide1.title',
    bodyKey: 'onboarding.slide1.body',
    bg: '#FFF7ED',
    accent: '#F97316',
    demo: 'wordlist',
  },
  {
    titleKey: 'onboarding.slide2.title',
    bodyKey: 'onboarding.slide2.body',
    bg: '#F0EEFF',
    accent: '#6C5CE7',
    demo: 'flashcard',
  },
  {
    titleKey: 'onboarding.slide3.title',
    bodyKey: 'onboarding.slide3.body',
    bg: '#F0FDFA',
    accent: '#0D9488',
    demo: 'curation',
  },
  {
    titleKey: 'onboarding.slide4.title',
    bodyKey: 'onboarding.slide4.body',
    bg: '#EBF3FF',
    accent: '#3182F6',
    demo: 'avocado',
  },
];

function SlideDemo({ type, isActive }: { type: string; isActive: boolean }) {
  if (type === 'wordlist') return <WordListDemo isActive={isActive} />;
  if (type === 'flashcard') return <FlashcardDemo isActive={isActive} />;
  if (type === 'curation') return <CurationDemo isActive={isActive} />;
  if (type === 'avocado') {
    return (
      <View style={{ alignItems: 'center' }}>
        <AvocadoCharacter slideIndex={3} isActive={isActive} size={200} />
      </View>
    );
  }
  return null;
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { markOnboardingDone } = useOnboarding();
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const isLast = currentIndex === SLIDES.length - 1;

  const handleNext = () => {
    Haptics.selectionAsync();
    if (isLast) {
      handleFinish();
      return;
    }
    const next = currentIndex + 1;
    scrollRef.current?.scrollTo({ x: SCREEN_WIDTH * next, animated: true });
    setCurrentIndex(next);
  };

  const handleSkip = () => {
    Haptics.selectionAsync();
    handleFinish();
  };

  const handleFinish = async () => {
    await markOnboardingDone();
    router.replace('/login');
  };

  const handleScroll = (e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (index !== currentIndex) {
      Haptics.selectionAsync();
      setCurrentIndex(index);
    }
  };

  const slide = SLIDES[currentIndex];

  return (
    <View style={[styles.container, { backgroundColor: slide.bg }]}>
      {/* Skip 버튼 */}
      {!isLast && (
        <TouchableOpacity
          style={[styles.skipBtn, { top: insets.top + 16 }]}
          onPress={handleSkip}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
        </TouchableOpacity>
      )}

      {/* 슬라이드 */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={styles.scrollView}
      >
        {SLIDES.map((s, i) => (
          <View
            key={i}
            style={[
              styles.slide,
              { backgroundColor: s.bg, paddingTop: insets.top + 48 },
            ]}
          >
            {/* 데모 영역 */}
            <View style={styles.demoArea}>
              <SlideDemo type={s.demo} isActive={currentIndex === i} />
            </View>

            {/* 텍스트 영역 */}
            <View style={styles.textArea}>
              <Text style={styles.title}>{t(s.titleKey)}</Text>
              <Text style={styles.body}>{t(s.bodyKey)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* 하단 */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <OnboardingDots total={SLIDES.length} currentIndex={currentIndex} />
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: slide.accent }]}
          onPress={handleNext}
          activeOpacity={0.85}
        >
          <Text style={styles.nextBtnText}>
            {isLast ? t('onboarding.start') : t('onboarding.next')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  skipBtn: {
    position: 'absolute',
    right: 24,
    zIndex: 10,
  },
  skipText: {
    fontSize: 15,
    fontFamily: 'Pretendard_500Medium',
    color: '#8E8EA0',
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    paddingHorizontal: 28,
  },
  demoArea: {
    flex: 1,
    justifyContent: 'center',
  },
  textArea: {
    paddingBottom: 24,
    gap: 10,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Pretendard_700Bold',
    color: '#1A1A2E',
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  body: {
    fontSize: 15,
    fontFamily: 'Pretendard_400Regular',
    color: '#8E8EA0',
    lineHeight: 22,
  },
  footer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 20,
  },
  nextBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnText: {
    fontSize: 17,
    fontFamily: 'Pretendard_600SemiBold',
    color: '#FFFFFF',
  },
});
