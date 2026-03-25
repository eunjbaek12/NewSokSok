import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

interface ScrollIndicatorProps {
  scrollY: Animated.Value;
  contentHeight: number;
  visibleHeight: number;
}

export default function ScrollIndicator({ scrollY, contentHeight, visibleHeight }: ScrollIndicatorProps) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const listenerId = scrollY.addListener(() => {
      Animated.timing(opacity, { toValue: 1, duration: 0, useNativeDriver: true }).start();

      if (fadeTimer.current) clearTimeout(fadeTimer.current);
      fadeTimer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      }, 1500);
    });

    return () => {
      scrollY.removeListener(listenerId);
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [scrollY, opacity]);

  if (contentHeight <= visibleHeight || visibleHeight === 0) return null;

  const thumbHeight = Math.max(32, (visibleHeight / contentHeight) * visibleHeight);
  const maxScroll = contentHeight - visibleHeight;
  const maxThumbTop = visibleHeight - thumbHeight;

  const thumbTop = scrollY.interpolate({
    inputRange: [0, maxScroll],
    outputRange: [0, maxThumbTop],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        right: 3,
        top: 0,
        bottom: 0,
        width: 3,
        opacity,
      }}
    >
      <View style={{ flex: 1 }}>
        <Animated.View
          style={{
            position: 'absolute',
            top: thumbTop,
            width: 3,
            height: thumbHeight,
            borderRadius: 2,
            backgroundColor: colors.textTertiary,
            opacity: 0.6,
          }}
        />
      </View>
    </Animated.View>
  );
}
