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

const C = {
  bg: '#FAF6EC',
  surface: '#FFFDF5',
  surfaceSecondary: '#F0E8D5',
  text: '#3B2A1A',
  textSecondary: '#7A6651',
  textTertiary: '#A89880',
  primary: '#6AB045',
  primaryLight: '#E8F5D9',
  border: '#C8BAA0',
  borderLight: '#DDD3BF',
  warning: '#F59E0B',
};

const AVAIL_W = 300;
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
  const CARD_H = 303 * s;

  return (
    <Animated.View style={[styles.wrapper, { opacity: containerOpacity }]}>
      <View style={[styles.screen, { backgroundColor: C.bg, width: AVAIL_W, height: 420 }]}>

        {/* ── 헤더 ── */}
        <View style={[styles.header, {
          borderBottomColor: C.border,
          paddingHorizontal: 16 * s,
          paddingTop: 14 * s,
          paddingBottom: 0,
        }]}>
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
            <Text style={{
              fontSize: 12 * s, fontFamily: 'Pretendard_500Medium',
              color: C.textTertiary, minWidth: 40 * s, textAlign: 'right',
            }}>
              1 / 4
            </Text>
          </View>
        </View>

        {/* ── 카드 영역 ── */}
        <View style={{ paddingHorizontal: 24 * s, paddingTop: 8 * s, paddingBottom: 8 * s }}>
          <View style={{ height: CARD_H, position: 'relative' }}>

            {/* ── 카드 앞면 (실제 CardFront 구조와 동일) ── */}
            <Animated.View style={[
              styles.card,
              {
                backgroundColor: C.surface + 'F2',
                borderColor: C.borderLight,
                borderWidth: 1,
                borderRadius: 12 * s,
                padding: 24 * s,
                minHeight: CARD_H,
                gap: 6 * s,
              },
              frontStyle,
            ]}>
              {/* starBtn */}
              <Ionicons
                name="star-outline"
                size={20 * s}
                color={C.textTertiary}
                style={{ position: 'absolute', top: 14 * s, right: 14 * s }}
              />

              {/* topPosBadge */}
              <View style={{
                backgroundColor: C.primaryLight,
                paddingHorizontal: 7 * s, paddingVertical: 2 * s,
                borderRadius: 8 * s, marginBottom: 6 * s,
              }}>
                <Text style={{ fontSize: 11 * s, fontFamily: 'Pretendard_600SemiBold', color: C.primary }}>명사</Text>
              </View>

              {/* cardWord */}
              <Text style={{ fontSize: 26 * s, fontFamily: 'Pretendard_700Bold', color: C.text, textAlign: 'center' }}>
                apple
              </Text>

              {/* cardInfoRow → phoneticText */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 13 * s, fontFamily: 'Pretendard_400Regular', color: C.textSecondary }}>
                  /æp·əl/
                </Text>
              </View>

              {/* speakerBtn */}
              <View style={{ padding: 6 * s, alignItems: 'center' }}>
                <Ionicons name="volume-medium-outline" size={22 * s} color={C.textTertiary} />
              </View>

              {/* hintText */}
              <Text style={{
                position: 'absolute',
                bottom: 14 * s,
                fontSize: 11 * s,
                fontFamily: 'Pretendard_600SemiBold',
                color: C.textTertiary,
                opacity: 0.7,
              }}>
                탭하여 뒤집기
              </Text>
            </Animated.View>

            {/* ── 카드 뒷면 (실제 CardBack 구조와 동일) ── */}
            <Animated.View style={[
              styles.card,
              {
                backgroundColor: C.surface + 'F2',
                borderColor: C.borderLight,
                borderWidth: 1,
                borderRadius: 12 * s,
                padding: 14 * s,
                paddingTop: 76 * s,
                minHeight: CARD_H,
                gap: 6 * s,
              },
              backStyle,
            ]}>
              {/* starBtn */}
              <Ionicons
                name="star-outline"
                size={20 * s}
                color={C.textTertiary}
                style={{ position: 'absolute', top: 14 * s, right: 14 * s }}
              />

              {/* termWrapper: topPosBadge + term + phonetic + speakerBtn */}
              <View style={{ alignItems: 'center', gap: 3 * s }}>
                <View style={{
                  backgroundColor: C.primaryLight,
                  paddingHorizontal: 5 * s, paddingVertical: 1 * s,
                  borderRadius: 8 * s, marginBottom: 3 * s,
                }}>
                  <Text style={{ fontSize: 9 * s, fontFamily: 'Pretendard_600SemiBold', color: C.primary }}>명사</Text>
                </View>
                <Text style={{ fontSize: 14 * s, fontFamily: 'Pretendard_600SemiBold', color: C.textSecondary }}>
                  apple
                </Text>
                <Text style={{ fontSize: 11 * s, fontFamily: 'Pretendard_400Regular', color: C.textSecondary }}>
                  /æp·əl/
                </Text>
                <View style={{ padding: 4 * s, alignItems: 'center' }}>
                  <Ionicons name="volume-medium-outline" size={20 * s} color={C.textTertiary} />
                </View>
              </View>

              {/* gradientDivider */}
              <View style={{
                width: '70%', height: StyleSheet.hairlineWidth,
                backgroundColor: C.border, alignSelf: 'center',
              }} />

              {/* cardMeaning */}
              <Text style={{ fontSize: 20 * s, fontFamily: 'Pretendard_700Bold', color: C.text, textAlign: 'center' }}>
                사과
              </Text>

              {/* cardExampleBox */}
              <View style={{
                backgroundColor: C.surfaceSecondary,
                borderRadius: 8 * s, padding: 8 * s,
                width: '100%',
              }}>
                <Text style={{
                  fontSize: 10 * s, fontFamily: 'Pretendard_400Regular',
                  color: C.textSecondary, textAlign: 'center', fontStyle: 'italic',
                }}>
                  I ate an apple this morning.
                </Text>
              </View>
            </Animated.View>
          </View>
        </View>

        {/* ── 하단 버튼 (일반 플로우 - 카드 아래에 위치) ── */}
        <View style={{
          flexDirection: 'row',
          paddingHorizontal: 16 * s,
          paddingBottom: 12 * s,
          gap: 16 * s,
        }}>
          {/* 다시 볼게요 */}
          <View style={[styles.actionBtn, {
            flex: 1,
            backgroundColor: C.warning + '1A',
            borderColor: C.warning + '33',
            borderRadius: 12 * s,
            paddingVertical: 12 * s,
            paddingHorizontal: 12 * s,
          }]}>
            <Ionicons name="chevron-back" size={20 * s} color={C.warning} />
            <View>
              <Text style={{ fontFamily: 'Pretendard_600SemiBold', fontSize: 13 * s, color: C.warning }}>다시 볼게요</Text>
              <Text style={{ fontFamily: 'Pretendard_600SemiBold', fontSize: 9 * s, color: C.warning, opacity: 0.5, textTransform: 'uppercase' }}>Swipe Left</Text>
            </View>
          </View>

          {/* 외웠어요 */}
          <View style={[styles.actionBtn, {
            flex: 1,
            backgroundColor: C.primary + '1A',
            borderColor: C.primary + '33',
            borderRadius: 12 * s,
            paddingVertical: 12 * s,
            paddingHorizontal: 12 * s,
            justifyContent: 'flex-end',
          }]}>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontFamily: 'Pretendard_600SemiBold', fontSize: 13 * s, color: C.primary }}>외웠어요</Text>
              <Text style={{ fontFamily: 'Pretendard_600SemiBold', fontSize: 9 * s, color: C.primary, opacity: 0.5, textTransform: 'uppercase' }}>Swipe Right</Text>
            </View>
            <Ionicons name="chevron-forward" size={20 * s} color={C.primary} />
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
    backgroundColor: '#FAF6EC',
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
    gap: 8,
    overflow: 'hidden',
  },
});
