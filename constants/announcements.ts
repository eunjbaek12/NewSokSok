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
    version: '1.6.0',
    date: '2026-08-18',
    items: [
      { key: 'whatsNew.v160_1', icon: 'school' },
      // 2026-08-20 제보(예문 빈칸의 다중정답)에서 나온 것이라 덱 이야기보다 앞에 둔다 —
      // 사용자 제안에서 나온 것을 위로 올리는 1.5.0 때 방침 그대로다.
      // 아이콘은 예문 학습 버튼이 쓰는 것을 그대로 가져왔다(app/list/[id].tsx). 마지막
      // 줄의 chatbubble-ellipses 와 나란히 두면 말풍선 두 개가 한 덩어리로 읽힌다.
      // 스펙: docs/example-choices-multi-answer-spec.md
      { key: 'whatsNew.v160_2', icon: 'chatbubbles-outline' },
      { key: 'whatsNew.v160_3', icon: 'add-circle' },
      { key: 'whatsNew.v160_4', icon: 'refresh' },
      { key: 'whatsNew.v160_5', icon: 'cloud-download' },
      { key: 'whatsNew.v160_6', icon: 'book' },
      { key: 'whatsNew.v160_7', icon: 'chatbubble-ellipses' },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-08-16',
    // 🔑 사용자 제안에서 나온 것을 맨 위에 둔다(은정님 방침). 이번 1번은 2026-08-12
    // 문의 "한국어 뜻만 한꺼번에 지울 수 있는 버튼이 있으면 좋겠습니다" 가 그대로
    // 구현된 것이고(`2c40670`), 마지막 줄로 다음 제안을 청한다 — 감사와 참여 요청이
    // 한 시트 안에서 짝을 이룬다.
    //
    // 4·5번(배너 면제·무료 한도)은 서버 정책과 짝이다 — 20260813020000 +
    // 20260815020000 을 적용해야 실제로 그렇게 동작한다. 스토어 공개를 확인한 직후
    // 적용하기로 했으므로 시차는 하루 이내다. 절차는 docs/release-checklist-next.md §1.
    //
    // 5번에서 "게스트로 사용하면 10단어" 절을 1.6.0 작업 중에 지웠다. 과거 소식은
    // 손대지 않는 것이 원칙이지만, 시트와 달리 목록 화면(설정 › 업데이트 소식)은
    // ANNOUNCEMENTS 배열 전체를 그리므로 이 줄이 계속 보인다 — 게스트 등급을 없애는
    // 서버 변경(20260818000000_remove_guest_tier.sql)이 적용되면 거짓이 된다.
    //
    // 2번에 "뜻 언어를 영어로" 를 붙인 이유: TOPIK II 덱은 ko→en 이라 뜻 언어가 en 인
    // 사용자에게만 큐레이션 목록에 뜬다. 안 붙이면 한국어 사용자에게 "왔다는데 없다" 가 된다.
    items: [
      { key: 'whatsNew.v150_1', icon: 'bulb' },
      { key: 'whatsNew.v150_2', icon: 'school' },
      { key: 'whatsNew.v150_3', icon: 'language' },
      { key: 'whatsNew.v150_4', icon: 'eye-off' },
      { key: 'whatsNew.v150_5', icon: 'information-circle' },
      { key: 'whatsNew.v150_6', icon: 'chatbubble-ellipses' },
    ],
  },
  {
    version: '1.4.0',
    date: '2026-08-06',
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
