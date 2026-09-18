import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { VocaList } from '@/lib/types';
import { useSettingsStore } from '@/features/settings';
import { useForegroundCount } from '@/hooks/useForegroundCount';
import { ensureWordChannel, syncWordNotifications } from './notifications';

/**
 * 단어 알림 일정을 지금 데이터·설정에 붙들어 둔다 — 복습 알림 스케줄러와 같은 자리(앱 루트)에서만 부른다.
 *
 * 다시 예약하는 때: 단어장 데이터 · 설정 · 앱 언어가 바뀔 때, 앱을 새로 켤 때, **앱을 다시 열 때**.
 * 마지막 것이 없으면 공부 없이 열기만 하는 사람의 예약이 9일 반 뒤 끊겨, 설정 화면의 «한 번 열면
 * 다시 이어져요»가 거짓말이 된다. 언어는 «곧 멈춰요» 안내 문구가 예약 순간 굳기 때문에 넣는다.
 */
export function useWordNotificationScheduler(lists: VocaList[]) {
  const settings = useSettingsStore(s => s.wordNotificationSettings);
  const isLoading = useSettingsStore(s => s.isLoading);
  const { i18n } = useTranslation();
  const language = i18n.language;
  const foreground = useForegroundCount();

  useEffect(() => {
    void ensureWordChannel();
  }, [language]);

  // lists 는 학습 커밋 하나에도 여러 번 바뀐다 — 잠잠해진 뒤 한 번만(복습 알림과 같은 1.5초).
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isLoading) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void syncWordNotifications(lists, settings).catch(e =>
        console.warn('[word-notif] schedule failed:', e?.message ?? e),
      );
    }, 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isLoading, lists, settings, language, foreground]);
}
