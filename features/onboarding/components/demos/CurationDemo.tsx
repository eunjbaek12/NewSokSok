import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import CharacterSvg from '@/components/CharacterSvg';
import { useTheme } from '@/features/theme';

type DemoColors = {
  bg: string;
  surface: string;
  surfaceSecondary: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  primary: string;
  primaryLight: string;
  primaryButton: string;
  accent: string;
  border: string;
  borderLight: string;
  cardShadow: string;
  onPrimary: string;
  beginnerBg: string;
  beginnerText: string;
  intermediateBg: string;
  intermediateText: string;
};

type FontFamilyMap = {
  regular: string;
  medium: string;
  semiBold: string;
  bold: string;
};

const AVAIL_W = 300;
const S = AVAIL_W / 340;

type CardData = {
  icon: string;
  title: string;
  description: string;
  tags: string[];
  wordCount: number;
  level: 'beginner' | 'intermediate';
  langPair: string;
  delay: number;
};

// ─── 실제 curation.tsx 카드(detailed 모드)와 동일한 구조 ───────────────────
function ThemeCard({
  icon, title, description, tags, wordCount, level, langPair, delay, isActive, C, fontFamily,
}: CardData & { isActive: boolean; C: DemoColors; fontFamily: FontFamilyMap }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(10);

  useEffect(() => {
    if (!isActive) { opacity.value = 0; translateY.value = 10; return; }
    opacity.value = withDelay(delay, withTiming(1, { duration: 320 }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) }));
  }, [isActive]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const levelBg = level === 'beginner' ? C.beginnerBg : C.intermediateBg;
  const levelColor = level === 'beginner' ? C.beginnerText : C.intermediateText;
  const levelLabel = level === 'beginner' ? '초급' : '중급';
  const p = S;

  return (
    <Animated.View style={[cardStyle, {
      backgroundColor: C.surface,
      borderRadius: 16 * p,
      padding: 16 * p,
      marginBottom: 12 * p,
      borderWidth: 1,
      borderColor: C.borderLight,
      shadowColor: C.cardShadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 10,
      elevation: 4,
    }]}>
      {/* cardHeader */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 * p }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 * p, flex: 1 }}>
          <Text style={{ fontSize: 16 * p }}>{icon}</Text>
          <Text style={{ fontSize: 17 * p, fontFamily: fontFamily.bold, color: C.text, flex: 1 }} numberOfLines={1}>{title}</Text>
        </View>
        <View style={{ backgroundColor: levelBg, paddingHorizontal: 8 * p, paddingVertical: 3 * p, borderRadius: 10 * p }}>
          <Text style={{ fontSize: 11 * p, fontFamily: fontFamily.semiBold, color: levelColor }}>{levelLabel}</Text>
        </View>
      </View>

      {/* tagRow */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 * p, marginTop: 4 * p }}>
        {tags.map(tag => (
          <View key={tag} style={{ backgroundColor: C.surfaceSecondary, paddingHorizontal: 8 * p, paddingVertical: 2 * p, borderRadius: 4 * p }}>
            <Text style={{ fontSize: 11 * p, fontFamily: fontFamily.medium, color: C.textSecondary }}>#{tag}</Text>
          </View>
        ))}
      </View>

      {/* cardDesc */}
      <Text style={{ fontSize: 13 * p, fontFamily: fontFamily.regular, color: C.textSecondary, marginTop: 6 * p }} numberOfLines={1}>
        {description}
      </Text>

      {/* langPair */}
      <Text style={{ fontSize: 13 * p, fontFamily: fontFamily.medium, color: C.textTertiary, marginTop: 4 * p }}>
        {langPair}
      </Text>

      {/* cardFooter */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 * p }}>
        <View style={{ backgroundColor: C.primaryLight, paddingHorizontal: 8 * p, paddingVertical: 3 * p, borderRadius: 10 * p }}>
          <Text style={{ fontSize: 12 * p, fontFamily: fontFamily.bold, color: C.primary, letterSpacing: 0.3 }}>{wordCount} 단어 수록</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const THEMES: CardData[] = [
  {
    icon: '✈️',
    title: '여행 영어 필수 표현',
    description: '공항, 호텔, 레스토랑 등 여행 필수 어휘',
    tags: ['여행', '회화'],
    wordCount: 30,
    level: 'beginner',
    langPair: '🇺🇸 EN → 🇰🇷 KO',
    delay: 500,
  },
  {
    icon: '💼',
    title: '비즈니스 이메일',
    description: '업무 이메일 및 회의에서 쓰는 표현 모음',
    tags: ['비즈니스', '이메일'],
    wordCount: 25,
    level: 'intermediate',
    langPair: '🇺🇸 EN → 🇰🇷 KO',
    delay: 850,
  },
];

const CHIPS = ['전체', '영어', '한국어', '일본어', '중국어'];

