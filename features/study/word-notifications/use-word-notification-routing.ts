import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useLastNotificationResponse } from 'expo-notifications';
import { useListsQuery } from '@/features/vocab';
import { WORD_NOTIFICATION_KIND, WORD_NOTIFICATION_STOP_KIND } from './notifications';

/**
 * 단어 알림을 누르면 그 단어가 든 단어장 화면을 열고 그 단어까지 내려간다(N10).
 * «곧 멈춰요» 안내는 «알림에 나올 단어» 화면으로.
 *
 * 앱에는 단어 하나로 가는 화면이 없다(단어 상세 창은 단어 추가·공유 단어장 전용이고 암기 체크도
 * 없다). 단어장 화면의 ✓가 버튼 없는 알림에서 «이 단어는 알아요»를 말하는 유일한 길이다.
 *
 * `useLastNotificationResponse` 는 앱이 꺼져 있다가 알림으로 실행된 경우도 잡는다. 콜드 스타트엔
 * 단어장 데이터가 아직 없을 수 있어, 불러온 뒤에 존재를 확인하고 연다 — 먼저 열면 지워진 단어장을
 * 빈 화면으로 연다. 같은 응답을 두 번 처리하지 않게 식별자를 기억한다.
 */
export function useWordNotificationRouting(): void {
  const lastResponse = useLastNotificationResponse();
  const { data: lists, isSuccess } = useListsQuery();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!lastResponse || !isSuccess) return;
    if (lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const request = lastResponse.notification.request;
    const data = request.content.data as { kind?: string; listId?: string; wordId?: string } | undefined;
    if (data?.kind !== WORD_NOTIFICATION_KIND && data?.kind !== WORD_NOTIFICATION_STOP_KIND) return;

    const key = `${request.identifier}:${lastResponse.notification.date}`;
    if (handled.current === key) return;
    handled.current = key;

    if (data.kind === WORD_NOTIFICATION_STOP_KIND) {
      router.push('/word-notification-source' as any);
      return;
    }

    const list = (lists ?? []).find(l => l.id === data.listId);
    if (!list) {
      // 단어장이 지워졌다 — 단어장 탭으로.
      router.navigate('/(tabs)/vocab-lists' as any);
      return;
    }
    const hasWord = !!data.wordId && list.words.some(w => w.id === data.wordId);
    router.push({
      pathname: '/list/[id]',
      params: hasWord ? { id: list.id, focusWordId: data.wordId! } : { id: list.id },
    } as any);
  }, [lastResponse, isSuccess, lists]);
}
