import React from 'react';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';

interface ToggleProps {
    value: boolean;
    onValueChange: (v: boolean) => void;
    activeColor?: string;
}

export default function Toggle({ value, onValueChange, activeColor = '#4A7DFF' }: ToggleProps) {
    const { isDark } = useTheme();

    const thumbStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: withTiming(value ? 14 : 0, { duration: 200 }) }],
    }));

    const trackStyle = useAnimatedStyle(() => ({
        backgroundColor: withTiming(value ? activeColor : (isDark ? '#374151' : '#E5E7EB'), { duration: 200 }),
    }));

    return (
        <Pressable onPress={() => onValueChange(!value)} style={{ padding: 4 }}>
            <Animated.View style={[{
                width: 30,
                height: 16,
                borderRadius: 8,
                justifyContent: 'center',
                paddingHorizontal: 2,
            }, trackStyle]}>
                <Animated.View style={[{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: '#FFF',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 1,
                    elevation: 1,
                }, thumbStyle]} />
            </Animated.View>
        </Pressable>
    );
}
