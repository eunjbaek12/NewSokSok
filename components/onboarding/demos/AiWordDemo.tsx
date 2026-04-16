import React, { useEffect, useRef, useState } from 'react';
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
  cardShadow: 'rgba(25, 31, 40, 0.08)',
};

const SCREEN_W = Dimensions.get('window').width;
const AVAIL_W = SCREEN_W - 56;
const S = AVAIL_W / 340;

// 실제 ListCard와 동일한 구조
function ListCardItem({
  icon, title, tag, memorized, total, percent, delay, isActive,
}: {
  icon: string; title: string; tag: string;
  memorized: number; total: number; percent: number;
  delay: number; isActive: boolean;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(14);
  const barWidth = useSharedValue(0);

  useEffect(() => {
    if (!isActive) {
      opacity.value = 0;
      translateY.value = 14;
      barWidth.value = 0;
      return;
    }
    opacity.value = withDelay(delay, withTiming(1, { duration: 380 }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 380, easing: Easing.out(Easing.quad) }));
    barWidth.value = withDelay(delay + 300, withTiming(percent / 100, { duration: 600, easing: Easing.out(Easing.quad) }));
  }, [isActive]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value * 100}%`,
  }));

  const p = S;
  return (
    <Animated.View style={[
      cardStyle,
      {
        backgroundColor: C.surface,
        borderRadius: 12 * p,
        padding: 16 * p,
        marginBottom: 12 * p,
        borderWidth: 1,
        borderColor: 'rgba(49,130,246,0.1)',
        shadowColor: C.cardShadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 10,
        elevation: 4,
      }
    ]}>
      {/* 상단 row: 제목 + 메뉴 */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 16 * p }}>{icon}</Text>
            <Text style={{ fontSize: 16 * p, fontFamily: 'Pretendard_700Bold', color: C.text }} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <Text style={{ fontSize: 12 * p, fontFamily: 'Pretendard_400Regular', color: C.textTertiary, marginTop: 4 * p }}>
            방금 전 학습
          </Text>
        </View>
        <Ionicons name="ellipsis-vertical" size={16 * p} color={C.textTertiary} style={{ opacity: 0.55 }} />
      </View>

      {/* 진행 바 */}
      <View style={{ marginTop: 12 * p }}>
        <View style={{ height: 4 * p, backgroundColor: C.surfaceSecondary, borderRadius: 2 * p, overflow: 'hidden' }}>
          <Animated.View style={[barStyle, {
            height: '100%',
            backgroundColor: percent === 100 ? C.success : C.primary,
            borderRadius: 2 * p,
          }]} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 * p }}>
          <Text style={{ fontSize: 12 * p, fontFamily: 'Pretendard_400Regular', color: C.textSecondary }}>
            {memorized}/{total} 단어
          </Text>
          <Text style={{ fontSize: 13 * p, fontFamily: 'Pretendard_600SemiBold', color: percent === 100 ? C.success : C.primary }}>
            {percent}%
          </Text>
        </View>
      </View>

      {/* 태그 */}
      <View style={{ flexDirection: 'row', gap: 4, marginTop: 8 * p }}>
        <View style={{ backgroundColor: C.surfaceSecondary, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
          <Text style={{ color: C.textSecondary, fontSize: 11 * p, fontFamily: 'Pretendard_500Medium' }}>#{tag}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// 타이핑 검색창 (실제 앱 search trigger와 동일)
function SearchBar({ isActive }: { isActive: boolean }) {
  const [text, setText] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const QUERY = '여행';

  useEffect(() => {
    if (!isActive) { setText(''); return; }
    let i = 0;
    const type = () => {
      if (i <= QUERY.length) {
        setText(QUERY.slice(0, i));
        i++;
        timerRef.current = setTimeout(type, 150);
      }
    };
    timerRef.current = setTimeout(type, 500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isActive]);

  const p = S;
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.surface,
      borderRadius: 12 * p,
      paddingHorizontal: 14 * p,
      paddingVertical: 10 * p,
      borderWidth: 1,
      borderColor: C.border,
      gap: 8 * p,
      marginBottom: 16 * p,
    }}>
      <Ionicons name="search-outline" size={16 * p} color={C.textTertiary} />
      <Text style={{ flex: 1, fontSize: 14 * p, fontFamily: 'Pretendard_400Regular', color: text ? C.text : C.textTertiary }}>
        {text || '단어장 검색'}
        {text.length > 0 && text.length < QUERY.length && (
          <Text style={{ color: C.primary }}>|</Text>
        )}
      </Text>
    </View>
  );
}

const CARDS = [
  { icon: '✈️', title: '여행 영어 단어장', tag: '여행', memorized: 18, total: 20, percent: 90, delay: 700 },
  { icon: '📚', title: '토익 필수 단어', tag: '토익', memorized: 45, total: 80, percent: 56, delay: 1050 },
  { icon: '💼', title: '비즈니스 영어', tag: '비즈니스', memorized: 12, total: 30, percent: 40, delay: 1400 },
];

export function AiWordDemo({ isActive }: { isActive: boolean }) {
  const headerOpacity = useSharedValue(0);

  useEffect(() => {
    headerOpacity.value = isActive ? withTiming(1, { duration: 400 }) : withTiming(0, { duration: 200 });
  }, [isActive]);

  const headerStyle = useAnimatedStyle(() => ({ opacity: headerOpacity.value }));
  const p = S;

  return (
    <View style={[styles.screen, { backgroundColor: C.bg, width: AVAIL_W }]}>
      {/* 실제 앱 헤더 (index.tsx 와 동일) */}
      <Animated.View style={[{ paddingHorizontal: 20 * p, paddingTop: 14 * p, paddingBottom: 8 * p, flexDirection: 'row', alignItems: 'center', gap: 12 * p }, headerStyle]}>
        {/* CharacterSvg 대신 아보카도 이모지로 대체 */}
        <View style={{ width: 40 * p, height: 40 * p, borderRadius: 12 * p, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22 * p }}>🥑</Text>
        </View>
        <View>
          <Text style={{ fontSize: 18 * p, fontFamily: 'Pretendard_700Bold', color: C.text }}>
            안녕하세요, <Text style={{ color: C.primary }}>학습자</Text>님
          </Text>
          <Text style={{ fontSize: 12 * p, fontFamily: 'Pretendard_400Regular', color: C.textSecondary, marginTop: 2 }}>
            오늘도 함께 공부해요
          </Text>
        </View>
      </Animated.View>

      {/* 검색바 */}
      <View style={{ paddingHorizontal: 16 * p }}>
        <SearchBar isActive={isActive} />
      </View>

      {/* 단어장 목록 */}
      <View style={{ paddingHorizontal: 16 * p }}>
        {CARDS.map((c) => (
          <ListCardItem key={c.title} {...c} isActive={isActive} />
        ))}
      </View>
    </View>
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
    paddingBottom: 8,
  },
});
