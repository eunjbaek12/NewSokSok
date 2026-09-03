import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { ImageBackground, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/api/client";
import { ThemeProvider, useSkinStore } from "@/features/theme";
import { useVocabBootstrap, useLists } from "@/features/vocab";
import { useAuth, useAuthStore, isCloudAuthMode } from "@/features/auth";
import { useSettings, useSettingsStore } from "@/features/settings";
import { LocaleProvider } from "@/features/locale";
import { useFonts } from "expo-font";
import { Jua_400Regular } from "@expo-google-fonts/jua";
import { GowunBatang_400Regular, GowunBatang_700Bold } from "@expo-google-fonts/gowun-batang";
import { useOnboarding, useOnboardingStore } from "@/features/onboarding";
import { useQuotaStore } from "@/features/quota";
import { reconcileSubscriptionOnLaunch } from "@/features/billing";
import { useSupportStore } from "@/features/support";
import { initAdMob } from "@/lib/ads/admob";
import { RewardedAdModal } from "@/components/ads/RewardedAdModal";
import { ProLimitReachedModal } from "@/components/ads/ProLimitReachedModal";
import "@/i18n";
import { useReviewNotificationRouting } from '@/features/study/review/use-review-notification-routing';
import { useReviewNotificationScheduler } from '@/features/study/review/use-review-notifications';

SplashScreen.preventAutoHideAsync();

// 브랜드 스플래시(splash-full.png) 노출 시간. 앱 트리는 이 뒤에서 이미 마운트되어
// hydrate·SQLite 마이그레이션·클라우드 동기화를 진행하므로, 이 시간은 초기화와
// 겹쳐 소비된다(초기화를 뒤로 미루지 않는다).
const SPLASH_MS = 1500;

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Pretendard_400Regular: require("../assets/fonts/Pretendard-Regular.otf"),
    Pretendard_500Medium: require("../assets/fonts/Pretendard-Medium.otf"),
    Pretendard_600SemiBold: require("../assets/fonts/Pretendard-SemiBold.otf"),
    Pretendard_700Bold: require("../assets/fonts/Pretendard-Bold.otf"),
    Jua_400Regular,
    // 한글 스킨 전용. 스킨을 고르지 않은 사용자도 함께 받지만, 폰트 게이트가
    // 여기 하나뿐이라 스킨별 지연 로딩을 넣으면 "폰트 준비 전 렌더" 문제를
    // 다시 열게 된다(글자 끝이 잘리던 그 버그다).
    GowunBatang_400Regular,
    GowunBatang_700Bold,
  });
  const [splashElapsed, setSplashElapsed] = useState(false);

  // 타이머는 마운트 즉시 시작한다. 스플래시 이미지 자체는 폰트가 필요 없으므로
  // 폰트 로딩(수백 ms)과 노출 시간이 겹친다 — 예전처럼 더해지지 않는다.
  useEffect(() => {
    SplashScreen.hideAsync();
    const t = setTimeout(() => setSplashElapsed(true), SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  // 폰트가 아직이면 노출 시간이 지나도 스플래시를 유지한다.
  const showSplash = !splashElapsed || !fontsLoaded;

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
                      {/* 🔴 폰트가 준비되기 전에는 화면을 그리지 않는다 — 가려져 있어도 그리면 안 된다.
                          RN Android 는 Text 의 폭을 그 시점의 Typeface 로 재는데, 커스텀 폰트가
                          아직이면 시스템 폴백(Roboto·OneUI Sans KR)으로 잰다. Pretendard 는 그보다
                          넓으므로 나중에 진짜 폰트로 그리면 글자가 상자를 넘고, 띄어쓰기가 있으면
                          마지막 낱말이 보이지 않는 둘째 줄로 넘어가고 없으면 마지막 글자가 깎인다
                          ("Google로 로그인"→"Google로", "Next"→"Nex"). 실측: `A VOCA DO` 의 상자가
                          272px 인데 이는 Roboto 글리프 199.7 + 자간 8칸 72 = 271.7 로, Pretendard 가
                          요구하는 281 이 아니라 폴백으로 잰 값이다.
                          🔴 다시 마운트하는 것으로는 못 고친다 — RN 의 텍스트 측정 캐시는 문자열과
                          스타일로만 키를 잡아서, 한번 잘못 잰 값을 프로세스가 끝날 때까지 다시 쓴다.
                          애초에 재지 않게 막는 것이 유일한 해법이다.
                          콜드 스타트는 늘지 않는다 — AppHydrators 가 이 위에 있어 hydrate·SQLite·
                          동기화는 그대로 0 초에 시작하고, 스플래시 1500ms 안에 폰트(수백 ms)가 끝난다. */}
                      {fontsLoaded && <AppStack />}
                      <ReviewNotificationScheduler />
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
      {showSplash && (
        <View
          style={[StyleSheet.absoluteFill, styles.splash]}
          // 가려진 UI가 눌리지 않도록 스플래시가 터치를 흡수한다.
          onStartShouldSetResponder={() => true}
        >
          <ImageBackground
            source={require("../assets/images/splash-full.png")}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        </View>
      )}
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
      await initAdMob();
    })();
    // 개발자 답장 확인 — 세션 1회. 게스트도 조회하므로(ticket_key 기반) 로그인
    // 여부와 무관하게 여기서 한 번 돈다. 실패는 조용히 삼킨다(배지가 안 뜰 뿐이고,
    // 문의 화면에 들어가면 다시 조회한다).
    void useSupportStore.getState().refresh();
  }, []);

  // 로그인 직후 / 토큰 갱신 직후에 quota 1회 새로고침.
  const authMode = useAuthStore(s => s.mode);
  useEffect(() => {
    if (isCloudAuthMode(authMode)) {
      useQuotaStore.getState().refresh(true);
      // 구독 갱신 반영 gap 보완: 세션당 1회, 구독 이력+만료 임박 유저만 조용히
      // 재검증(내부 자체 게이트). fire-and-forget — 실패해도 UI 영향 없음.
      void reconcileSubscriptionOnLaunch();
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

// 복습 알림 재예약을 상시 담당한다(§8). 홈 화면이 아니라 이 루트에 두는 이유:
// 설정 탭에서 시간을 바꿔도, 시작 탭이 홈이 아니어도 항상 재예약되게 하기 위해서.
// null만 반환하는 얇은 컴포넌트라 lists 구독의 리렌더가 이 컴포넌트에만 갇힌다
// (AppStack의 네비게이터가 lists 변화마다 리렌더되는 것을 피한다).
function ReviewNotificationScheduler() {
  useReviewNotificationScheduler(useLists());
  return null;
}

// quota_exceeded 발생 시 자동으로 띄우는 글로벌 보상형 광고 모달.
function GlobalRewardedAdModal() {
  const quotaExceededAt = useQuotaStore(s => s.quotaExceededAt);
  const dismiss = useQuotaStore(s => s.dismissQuotaExceeded);
  // 보상을 받은 순간 막혔던 요청을 이어서 돌린다. 모달은 여기서 닫히지 않고 성공 화면을
  // 보여주므로, 사용자가 닫을 때쯤이면 폼이 이미 채워져 있다. 등록은 한 번만 쓰고 비운다.
  const handleGranted = () => {
    const quota = useQuotaStore.getState();
    const retry = quota.retryAfterReward;
    quota.setRetryAfterReward(null);
    retry?.();
  };
  return (
    <RewardedAdModal
      visible={quotaExceededAt > 0}
      onClose={dismiss}
      onGranted={handleGranted}
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
  // 복습 알림을 탭하면 홈으로(§8.1). 콜드 스타트로 실행된 경우도 포함한다.
  useReviewNotificationRouting();
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
    // 🔴 온보딩이 아직이면 위 effect 의 온보딩 이동이 우선이다. 여기서 먼저 로그인으로
    //    보내면 최초 실행 사용자가 온보딩을 통째로 건너뛴다.
    //    inAuthScreen 검사만으로는 못 막는다 — 두 effect 가 한 커밋에서 연달아 실행되면
    //    이 시점의 segments 는 위 replace 가 반영되기 **전** 값이라 'onboarding' 이 아니고,
    //    그래서 방금 건 온보딩 이동을 로그인이 덮어쓴다. 폰트 게이트를 넣기 전에는 두 값이
    //    서로 다른 렌더에서 정착해 우연히 순서가 갈렸을 뿐이고, 게이트 이후 hydrate 가
    //    AppStack 마운트보다 먼저 끝나면서 같은 커밋에 몰렸다. 실측(Galaxy S22 · preview):
    //    게이트 없는 대조군 3/3 온보딩 · 게이트 있는 판 3/3 로그인.
    //    타이밍에 기대지 말고 순서를 값으로 못박는다.
    if (isOnboardingDone !== true) return;
    const first = segments[0] as string;
    const inAuthScreen = first === 'login' || first === 'onboarding';
    if (authMode === 'none' && !inAuthScreen) {
      router.replace('/login');
    }
  }, [authMode, authLoading, segments, isOnboardingDone]);

  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, animation: 'none' }} />
      <Stack.Screen name="login" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="list/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="fill-bare/[id]" options={{ headerShown: false }} />
      <Stack.Screen
        name="add-word"
        options={{
          presentation: "fullScreenModal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="import-csv"
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
        name="search-modal"
        options={{
          presentation: "fullScreenModal",
          headerShown: false,
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen name="study-results" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="stats" options={{ headerShown: false }} />
      <Stack.Screen name="faq" options={{ headerShown: false }} />
      <Stack.Screen name="plans" options={{ headerShown: false }} />
      <Stack.Screen name="terms" options={{ headerShown: false }} />
      <Stack.Screen name="licenses" options={{ headerShown: false }} />
      <Stack.Screen name="advanced-settings" options={{ headerShown: false }} />
      {/*
        아래 두 화면은 자기 헤더를 직접 그린다. 여기 등록을 빠뜨리면 expo-router가
        기본 네이티브 헤더에 라우트 이름("Contact", "Whats-new")을 얹어 헤더가 두 개로
        보인다 — 새 화면을 추가할 때마다 이 목록에 함께 넣을 것.
      */}
      <Stack.Screen name="contact" options={{ headerShown: false }} />
      <Stack.Screen name="whats-new" options={{ headerShown: false }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  splash: {
    backgroundColor: "#2A7B78",
    // 형제 오버레이라 Android에서는 elevation이 큰 하위 뷰(탭바 등)에 가려질 수
    // 있다. zIndex(iOS)와 elevation(Android)을 함께 올려 항상 최상단에 둔다.
    zIndex: 10,
    elevation: 10,
  },
});
