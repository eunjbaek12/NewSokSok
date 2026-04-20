import { View, Text } from 'react-native';
import { useTheme } from '@/features/theme';

export default function ThemeGeneratorScreen() {
    const { colors } = useTheme();

    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
            <Text style={{ color: colors.text }}>테마 생성 기능 준비 중</Text>
        </View>
    );
}
