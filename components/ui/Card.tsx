import React, { ComponentProps } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

interface CardProps extends ComponentProps<typeof View> {
    style?: ViewStyle | ViewStyle[];
    ref?: React.Ref<View>;
}

export function Card({
    ref,
    children,
    style,
    ...props
}: CardProps) {
    const { colors } = useTheme();

    return (
        <View
            ref={ref}
            style={[
                styles.card,
                {
                    backgroundColor: colors.surface,
                    shadowColor: colors.cardShadow || '#000',
                },
                style,
            ]}
            {...props}
        >
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 20,
        padding: 20,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 4,
    },
});
