import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = '@soksok_onboarding_done';
const AUTH_KEY = '@soksok_auth';

export function useOnboarding() {
  const [isOnboardingDone, setIsOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const done = await AsyncStorage.getItem(ONBOARDING_KEY);

        if (done === null) {
          // 키가 없는 경우 = 앱 최초 설치
          // auth가 이미 있으면 기존 사용자(앱 업데이트) → 온보딩 스킵
          const auth = await AsyncStorage.getItem(AUTH_KEY);
          if (auth) {
            await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
            setIsOnboardingDone(true);
          } else {
            setIsOnboardingDone(false);
          }
        } else {
          // 키가 명시적으로 설정된 경우 ('true' or 'false') → 그 값 그대로 사용
          setIsOnboardingDone(done === 'true');
        }
      } catch {
        setIsOnboardingDone(true);
      }
    })();
  }, []);

  const markOnboardingDone = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    setIsOnboardingDone(true);
  };

  return { isOnboardingDone, markOnboardingDone };
}
