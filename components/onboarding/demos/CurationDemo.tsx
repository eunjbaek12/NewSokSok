import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import CharacterSvg from '@/components/CharacterSvg';

// 실제 앱 colors.light 토큰
const C = {
  bg: '#F0F4FF',
  surface: '#F8FAFC',
  surfaceSecondary: '#EBEEF2',
  text: '#191F28',
  textSecondary: '#4E5968',
  textTertiary: '#8B95A1',
  primary: '#3182F6',
  primaryLight: '#E8F0FE',
  primaryButton: '#3182F6',
  border: '#E5E8EB',
  borderLight: '#F2F4F6',
  cardShadow: 'rgba(25,31,40,0.08)',
};

const LEVEL_STYLES = {
  beginner: { label: '초급', bg: '#DCFCE7', color: '#16A34A' },
  intermediate: { label: '중급', bg: '#DBEAFE', color: '#2563EB' },
};

const SCREEN_W = Dimensions.get('window').width;
const AVAIL_W = SCREEN_W - 56;
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
function ThemeCard({ icon, title, description, tags, wordCount, level, langPair, delay, isActive }: CardData & { isActive: boolean }) {
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

  const levelStyle = LEVEL_STYLES[level];
  const p = S;

  return (
    // 실제 themeCard + cardDetailed: borderRadius 16, padding 16, marginBottom 12
    <Animated.View style={[cardStyle, {
      backgroundColor: C.surface,
      borderRadius: 16 * p,
      padding: 16 * p,
      marginBottom: 12 * p,
      borderWidth: 1,
      borderColor: 'rgba(49,130,246,0.1)',
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
          <Text style={{ fontSize: 17 * p, fontFamily: 'Pretendard_700Bold', color: C.text, flex: 1 }} numberOfLines={1}>{title}</Text>
        </View>
        <View style={{ backgroundColor: levelStyle.bg, paddingHorizontal: 8 * p, paddingVertical: 3 * p, borderRadius: 10 * p }}>
          <Text style={{ fontSize: 11 * p, fontFamily: 'Pretendard_600SemiBold', color: levelStyle.color }}>{levelStyle.label}</Text>
        </View>
      </View>

      {/* tagRow */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 * p, marginTop: 4 * p }}>
        {tags.map(tag => (
          <View key={tag} style={{ backgroundColor: C.surfaceSecondary, paddingHorizontal: 8 * p, paddingVertical: 2 * p, borderRadius: 4 * p }}>
            <Text style={{ fontSize: 11 * p, fontFamily: 'Pretendard_500Medium', color: C.textSecondary }}>#{tag}</Text>
          </View>
        ))}
      </View>

      {/* cardDesc */}
      <Text style={{ fontSize: 13 * p, fontFamily: 'Pretendard_400Regular', color: C.textSecondary, marginTop: 6 * p }} numberOfLines={1}>
        {description}
      </Text>

      {/* langPair */}
      <Text style={{ fontSize: 13 * p, fontFamily: 'Pretendard_500Medium', color: C.textTertiary, marginTop: 4 * p }}>
        {langPair}
      </Text>

      {/* cardFooter */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 * p }}>
        <View style={{ backgroundColor: C.primaryLight, paddingHorizontal: 8 * p, paddingVertical: 3 * p, borderRadius: 10 * p }}>
          <Text style={{ fontSize: 12 * p, fontFamily: 'Pretendard_700Bold', color: C.primary, letterSpacing: 0.3 }}>{wordCount}개 단어</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 * p }}>
          <Ionicons name="download-outline" size={12 * p} color={C.textTertiary} />
          <Text style={{ fontSize: 11 * p, fontFamily: 'Pretendard_500Medium', color: C.textTertiary }}>1.2k</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// 카드 2개
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

// 실제 langFilterChips
const CHIPS = ['전체', 'EN', 'KO', 'JP', 'ZH'];

export function CurationDemo({ isActive }: { isActive: boolean }) {
  const screenOpacity = useSharedValue(0);

  useEffect(() => {
    screenOpacity.value = isActive
      ? withTiming(1, { duration: 400 })
      : withTiming(0, { duration: 200 });
  }, [isActive]);

  const screenStyle = useAnimatedStyle(() => ({ opacity: screenOpacity.value }));
  const p = S;

  return (
    <Animated.View style={[screenStyle, styles.screen, { backgroundColor: C.bg, width: AVAIL_W }]}>

      {/* ── 헤더 (실제 curation.tsx: paddingHorizontal 20, paddingBottom 8, gap 12) ── */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16 * p,
        paddingTop: 14 * p,
        paddingBottom: 8 * p,
        gap: 10 * p,
      }}>
        {/* 실제 CharacterSvg (size 56, 스케일 적용) */}
        <CharacterSvg size={Math.round(44 * p)} wave={isActive} isDark={false} />

        <View style={{ flex: 1 }}>
          {/* headerTitle: fontSize 26 */}
          <Text style={{
            fontSize: 22 * p,
            fontFamily: 'Pretendard_700Bold',
            color: C.text,
            letterSpacing: -0.5,
          }}>
            단어 모음
          </Text>
          {/* headerSubtitle: fontSize 14 */}
          <Text style={{
            fontSize: 11 * p,
            fontFamily: 'Pretendard_400Regular',
            color: C.textSecondary,
            marginTop: 1,
            lineHeight: 16 * p,
          }} numberOfLines={1}>
            오늘도 새로운 단어를 배워봐요
          </Text>
        </View>

        {/* actionBtn: width 44, height 44, borderRadius 12, border */}
        <View style={{
          width: 36 * p, height: 36 * p,
          borderRadius: 10 * p,
          borderWidth: 1,
          borderColor: C.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Ionicons name="reorder-three-outline" size={20 * p} color={C.textSecondary} />
        </View>
      </View>

      {/* ── 검색창 (실제: paddingHorizontal 20, searchBox: paddingH 16, paddingV 14, borderRadius 16) ── */}
      <View style={{ paddingHorizontal: 14 * p, paddingVertical: 6 * p }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14 * p,
          paddingVertical: 11 * p,
          borderRadius: 14 * p,
          borderWidth: 1,
          borderColor: C.borderLight,
          backgroundColor: C.surface,
          gap: 8 * p,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 6,
          elevation: 1,
        }}>
          <Ionicons name="search" size={18 * p} color={C.textTertiary} />
          <Text style={{ flex: 1, fontSize: 14 * p, fontFamily: 'Pretendard_400Regular', color: C.textTertiary }}>
            단어장 검색
          </Text>
        </View>
      </View>

      {/* ── 언어 필터 칩 (실제: horizontal ScrollView, paddingHorizontal 20, langChip: paddingH 14, paddingV 7) ── */}
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
              fontFamily: 'Pretendard_600SemiBold',
              color: i === 0 ? '#FFFFFF' : C.textSecondary,
            }}>
              {chip}
            </Text>
          </View>
        ))}
      </View>

      {/* ── 탭 (실제: tabContainer: paddingHorizontal 20, paddingVertical 12, fontSize 16) ── */}
      <View style={{
        flexDirection: 'row',
        paddingHorizontal: 14 * p,
        marginBottom: 8 * p,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.border,
      }}>
        {/* 공식 탭 (active) */}
        <View style={{
          flex: 1,
          paddingVertical: 10 * p,
          alignItems: 'center',
          borderBottomWidth: 2,
          borderBottomColor: C.primary,
        }}>
          <Text style={{ fontSize: 14 * p, fontFamily: 'Pretendard_600SemiBold', color: C.primary }}>공식</Text>
        </View>
        {/* 커뮤니티 탭 */}
        <View style={{ flex: 1, paddingVertical: 10 * p, alignItems: 'center' }}>
          <Text style={{ fontSize: 14 * p, fontFamily: 'Pretendard_600SemiBold', color: C.textSecondary }}>커뮤니티</Text>
        </View>
      </View>

      {/* ── 카드 목록 (2개, detailed 모드) ── */}
      <View style={{ paddingHorizontal: 14 * p, paddingBottom: 12 * p }}>
        {THEMES.map(theme => (
          <ThemeCard key={theme.title} {...theme} isActive={isActive} />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: 'rgba(25,31,40,0.12)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 8,
  },
});
