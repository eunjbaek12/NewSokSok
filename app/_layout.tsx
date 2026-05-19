import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { ImageBackground, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/api/client";
import { ThemeProvider, useSkinStore } from "@/features/theme";
import { useVocabBootstrap } from "@/features/vocab";
import { useAuth, useAuthStore } from "@/features/auth";
import { useSettings, useSettingsStore } from "@/features/settings";
import { LocaleProvider } from "@/features/locale";
import { useFonts } from "expo-font";
import { Jua_400Regular } from "@expo-google-fonts/jua";
import { useOnboarding, useOnboardingStore } from "@/features/onboarding";
import { useQuotaStore } from "@/features/quota";
import { initAdMob, applyAdMobChildTags } from "@/lib/ads/admob";
import { RewardedAdModal } from "@/components/ads/RewardedAdModal";
import { ProLimitReachedModal } from "@/components/ads/ProLimitReachedModal";
import { useAdsAllowed } from "@/components/ads/AppBannerAd";
import { isUnder14From } from "@/lib/age";
import "@/i18n";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Pretendard_400Regular: require("../assets/fonts/Pretendard-Regular.otf"),
    Pretendard_500Medium: require("../assets/fonts/Pretendard-Medium.otf"),
    Pretendard_600SemiBold: require("../assets/fonts/Pretendard-SemiBold.otf"),
    Pretendard_700Bold: require("../assets/fonts/Pretendard-Bold.otf"),
    Jua_400Regular,
  });
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      const t = setTimeout(() => setSplashDone(true), 1500);
      return () => clearTimeout(t);
    }
  }, [fontsLoaded]);

  if (!splashDone) {
    return (
      <ImageBackground
        source={require("../assets/images/splash-full.png")}
        style={styles.splash}
        resizeMode="cover"
      />
    );
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <LocaleProvider>
          <QueryClientProvider client={queryClient}>
            <AppHydrators>
              <ThemeProvider>
                <VocabBootstrapper>
                  <KeyboardProvider>
                    <GestureHandlerRootView style={{ flex: 1 }}>
                      <AppStack />
                      <GlobalRewardedAdModal />
                      <GlobalProLimitReachedModal />
                    </GestureHandlerRootView>
                  </KeyboardProvider>
                </VocabBootstrapper>
              </ThemeProvider>
            </AppHydrators>
          </QueryClientProvider>
        </LocaleProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

function AppHydrators({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    (async () => {
      await Promise.all([
        useAuthStore.getState().hydrate(),
        useSettingsStore.getState().hydrate(),
        useOnboardingStore.getState().hydrate(),
        useSkinStore.getState().hydrate(),
      ]);
      // birthday가 있으면 만 14세 도달 여부 매 cold start마다 재계산 (자동 해제).
      const settings = useSettingsStore.getState();
      const profile = settings.profileSettings;
      if (profile.birthday) {
        const derived = isUnder14From(profile.birthday);
        if (derived !== profile.isUnder14) {
          await settings.updateProfileSettings({ isUnder14: derived });
        }
      }
      await initAdMob();
    })();
  }, []);

  // isUnder14 변경 감지 → AdMob 태그 즉시 재설정. setRequestConfiguration은 호출 후 광고 요청부터 적용.
  const isUnder14 = useSettingsStore(s => s.profileSettings.isUnder14);
  const settingsLoading = useSettingsStore(s => s.isLoading);
  useEffect(() => {
    if (settingsLoading) return;
    applyAdMobChildTags({ isUnder14 }).catch(() => {});
  }, [isUnder14, settingsLoading]);

  // 로그인 직후 / 토큰 갱신 직후에 quota 1회 새로고침.
  const authMode = useAuthStore(s => s.mode);
  useEffect(() => {
    if (authMode === 'google') {
      useQuotaStore.getState().refresh(true);
    } else {
      useQuotaStore.getState().clear();
    }
  }, [authMode]);

  return <>{children}</>;
}

function VocabBootstrapper({ children }: { children: React.ReactNode }) {
  useVocabBootstrap();
  return <>{children}</>;
}

// quota_exceeded 발생 시 자동으로 띄우는 글로벌 보상형 광고 모달.
function GlobalRewardedAdModal() {
  const quotaExceededAt = useQuotaStore(s => s.quotaExceededAt);
  const dismiss = useQuotaStore(s => s.dismissQuotaExceeded);
  const adsAllowed = useAdsAllowed();
  return (
    <RewardedAdModal
      visible={adsAllowed && quotaExceededAt > 0}
      onClose={dismiss}
      onGranted={() => { /* 사용자가 모달 닫고 다시 enrich 시도 — v1.2에 자동 재시도 검토 */ }}
    />
  );
}

// Pro 사용자가 일 한도 초과 시 안내 모달. 광고 시청 흐름 없음 (Pro 약속 무결성).
function GlobalProLimitReachedModal() {
  const proLimitReachedAt = useQuotaStore(s => s.proLimitReachedAt);
  const dismiss = useQuotaStore(s => s.dismissProLimitReached);
  return (
    <ProLimitReachedModal
      visible={proLimitReachedAt > 0}
      onClose={dismiss}
    />
  );
}

function AppStack() {
  const { inputSettings } = useSettings();
  const { isOnboardingDone } = useOnboarding();
  const { authMode, loading: authLoading } = useAuth();
  const profileSettings = useSettingsStore(s => s.profileSettings);
  const settingsLoading = useSettingsStore(s => s.isLoading);
  const segments = useSegments();

  useEffect(() => {
    if (isOnboardingDone === null) return;
    if (!isOnboardingDone) {
      router.replace('/onboarding' as any);
    }
  }, [isOnboardingDone]);

  // 기존 사용자(자동 isOnboardingDone=true)와 v1.0 토글러 마이그레이션 — birthday 없으면 age-gate.
  useEffect(() => {
    if (!isOnboardingDone) return;
    if (settingsLoading) return;
    if (profileSettings.birthday) return;
    const first = segments[0] as string;
    if (first !== 'age-gate' && first !== 'onboarding') {
      router.replace('/age-gate' as any);
    }
  }, [isOnboardingDone, settingsLoading, profileSettings.birthday, segments]);

  useEffect(() => {
    if (authLoading) return;
    const first = segments[0] as string;
    const inAuthScreen = first === 'login' || first === 'onboarding' || first === 'age-gate';
    if (authMode === 'none' && !inAuthScreen) {
      router.replace('/login');
    }
  }, [authMode, authLoading, segments]);

  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, animation: 'none' }} />
      <Stack.Screen name="age-gate" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="login" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="list/[id]" options={{ headerShown: false }} />
      <Stack.Screen
        name="add-word"
        options={{
          presentation: "fullScreenModal",
          headerShown: false,
        }}
      />

      <Stack.Screen name="plan/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="flashcards/[id]" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="quiz/[id]" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="examples/[id]" options={{ headerShown: false, gestureEnabled: false, fullScreenGestureEnabled: false }} />
      <Stack.Screen name="autoplay/[id]" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen
        name="theme-generator"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.85],
          sheetGrabberVisible: true,
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="search-modal"
        options={{
          presentation: "fullScreenModal",
          headerShown: false,
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen name="study-results" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="faq" options={{ headerShown: false }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: "#2A7B78",
  },
});
