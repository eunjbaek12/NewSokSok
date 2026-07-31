// 버전이 올라간 첫 실행에 소식 시트를 한 번 띄운다.
//
// 알림함을 만들지 않는 이유가 여기 있다 — 벨을 눌러야 보이는 목록은 궁금해서
// 누른 사람만 보지만, 이 시트는 앱을 켠 사람 거의 전원에게 닿는다. 그리고 소식
// 쓰기가 뜸해져도 아무 흔적이 남지 않는다(방치가 눈에 보이는 알림함과 다르다).
//
// 판정은 "마지막으로 보여준 버전"과 지금 버전의 비교뿐이다:
//   저장값 없음(신규 설치) → 띄우지 않고 저장만. 처음 쓰는 사람에게 "달라진 점"은
//                            의미가 없다.
//   저장값 === 현재       → 아무것도 안 함
//   저장값 ≠ 현재         → 그 버전의 소식이 있으면 시트, 없으면 저장만
//
// 재설치하면 저장값이 비어 신규 설치로 잡힌다 — 그게 맞는 동작이다.

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { ANNOUNCEMENTS, announcementFor, type Announcement } from '@/constants/announcements';
import { suppressAutoReviewForSession } from '@/features/reviews';

const LAST_SEEN_KEY = '@soksok_last_seen_version';
const FORCE_KEY = '@soksok_whats_new_force';

export function currentAppVersion(): string {
  return Constants.expoConfig?.version ?? '';
}

/**
 * 개발자 메뉴("새로운 소식 다시 보기")용.
 *
 * 저장값만 지우면 부족하다 — 개발·preview 빌드에서는 앱 버전이 그대로라
 * announcementFor(현재 버전)이 비어 시트가 끝내 뜨지 않는다(릴리스 전이라 배열의
 * 버전이 아직 미래다). 그래서 버전 비교를 건너뛰고 최신 항목을 띄우라는 플래그를
 * 함께 세운다. 실기 검증에 이 경로가 없으면 시트를 눈으로 볼 방법이 없다.
 */
export async function resetWhatsNewSeen(): Promise<void> {
  await AsyncStorage.multiRemove([LAST_SEEN_KEY]);
  await AsyncStorage.setItem(FORCE_KEY, '1');
}

export function useWhatsNew() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const version = currentAppVersion();
        if (!version) return;

        // 개발자 메뉴로 강제 표시 — 버전 비교를 건너뛰고 최신 항목을 띄운다.
        const forced = await AsyncStorage.getItem(FORCE_KEY);
        if (forced) {
          await AsyncStorage.removeItem(FORCE_KEY);
          const newest = ANNOUNCEMENTS[0];
          if (newest && !cancelled) {
            suppressAutoReviewForSession();
            setAnnouncement(newest);
          }
          return;
        }

        const lastSeen = await AsyncStorage.getItem(LAST_SEEN_KEY);

        // 신규 설치 또는 이미 본 버전 — 조용히 기록만 하고 물러난다.
        if (!lastSeen || lastSeen === version) {
          if (lastSeen !== version) await AsyncStorage.setItem(LAST_SEEN_KEY, version);
          return;
        }

        const next = announcementFor(version);
        if (!next) {
          // 이 버전엔 알릴 게 없다(버그픽스만 있는 릴리스). 기록만 옮긴다.
          await AsyncStorage.setItem(LAST_SEEN_KEY, version);
          return;
        }
        if (cancelled) return;

        // 같은 세션에서 인앱 리뷰 넛지까지 뜨면 팝업이 둘이 된다. 리뷰가 0개인
        // 지금은 요청 한 번의 질이 횟수보다 중요하므로, 이번 세션은 넛지를 쉰다.
        suppressAutoReviewForSession();
        setAnnouncement(next);
      } catch {
        // 소식을 못 띄우는 건 조용히 넘어갈 일이다.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dismiss = useCallback(async () => {
    setAnnouncement(null);
    try {
      await AsyncStorage.setItem(LAST_SEEN_KEY, currentAppVersion());
    } catch {}
  }, []);

  return { announcement, dismiss };
}
