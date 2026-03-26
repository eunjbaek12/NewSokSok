import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

interface ProgressBarProps {
  percent: number;
  colors: any;
}

export default function ProgressBar({ percent, colors }: ProgressBarProps) {
  const animWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: percent,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [percent]);

  const widthInterpolated = animWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSecondary }]}>
      <Animated.View
        style={[
          styles.progressFill,
          {
            width: widthInterpolated,
            backgroundColor: percent === 100 ? colors.success : colors.primary,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
});
