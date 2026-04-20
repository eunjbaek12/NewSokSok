import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

interface Props {
  total: number;
  currentIndex: number;
}

function Dot({ active }: { active: boolean }) {
  const animatedStyle = useAnimatedStyle(() => ({
    width: withSpring(active ? 20 : 8, { damping: 15, stiffness: 200 }),
    opacity: withSpring(active ? 1 : 0.35, { damping: 15, stiffness: 200 }),
  }));

  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: active ? '#6AB045' : '#6AB045' },
        animatedStyle,
      ]}
    />
  );
}

export function OnboardingDots({ total, currentIndex }: Props) {
  return (
    <View style={styles.container}>
      {Array.from({ length: total }).map((_, i) => (
        <Dot key={i} active={i === currentIndex} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
});
