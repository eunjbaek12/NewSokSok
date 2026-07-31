import { useEffect } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useLastNotificationResponse } from 'expo-notifications';
import { REVIEW_NOTIFICATION_KIND } from './notifications';

/**
 * 복습 알림을 탭하면 홈으로 보낸다(§8.1) — 거기 복습 배너가 있다.
 *
 * 세션으로 직행하지 않고 홈에 내려놓는 이유: 알림에 적힌 개수와 실제 목록이 어긋날 수
 * 있고(다른 기기에서 학습했거나 발사 후 시간이 지난 경우), 배너가 그 순간의 진짜 수를
 * 보여준 뒤 사용자가 탭하게 하는 편이 정직하다. 탭 한 번이 더 들지만 어차피 원탭이다.
 *
 * `useLastNotificationResponse`는 **앱이 꺼져 있다가 알림으로 실행된 경우**도 잡아준다 —
 * 리스너만 달면 콜드 스타트에서 이미 지나간 이벤트를 놓친다.
 */
export function useReviewNotificationRouting(): void {
  const lastResponse = useLastNotificationResponse();

  useEffect(() => {
    if (!lastResponse) return;
    const data = lastResponse.notification.request.content.data as { kind?: string } | undefined;
    if (data?.kind !== REVIEW_NOTIFICATION_KIND) return;
    if (lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    // 홈(= (tabs)의 index)으로 보낸다. index 라우트의 유효한 href는 '/'뿐이다 —
    // '/(tabs)/index'는 expo-router에 존재하지 않는 경로라(생성된 라우트 타입도
    // `/(tabs)` | `/`만 노출한다) +not-found("페이지를 찾을 수 없어요")로 떨어진다.
    // 시작 탭을 "단어장"으로 바꿔 둔 사용자가 알림을 눌러도 홈 복습 배너에 닿게 하려는
    // 것이고, 시작 탭 replace와의 경합은 (tabs)/_layout.tsx가 fromReviewNotification일
    // 때 initialRouteName을 index로 고정하고 replace를 건너뛰어 이미 막고 있다.
    // (`as any`를 붙이지 않는다 — 그 캐스팅이 잘못된 경로를 통과시켜 이 버그를 냈다.)
    router.navigate('/');
  }, [lastResponse]);
}
