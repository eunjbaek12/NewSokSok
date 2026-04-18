import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
  SharedValue,
} from 'react-native-reanimated';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

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
  success: '#6AB045',
  naverGreen: '#03C75A',
  // 키보드 색상 (iOS 스타일)
  kbBg: '#CDD0D5',
  kbKey: '#FFFFFF',
  kbSpecial: '#ADB5BC',
  kbHighlight: '#A8AAAF',
  kbText: '#000000',
  kbReturn: '#6AB045',
};

const AVAIL_W = 300;
const S = AVAIL_W / 340;

// ─── 단어 카드 ───────────────────────────────────────────────
function WordCard({
  term, meaning, isMemorized, isStarred, opacity, translateX,
}: {
  term: string; meaning: string;
  isMemorized: boolean; isStarred: boolean;
  opacity: SharedValue<number>;
  translateX: SharedValue<number>;
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

// ─── iOS 스타일 리얼 키보드 ──────────────────────────────────
const KB_ROW1 = ['Q','W','E','R','T','Y','U','I','O','P'];
const KB_ROW2 = ['A','S','D','F','G','H','J','K','L'];
const KB_ROW3 = ['Z','X','C','V','B','N','M'];

function Key({
  label, isHighlighted, isSpecial, isReturn, width, height, fontSize,
}: {
  label: React.ReactNode; isHighlighted?: boolean; isSpecial?: boolean;
  isReturn?: boolean; width: number; height: number; fontSize: number;
}) {
  return (
    <View style={{
      width, height,
      backgroundColor: isReturn ? C.kbReturn : isHighlighted ? C.kbHighlight : isSpecial ? C.kbSpecial : C.kbKey,
      borderRadius: 5,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isHighlighted ? 0 : 0.3,
      shadowRadius: 0,
      elevation: isHighlighted ? 0 : 1,
    }}>
      {typeof label === 'string' ? (
        <Text style={{
          fontSize,
          color: isReturn ? '#fff' : C.kbText,
          fontFamily: isReturn ? 'Pretendard_600SemiBold' : 'Pretendard_400Regular',
          letterSpacing: -0.3,
        }}>{label}</Text>
      ) : label}
    </View>
  );
}

function RealisticKeyboard({
  kbOpacity, highlightedKey,
}: {
  kbOpacity: SharedValue<number>;
  highlightedKey: string;
}) {
  const p = S;
  const kbStyle = useAnimatedStyle(() => ({
    opacity: kbOpacity.value,
    transform: [{ translateY: (1 - kbOpacity.value) * 80 * p }],
  }));

  // 키보드 치수 계산 (unscaled 기준 340 단위)
  const KB_PAD = 3 * p;
  const ROW_GAP = 11 * p; // 행 사이 간격
  const KEY_GAP = 6 * p;  // 키 사이 간격
  const KEY_H = 40 * p;
  const FONT = 14 * p;

  // Row 1: 10 keys
  const R1_KEY_W = (AVAIL_W - KB_PAD * 2 - KEY_GAP * 9) / 10;
  // Row 2: 9 keys (offset)
  const R2_KEY_W = (AVAIL_W - KB_PAD * 2 - KEY_GAP * 8 - R1_KEY_W) / 9;
  // Row 3: 7 letters + 2 special
  const SPECIAL_W = R1_KEY_W * 1.5;
  const R3_KEY_W = (AVAIL_W - KB_PAD * 2 - KEY_GAP * 8 - SPECIAL_W * 2) / 7;
  // Row 4
  const NUM_W = R1_KEY_W * 1.5;
  const RETURN_W = R1_KEY_W * 1.5;
  const SPACE_W = AVAIL_W - KB_PAD * 2 - NUM_W - RETURN_W - KEY_GAP * 2;

  const isHL = (k: string) => highlightedKey === k;

  return (
    <Animated.View style={[kbStyle, {
      position: 'absolute',
      bottom: 0, left: 0, right: 0,
      backgroundColor: C.kbBg,
      paddingTop: 10 * p,
      paddingBottom: 8 * p,
      paddingHorizontal: KB_PAD,
    }]}>
      {/* Row 1: Q-P */}
      <View style={{ flexDirection: 'row', gap: KEY_GAP, marginBottom: ROW_GAP }}>
        {KB_ROW1.map(k => (
          <Key key={k} label={k} width={R1_KEY_W} height={KEY_H} fontSize={FONT} isHighlighted={isHL(k)} />
        ))}
      </View>

      {/* Row 2: A-L (offset) */}
      <View style={{ flexDirection: 'row', gap: KEY_GAP, marginBottom: ROW_GAP, paddingHorizontal: R1_KEY_W / 2 }}>
        {KB_ROW2.map(k => (
          <Key key={k} label={k} width={R2_KEY_W} height={KEY_H} fontSize={FONT} isHighlighted={isHL(k)} />
        ))}
      </View>

      {/* Row 3: ⇧ Z-M ⌫ */}
      <View style={{ flexDirection: 'row', gap: KEY_GAP, marginBottom: ROW_GAP }}>
        <Key label={
          <Ionicons name="arrow-up" size={14 * p} color={C.kbText} />
        } isSpecial width={SPECIAL_W} height={KEY_H} fontSize={FONT} />
        {KB_ROW3.map(k => (
          <Key key={k} label={k} width={R3_KEY_W} height={KEY_H} fontSize={FONT} isHighlighted={isHL(k)} />
        ))}
        <Key label={
          <Ionicons name="backspace-outline" size={16 * p} color={C.kbText} />
        } isSpecial width={SPECIAL_W} height={KEY_H} fontSize={FONT} />
      </View>

      {/* Row 4: 123 space search */}
      <View style={{ flexDirection: 'row', gap: KEY_GAP }}>
        <Key label="123" isSpecial width={NUM_W} height={KEY_H} fontSize={12 * p} />
        <Key label=" " width={SPACE_W} height={KEY_H} fontSize={FONT} />
        <Key label="search" isReturn width={RETURN_W} height={KEY_H} fontSize={11 * p} />
      </View>
    </Animated.View>
  );
}

// ─── 단어 추가 팝업 (실제 add-word.tsx UI와 동일) ─────────────
function AddWordPopup({
  popupOpacity, popupScale, inputText, showAutofill,
  saveFabOpacity, saveFabScale, kbOpacity, highlightedKey,
}: {
  popupOpacity: SharedValue<number>;
  popupScale: SharedValue<number>;
  inputText: string;
  showAutofill: boolean;
  saveFabOpacity: SharedValue<number>;
  saveFabScale: SharedValue<number>;
  kbOpacity: SharedValue<number>;
  highlightedKey: string;
}) {
  const autofillOp = useSharedValue(0);
  useEffect(() => {
    autofillOp.value = withTiming(showAutofill ? 1 : 0, { duration: 280 });
  }, [showAutofill]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: popupOpacity.value }));
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: popupScale.value }] }));
  const autofillStyle = useAnimatedStyle(() => ({ opacity: autofillOp.value }));
  const fabStyle = useAnimatedStyle(() => ({
    opacity: saveFabOpacity.value,
    transform: [{ scale: saveFabScale.value }],
  }));
  const p = S;

  return (
    <Animated.View style={[overlayStyle, {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.42)',
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingTop: 16 * p,
    }]}>
      {/* 팝업 카드 */}
      <Animated.View style={[cardStyle, {
        width: '96%',
        backgroundColor: C.bg,
        borderRadius: 24 * p,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.28,
        shadowRadius: 20,
        elevation: 10,
      }]}>
        {/* ── topBar ── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 20 * p, paddingTop: 10 * p, paddingBottom: 8 * p,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderLight,
        }}>
          <Text style={{ fontSize: 15 * p, fontFamily: 'Pretendard_400Regular', color: C.textSecondary }}>취소</Text>
          <Text style={{ fontSize: 16 * p, fontFamily: 'Pretendard_600SemiBold', color: C.text }}>단어 추가</Text>
          <Ionicons name="settings-outline" size={19 * p} color={C.textSecondary} />
        </View>

        {/* ── 스크롤 영역 ── */}
        <View style={{ padding: 14 * p, paddingBottom: 14 * p, gap: 8 * p }}>

          {/* 단어장 선택 */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            borderWidth: 1, borderRadius: 12 * p, borderColor: C.border,
            paddingHorizontal: 12 * p, paddingVertical: 10 * p,
            gap: 7 * p, backgroundColor: C.surface,
          }}>
            <Ionicons name="folder-outline" size={17 * p} color={C.textSecondary} />
            <Text style={{ flex: 1, fontSize: 14 * p, fontFamily: 'Pretendard_500Medium', color: C.text }}>✈️ 여행 영어 단어장</Text>
            <Ionicons name="chevron-down" size={15 * p} color={C.textTertiary} />
          </View>

          {/* 입력 도구 모음 (mic, camera, images, excel) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 * p }}>
            {/* 마이크 */}
            <View style={{
              width: 28 * p, height: 28 * p, borderRadius: 14 * p,
              backgroundColor: C.surfaceSecondary,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="mic-outline" size={14 * p} color={C.textSecondary} />
            </View>
            {/* 카메라 */}
            <View style={{
              width: 28 * p, height: 28 * p, borderRadius: 14 * p,
              backgroundColor: C.surfaceSecondary,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="camera-outline" size={14 * p} color={C.textSecondary} />
            </View>
            {/* 갤러리 */}
            <View style={{
              width: 28 * p, height: 28 * p, borderRadius: 14 * p,
              backgroundColor: C.surfaceSecondary,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="images-outline" size={14 * p} color={C.textSecondary} />
            </View>
            {/* 엑셀 */}
            <View style={{
              width: 28 * p, height: 28 * p, borderRadius: 14 * p,
              backgroundColor: C.surfaceSecondary,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <MaterialCommunityIcons name="microsoft-excel" size={14 * p} color={C.textSecondary} />
            </View>
          </View>

          {/* 단어 입력창 + 검색 액션 */}
          <View style={{ position: 'relative', flexDirection: 'row', alignItems: 'center' }}>
            <View style={{
              flex: 1,
              backgroundColor: C.surface,
              borderWidth: 1.5,
              borderColor: inputText.length > 0 ? C.primary : C.border,
              borderRadius: 12 * p,
              paddingVertical: 11 * p,
              paddingLeft: 14 * p,
              paddingRight: 92 * p,
              flexDirection: 'row', alignItems: 'center',
            }}>
              <Text style={{ fontSize: 15 * p, fontFamily: 'Pretendard_600SemiBold', color: C.text }}>
                {inputText || ''}
                {inputText.length > 0 && (
                  <Text style={{ color: C.primary }}>|</Text>
                )}
                {inputText.length === 0 && (
                  <Text style={{ color: C.textTertiary, fontFamily: 'Pretendard_400Regular' }}>영어 단어 입력...</Text>
                )}
              </Text>
            </View>

            {/* 검색 액션 버튼들 (스피커, 검색, N) */}
            <View style={{
              position: 'absolute', right: 4 * p,
              flexDirection: 'row', alignItems: 'center',
            }}>
              {/* 스피커 */}
              <View style={{ padding: 6 * p }}>
                <Ionicons name="volume-medium-outline" size={20 * p} color={inputText.length > 0 ? C.textSecondary : C.textTertiary} />
              </View>
              {/* 검색 */}
              <View style={{ padding: 6 * p }}>
                <Ionicons name="search-outline" size={20 * p} color={inputText.length > 0 ? C.primary : C.textTertiary} />
              </View>
              {/* 네이버 N */}
              <View style={{ padding: 6 * p }}>
                <Text style={{ fontSize: 14 * p, fontFamily: 'Pretendard_700Bold', color: inputText.length > 0 ? C.naverGreen : C.textTertiary, lineHeight: 20 * p }}>N</Text>
              </View>
            </View>
          </View>

          {/* ── 자동완성 결과 ── */}
          <Animated.View style={[autofillStyle, { gap: 7 * p }]}>
            {/* 한국어 뜻 */}
            <View style={{
              borderWidth: 1, borderRadius: 12 * p, borderColor: C.border,
              paddingHorizontal: 14 * p, paddingVertical: 10 * p,
              backgroundColor: C.surface,
            }}>
              <Text style={{ fontSize: 11 * p, fontFamily: 'Pretendard_600SemiBold', color: C.textSecondary, letterSpacing: 0.8, marginBottom: 3 * p }}>한국어 뜻</Text>
              <Text style={{ fontSize: 15 * p, fontFamily: 'Pretendard_600SemiBold', color: C.text }}>사과</Text>
            </View>

            {/* 발음 */}
            <View style={{
              borderWidth: 1, borderRadius: 12 * p, borderColor: C.border,
              paddingHorizontal: 14 * p, paddingVertical: 9 * p,
              backgroundColor: C.surface,
              flexDirection: 'row', alignItems: 'center', gap: 8 * p,
            }}>
              <Text style={{ fontSize: 11 * p, fontFamily: 'Pretendard_600SemiBold', color: C.textSecondary, letterSpacing: 0.8 }}>발음</Text>
              <Text style={{ fontSize: 13 * p, fontFamily: 'Pretendard_400Regular', color: C.textSecondary }}>/æp·əl/</Text>
            </View>

            {/* 예문 */}
            <View style={{
              borderWidth: 1, borderRadius: 12 * p, borderColor: C.border,
              paddingHorizontal: 14 * p, paddingVertical: 9 * p,
              backgroundColor: C.surface,
            }}>
              <Text style={{ fontSize: 11 * p, fontFamily: 'Pretendard_600SemiBold', color: C.textSecondary, letterSpacing: 0.8, marginBottom: 3 * p }}>예문</Text>
              <Text style={{ fontSize: 12 * p, fontFamily: 'Pretendard_400Regular', color: C.textSecondary, fontStyle: 'italic' }}>
                I ate an apple this morning.
              </Text>
            </View>
          </Animated.View>
        </View>

      </Animated.View>

      {/* ── 저장 FAB (키보드 위에 플로팅) ── */}
      <Animated.View style={[fabStyle, {
        position: 'absolute', right: 20 * p, bottom: 223 * p, zIndex: 200,
      }]}>
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 18 * p, paddingVertical: 10 * p,
          borderRadius: 22 * p, backgroundColor: C.primary,
          gap: 5 * p,
          shadowColor: C.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
          elevation: 6,
        }}>
          <Ionicons name="checkmark" size={18 * p} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 15 * p, fontFamily: 'Pretendard_700Bold' }}>저장</Text>
        </View>
      </Animated.View>

      {/* ── iOS 스타일 키보드 (오버레이 하단) ── */}
      <RealisticKeyboard kbOpacity={kbOpacity} highlightedKey={highlightedKey} />
    </Animated.View>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────
const WORDS = [
  { term: 'luggage', meaning: '짐, 수하물', isMemorized: false, isStarred: true },
  { term: 'departure', meaning: '출발', isMemorized: false, isStarred: false },
  { term: 'journey', meaning: '여행, 여정', isMemorized: true, isStarred: false },
];

const CYCLE_MS = 8800;

export function WordListDemo({ isActive }: { isActive: boolean }) {
  const p = S;

  // 단어 목록 애니메이션
  const screenOpacity = useSharedValue(0);
  const progressWidth = useSharedValue(0);
  const word1Opacity = useSharedValue(0); const word1X = useSharedValue(-8);
  const word2Opacity = useSharedValue(0); const word2X = useSharedValue(-8);
  const word3Opacity = useSharedValue(0); const word3X = useSharedValue(-8);
  const word4Opacity = useSharedValue(0); const word4X = useSharedValue(20);
  const listFabScale = useSharedValue(1);

  // 팝업 / 저장 / 키보드 애니메이션
  const popupOpacity = useSharedValue(0);
  const popupScale = useSharedValue(0.92);
  const saveFabOpacity = useSharedValue(0);
  const saveFabScale = useSharedValue(0.8);
  const kbOpacity = useSharedValue(0);

  const [inputText, setInputText] = useState('');
  const [showAutofill, setShowAutofill] = useState(false);
  const [highlightedKey, setHighlightedKey] = useState('');

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const after = (fn: () => void, delay: number) => {
    const id = setTimeout(fn, delay);
    timers.current.push(id);
  };

  const resetAll = () => {
    screenOpacity.value = withTiming(0, { duration: 250 });
    progressWidth.value = 0;
    word1Opacity.value = 0; word1X.value = -8;
    word2Opacity.value = 0; word2X.value = -8;
    word3Opacity.value = 0; word3X.value = -8;
    word4Opacity.value = 0; word4X.value = 20;
    listFabScale.value = 1;
    popupOpacity.value = 0; popupScale.value = 0.92;
    saveFabOpacity.value = 0; saveFabScale.value = 0.8;
    kbOpacity.value = 0;
    setInputText(''); setShowAutofill(false); setHighlightedKey('');
  };

  const runCycle = (offset: number) => {
    // Phase 1: 목록 등장 (0ms)
    after(() => {
      screenOpacity.value = withTiming(1, { duration: 400 });
      progressWidth.value = withDelay(200, withTiming(0.33, { duration: 500, easing: Easing.out(Easing.quad) }));
    }, offset);
    after(() => { word1Opacity.value = withTiming(1, { duration: 300 }); word1X.value = withTiming(0, { duration: 300 }); }, offset + 350);
    after(() => { word2Opacity.value = withTiming(1, { duration: 300 }); word2X.value = withTiming(0, { duration: 300 }); }, offset + 570);
    after(() => { word3Opacity.value = withTiming(1, { duration: 300 }); word3X.value = withTiming(0, { duration: 300 }); }, offset + 800);

    // Phase 2: + FAB 탭 (1300ms)
    after(() => { listFabScale.value = withSpring(0.82, { damping: 10, stiffness: 300 }); }, offset + 1300);
    after(() => { listFabScale.value = withSpring(1, { damping: 10, stiffness: 300 }); }, offset + 1480);

    // Phase 3: 팝업 등장 (1680ms)
    after(() => {
      popupOpacity.value = withSpring(1, { damping: 20, stiffness: 200 });
      popupScale.value = withSpring(1, { damping: 20, stiffness: 200 });
    }, offset + 1680);

    // Phase 4: 키보드 등장 (2050ms)
    after(() => {
      kbOpacity.value = withSpring(1, { damping: 18, stiffness: 180 });
    }, offset + 2050);

    // Phase 5: 타이핑 "apple" — 각 키 하이라이트 포함 (2180ms~)
    const WORD = 'apple';
    const KEY_MAP: Record<string, string> = { a:'A', p:'P', l:'L', e:'E' };
    WORD.split('').forEach((char, i) => {
      after(() => {
        setInputText(WORD.slice(0, i + 1));
        const key = KEY_MAP[char] || char.toUpperCase();
        setHighlightedKey(key);
        // 키 하이라이트 110ms 후 해제
        setTimeout(() => setHighlightedKey(''), 110);
      }, offset + 2180 + i * 150);
    });

    // Phase 6: 자동완성 + 저장 버튼 등장 (3100ms)
    after(() => {
      setShowAutofill(true);
      saveFabOpacity.value = withSpring(1, { damping: 18, stiffness: 200 });
      saveFabScale.value = withSpring(1, { damping: 14, stiffness: 200 });
    }, offset + 3100);

    // Phase 7: 저장 버튼 눌림 (4500ms)
    after(() => { saveFabScale.value = withSpring(0.88, { damping: 10, stiffness: 300 }); }, offset + 4500);
    after(() => { saveFabScale.value = withSpring(1, { damping: 10, stiffness: 300 }); }, offset + 4680);

    // Phase 8: 팝업 + 키보드 닫기 (4880ms)
    after(() => {
      popupOpacity.value = withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) });
      popupScale.value = withTiming(0.93, { duration: 280 });
      saveFabOpacity.value = withTiming(0, { duration: 200 });
      kbOpacity.value = withTiming(0, { duration: 220 });
    }, offset + 4880);

    // Phase 9: 새 단어 목록에 추가됨 (5200ms)
    after(() => {
      setInputText(''); setShowAutofill(false);
      word4Opacity.value = withTiming(1, { duration: 340 });
      word4X.value = withTiming(0, { duration: 340, easing: Easing.out(Easing.quad) });
      progressWidth.value = withTiming(0.5, { duration: 400 });
    }, offset + 5200);

    // Phase 10: 저장 후 목록 화면 유지 (5200ms ~ 8500ms = 3.3초 표시)
  };

  useEffect(() => {
    clearTimers();
    if (!isActive) { resetAll(); return; }

    // 4사이클 반복
    for (let i = 0; i < 4; i++) {
      const start = CYCLE_MS * i;
      runCycle(start);
      after(() => { resetAll(); }, start + 8500);
    }

    return clearTimers;
  }, [isActive]);

  const screenStyle = useAnimatedStyle(() => ({ opacity: screenOpacity.value }));
  const barStyle = useAnimatedStyle(() => ({ width: `${progressWidth.value * 100}%` }));
  const listFabStyle = useAnimatedStyle(() => ({ transform: [{ scale: listFabScale.value }] }));

  return (
    <Animated.View style={[screenStyle, styles.screen, { backgroundColor: C.bg, width: AVAIL_W, height: 420 }]}>
      {/* ── 헤더 ── */}
      <View style={{
        paddingHorizontal: 14 * p, paddingTop: 13 * p, paddingBottom: 9 * p,
        flexDirection: 'row', alignItems: 'center', gap: 10 * p,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
      }}>
        <Ionicons name="chevron-back" size={23 * p} color={C.text} />
        <Text style={{ fontSize: 17 * p, fontFamily: 'Pretendard_700Bold', color: C.text, flex: 1 }}>✈️ 여행 영어 단어장</Text>
        <Text style={{ fontSize: 13 * p, fontFamily: 'Pretendard_600SemiBold', color: C.primary }}>계획보기</Text>
      </View>

      {/* ── 진행도 ── */}
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

      {/* ── 필터 행 ── */}
      <View style={{
        paddingHorizontal: 12 * p, paddingVertical: 7 * p,
        flexDirection: 'row', alignItems: 'center',
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderLight,
      }}>
        <Ionicons name="star-outline" size={18 * p} color={C.textTertiary} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 * p, paddingLeft: 8 * p }}>
          <Ionicons name="time-outline" size={12 * p} color={C.textSecondary} />
          <Text style={{ fontSize: 12 * p, fontFamily: 'Pretendard_500Medium', color: C.textSecondary }}>최신순 (4)</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 * p }}>
          <Text style={{ fontSize: 11 * p, fontFamily: 'Pretendard_600SemiBold', color: C.textTertiary, textTransform: 'uppercase' }}>ALL</Text>
          <Ionicons name="filter-outline" size={16 * p} color={C.textTertiary} />
        </View>
      </View>

      {/* ── 단어 카드 목록 ── */}
      <View style={{ paddingHorizontal: 12 * p, paddingTop: 10 * p, paddingBottom: 54 * p }}>
        <WordCard {...WORDS[0]} opacity={word1Opacity} translateX={word1X} />
        <WordCard {...WORDS[1]} opacity={word2Opacity} translateX={word2X} />
        <WordCard {...WORDS[2]} opacity={word3Opacity} translateX={word3X} />
        <WordCard term="apple" meaning="사과" isMemorized={false} isStarred={false} opacity={word4Opacity} translateX={word4X} />
      </View>

      {/* ── + FAB ── */}
      <Animated.View style={[listFabStyle, {
        position: 'absolute', right: 14 * p, bottom: 14 * p,
        width: 46 * p, height: 46 * p, borderRadius: 23 * p,
        backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
        elevation: 6,
      }]}>
        <Ionicons name="add" size={26 * p} color="#FFFFFF" />
      </Animated.View>

      {/* ── 단어 추가 팝업 (저장 버튼 + 키보드 포함) ── */}
      <AddWordPopup
        popupOpacity={popupOpacity}
        popupScale={popupScale}
        inputText={inputText}
        showAutofill={showAutofill}
        saveFabOpacity={saveFabOpacity}
        saveFabScale={saveFabScale}
        kbOpacity={kbOpacity}
        highlightedKey={highlightedKey}
      />
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
