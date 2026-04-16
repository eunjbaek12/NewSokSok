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
  border: '#E5E8EB',
  borderLight: '#F2F4F6',
  success: '#22C55E',
  successLight: '#DCFCE7',
};

const SCREEN_W = Dimensions.get('window').width;
const AVAIL_W = SCREEN_W - 56;
const S = AVAIL_W / 340;

// 실제 plan/[id].tsx의 WordPlanCard와 동일
function WordRow({
  term, meaning, pos, isMemorized, delay, isActive,
}: {
  term: string; meaning: string; pos: string;
  isMemorized: boolean; delay: number; isActive: boolean;
}) {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(-10);

  useEffect(() => {
    if (!isActive) { opacity.value = 0; translateX.value = -10; return; }
    opacity.value = withDelay(delay, withTiming(1, { duration: 320 }));
    translateX.value = withDelay(delay, withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) }));
  }, [isActive]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  const p = S;
  return (
    <Animated.View style={[style, {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isMemorized ? C.surfaceSecondary : C.surface,
      borderRadius: 10 * p,
      padding: 12 * p,
      marginBottom: 7 * p,
      borderWidth: 1,
      borderColor: isMemorized ? C.borderLight : C.border,
      opacity: isMemorized ? 0.65 : 1,
    }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 * p, flex: 1 }}>
        {pos ? (
          <View style={{ backgroundColor: C.primaryLight, paddingHorizontal: 6 * p, paddingVertical: 2 * p, borderRadius: 4 * p }}>
            <Text style={{ color: C.primary, fontSize: 10 * p, fontFamily: 'Pretendard_600SemiBold' }}>{pos}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14 * p, fontFamily: 'Pretendard_600SemiBold', color: C.text }} numberOfLines={1}>{term}</Text>
          <Text style={{ fontSize: 12 * p, fontFamily: 'Pretendard_400Regular', color: C.textSecondary, marginTop: 1 * p }} numberOfLines={1}>{meaning}</Text>
        </View>
      </View>
      <Ionicons
        name={isMemorized ? 'checkmark-circle' : 'ellipse-outline'}
        size={22 * p}
        color={isMemorized ? C.success : C.border}
      />
    </Animated.View>
  );
}

const WORDS = [
  { term: 'airplane', meaning: '비행기', pos: '명사', isMemorized: true, delay: 700 },
  { term: 'passport', meaning: '여권', pos: '명사', isMemorized: true, delay: 900 },
  { term: 'departure', meaning: '출발', pos: '명사', isMemorized: false, delay: 1100 },
  { term: 'itinerary', meaning: '여행 일정', pos: '명사', isMemorized: false, delay: 1300 },
];

export function PlanDemo({ isActive }: { isActive: boolean }) {
  const screenOpacity = useSharedValue(0);
  const barWidth = useSharedValue(0);

  useEffect(() => {
    if (!isActive) {
      screenOpacity.value = 0;
      barWidth.value = 0;
      return;
    }
    screenOpacity.value = withTiming(1, { duration: 400 });
    // 2/4 단어 암기 = 50%
    barWidth.value = withDelay(500, withTiming(0.5, { duration: 800, easing: Easing.out(Easing.quad) }));
  }, [isActive]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: screenOpacity.value }));
  const barStyle = useAnimatedStyle(() => ({ width: `${barWidth.value * 100}%` }));

  const p = S;

  return (
    <Animated.View style={[styles.screen, { backgroundColor: C.bg, width: AVAIL_W }, containerStyle]}>

      {/* 헤더 (실제 plan/[id].tsx 와 동일) */}
      <View style={[styles.header, { paddingTop: 14 * p, paddingHorizontal: 16 * p, paddingBottom: 10 * p }]}>
        <Ionicons name="chevron-back" size={22 * p} color={C.text} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 16 * p, fontFamily: 'Pretendard_700Bold', color: C.text }}>학습 계획</Text>
          <Text style={{ fontSize: 11 * p, fontFamily: 'Pretendard_400Regular', color: C.textTertiary, marginTop: 1 * p }} numberOfLines={1}>
            여행 영어 단어장
          </Text>
        </View>
        <Ionicons name="refresh-outline" size={18 * p} color={C.textSecondary} />
      </View>

      {/* Status Banner: in-progress (실제 앱 primaryLight 배경) */}
      <View style={[styles.banner, { backgroundColor: C.primaryLight, marginHorizontal: 16 * p, borderRadius: 12 * p, padding: 12 * p }]}>
        <Ionicons name="calendar-outline" size={20 * p} color={C.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13 * p, fontFamily: 'Pretendard_600SemiBold', color: C.primary }}>학습이 진행 중이에요</Text>
          <Text style={{ fontSize: 11 * p, fontFamily: 'Pretendard_400Regular', color: C.primary, opacity: 0.75, marginTop: 2 * p }}>
            남은 기간 3일 / 총 5일
          </Text>
        </View>
      </View>

      {/* Progress Summary (실제 앱의 progressRow) */}
      <View style={[styles.progressRow, { marginHorizontal: 16 * p, marginTop: 10 * p, paddingVertical: 10 * p, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.borderLight }]}>
        <Text style={{ fontSize: 13 * p, fontFamily: 'Pretendard_400Regular', color: C.textSecondary }}>
          <Text style={{ fontFamily: 'Pretendard_700Bold', color: C.text }}>2</Text>
          {'  /  20단어 암기'}
        </Text>
        <View style={{ flex: 1, marginLeft: 12 * p, height: 4 * p, backgroundColor: C.surfaceSecondary, borderRadius: 2 * p, overflow: 'hidden' }}>
          <Animated.View style={[barStyle, { height: '100%', backgroundColor: C.primary, borderRadius: 2 * p }]} />
        </View>
      </View>

      {/* Day 네비게이션 (실제 앱 dayNavRow) */}
      <View style={[styles.dayNav, { marginHorizontal: 16 * p, paddingVertical: 10 * p, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.borderLight }]}>
        <Ionicons name="chevron-back" size={20 * p} color={C.text} style={{ opacity: 0.3 }} />
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={{ fontSize: 15 * p, fontFamily: 'Pretendard_700Bold', color: C.text }}>Day 1</Text>
          <Text style={{ fontSize: 12 * p, fontFamily: 'Pretendard_400Regular', color: C.textTertiary, marginTop: 2 * p }}>
            2 / 4 단어 암기
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20 * p} color={C.text} />
      </View>

      {/* 단어 목록 (실제 앱 WordPlanCard) */}
      <View style={{ paddingHorizontal: 16 * p, paddingTop: 10 * p }}>
        {WORDS.map((w) => (
          <WordRow key={w.term} {...w} isActive={isActive} />
        ))}
      </View>

      {/* 하단 학습 시작 버튼 (실제 앱 bottomBar) */}
      <View style={{ paddingHorizontal: 16 * p, paddingTop: 8 * p, paddingBottom: 12 * p }}>
        <View style={{ backgroundColor: C.primary, borderRadius: 12 * p, paddingVertical: 12 * p, alignItems: 'center' }}>
          <Text style={{ fontSize: 14 * p, fontFamily: 'Pretendard_600SemiBold', color: '#FFFFFF' }}>
            Day 1 학습 시작
          </Text>
        </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0F4FF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E8EB',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
