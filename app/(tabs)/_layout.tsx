import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs, Redirect } from "expo-router";
import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>홈</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="curation">
        <Icon sf={{ default: "square.stack", selected: "square.stack.fill" }} />
        <Label>단어 모음</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} />
        <Label>설정</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: colors.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          elevation: 20,
          height: 64, // Unified height
          bottom: insets.bottom, // Lift above system bar
          left: 0,
          right: 0,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          paddingBottom: 0,
        },
        tabBarItemStyle: {
          height: 64,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontFamily: 'Pretendard_600SemiBold',
          marginBottom: 10,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "홈",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="curation"
        options={{
          title: "단어 모음",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "albums" : "albums-outline"} size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "설정",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "settings" : "settings-outline"} size={28} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { authMode, loading } = useAuth();

  if (loading) return <View style={{ flex: 1 }} />;

  if (authMode === 'none') {
    return <Redirect href="/login" />;
  }

  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
