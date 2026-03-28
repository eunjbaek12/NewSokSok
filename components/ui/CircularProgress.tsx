import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

interface CircularProgressProps {
    size: number;
    strokeWidth: number;
    memorized: number;
    total: number;
    trackColor: string;
    progressColor: string;
    successColor: string;
    textColor: string;
    secondaryTextColor: string;
}

export default function CircularProgress({
    size,
    strokeWidth,
    memorized,
    total,
    trackColor,
    progressColor,
    successColor,
    textColor,
    secondaryTextColor,
}: CircularProgressProps) {
    const radius = (size / 2) - strokeWidth;
    const circumference = 2 * Math.PI * radius;
    const percent = total > 0 ? Math.min(memorized / total, 1) : 0;
    const dashOffset = circumference * (1 - percent);
    const isComplete = percent >= 1;
    const strokeColor = isComplete ? successColor : progressColor;

    const cx = size / 2;
    const cy = size / 2;

    return (
        <View style={{ width: size, height: size }}>
            <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
                <Circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    stroke={trackColor}
                    strokeWidth={strokeWidth}
                    fill="none"
                />
                {percent > 0 && (
                    <Circle
                        cx={cx}
                        cy={cy}
                        r={radius}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        fill="none"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashOffset}
                        strokeLinecap="round"
                        rotation="-90"
                        origin={`${cx}, ${cy}`}
                    />
                )}
            </Svg>
            <View style={[StyleSheet.absoluteFill, styles.center]}>
                {isComplete ? (
                    <Ionicons name="checkmark-circle" size={size * 0.4} color={successColor} />
                ) : (
                    <>
                        <Text
                            style={[styles.fractionText, { fontSize: size * 0.15, color: secondaryTextColor }]}
                            numberOfLines={1}
                        >
                            {memorized}/{total}
                        </Text>
                        <Text
                            style={[styles.percentText, { fontSize: size * 0.22, color: textColor }]}
                            numberOfLines={1}
                        >
                            {Math.round(percent * 100)}%
                        </Text>
                    </>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    center: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    fractionText: {
        fontFamily: 'Pretendard_500Medium',
        letterSpacing: -0.3,
    },
    percentText: {
        fontFamily: 'Pretendard_700Bold',
        marginTop: -1,
        letterSpacing: -0.5,
    },
});
