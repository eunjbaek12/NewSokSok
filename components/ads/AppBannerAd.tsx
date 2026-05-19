// 광고 배너 — 가드/플랫폼 분기를 자체 처리.
// Pro / 트라이얼 / 14세 미만 사용자에겐 null 반환.
//
// 사용 패턴:
//   1. 탭 화면(메인 화면): mode="tab-anchor"로 탭바 위에 absolute 고정.
//      ScrollView paddingBottom = 기존 탭바 공간 + BANNER_SLOT_HEIGHT.
//   2. 학습 화면: mode="bottom-anchor"로 답 버튼 영역 위에 16dp 간격으로 absolute.
//      답 버튼 측 paddingBottom = insets.bottom + BANNER_SLOT_HEIGHT + 16.
//   3. inline: 일반 흐름 안에 배너 (예: 모달 등). 가드만 받는 단순 BannerAd.

import React, { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { useQuota } from '@/features/quota';
import { useAuth } from '@/features/auth';
import { useSettings } from '@/features/settings';
import { AD_UNIT_BANNER, isAdsAllowed } from '@/lib/ads/admob';

/**
 * BannerAdSize.BANNER (320x50) 기준 배너 슬롯 높이.
 * ANCHORED_ADAPTIVE_BANNER는 기기마다 가변이라 레이아웃 계산이 불안정 →
 * 일관성·간격 계산 단순화를 위해 BANNER로 통일.
 */
export const BANNER_SLOT_HEIGHT = 50;

/** ClassicTabLayout의 tabBar 높이 (insets.bottom 미포함). */
export const TAB_BAR_HEIGHT = 64;

interface Props {
  mode?: 'tab-anchor' | 'bottom-anchor' | 'inline';
}

/**
 * 광고 노출 여부를 판단하는 단일 진입점.
 * AppBannerAd와 useAdsBottomInset이 공유.
 */
export function useAdsAllowed(): boolean {
  const { authMode } = useAuth();
  const { status } = useQuota();
  const { profileSettings } = useSettings();
  const isUnder14 = profileSettings.isUnder14 === true;

  return useMemo(() => {
    if (Platform.OS === 'web') return false;
    // 게스트는 quota 정보 없음 → tier=null → Free 동급으로 광고 노출
    const tier = authMode === 'google' ? (status?.tier ?? null) : null;
    return isAdsAllowed({ tier, isUnder14 });
  }, [authMode, status?.tier, isUnder14]);
}

/**
 * 학습 화면의 답 버튼/컨트롤 영역에 추가해야 할 paddingBottom 보정값.
 * 배너가 화면 하단에 mode="bottom-anchor"로 떠 있을 때, 답 영역이 배너 위로 16dp 간격을 두도록.
 *
 * 사용 예: paddingBottom: insets.bottom + 36 + useAdsBottomInset()
 */
export function useAdsBottomInset(): number {
  const allowed = useAdsAllowed();
  return allowed ? BANNER_SLOT_HEIGHT + 16 : 0;
}

export function AppBannerAd({ mode = 'inline' }: Props) {
  const allowed = useAdsAllowed();
  const insets = useSafeAreaInsets();

  if (!allowed) return null;

  const banner = <BannerAd unitId={AD_UNIT_BANNER} size={BannerAdSize.BANNER} />;

  if (mode === 'tab-anchor') {
    // ClassicTabLayout: 탭바 바로 위
    return (
      <View
        pointerEvents="box-none"
        style={[styles.anchor, { bottom: insets.bottom + TAB_BAR_HEIGHT }]}
      >
        {banner}
      </View>
    );
  }

  if (mode === 'bottom-anchor') {
    // 학습 화면: 답 버튼 영역 위. safe area 위에 직접 배치.
    return (
      <View
        pointerEvents="box-none"
        style={[styles.anchor, { bottom: insets.bottom }]}
      >
        {banner}
      </View>
    );
  }

  return <View style={styles.inline}>{banner}</View>;
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    height: BANNER_SLOT_HEIGHT,
    justifyContent: 'center',
  },
  inline: {
    alignItems: 'center',
    justifyContent: 'center',
    height: BANNER_SLOT_HEIGHT,
  },
});
