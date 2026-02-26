import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { VocabProvider } from "@/contexts/VocabContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
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
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ThemeProvider>
              <VocabProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <Stack screenOptions={{ headerBackTitle: "Back" }}>
                    <Stack.Screen name="login" options={{ headerShown: false, gestureEnabled: false }} />
                    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                    <Stack.Screen name="list/[id]" options={{ headerShown: false }} />
                    <Stack.Screen
                      name="add-word"
                      options={{
                        presentation: "formSheet",
                        sheetAllowedDetents: [0.75],
                        sheetGrabberVisible: true,
                        headerShown: false,
                      }}
                    />
                    <Stack.Screen name="study-select/[id]" options={{ headerShown: false }} />
                    <Stack.Screen name="flashcards/[id]" options={{ headerShown: false, gestureEnabled: false }} />
                    <Stack.Screen name="quiz/[id]" options={{ headerShown: false, gestureEnabled: false }} />
                    <Stack.Screen name="examples/[id]" options={{ headerShown: false, gestureEnabled: false }} />
                    <Stack.Screen
                      name="theme-generator"
                      options={{
                        presentation: "formSheet",
                        sheetAllowedDetents: [0.85],
                        sheetGrabberVisible: true,
                        headerShown: false,
                      }}
                    />
                    <Stack.Screen name="shadowing/[id]" options={{ headerShown: false, gestureEnabled: false }} />
                    <Stack.Screen name="study-results" options={{ headerShown: false, gestureEnabled: false }} />
                  </Stack>
                </GestureHandlerRootView>
              </VocabProvider>
            </ThemeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
