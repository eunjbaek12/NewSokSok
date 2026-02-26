import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Switch,
  Pressable,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme } = useTheme();
  const { authMode, user, logout } = useAuth();

  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const handleToggleTheme = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleTheme();
  };

  const handleLogout = () => {
    Alert.alert(
      '로그아웃',
      authMode === 'google'
        ? '로그아웃하면 로그인 화면으로 돌아갑니다. 클라우드 데이터는 보관됩니다.'
        : '로그아웃하면 로그인 화면으로 돌아갑니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '로그아웃',
          style: 'destructive',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            logout();
            router.replace('/login');
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>Account</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}>
            <View style={styles.rowLeft}>
              {authMode === 'google' && user?.avatarUrl ? (
                <Image
                  source={{ uri: user.avatarUrl }}
                  style={styles.avatar}
                />
              ) : (
                <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons
                    name={authMode === 'google' ? 'person' : 'phone-portrait-outline'}
                    size={18}
                    color={colors.primary}
                  />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>
                  {authMode === 'google' && user?.displayName
                    ? user.displayName
                    : '게스트 사용자'}
                </Text>
                <Text style={[styles.rowSubtitle, { color: colors.textTertiary }]}>
                  {authMode === 'google' && user?.email
                    ? user.email
                    : '로컬 저장소 사용 중'}
                </Text>
              </View>
            </View>
            {authMode === 'google' && (
              <View style={[styles.cloudBadge, { backgroundColor: colors.successLight }]}>
                <Ionicons name="cloud-done-outline" size={14} color={colors.success} />
                <Text style={[styles.cloudBadgeText, { color: colors.success }]}>동기화</Text>
              </View>
            )}
          </View>
          <Pressable style={styles.row} onPress={handleLogout}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="log-out-outline" size={18} color="#EF4444" />
              </View>
              <Text style={[styles.rowTitle, { color: '#EF4444' }]}>로그아웃</Text>
            </View>
          </Pressable>
        </View>

        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>Appearance</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="moon-outline" size={18} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Dark Mode</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textTertiary }]}>
                  {isDark ? 'Dark' : 'Light'} theme active
                </Text>
              </View>
            </View>
            <Switch
              value={isDark}
              onValueChange={handleToggleTheme}
              trackColor={{ false: colors.surfaceSecondary, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>About</Text>
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.rowTitle, { color: colors.text }]}>App Name</Text>
            </View>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>SokSok Voca</Text>
          </View>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.successLight }]}>
                <Ionicons name="code-slash-outline" size={18} color={colors.success} />
              </View>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Version</Text>
            </View>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>1.0.0</Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  sectionHeader: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  section: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  rowTitle: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    flexShrink: 1,
  },
  rowSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  rowValue: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  cloudBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cloudBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
});
