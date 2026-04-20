import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/api/client";
import { ThemeProvider } from "@/features/theme";
import { useVocabBootstrap } from "@/features/vocab";
import { useAuth, useAuthStore } from "@/features/auth";
import { useSettings, useSettingsStore } from "@/features/settings";
import { LocaleProvider } from "@/features/locale";
import { useFonts } from "expo-font";
import { useOnboarding, useOnboardingStore } from "@/features/onboarding";
import "@/i18n";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Pretendard_400Regular: require("../assets/fonts/Pretendard-Regular.otf"),
    Pretendard_500Medium: require("../assets/fonts/Pretendard-Medium.otf"),
    Pretendard_600SemiBold: require("../assets/fonts/Pretendard-SemiBold.otf"),
    Pretendard_700Bold: require("../assets/fonts/Pretendard-Bold.otf"),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <LocaleProvider>
          <QueryClientProvider client={queryClient}>
            <AppHydrators>
              <ThemeProvider>
                <VocabBootstrapper>
                  <GestureHandlerRootView style={{ flex: 1 }}>
                    <AppStack />
                  </GestureHandlerRootView>
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
    useAuthStore.getState().hydrate();
    useSettingsStore.getState().hydrate();
    useOnboardingStore.getState().hydrate();
  }, []);
  return <>{children}</>;
}

function VocabBootstrapper({ children }: { children: React.ReactNode }) {
  useVocabBootstrap();
  return <>{children}</>;
}

function AppStack() {
  const { inputSettings } = useSettings();
  const { isOnboardingDone } = useOnboarding();
  const { authMode, loading: authLoading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (isOnboardingDone === null) return;
    if (!isOnboardingDone) {
      router.replace('/onboarding' as any);
    }
  }, [isOnboardingDone]);

  useEffect(() => {
    if (authLoading) return;
    const first = segments[0] as string;
    const inAuthScreen = first === 'login' || first === 'onboarding';
    if (authMode === 'none' && !inAuthScreen) {
      router.replace('/login');
    }
  }, [authMode, authLoading, segments]);

  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, animation: 'none' }} />
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
    </Stack>
  );
}
