// 업데이트 소식 — 앱과 함께 배포되는 배열.
//
// 왜 서버가 아니라 번들인가:
//   업데이트 소식은 정의상 업데이트할 때만 생긴다. 앱에 담아 두면 다국어·버전
//   타게팅·오프라인 처리가 전부 공짜가 된다(i18n 키를 그대로 쓰고, 1.3.0 소식은
//   1.3.0 앱에만 들어 있으므로 필터가 필요 없다). 새 빌드 없이 띄워야 할 긴급
//   공지가 실제로 필요해지는 날 서버를 얹으면 되고, 그때도 화면은 그대로 쓴다.
//
// 릴리스 때 할 일:
//   사용자가 체감하는 변화가 있을 때만 항목을 추가한다. 버그픽스만 있는 릴리스는
//   여기에 안 적으면 그만이고, 그러면 시트도 뜨지 않는다.
//   문구는 기능 이름이 아니라 사용자가 겪는 변화로, 세 줄을 넘기지 않게 쓴다.
//
// 배열은 최근 10개 정도만 남긴다 — 번들에 들어가는 문자열이고, 2년 전 버전의
// "달라진 점"을 읽는 사람은 없다.

import type { Ionicons } from '@expo/vector-icons';

export interface AnnouncementItem {
  /** i18n 키. 점 대신 밑줄을 쓴다 — i18n이 점을 중첩 경로로 해석하기 때문. */
  key: string;
  /**
   * 항목이 가리키는 기능의 아이콘. 세 줄에 전부 같은 아이콘을 쓰면 한 덩어리로 읽혀
   * 무엇이 달라졌는지 훑을 수가 없다. 그 기능이 앱 안에서 이미 쓰는 아이콘을 그대로
   * 가져온다(예: 문의는 설정 화면과 같은 chatbubble).
   */
  icon: keyof typeof Ionicons.glyphMap;
}

export interface Announcement {
  /** app.json의 version과 정확히 같아야 시트가 뜬다. */
  version: string;
  /** 표시용 날짜(YYYY-MM-DD). 목록 화면에서 로케일 형식으로 그린다. */
  date: string;
  items: AnnouncementItem[];
}

// ⚠️ 릴리스 직전에 version과 date를 실제 값으로 맞출 것. version이 app.json과
//    다르면 시트가 뜨지 않는다(그게 안전한 기본값이다 — 틀린 소식을 띄우느니
//    안 띄우는 편이 낫다).
export const ANNOUNCEMENTS: Announcement[] = [
  {
    version: '1.4.0',
    // ⚠️ 임시값 — 출시일이 정해지면 실제 날짜로 바꿀 것.
    date: '2026-08-10',
    // 앞 세 줄은 1.3.0 에 실었던 소식이다. 1.3.0 에서는 아무에게도 뜨지 않았다 —
    // 판정에 쓰는 @soksok_last_seen_version 키가 1.3.0 에서 처음 생겨서, 1.2.x 에서
    // 올라온 기존 사용자가 전부 "신규 설치"로 분류돼 조용히 기록만 되고 넘어갔다
    // (use-whats-new.ts). 그래서 1.3.0 항목을 남겨 두지 않고 여기로 옮겼다 —
    // 두 벌로 두면 목록 화면에 같은 문장이 두 카드에 중복으로 뜬다.
    items: [
      { key: 'whatsNew.v140_1', icon: 'refresh' },
      { key: 'whatsNew.v140_2', icon: 'search' },
      { key: 'whatsNew.v140_3', icon: 'chatbubble-ellipses' },
      // 설정의 앱 언어 행이 쓰는 globe, 스킨은 설정에 아이콘이 없어 새로 고른다.
      { key: 'whatsNew.v140_4', icon: 'globe' },
      { key: 'whatsNew.v140_5', icon: 'color-palette' },
    ],
  },
];

/** 해당 버전의 소식. 없으면 undefined — 호출부는 시트를 띄우지 않는다. */
export function announcementFor(version: string): Announcement | undefined {
  return ANNOUNCEMENTS.find(a => a.version === version);
}
