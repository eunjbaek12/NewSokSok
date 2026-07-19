/**
 * 복습 로컬 알림 — expo-notifications 래퍼. 설계: docs/gentle-srs-design.md §8.
 *
 * 계획(어느 날 몇 개)은 순수 모듈 `./notification-plan`이 담당하고, 여기서는 OS에 거는
 * 부수효과만 다룬다. 서버·푸시 인프라는 쓰지 않는다 — 전부 로컬 스케줄이다.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import i18n from '@/i18n';
import type { VocaList } from '@/lib/types';
import type { ReviewNotificationSettings } from '@shared/contracts';
import { planReviewNotifications } from './notification-plan';

/**
 * 우리가 건 알림만 골라내는 표식. 다른 기능이 알림을 추가하더라도 `cancelAll`로
 * 남의 알림까지 지우지 않기 위해 데이터에 태그를 심고 그 태그로만 취소한다.
 * 탭 라우팅(use-review-notification-routing)도 이 표식으로 우리 알림을 식별한다.
 */
export const REVIEW_NOTIFICATION_KIND = 'gentle-srs-review';
const REVIEW_TAG = REVIEW_NOTIFICATION_KIND;

const ANDROID_CHANNEL_ID = 'review';

/**
 * 알림 표시 방식. 앱이 떠 있을 때는 배너를 띄우지 않는다 — 이미 앱을 보고 있는
 * 사용자에게 "앱을 열어보세요"는 무의미하고, 홈 배너가 그 자리에 이미 있다.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Android는 채널이 없으면 알림이 조용히 사라진다. 앱 시작 시 1회. */
export async function ensureReviewChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: i18n.t('reviewNotif.channelName'),
    importance: Notifications.AndroidImportance.DEFAULT,
    // 진동·소리 없음: 초대이지 독촉이 아니다(P5). 조용한 시간대는 OS의
    // 집중 모드/방해 금지에 위임하므로 우리가 밤 시간을 막지 않는다(§8.2).
    vibrationPattern: null as unknown as number[],
    sound: null,
  });
}

/** 현재 권한이 허용됐는가. 시스템 창을 띄우지 않는 조회 전용. */
export async function hasNotificationPermission(): Promise<boolean> {
  const { granted } = await Notifications.getPermissionsAsync();
  return granted;
}

/**
 * OS 권한 창을 띄운다. **soft ask에서 "알림 받기"를 누른 경우에만 부를 것**(§8.4) —
 * iOS는 시스템 창을 한 번 거절당하면 앱에서 다시 물어볼 수 없다(설정으로 보내야 함).
 * 한 발의 총알이므로 아껴 쓴다.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const { granted } = await Notifications.requestPermissionsAsync();
  return granted;
}

/** 우리가 건 복습 알림만 전부 취소. */
export async function cancelReviewNotifications(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter(n => (n.content.data as any)?.kind === REVIEW_TAG)
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

// 재예약 실행을 직렬화하는 체인 + 세대 카운터. 아래 syncReviewNotifications 주석 참조.
// (lib/db의 runInTransaction과 같은 수법 — 이 레포의 기존 관용구다.)
let syncChain: Promise<unknown> = Promise.resolve();
let syncGeneration = 0;

/**
 * 복습 알림 일정을 현재 데이터에 맞춰 다시 건다 — 이 모듈의 유일한 진입점.
 *
 * **항상 전체 취소 후 재생성**한다. 증분 갱신은 "어제 잡은 일정 중 무엇이 아직
 * 유효한가"를 추적해야 하는데, 학습 한 번에 여러 날의 예측이 동시에 바뀌므로
 * 그 추적이 재생성보다 비싸고 틀리기 쉽다. 재생성은 15개 남짓이라 값싸다.
 *
 * 끄여 있거나 권한이 없으면 남은 일정만 지우고 끝낸다 — OS 설정에서 권한을
 * 껐는데 예전 일정이 살아남아 있는 상태를 막는다.
 *
 * ## 왜 직렬화하나
 *
 * "전체 취소 후 재생성"은 겹쳐 돌면 **깨진다**. 한 번 실행이 취소 1회 + 등록 15회를
 * 순차 await하는 긴 작업이라, 그 사이에 두 번째 실행이 끼어들면:
 *   - 2번의 cancel이 1번의 "이미 등록된 것"만 지우고, 그 뒤 1번이 남은 등록을 계속
 *     발사 → 1번의 잔여 알림이 살아남은 채 2번도 전량 등록 → **같은 날 두 번 울린다.**
 *   - 순서가 반대면 2번이 등록한 것을 1번 기준의 cancel이 걷어가 **알림이 사라진다.**
 * 호출부(홈 화면)는 학습 커밋·동기화 pull·단어 편집마다 이 함수를 부르므로 실제로 겹친다.
 *
 * 세대 카운터가 체인 위에 하나 더 얹힌 이유: 직렬화만 하면 밀린 요청이 순서대로 전부
 * 실행되는데, 어차피 마지막 것이 앞의 결과를 통째로 덮어쓴다. 자기보다 새 요청이
 * 들어와 있으면 건너뛰어(coalesce) 무의미한 재예약을 아낀다.
 */
export async function syncReviewNotifications(
  lists: VocaList[],
  settings: ReviewNotificationSettings,
  now: number = Date.now(),
): Promise<number> {
  const myGeneration = ++syncGeneration;
  // 체인의 read-and-advance 사이에 await가 없어야 한다 — 동시 호출자가 같은 꼬리에
  // 매달려 결국 병렬로 도는 것을 막는다(runInTransaction의 주의사항과 동일).
  const run = syncChain.then(async () => {
    // 내 차례가 오기 전에 더 새로운 요청이 들어왔다면 이 실행은 의미가 없다.
    if (myGeneration !== syncGeneration) return 0;
    return applyReviewNotificationPlan(lists, settings, now);
  });
  syncChain = run.then(() => undefined, () => undefined);
  return run;
}

/** 실제 작업. 반드시 syncReviewNotifications의 체인 위에서만 부를 것. */
async function applyReviewNotificationPlan(
  lists: VocaList[],
  settings: ReviewNotificationSettings,
  now: number,
): Promise<number> {
  await cancelReviewNotifications();

  if (!settings.enabled) return 0;
  if (!(await hasNotificationPermission())) return 0;

  const plan = planReviewNotifications(lists, now, { hour: settings.hour, minute: settings.minute });

  for (const { fireAt, count } of plan) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t('reviewNotif.title', { count }),
        body: i18n.t('reviewNotif.body'),
        data: { kind: REVIEW_TAG },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(fireAt),
        // Android 채널 지정은 trigger에서만 읽힌다(content에는 그런 필드가 없다).
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : null),
      },
    });
  }

  return plan.length;
}
