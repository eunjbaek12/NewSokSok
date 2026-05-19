import React, { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BirthdayGateScreen } from '@/features/onboarding/BirthdayGateScreen';
import { useSettings } from '@/features/settings';
import { applyAdMobChildTags } from '@/lib/ads/admob';

export default function AgeGateRoute() {
  const params = useLocalSearchParams<{ from?: string }>();
  const context: 'onboarding' | 'migration' = params.from === 'onboarding' ? 'onboarding' : 'migration';
  const { updateProfileSettings } = useSettings();

  // 게이트 화면에선 하드웨어 back 차단 — 입력 안 하고 빠져나가지 못하게.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const handleSubmit = async (birthday: string, isUnder14: boolean) => {
    await updateProfileSettings({
      birthday,
      isUnder14,
      birthdaySetAt: Date.now(),
    });
    await applyAdMobChildTags({ isUnder14 });
    if (context === 'onboarding') {
      router.replace('/login');
    } else {
      router.replace('/(tabs)' as any);
    }
  };

  return <BirthdayGateScreen context={context} onSubmit={handleSubmit} />;
}