export function CurationDemo({ isActive }: { isActive: boolean }) {
  const { colors, fontFamily, isDark } = useTheme();
  const screenOpacity = useSharedValue(0);

  const C: DemoColors = useMemo(() => ({
    bg: colors.background,
    surface: colors.surface,
    surfaceSecondary: colors.surfaceSecondary,
    text: colors.text,
    textSecondary: colors.textSecondary,
    textTertiary: colors.textTertiary,
    primary: colors.primary,
    primaryLight: colors.primaryLight,
    primaryButton: colors.primaryButton,
    accent: colors.accent,
    border: colors.border,
    borderLight: colors.borderLight,
    cardShadow: colors.cardShadow,
    onPrimary: colors.onPrimary,
    beginnerBg: colors.difficulty.beginnerBg,
    beginnerText: colors.difficulty.beginnerText,
    intermediateBg: colors.difficulty.intermediateBg,
    intermediateText: colors.difficulty.intermediateText,
  }), [colors]);

  useEffect(() => {
    screenOpacity.value = isActive
      ? withTiming(1, { duration: 400 })
      : withTiming(0, { duration: 200 });
  }, [isActive]);

  const screenStyle = useAnimatedStyle(() => ({ opacity: screenOpacity.value }));
  const p = S;

  return (
    <Animated.View style={[screenStyle, styles.screen, {
      backgroundColor: C.bg,
      width: AVAIL_W,
      height: 420,
      borderColor: C.border,
      shadowColor: colors.shadow,
    }]}>

      {/* ── 헤더 (실제 curation.tsx: paddingHorizontal 20, paddingBottom 8, gap 12) ── */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16 * p,
        paddingTop: 14 * p,
        paddingBottom: 8 * p,
        gap: 10 * p,
      }}>
        <CharacterSvg size={Math.round(44 * p)} wave={isActive} isDark={isDark} />

        <View style={{ flex: 1 }}>
          <Text style={{
            fontSize: 22 * p,
            fontFamily: fontFamily.bold,
            color: C.text,
            letterSpacing: -0.5,
          }}>
            단어 모음
          </Text>
          <Text style={{
            fontSize: 11 * p,
            fontFamily: fontFamily.regular,
            color: C.textSecondary,
            marginTop: 1,
            lineHeight: 16 * p,
          }} numberOfLines={1}>
            단어장을 바로 내 것으로 가져와요
          </Text>
        </View>

        <View style={{
          width: 40 * p, height: 40 * p,
          borderRadius: 12 * p,
          borderWidth: 1,
          borderColor: C.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Ionicons name="reorder-three-outline" size={22 * p} color={C.textSecondary} />
        </View>
      </View>

      {/* ── 검색창 + AI 생성 버튼 ── */}
      <View style={{ paddingHorizontal: 14 * p, paddingVertical: 6 * p, flexDirection: 'row', alignItems: 'center', gap: 8 * p }}>
        <View style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14 * p,
          paddingVertical: 12 * p,
          borderRadius: 14 * p,
          borderWidth: 1,
          borderColor: C.borderLight,
          backgroundColor: C.surface,
          gap: 8 * p,
          shadowColor: C.cardShadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 1,
          shadowRadius: 6,
          elevation: 1,
        }}>
          <Ionicons name="search" size={18 * p} color={C.textTertiary} />
          <Text style={{ flex: 1, fontSize: 14 * p, fontFamily: fontFamily.regular, color: C.textTertiary }}>
            주제나 상황을 입력하세요
          </Text>
        </View>
        <View style={{
          width: 42 * p, height: 42 * p,
          borderRadius: 14 * p,
          borderWidth: 1,
          borderColor: C.borderLight,
          backgroundColor: C.surface,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: C.cardShadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 1,
          shadowRadius: 6,
          elevation: 1,
        }}>
          <Ionicons name="sparkles" size={20 * p} color={C.accent} />
        </View>
      </View>

      {/* ── 언어 필터 칩 ── */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 14 * p, paddingVertical: 2 * p, gap: 7 * p }}>
        {CHIPS.map((chip, i) => (
          <View key={chip} style={{
            paddingHorizontal: 12 * p,
            paddingVertical: 6 * p,
            borderRadius: 20 * p,
            backgroundColor: i === 0 ? C.primaryButton : C.surfaceSecondary,
          }}>
            <Text style={{
              fontSize: 12 * p,
              fontFamily: fontFamily.semiBold,
              color: i === 0 ? C.onPrimary : C.textSecondary,
            }}>
              {chip}
            </Text>
          </View>
        ))}
      </View>

      {/* ── 탭 ── */}
      <View style={{
        flexDirection: 'row',
        paddingHorizontal: 14 * p,
        marginBottom: 8 * p,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.border,
      }}>
        <View style={{
          flex: 1,
          paddingVertical: 10 * p,
          alignItems: 'center',
          borderBottomWidth: 2,
          borderBottomColor: C.primary,
        }}>
          <Text style={{ fontSize: 14 * p, fontFamily: fontFamily.semiBold, color: C.primary }}>공식 단어장</Text>
        </View>
        <View style={{ flex: 1, paddingVertical: 10 * p, alignItems: 'center' }}>
          <Text style={{ fontSize: 14 * p, fontFamily: fontFamily.semiBold, color: C.textSecondary }}>공유 단어장</Text>
        </View>
      </View>

      {/* ── 카드 목록 ── */}
      <View style={{ paddingHorizontal: 14 * p, paddingBottom: 12 * p }}>
        {THEMES.map(theme => (
          <ThemeCard key={theme.title} {...theme} isActive={isActive} C={C} fontFamily={fontFamily} />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 10,
  },
});
