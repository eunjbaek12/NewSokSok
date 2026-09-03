import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle, GestureResponderEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/features/theme';
import { speak, SLOW_RATE } from '@/lib/tts';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface SpeakerButtonProps {
  /** 읽을 텍스트. 표제어면 getSpeakableText, 예문이면 stripSenseMarkers를 통과시킨 값을 넘긴다. */
  text: string;
  /** BCP-47 태그. getTtsLang(sourceLang)로 만든다. */
  language: string;
  size?: number;
  /** 평상시 아이콘 색. 기본 colors.textTertiary */
  color?: string;
  /** 재생 중·누르는 중 색. 기본 colors.primary */
  activeColor?: string;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
  /**
   * 부모가 탭 제스처를 가진 경우(카드 뒤집기, 오토플레이 화면 탭) true.
   * 스피커를 눌렀을 뿐인데 카드가 뒤집히는 것을 막는다.
   */
  stopPropagation?: boolean;
  /** 읽을 내용이 아직 없을 때(입력 전 등). 눌리지 않고 흐린 색으로 표시된다. */
  disabled?: boolean;
  /**
   * 스크린리더가 읽을 이름. **넘기지 않아도 된다** — 기본값이 "발음 듣기"다.
   * 한 화면에 스피커가 여럿이라 구분이 필요할 때만(표제어용·예문용) 덮어쓴다.
   */
  accessibilityLabel?: string;
}

/**
 * 단어·예문 발음 재생 버튼.
 *
 * 화면마다 제각각이던 스피커를 하나로 모은 것 — 이전에는 햅틱이 있는 곳(단어 상세)과
 * 없는 곳, 재생 중 표시가 있는 곳(단어장 상세)과 없는 곳, stopPropagation을 하는
 * 곳(오토플레이)과 안 하는 곳이 섞여 있었다.
 *
 * 재생 상태를 **컴포넌트 지역 state로** 들고 있는 게 핵심이다. 이전에 단어장 상세는
 * 목록 전체가 speakingWordId 하나를 공유해서, A 재생 중 B를 누르면 speak(B)가 내부에서
 * Speech.stop()을 호출 → A의 onStopped가 발화 → A의 await이 풀리며 setSpeakingWordId(null)
 * → 정작 재생 중인 B의 표시가 꺼지는 경합이 있었다. 인스턴스마다 자기 상태만 만지면
 * A는 자기 표시만 끄고 B는 그대로 남는다.
 */
export default function SpeakerButton({
  text,
  language,
  size = 26,
  color,
  activeColor,
  style,
  hitSlop = 12,
  stopPropagation = false,
  disabled = false,
  accessibilityLabel,
}: SpeakerButtonProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const idle = color ?? colors.textTertiary;
  const active = activeColor ?? colors.primary;

  const play = useCallback(async (rate?: number) => {
    const body = text?.trim();
    if (!body) return;
    setIsPlaying(true);
    try {
      await speak(body, language, rate == null ? {} : { rate });
    } finally {
      if (mounted.current) setIsPlaying(false);
    }
  }, [text, language]);

  const handlePress = useCallback((e: GestureResponderEvent) => {
    if (stopPropagation) e.stopPropagation();
    Haptics.selectionAsync();
    void play();
  }, [play, stopPropagation]);

  // 길게 누르면 느리게 — 발음이 뭉쳐 들리는 단어를 뜯어 듣는 용도.
  // RN Pressable은 onLongPress가 발화하면 onPress를 부르지 않으므로 이중 재생은 없다.
  const handleLongPress = useCallback((e: GestureResponderEvent) => {
    if (stopPropagation) e.stopPropagation();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void play(SLOW_RATE);
  }, [play, stopPropagation]);

  const icon: IconName = isPlaying ? 'volume-high' : 'volume-medium-outline';

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={[styles.btn, style]}
      accessibilityRole="button"
      // 넘어온 게 없으면 기본 이름을 준다. 비워 두면 RN 이 자식을 대신 읽는데,
      // 자식은 Ionicons = 아이콘 폰트 Text 라 **글리프 코드포인트가 그대로 이름이
      // 된다**(실기 덤프에서 content-desc=""). 스크린리더에는 뜻 없는 문자다.
      // 실제로 호출자 11 곳이 전부 이 prop 을 안 넘기고 있었다 — 잊기 쉬운 쪽이
      // 기본값이었으므로 호출자를 고치는 대신 기본값을 고친다.
      accessibilityLabel={accessibilityLabel ?? t('common.playPronunciation')}
      accessibilityState={{ busy: isPlaying, disabled }}
    >
      {({ pressed }) => (
        <Ionicons
          name={icon}
          size={size}
          color={disabled ? colors.textTertiary : (isPlaying || pressed ? active : idle)}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
