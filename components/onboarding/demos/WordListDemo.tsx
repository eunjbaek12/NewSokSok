import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

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
};

const SCREEN_W = Dimensions.get('window').width;
const AVAIL_W = SCREEN_W - 56;
const S = AVAIL_W / 340;

// ─── 단어 카드 ───────────────────────────────────────────────
function WordCard({
  term, meaning, isMemorized, isStarred, opacity, translateX,
}: {
  term: string; meaning: string;
  isMemorized: boolean; isStarred: boolean;
  opacity: Animated.SharedValue<number>;
  translateX: Animated.SharedValue<number>;
}) {
  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));
  const p = S;
  return (
    <Animated.View style={[cardStyle, {
      backgroundColor: C.surface,
      borderRadius: 12 * p,
      marginBottom: 9 * p,
      borderLeftWidth: 3 * p,
      borderLeftColor: isStarred ? '#FFD700' : isMemorized ? C.success : C.primary,
    }]}>
      <View style={{ flexDirection: 'row', padding: 12 * p, gap: 10 * p, alignItems: 'center' }}>
        <Ionicons name={isStarred ? 'star' : 'star-outline'} size={19 * p} color={isStarred ? '#FFD700' : C.textTertiary} />
        <View style={{ flex: 1, gap: 3 * p }}>
          <Text style={{
            fontSize: 16 * p, fontFamily: 'Pretendard_700Bold',
            color: isMemorized ? C.textTertiary : C.text,
            textDecorationLine: isMemorized ? 'line-through' : 'none',
          }}>{term}</Text>
          <Text style={{ fontSize: 13 * p, fontFamily: 'Pretendard_500Medium', color: C.textSecondary }}>{meaning}</Text>
        </View>
        <Ionicons
          name={isMemorized ? 'checkmark-circle' : 'checkmark-circle-outline'}
          size={21 * p}
          color={isMemorized ? C.success : C.textTertiary}
        />
      </View>
    </Animated.View>
  );
}

