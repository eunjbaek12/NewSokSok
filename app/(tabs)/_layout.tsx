import { Tabs, Redirect, router } from "expo-router";
import { BlurView } from "expo-blur";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/features/theme";
import { useAuth } from "@/features/auth";
import { useSettings } from "@/features/settings";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { StartupTab } from "@/features/settings";

function AddWordTabButton() {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => router.push('/add-word')}
      style={({ pressed }) => ({
        top: -20,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.primaryButton,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 12,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Ionicons name="add" size={32} color={colors.onPrimary} />
    </Pressable>
  );
}

function ClassicTabLayout({ startupTab }: { startupTab: StartupTab }) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      initialRouteName={startupTab}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 12,
          fontFamily: 'Pretendard_700Bold',
          marginTop: 8,
          paddingBottom: 4,
        },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isDark ? "rgba(42, 30, 15, 0.95)" : "rgba(255, 253, 245, 0.95)",
          borderTopWidth: 0.5,
          borderTopColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(59, 42, 26, 0.08)",
          elevation: 8,
          height: 64 + insets.bottom,
          bottom: 0,
          left: 0,
          right: 0,
          paddingBottom: insets.bottom,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          overflow: 'visible',
        },
        tabBarItemStyle: {
          height: 64,
          justifyContent: 'center',
          alignItems: 'center',
          paddingTop: 0,
        },
        tabBarIconStyle: {
          width: 24,
          height: 24,
          justifyContent: 'center',
          alignItems: 'center',
          marginTop: 4,
        },
        tabBarBackground: () => (
          <BlurView
            intensity={80}
            tint={isDark ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
          />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: t('tabs.home'),
          tabBarIcon: ({ color }) => (
            <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="home-outline" size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="vocab-lists"
        options={{
          tabBarLabel: t('tabs.vocabLists'),
          tabBarIcon: ({ color }) => (
            <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="library-outline" size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="add-action"
        options={{
          tabBarLabel: () => null,
          tabBarIcon: () => null,
          tabBarButton: () => <AddWordTabButton />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
          },
        }}
      />
      <Tabs.Screen
        name="curation"
        options={{
          tabBarLabel: t('tabs.curation'),
          tabBarIcon: ({ color }) => (
            <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="cloud-outline" size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarLabel: t('tabs.settings'),
          tabBarIcon: ({ color }) => (
            <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="settings-outline" size={24} color={color} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { authMode, loading } = useAuth();
  const { profileSettings, isLoading: settingsLoading } = useSettings();
  const [startupHandled, setStartupHandled] = useState(false);

  useEffect(() => {
    if (!settingsLoading && !loading && !startupHandled) {
      const tab = profileSettings.startupTab ?? 'index';
      if (tab !== 'index') {
        router.replace(`/(tabs)/${tab}` as any);
      }
      setStartupHandled(true);
    }
  }, [settingsLoading, loading, startupHandled]);

  if (loading || settingsLoading) return <View style={{ flex: 1 }} />;

  if (authMode === 'none') {
    return <Redirect href="/login" />;
  }

  const startupTab = profileSettings.startupTab ?? 'index';

  // iOS 26(Liquid Glass)에서 expo-router/unstable-native-tabs 경로는 미검증(개발 환경이
  // Windows라 iOS 로컬 실행 불가)이라 App Store 심사에서 홈 진입 시 크래시했다(반려 2.1a,
  // 2026-06-05). 게스트·구글·애플 모든 로그인이 (tabs)로 수렴하므로 이 경로가 "Get Started/
  // 로그인 버튼 → 에러"의 공통 원인. 검증된 ClassicTabLayout으로 통일. Liquid Glass 네이티브
  // 탭은 iOS 26 실기 테스트가 가능해진 뒤 별도 업데이트에서 재도입한다.
  return <ClassicTabLayout startupTab={startupTab} />;
}
