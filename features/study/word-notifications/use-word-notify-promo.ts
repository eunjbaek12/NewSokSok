/**
 * 홈 «단어 알림» 권유 카드의 상태와 동작. 보일지 말지의 규칙은 `./promo`(순수)에 있다.
 */
import { useCallback, useMemo, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { VocaList } from '@/lib/types';
import { useSettingsStore } from '@/features/settings';
import { hasNotificationPermission, requestNotificationPermission } from '../review/notifications';
import { resolveSourceList } from './plan';
import { syncWordNotifications } from './notifications';
import { countSendableWords, shouldShowWordNotifyPromo } from './promo';

export interface WordNotifyPromo {
  visible: boolean;
  /** 방금 이 카드로 켰다 — 카드가 «켰어요»로 바뀐다. 홈을 떠나면 사라진다. */
  justEnabled: boolean;
  /** 알림이 나갈 단어장 이름. 없으면 null(그때는 카드가 뜨지 않는다). */
  listTitle: string | null;
  enable: () => Promise<void>;
  dismiss: () => Promise<void>;
}

export function useWordNotifyPromo(lists: VocaList[]): WordNotifyPromo {
  const { t } = useTranslation();
  const wordNotif = useSettingsStore(s => s.wordNotificationSettings);
  const review = useSettingsStore(s => s.reviewNotificationSettings);
  const isLoading = useSettingsStore(s => s.isLoading);
  const updateWordNotif = useSettingsStore(s => s.updateWordNotificationSettings);

  const [justEnabled, setJustEnabled] = useState(false);

  // 홈을 떠나면 «켰어요»를 거둔다 — 다음에 들어오면 카드가 없다.
  // (탭은 화면을 마운트한 채 두므로 언마운트에 기대면 앱을 끌 때까지 남는다.)
  useFocusEffect(
    useCallback(() => {
      return () => setJustEnabled(false);
    }, []),
  );

  // 이름은 «켰어요»에서만 쓴다 — 켜기 전 카드는 단어장을 말하지 않는다.
  const list = useMemo(() => resolveSourceList(lists, wordNotif.listId).list, [lists, wordNotif.listId]);
  // 띄울지 말지는 **앱 전체** 기준이다(promo.ts countSendableWords 주석 참조).
  const sendableCount = useMemo(() => countSendableWords(lists, wordNotif), [lists, wordNotif]);

  const visible =
    !isLoading &&
    (justEnabled || shouldShowWordNotifyPromo({ wordNotif, review, sendableCount }));

  const enable = useCallback(async () => {
    // 설정 탭의 스위치와 같은 흐름 — 권한을 받은 경우에만 켠다(«켜져 있는데 안 오는» 상태를 안 만든다).
    const granted = (await hasNotificationPermission()) || (await requestNotificationPermission());
    if (!granted) {
      // 거절당하면 카드를 접는다. 알림 권한은 앱에 하나뿐이라 iOS에서는 다시 물을 수 없고,
      // 남은 카드가 할 수 있는 말은 «설정 열기»뿐이라 그때부터는 조르기가 된다.
      await updateWordNotif({ promoDismissed: true });
      Alert.alert(
        t('reviewNotif.blockedTitle'),
        t('reviewNotif.blockedBody'),
        [
          { text: t('reviewNotif.cancel'), style: 'cancel' },
          { text: t('reviewNotif.blockedOpen'), onPress: () => { Linking.openSettings().catch(() => {}); } },
        ],
      );
      return;
    }
    await updateWordNotif({ enabled: true, promoDismissed: true });
    setJustEnabled(true);
    // 상시 스케줄러의 디바운스를 기다리지 않고 바로 건다 — 설정 화면의 스위치와 같다.
    void syncWordNotifications(lists, { ...wordNotif, enabled: true });
  }, [lists, wordNotif, updateWordNotif, t]);

  const dismiss = useCallback(async () => {
    await updateWordNotif({ promoDismissed: true });
  }, [updateWordNotif]);

  return { visible, justEnabled, listTitle: list?.title ?? null, enable, dismiss };
}
