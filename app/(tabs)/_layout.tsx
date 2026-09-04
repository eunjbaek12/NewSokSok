import { Tabs, Redirect, router } from "expo-router";
import { BlurView } from "expo-blur";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/features/theme";
import { useAuth } from "@/features/auth";
import { useOnboarding } from "@/features/onboarding";
import { useSettings } from "@/features/settings";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLastNotificationResponse } from "expo-notifications";
import type { StartupTab } from "@/features/settings";
import { REVIEW_NOTIFICATION_KIND } from "@/features/study/review/notifications";

function AddWordTabButton() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('addWord.addWordTitle')}
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
  const { isOnboardingDone } = useOnboarding();
  const [startupHandled, setStartupHandled] = useState(false);

  // 복습 알림을 눌러 실행된 세션은 시작 탭 설정을 무시하고 홈으로 연다(§8.1) — 복습 배너는
  // 홈에만 있어서, 시작 탭을 "단어장"으로 바꿔 둔 사용자가 알림을 눌러도 아무 일도 일어나지
  // 않은 것처럼 보인다. 알림 없이 실행하면 lastResponse가 비어 있어 시작 탭이 그대로 동작하고,
  // 백그라운드 복귀는 startupHandled가 이미 true라 이 분기를 타지 않는다.
  const lastResponse = useLastNotificationResponse();
  const fromReviewNotification =
    (lastResponse?.notification.request.content.data as { kind?: string } | undefined)?.kind ===
    REVIEW_NOTIFICATION_KIND;

  useEffect(() => {
    if (!settingsLoading && !loading && !startupHandled) {
      const tab = profileSettings.startupTab ?? 'index';
      if (tab !== 'index' && !fromReviewNotification) {
        router.replace(`/(tabs)/${tab}` as any);
      }
      setStartupHandled(true);
    }
  }, [settingsLoading, loading, startupHandled, fromReviewNotification]);

  if (loading || settingsLoading || isOnboardingDone === null) return <View style={{ flex: 1 }} />;

  // 🔴 온보딩이 먼저다. 최초 실행의 초기 라우트는 (tabs) 라서 이 레이아웃이 먼저 그려지는데,
  //    여기서 곧장 로그인으로 보내면 온보딩을 통째로 건너뛴다. 루트의 온보딩 이동은 effect 라
  //    **선언형 Redirect 를 이기지 못한다** — 같은 커밋이면 이쪽이 확정된다.
  //    폰트 게이트를 넣기 전에는 이 레이아웃이 loading 중이라 빈 화면을 돌려주는 동안 루트
  //    effect 가 먼저 움직여 우연히 온보딩이 이겼을 뿐이고, 게이트 이후 hydrate 가 마운트보다
  //    먼저 끝나면서 첫 렌더에 바로 Redirect 가 나가 순서가 뒤집혔다.
  //    실측(Galaxy S22 · preview): 게이트 없는 대조군 3/3 온보딩 · 게이트 3/3 로그인.
  if (isOnboardingDone === false) {
    return <Redirect href={'/onboarding' as any} />;
  }

  if (authMode === 'none') {
    return <Redirect href="/login" />;
  }

  // 알림으로 열린 세션은 네비게이터 자체를 홈에서 시작시킨다. 위 replace만으로는
  // initialRouteName이 이미 다른 탭으로 확정된 뒤라 홈에 닿지 못할 수 있다.
  const startupTab = fromReviewNotification ? 'index' : (profileSettings.startupTab ?? 'index');

  // iOS 26(Liquid Glass)에서 expo-router/unstable-native-tabs 경로는 미검증(개발 환경이
  // Windows라 iOS 로컬 실행 불가)이라 App Store 심사에서 홈 진입 시 크래시했다(반려 2.1a,
  // 2026-06-05). 게스트·구글·애플 모든 로그인이 (tabs)로 수렴하므로 이 경로가 "Get Started/
  // 로그인 버튼 → 에러"의 공통 원인. 검증된 ClassicTabLayout으로 통일. Liquid Glass 네이티브
  // 탭은 iOS 26 실기 테스트가 가능해진 뒤 별도 업데이트에서 재도입한다.
  return <ClassicTabLayout startupTab={startupTab} />;
}
