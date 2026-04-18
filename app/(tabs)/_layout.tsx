import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs, Redirect, router } from "expo-router";
import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { StartupTab } from "@/contexts/SettingsContext";

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
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 12,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Ionicons name="add" size={32} color="#FFFFFF" />
    </Pressable>
  );
}

function NativeTabLayout({ startupTab }: { startupTab: StartupTab }) {
  const { t } = useTranslation();
  return (
    <NativeTabs {...({ initialRouteName: startupTab } as any)}>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>{t('tabs.home')}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="vocab-lists">
        <Icon sf={{ default: "books.vertical", selected: "books.vertical.fill" }} />
        <Label>{t('tabs.vocabLists')}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="curation">
        <Icon sf={{ default: "square.stack", selected: "square.stack.fill" }} />
        <Label>{t('tabs.curation')}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} />
        <Label>{t('tabs.settings')}</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
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
          shadowColor: "#000",
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

  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout startupTab={startupTab} />;
  }
  return <ClassicTabLayout startupTab={startupTab} />;
}
