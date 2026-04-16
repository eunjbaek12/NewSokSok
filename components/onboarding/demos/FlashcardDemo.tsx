import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  interpolate,
  Extrapolation,
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
  warning: '#F59E0B',
};

const SCREEN_W = Dimensions.get('window').width;
const AVAIL_W = SCREEN_W - 56;
const SCALE = AVAIL_W / 340;

export function FlashcardDemo({ isActive }: { isActive: boolean }) {
  const rotation = useSharedValue(0);
  const containerOpacity = useSharedValue(0);

  useEffect(() => {
    if (!isActive) {
      rotation.value = 0;
      containerOpacity.value = 0;
      return;
    }
    containerOpacity.value = withTiming(1, { duration: 400 });

    // 1.2s 후 flip, 1.5s 유지 후 다시 뒤집기, 반복
    rotation.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 0 }),
        withDelay(1200, withTiming(1, { duration: 450 })),
        withDelay(1800, withTiming(0, { duration: 450 })),
        withTiming(0, { duration: 800 }),
      ),
      -1,
      false,
    );
  }, [isActive]);

  const frontStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(rotation.value, [0, 0.5, 1], [0, 90, 180], Extrapolation.CLAMP);
    return {
      transform: [{ perspective: 900 }, { rotateY: `${rotateY}deg` }],
      opacity: rotation.value < 0.5 ? 1 : 0,
      zIndex: rotation.value < 0.5 ? 2 : 1,
      position: 'absolute', width: '100%', height: '100%',
    };
  });

  const backStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(rotation.value, [0, 0.5, 1], [180, 90, 0], Extrapolation.CLAMP);
    return {
      transform: [{ perspective: 900 }, { rotateY: `${rotateY}deg` }],
      opacity: rotation.value >= 0.5 ? 1 : 0,
      zIndex: rotation.value >= 0.5 ? 2 : 1,
      position: 'absolute', width: '100%', height: '100%',
    };
  });

  const s = SCALE;

  return (
    <Animated.View style={[styles.wrapper, { opacity: containerOpacity }]}>
      <View style={[styles.screen, { backgroundColor: C.bg, width: AVAIL_W }]}>

        {/* ── 헤더 (실제 flashcards/[id].tsx 와 동일) ── */}
        <View style={[styles.header, {
          borderBottomColor: C.border,
          paddingHorizontal: 16 * s,
          paddingTop: 14 * s,
          paddingBottom: 0,
        }]}>
          {/* headerRow */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 * s }}>
            <Ionicons name="chevron-back" size={24 * s} color={C.text} />
            <Text style={{
              flex: 1,
              fontSize: 20 * s,
              fontFamily: 'Pretendard_700Bold',
              color: C.text,
            }} numberOfLines={1}>
              카드 학습
            </Text>
            <Ionicons name="settings-outline" size={20 * s} color={C.textSecondary} />
          </View>

          {/* progressContainer */}
          <View style={{
            marginTop: 10 * s,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10 * s,
            paddingBottom: 12 * s,
          }}>
            <View style={{
              flex: 1, height: 6 * s, borderRadius: 3 * s,
              backgroundColor: C.surfaceSecondary, overflow: 'hidden',
            }}>
              <View style={{ width: '20%', height: '100%', borderRadius: 3 * s, backgroundColor: C.primary }} />
            </View>
            <Text style={{ fontSize: 12 * s, fontFamily: 'Pretendard_500Medium', color: C.textTertiary, minWidth: 40 * s, textAlign: 'right' }}>
              1 / 20
            </Text>
          </View>
        </View>

        {/* ── 카드 영역 ── */}
        <View style={{ paddingHorizontal: 24 * s, paddingTop: 8 * s, paddingBottom: (76 + 56) * s }}>
          <View style={{ height: 195 * s, position: 'relative' }}>

            {/* ── 카드 앞면 ── */}
            <Animated.View style={[
              styles.card,
              {
                backgroundColor: C.surface + 'F2',
                borderColor: C.borderLight,
                borderWidth: 1,
                borderRadius: 12 * s,
                padding: 32 * s,
                minHeight: 195 * s,
                gap: 12 * s,
              },
              frontStyle,
            ]}>
              {/* 별 버튼 (starBtn: absolute top right) */}
              <Ionicons
                name="star-outline"
                size={22 * s}
                color={C.textTertiary}
                style={{ position: 'absolute', top: 14 * s, right: 14 * s }}
              />

              {/* 품사 배지 */}
              <View style={{
                backgroundColor: C.primaryLight,
                paddingHorizontal: 8 * s, paddingVertical: 2 * s,
                borderRadius: 8 * s, marginBottom: 8 * s,
              }}>
                <Text style={{ fontSize: 12 * s, fontFamily: 'Pretendard_600SemiBold', color: C.primary }}>명사</Text>
              </View>

              {/* 단어 */}
              <Text style={{ fontSize: 36 * s, fontFamily: 'Pretendard_700Bold', color: C.text, textAlign: 'center' }}>apple</Text>

              {/* 발음 */}
              <Text style={{ fontSize: 14 * s, fontFamily: 'Pretendard_400Regular', color: C.textSecondary, textAlign: 'center' }}>
                /æp·əl/
              </Text>

              {/* 스피커 */}
              <Ionicons name="volume-medium-outline" size={26 * s} color={C.textTertiary} />

              {/* 힌트 */}
              <Text style={{
                position: 'absolute', bottom: 14 * s,
                fontSize: 12 * s, fontFamily: 'Pretendard_400Regular', color: C.textTertiary,
              }}>
                탭하여 뒤집기
              </Text>
            </Animated.View>

            {/* ── 카드 뒷면 ── */}
            <Animated.View style={[
              styles.card,
              {
                backgroundColor: C.surface + 'F2',
                borderColor: C.borderLight,
                borderWidth: 1,
                borderRadius: 12 * s,
                padding: 32 * s,
                paddingTop: 50 * s,
                minHeight: 195 * s,
                gap: 12 * s,
              },
              backStyle,
            ]}>
              {/* 별 버튼 */}
              <Ionicons
                name="star-outline"
                size={22 * s}
                color={C.textTertiary}
                style={{ position: 'absolute', top: 14 * s, right: 14 * s }}
              />

              {/* 상단: 품사 + 단어 + 발음 + 스피커 */}
              <View style={{ alignItems: 'center', gap: 4 * s }}>
                <View style={{
                  backgroundColor: C.primaryLight,
                  paddingHorizontal: 6 * s, paddingVertical: 1 * s,
                  borderRadius: 8 * s,
                }}>
                  <Text style={{ fontSize: 10 * s, fontFamily: 'Pretendard_600SemiBold', color: C.primary }}>명사</Text>
                </View>
                <Text style={{ fontSize: 14 * s, fontFamily: 'Pretendard_500Medium', color: C.textSecondary }}>apple</Text>
                <Ionicons name="volume-medium-outline" size={16 * s} color={C.textTertiary} />
              </View>

              {/* 구분선 */}
              <View style={{ width: '80%', height: StyleSheet.hairlineWidth, backgroundColor: C.border }} />

              {/* 뜻 */}
              <Text style={{ fontSize: 32 * s, fontFamily: 'Pretendard_700Bold', color: C.text, textAlign: 'center' }}>
                사과
              </Text>

              {/* 예문 박스 */}
              <View style={{
                backgroundColor: C.surfaceSecondary,
                borderRadius: 10 * s, padding: 10 * s,
                alignSelf: 'stretch',
              }}>
                <Text style={{ fontSize: 12 * s, fontFamily: 'Pretendard_400Regular', color: C.textSecondary, textAlign: 'center' }}>
                  I ate an apple this morning.
                </Text>
                <Text style={{ fontSize: 11 * s, fontFamily: 'Pretendard_400Regular', color: C.textTertiary, textAlign: 'center', marginTop: 4 * s }}>
                  나는 오늘 아침에 사과를 먹었다.
                </Text>
              </View>
            </Animated.View>
          </View>
        </View>

        {/* ── 하단 버튼 (실제 앱과 동일: 다시 볼게요 / 외웠어요) ── */}
        <View style={{
          position: 'absolute',
          bottom: 12 * s,
          left: 0, right: 0,
          flexDirection: 'row',
          paddingHorizontal: 16 * s,
          gap: 16 * s,
        }}>
          {/* 다시 볼게요 */}
          <View style={[styles.actionBtn, {
            flex: 1,
            backgroundColor: C.warning + '1A',
            borderColor: C.warning + '33',
            borderRadius: 14 * s,
            padding: 12 * s,
          }]}>
            <Ionicons name="chevron-back" size={22 * s} color={C.warning} />
            <View>
              <Text style={{ fontFamily: 'Pretendard_600SemiBold', fontSize: 13 * s, color: C.warning }}>다시 볼게요</Text>
              <Text style={{ fontFamily: 'Pretendard_400Regular', fontSize: 10 * s, color: C.warning, opacity: 0.5 }}>Swipe Left</Text>
            </View>
          </View>

          {/* 외웠어요 */}
          <View style={[styles.actionBtn, {
            flex: 1,
            backgroundColor: C.primary + '1A',
            borderColor: C.primary + '33',
            borderRadius: 14 * s,
            padding: 12 * s,
            justifyContent: 'flex-end',
          }]}>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontFamily: 'Pretendard_600SemiBold', fontSize: 13 * s, color: C.primary }}>외웠어요</Text>
              <Text style={{ fontFamily: 'Pretendard_400Regular', fontSize: 10 * s, color: C.primary, opacity: 0.5 }}>Swipe Right</Text>
            </View>
            <Ionicons name="chevron-forward" size={22 * s} color={C.primary} />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
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
    backgroundColor: '#F0F4FF',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  card: {
    position: 'absolute',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(25,31,40,0.08)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
    backfaceVisibility: 'hidden',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    gap: 6,
  },
});