// ─── 실제 add-word.tsx popup 모드와 동일한 팝업 ──────────────────────────────
function AddWordPopup({
  popupOpacity,
  popupScale,
  inputText,
  showAutofill,
}: {
  popupOpacity: Animated.SharedValue<number>;
  popupScale: Animated.SharedValue<number>;
  inputText: string;
  showAutofill: boolean;
}) {
  const autofillOpacity = useSharedValue(0);
  useEffect(() => {
    autofillOpacity.value = withTiming(showAutofill ? 1 : 0, { duration: 280 });
  }, [showAutofill]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: popupOpacity.value }));
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: popupScale.value }] }));
  const autofillStyle = useAnimatedStyle(() => ({ opacity: autofillOpacity.value }));
  const p = S;

  return (
    <Animated.View style={[overlayStyle, {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.40)',
      alignItems: 'center', justifyContent: 'center',
    }]}>
      {/* 실제 popup 모드: 92% width, 최대 700 높이 */}
      <Animated.View style={[cardStyle, {
        width: '96%',
        backgroundColor: C.bg,
        borderRadius: 24 * p,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 10,
      }]}>
        {/* 실제 topBar */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20 * p,
          paddingTop: 10 * p,
          paddingBottom: 6 * p,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: C.borderLight,
        }}>
          <Text style={{ fontSize: 16 * p, fontFamily: 'Pretendard_400Regular', color: C.textSecondary }}>취소</Text>
          <Text style={{ fontSize: 17 * p, fontFamily: 'Pretendard_600SemiBold', color: C.text }}>단어 추가</Text>
          <Ionicons name="settings-outline" size={20 * p} color={C.textSecondary} />
        </View>

        {/* scrollContent: padding 20 */}
        <View style={{ padding: 20 * p, gap: 10 * p }}>
          {/* 단어장 선택 (listSelector) */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            borderWidth: 1, borderRadius: 12 * p, borderColor: C.border,
            paddingHorizontal: 14 * p, paddingVertical: 12 * p,
            gap: 8 * p,
            backgroundColor: C.surface,
          }}>
            <Ionicons name="folder-outline" size={18 * p} color={C.textSecondary} />
            <Text style={{ flex: 1, fontSize: 15 * p, fontFamily: 'Pretendard_500Medium', color: C.text }}>
              ✈️ 여행 영어 단어장
            </Text>
            <Ionicons name="chevron-down" size={16 * p} color={C.textTertiary} />
          </View>

          {/* 단어 입력창 (wordInput) */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: C.surface,
            borderWidth: 1,
            borderColor: inputText.length > 0 ? C.primary : C.border,
            borderRadius: 12 * p,
            paddingVertical: 12 * p,
            paddingHorizontal: 16 * p,
            paddingRight: (16 + 38) * p,
          }}>
            <Text style={{
              flex: 1, fontSize: 16 * p,
              fontFamily: 'Pretendard_600SemiBold', color: C.text,
            }}>
              {inputText || ' '}
              {inputText.length > 0 && inputText.length < 5 && (
                <Text style={{ color: C.primary }}>|</Text>
              )}
            </Text>
            <Ionicons
              name="search-outline"
              size={22 * p}
              color={inputText.length > 0 ? C.primary : C.textTertiary}
              style={{ position: 'absolute', right: 8 * p }}
            />
          </View>

          {/* 자동완성 결과 */}
          <Animated.View style={[autofillStyle, { gap: 10 * p }]}>
            {/* 뜻 (meaningKr Input) */}
            <View style={{
              borderWidth: 1, borderRadius: 12 * p, borderColor: C.border,
              paddingHorizontal: 16 * p, paddingVertical: 12 * p,
              backgroundColor: C.surface,
            }}>
              <Text style={{ fontSize: 12 * p, fontFamily: 'Pretendard_600SemiBold', color: C.textSecondary, letterSpacing: 0.8, marginBottom: 4 * p }}>한국어 뜻</Text>
              <Text style={{ fontSize: 16 * p, fontFamily: 'Pretendard_600SemiBold', color: C.text }}>사과</Text>
            </View>

            {/* 발음 (phonetic) */}
            <View style={{
              borderWidth: 1, borderRadius: 12 * p, borderColor: C.border,
              paddingHorizontal: 16 * p, paddingVertical: 10 * p,
              backgroundColor: C.surface,
              flexDirection: 'row', alignItems: 'center', gap: 8 * p,
            }}>
              <Text style={{ fontSize: 12 * p, fontFamily: 'Pretendard_600SemiBold', color: C.textSecondary, letterSpacing: 0.8 }}>발음</Text>
              <Text style={{ fontSize: 14 * p, fontFamily: 'Pretendard_400Regular', color: C.textSecondary }}>/æp·əl/</Text>
            </View>

            {/* 예문 */}
            <View style={{
              borderWidth: 1, borderRadius: 12 * p, borderColor: C.border,
              paddingHorizontal: 16 * p, paddingVertical: 10 * p,
              backgroundColor: C.surface,
            }}>
              <Text style={{ fontSize: 12 * p, fontFamily: 'Pretendard_600SemiBold', color: C.textSecondary, letterSpacing: 0.8, marginBottom: 4 * p }}>예문</Text>
              <Text style={{ fontSize: 13 * p, fontFamily: 'Pretendard_400Regular', color: C.textSecondary, fontStyle: 'italic' }}>I ate an apple this morning.</Text>
            </View>
          </Animated.View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// ─── 저장 FAB (실제 add-word.tsx fabButton과 동일) ─────────────────────────
function SaveFab({
  fabOpacity,
  fabScale,
}: {
  fabOpacity: Animated.SharedValue<number>;
  fabScale: Animated.SharedValue<number>;
}) {
  const fabStyle = useAnimatedStyle(() => ({
    opacity: fabOpacity.value,
    transform: [{ scale: fabScale.value }],
  }));
  const p = S;
  return (
    <Animated.View style={[fabStyle, {
      position: 'absolute',
      right: 16 * p,
      bottom: 20 * p,
      zIndex: 200,
    }]}>
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20 * p,
        paddingVertical: 12 * p,
        borderRadius: 24 * p,
        backgroundColor: C.primary,
        gap: 6 * p,
        shadowColor: C.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
      }}>
        <Ionicons name="checkmark" size={20 * p} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 16 * p, fontFamily: 'Pretendard_700Bold' }}>저장</Text>
      </View>
    </Animated.View>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────
