import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = '@soksok_onboarding_done';
const AUTH_KEY = '@soksok_auth';

interface OnboardingStoreState {
  isOnboardingDone: boolean | null;
  hydrate: () => Promise<void>;
  markOnboardingDone: () => Promise<void>;
}

export const useOnboardingStore = create<OnboardingStoreState>((set) => ({
  isOnboardingDone: null,

  hydrate: async () => {
    try {
      const done = await AsyncStorage.getItem(ONBOARDING_KEY);

      if (done === null) {
        // 키가 없는 경우 = 앱 최초 설치
        // auth가 이미 있으면 기존 사용자(앱 업데이트) → 온보딩 스킵
        const auth = await AsyncStorage.getItem(AUTH_KEY);
        if (auth) {
          await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
          set({ isOnboardingDone: true });
        } else {
          set({ isOnboardingDone: false });
        }
      } else {
        set({ isOnboardingDone: done === 'true' });
      }
    } catch {
      set({ isOnboardingDone: true });
    }
  },

  markOnboardingDone: async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    set({ isOnboardingDone: true });
  },
}));

export function useOnboarding() {
  const isOnboardingDone = useOnboardingStore((s) => s.isOnboardingDone);
  const markOnboardingDone = useOnboardingStore((s) => s.markOnboardingDone);
  return { isOnboardingDone, markOnboardingDone };
}
