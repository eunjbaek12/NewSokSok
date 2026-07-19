import { useCallback, useEffect, useRef, useState } from 'react';
import type { VocaList } from '@/lib/types';
import { useSettingsStore } from '@/features/settings';
import { ensureReviewChannel, syncReviewNotifications } from './notifications';

/**
 * 복습 알림을 현재 데이터에 붙들어 두고, 첫 복습이 생긴 날 soft ask를 띄운다(§8).
 * 홈 화면에서 한 번만 사용한다.
 */
export function useReviewNotifications(lists: VocaList[], dueCount: number) {
  const settings = useSettingsStore(s => s.reviewNotificationSettings);
  const isLoading = useSettingsStore(s => s.isLoading);
  const updateSettings = useSettingsStore(s => s.updateReviewNotificationSettings);

  const [softAskVisible, setSoftAskVisible] = useState(false);

  useEffect(() => {
    void ensureReviewChannel();
  }, []);

  /**
   * 첫 복습이 준비된 순간에만 묻는다(§8.4): 홈에 배너가 이미 떠 있고, 아직 물어본 적 없고,
   * 켜져 있지 않을 때. 설정 hydrate 전에는 `softAsked`가 기본값(false)이라 이미 거절한
   * 사용자에게 시트가 번쩍이므로 로딩이 끝날 때까지 기다린다.
   */
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

  /**
   * 데이터·설정이 바뀔 때마다 일정을 다시 건다.
   *
   * 디바운스하는 이유: `lists`는 단어 추가·편집·학습 커밋·동기화 pull마다 새 배열이 되고,
   * 커밋 하나가 mutation 여러 개를 연쇄시켜 짧은 시간에 여러 번 바뀐다. 매번 계획을
   * 다시 세우면(단어 수 × 15일) 낭비라 잠잠해진 뒤 한 번만 돈다.
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

  return { softAskVisible, handleSoftAskDecided };
}