const WORDS = [
  { term: 'luggage', meaning: '짐, 수하물', isMemorized: false, isStarred: true },
  { term: 'departure', meaning: '출발', isMemorized: false, isStarred: false },
  { term: 'journey', meaning: '여행, 여정', isMemorized: true, isStarred: false },
];

export function WordListDemo({ isActive }: { isActive: boolean }) {
  const p = S;

  const screenOpacity = useSharedValue(0);
  const progressWidth = useSharedValue(0);
  const word1Opacity = useSharedValue(0); const word1X = useSharedValue(-8);
  const word2Opacity = useSharedValue(0); const word2X = useSharedValue(-8);
  const word3Opacity = useSharedValue(0); const word3X = useSharedValue(-8);
  const word4Opacity = useSharedValue(0); const word4X = useSharedValue(20);
  const listFabScale = useSharedValue(1);

  // 팝업 FAB (저장 버튼)
  const popupOpacity = useSharedValue(0);
  const popupScale = useSharedValue(0.92);
  const saveFabOpacity = useSharedValue(0);
  const saveFabScale = useSharedValue(0.8);

  const [inputText, setInputText] = useState('');
  const [showAutofill, setShowAutofill] = useState(false);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const after = (fn: () => void, delay: number) => {
    const id = setTimeout(fn, delay);
    timers.current.push(id);
  };

  const resetAll = () => {
    screenOpacity.value = 0;
    progressWidth.value = 0;
    word1Opacity.value = 0; word1X.value = -8;
    word2Opacity.value = 0; word2X.value = -8;
    word3Opacity.value = 0; word3X.value = -8;
    word4Opacity.value = 0; word4X.value = 20;
    listFabScale.value = 1;
    popupOpacity.value = 0; popupScale.value = 0.92;
    saveFabOpacity.value = 0; saveFabScale.value = 0.8;
    setInputText(''); setShowAutofill(false);
  };

  const runCycle = (offset: number) => {
    // Phase 1: 목록 등장
    after(() => {
      screenOpacity.value = withTiming(1, { duration: 400 });
      progressWidth.value = withDelay(200, withTiming(0.33, { duration: 500, easing: Easing.out(Easing.quad) }));
    }, offset);
    after(() => { word1Opacity.value = withTiming(1, { duration: 300 }); word1X.value = withTiming(0, { duration: 300 }); }, offset + 350);
    after(() => { word2Opacity.value = withTiming(1, { duration: 300 }); word2X.value = withTiming(0, { duration: 300 }); }, offset + 570);
    after(() => { word3Opacity.value = withTiming(1, { duration: 300 }); word3X.value = withTiming(0, { duration: 300 }); }, offset + 800);

    // Phase 2: FAB 탭
    after(() => { listFabScale.value = withSpring(0.82, { damping: 10, stiffness: 300 }); }, offset + 1300);
    after(() => { listFabScale.value = withSpring(1, { damping: 10, stiffness: 300 }); }, offset + 1480);

    // Phase 3: 팝업 등장
    after(() => {
      popupOpacity.value = withSpring(1, { damping: 20, stiffness: 200 });
      popupScale.value = withSpring(1, { damping: 20, stiffness: 200 });
    }, offset + 1680);

    // Phase 4: 타이핑
    'apple'.split('').forEach((_, i) => {
      after(() => setInputText('apple'.slice(0, i + 1)), offset + 2180 + i * 130);
    });

    // Phase 5: 자동완성 등장 + 저장 FAB 등장
    after(() => {
      setShowAutofill(true);
      saveFabOpacity.value = withSpring(1, { damping: 18, stiffness: 200 });
      saveFabScale.value = withSpring(1, { damping: 14, stiffness: 200 });
    }, offset + 2980);

    // Phase 6: 저장 버튼 눌림 효과
    after(() => { saveFabScale.value = withSpring(0.88, { damping: 10, stiffness: 300 }); }, offset + 4400);
    after(() => { saveFabScale.value = withSpring(1, { damping: 10, stiffness: 300 }); }, offset + 4580);

    // Phase 7: 팝업 + FAB 닫기
    after(() => {
      popupOpacity.value = withTiming(0, { duration: 250, easing: Easing.in(Easing.quad) });
      popupScale.value = withTiming(0.93, { duration: 250 });
      saveFabOpacity.value = withTiming(0, { duration: 200 });
    }, offset + 4780);

    // Phase 8: 새 단어가 목록에 추가됨
    after(() => {
      setInputText(''); setShowAutofill(false);
      word4Opacity.value = withTiming(1, { duration: 320 });
      word4X.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) });
      progressWidth.value = withTiming(0.5, { duration: 400 });
    }, offset + 5100);
  };

  useEffect(() => {
    clearTimers();
    if (!isActive) { resetAll(); return; }
    runCycle(0);
    // 두번째 사이클
    after(() => { resetAll(); }, 7400);
    after(() => { runCycle(7600); }, 7600);
    return clearTimers;
  }, [isActive]);

  const screenStyle = useAnimatedStyle(() => ({ opacity: screenOpacity.value }));
  const barStyle = useAnimatedStyle(() => ({ width: `${progressWidth.value * 100}%` }));
  const listFabStyle = useAnimatedStyle(() => ({ transform: [{ scale: listFabScale.value }] }));

  return (
    <Animated.View style={[screenStyle, styles.screen, { backgroundColor: C.bg, width: AVAIL_W }]}>
      {/* 헤더 */}
      <View style={{
        paddingHorizontal: 14 * p, paddingTop: 13 * p, paddingBottom: 9 * p,
        flexDirection: 'row', alignItems: 'center', gap: 10 * p,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
      }}>
        <Ionicons name="chevron-back" size={23 * p} color={C.text} />
        <Text style={{ fontSize: 17 * p, fontFamily: 'Pretendard_700Bold', color: C.text, flex: 1 }}>✈️ 여행 영어 단어장</Text>
        <Ionicons name="ellipsis-horizontal" size={19 * p} color={C.textSecondary} />
      </View>

      {/* 진행도 */}
      <View style={{
        paddingHorizontal: 14 * p, paddingVertical: 8 * p,
        flexDirection: 'row', alignItems: 'center', gap: 10 * p,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderLight,
      }}>
        <View style={{ flex: 1, height: 5 * p, backgroundColor: C.surfaceSecondary, borderRadius: 3 * p, overflow: 'hidden' }}>
          <Animated.View style={[barStyle, { height: '100%', backgroundColor: C.success, borderRadius: 3 * p }]} />
        </View>
        <Text style={{ fontSize: 12 * p, fontFamily: 'Pretendard_500Medium', color: C.textTertiary }}>1 / 4</Text>
      </View>

      {/* 단어 카드 목록 */}
      <View style={{ paddingHorizontal: 12 * p, paddingTop: 10 * p, paddingBottom: 54 * p }}>
        <WordCard {...WORDS[0]} opacity={word1Opacity} translateX={word1X} />
        <WordCard {...WORDS[1]} opacity={word2Opacity} translateX={word2X} />
        <WordCard {...WORDS[2]} opacity={word3Opacity} translateX={word3X} />
        <WordCard term="apple" meaning="사과" isMemorized={false} isStarred={false} opacity={word4Opacity} translateX={word4X} />
      </View>

      {/* 목록 화면의 + FAB */}
      <Animated.View style={[listFabStyle, {
        position: 'absolute', right: 14 * p, bottom: 14 * p,
        width: 46 * p, height: 46 * p, borderRadius: 23 * p,
        backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
        elevation: 6,
      }]}>
        <Ionicons name="add" size={26 * p} color="#FFFFFF" />
      </Animated.View>

      {/* 단어 추가 팝업 오버레이 */}
      <AddWordPopup
        popupOpacity={popupOpacity}
        popupScale={popupScale}
        inputText={inputText}
        showAutofill={showAutofill}
      />

      {/* 저장 FAB — 팝업 위에 별도로 표시 (실제 add-word.tsx 구조) */}
      <SaveFab fabOpacity={saveFabOpacity} fabScale={saveFabScale} />
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
