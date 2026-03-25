import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
    useSharedValue,
    useAnimatedProps,
    withTiming,
    cancelAnimation,
    Easing,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface TimerRingProps {
    isPlaying: boolean;
    totalDuration: number;
    resetKey: number;
    size: number;
    strokeWidth: number;
    color: string;
    bgColor: string;
    children: React.ReactNode;
}

export default function TimerRing({
    isPlaying,
    totalDuration,
    resetKey,
    size,
    strokeWidth,
    color,
    bgColor,
    children,
}: TimerRingProps) {
    const radius = (size / 2) - strokeWidth;
    const circumference = 2 * Math.PI * radius;

    const progress = useSharedValue(0);

    useEffect(() => {
        if (isPlaying) {
            progress.value = 0;
            progress.value = withTiming(1, {
                duration: totalDuration,
                easing: Easing.linear,
            });
        } else {
            cancelAnimation(progress);
        }
    }, [resetKey, isPlaying]);

    const animatedProps = useAnimatedProps(() => ({
        strokeDashoffset: circumference * progress.value,
    }));

    const cx = size / 2;
    const cy = size / 2;

    return (
        <View style={{ width: size, height: size }}>
            <Svg
                width={size}
                height={size}
                style={StyleSheet.absoluteFill}
            >
                {/* Background track */}
                <Circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    stroke={bgColor}
                    strokeWidth={strokeWidth}
                    fill="none"
                />
                {/* Animated progress ring */}
                <AnimatedCircle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeDasharray={circumference}
                    animatedProps={animatedProps}
                    strokeLinecap="round"
                    rotation="-90"
                    origin={`${cx}, ${cy}`}
                />
            </Svg>
            {/* Children centered */}
            <View style={[StyleSheet.absoluteFill, styles.childrenWrapper]}>
                {children}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    childrenWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});
