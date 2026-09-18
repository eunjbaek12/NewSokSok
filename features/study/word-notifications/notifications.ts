/**
 * 시간마다 단어 알림 — expo-notifications 래퍼. 설계: docs/word-notifications-design.md.
 *
 * 계획은 순수 모듈 `./plan` 이 세우고, 여기서는 OS 에 거는 부수효과와 «보낸 단어» 상태 저장만 한다.
 * 복습 알림(`features/study/review/notifications.ts`)과 같은 수법을 쓴다 — 자기 태그로만 취소하고,
 * 전체 취소 후 재생성을 체인 + 세대 카운터로 직렬화한다. 이유는 그 파일의 주석에 있다.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { z } from 'zod';
import i18n from '@/i18n';
import type { VocaList } from '@/lib/types';
import type { WordNotificationSettings } from '@shared/contracts';
import { persisted } from '@/lib/storage/persisted';
import { hasNotificationPermission } from '../review/notifications';
import { planWordNotifications, replayDelivered, EMPTY_WORD_NOTIF_STATE, type WordNotifState } from './plan';

/** 단어 알림 — data 에 `listId`·`wordId` 가 함께 실린다. 탭 라우팅도 이 표식으로 가른다. */
export const WORD_NOTIFICATION_KIND = 'word-notification';
/** «곧 멈춰요» 안내 — 누르면 «알림에 나올 단어» 화면. */
export const WORD_NOTIFICATION_STOP_KIND = 'word-notification-stop';

const ANDROID_CHANNEL_ID = 'word';

const WordNotifStateSchema = z.object({
  sent: z.array(z.string()),
  slots: z.array(z.object({
    fireAt: z.number(),
    wordId: z.string().nullable(),
    roundStart: z.boolean(),
  })),
  stopNoticeSent: z.boolean(),
});

// 기기 상태(어느 단어가 이미 나갔나)라 설정과 다른 키에 둔다.
const stateStore = persisted<WordNotifState>('@soksok_word_notification_state', WordNotifStateSchema, EMPTY_WORD_NOTIF_STATE);

/**
 * Android 는 채널이 없으면 알림이 조용히 사라진다. 복습 알림과 **따로** 둬서 사용자가 OS 설정에서
 * 이것만 끌 수 있게 한다(N12). 소리·진동 없음 — 복습 채널과 같은 값.
 */
export async function ensureWordChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: i18n.t('wordNotif.channelName'),
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: null as unknown as number[],
    sound: null,
  });
}

function isOurs(data: unknown): boolean {
  const kind = (data as { kind?: string } | undefined)?.kind;
  return kind === WORD_NOTIFICATION_KIND || kind === WORD_NOTIFICATION_STOP_KIND;
}

/** 우리가 건 단어 알림만 전부 취소. 복습 알림은 건드리지 않는다. */
export async function cancelWordNotifications(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter(n => isOurs(n.content.data))
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

let syncChain: Promise<unknown> = Promise.resolve();
let syncGeneration = 0;

/**
 * 단어 알림 일정을 지금 데이터·설정에 맞춰 다시 건다 — 이 모듈의 유일한 진입점.
 * 겹쳐 부르면 뒤의 요청만 실행된다(세대 카운터). 돌려주는 값은 잡은 알림 수.
 */
export async function syncWordNotifications(
  lists: VocaList[],
  settings: WordNotificationSettings,
  now: number = Date.now(),
): Promise<number> {
  const myGeneration = ++syncGeneration;
  const run = syncChain.then(async () => {
    if (myGeneration !== syncGeneration) return 0;
    return applyWordNotificationPlan(lists, settings, now);
  });
  syncChain = run.then(() => undefined, () => undefined);
  return run;
}

async function applyWordNotificationPlan(
  lists: VocaList[],
  settings: WordNotificationSettings,
  now: number,
): Promise<number> {
  await cancelWordNotifications();
  const state = await stateStore.load();

  if (!settings.enabled || !(await hasNotificationPermission())) {
    // 끈 동안에도 이미 나간 단어는 기억해 둔다 — 다시 켜면 이어서 보낸다.
    const { sent, stopNoticeSent } = replayDelivered(state, now);
    await stateStore.save({ sent: [...sent], slots: [], stopNoticeSent });
    return 0;
  }

  const { notifications, nextState } = planWordNotifications({ lists, settings, state, now });

  // 상태를 먼저 저장한다 — 예약 도중에 앱이 죽어도 «나간 칸» 계산이 실제 예약보다 앞서지 않게
  // (저장한 칸이 실제로 안 잡혔으면 다음 예약 때 그 단어를 건너뛸 뿐이고, 반대면 같은 단어가 두 번 간다).
  await stateStore.save(nextState);

  for (const n of notifications) {
    const trigger = {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(n.fireAt),
      // Android 채널 지정은 trigger 에서만 읽힌다(content 에는 그런 필드가 없다).
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : null),
    } as Notifications.NotificationTriggerInput;

    if (n.word) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: n.word.term,
          body: n.word.meaningKr,
          data: { kind: WORD_NOTIFICATION_KIND, listId: n.listId, wordId: n.word.id },
        },
        trigger,
      });
    } else {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: i18n.t('wordNotif.stopTitle'),
          body: i18n.t('wordNotif.stopBody'),
          data: { kind: WORD_NOTIFICATION_STOP_KIND },
        },
        trigger,
      });
    }
  }

  return notifications.length;
}
