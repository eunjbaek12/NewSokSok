import { View, Text } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';

export default function ShadowingScreen() {
    const { id } = useLocalSearchParams();
    const { colors } = useTheme();

    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
            <Text style={{ color: colors.text }}>섀도잉 기능 준비 중</Text>
        </View>
    );
}
