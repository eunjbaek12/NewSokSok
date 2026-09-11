import { parseShareDeepLink, rememberPendingShare } from '@/features/curation/share-link';

// 앱으로 들어오는 주소를 라우터 경로로 바꾼다.
//
// 최초 커밋부터 이 파일은 무엇이 들어오든 '/' 를 돌려줬다(이유는 기록돼 있지 않다). 들어오는
// 딥링크를 읽는 코드가 앱 어디에도 없어서(로그인은 네이티브 SDK 라 콜백 주소가 없다) 그래도
// 잃는 게 없었다. 친구에게 보낸 단어장 주소만 담기 화면으로 넘기고, 나머지는 지금처럼 홈으로
// 보낸다 — 모르는 경로를 라우터에 그대로 넘기면 없는 화면이 열린다.
export function redirectSystemPath({
  path,
}: { path: string; initial: boolean }) {
  const shareId = parseShareDeepLink(path);
  if (shareId) {
    // 온보딩·로그인이 이 경로를 덮을 수 있어 id 를 따로 기억해 둔다(app/_layout.tsx).
    rememberPendingShare(shareId);
    return `/d/${shareId}`;
  }
  return '/';
}
