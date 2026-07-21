import { useCallback, useEffect, useRef, useState } from 'react';
import type { VocaList } from '@/lib/types';
import { useSettingsStore } from '@/features/settings';
import { ensureReviewChannel, syncReviewNotifications } from './notifications';

/**
 * 복습 알림 일정을 현재 데이터·설정에 붙들어 둔다(§8) — **상시 마운트 지점에서만** 부른다.
 *
 * 왜 홈이 아니라 앱 루트인가: 재예약을 홈 화면에 두면 "설정 탭에서 시간을 바꿔도 홈이
 * 마운트돼 있어야만 반영되는" 결합이 생긴다. 시작 탭이 홈이 아니면 그 세션엔 재예약이
 * 아예 일어나지 않아 바뀐 시각이 적용되지 않는다. `lists`는 React Query 전역 캐시라
 * 어느 컴포넌트에서든 읽을 수 있으므로, 항상 살아 있는 루트(app/_layout.tsx의 AppStack
 * 옆)에 두어 탭 위치와 무관하게 일정을 유지한다.
 */
export function useReviewNotificationScheduler(lists: VocaList[]) {
  const settings = useSettingsStore(s => s.reviewNotificationSettings);
  const isLoading = useSettingsStore(s => s.isLoading);

  useEffect(() => {
    void ensureReviewChannel();
  }, []);

  /**
   * 데이터·설정이 바뀔 때마다 일정을 다시 건다.
   *
   * 디바운스하는 이유: `lists`는 단어 추가·편집·학습 커밋·동기화 pull마다 새 배열이 되고,
   * 커밋 하나가 mutation 여러 개를 연쇄시켜 짧은 시간에 여러 번 바뀐다. 매번 계획을
   * 다시 세우면(단어 수 × 15일) 낭비라 잠잠해진 뒤 한 번만 돈다. (설정 변경은 드물어
   * 이 디바운스에 갇힐 일이 없지만, 즉시성이 필요한 설정 화면은 명시적으로 한 번 더
   * 재예약한다 — app/(tabs)/settings.tsx.)
   */
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isLoading) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void syncReviewNotifications(lists, settings).catch(e =>
        console.warn('[review-notif] schedule failed:', e?.message ?? e),
      );
    }, 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isLoading, lists, settings]);
}

/**
 * 첫 복습이 생긴 날 권한 soft ask를 띄운다(§8.4) — **홈 화면에서만** 부른다(시트가 홈에 뜬다).
 *
 * 첫 복습이 준비된 순간에만 묻는다: 홈에 배너가 이미 떠 있고, 아직 물어본 적 없고,
 * 켜져 있지 않을 때. 설정 hydrate 전에는 `softAsked`가 기본값(false)이라 이미 거절한
 * 사용자에게 시트가 번쩍이므로 로딩이 끝날 때까지 기다린다.
 */
export function useReviewSoftAsk(dueCount: number) {
  const settings = useSettingsStore(s => s.reviewNotificationSettings);
  const isLoading = useSettingsStore(s => s.isLoading);
  const updateSettings = useSettingsStore(s => s.updateReviewNotificationSettings);

  const [softAskVisible, setSoftAskVisible] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (dueCount <= 0) return;
    if (settings.softAsked || settings.enabled) return;
    setSoftAskVisible(true);
  }, [isLoading, dueCount, settings.softAsked, settings.enabled]);

  const handleSoftAskDecided = useCallback(
    async (granted: boolean) => {
      setSoftAskVisible(false);
      // "나중에"든 시스템 창 거절이든 softAsked는 true — 다시 조르지 않는다.
      await updateSettings({ softAsked: true, enabled: granted });
    },
    [updateSettings],
  );

  return { softAskVisible, handleSoftAskDecided };
}
