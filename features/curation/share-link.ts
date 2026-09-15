// 친구에게 보낸 주소를 만들고, 돌아 들어온 주소를 읽는다.
//
// 랜딩은 GitHub Pages 에 둔다 — 개인정보처리방침이 이미 거기 있어 호스팅 비용이 0이고,
// 앱이 없는 사람도 무엇을 받았는지 볼 수 있다(docs/share-to-friend-spec.md §6).
//
// 🔴 **주소는 `/d/?id=<id>` 이지 `/d/<id>` 가 아니다.** GitHub Pages 는 정적 호스팅이라
// 임의 경로를 한 페이지로 돌릴 수 없어 `/d/<id>` 는 404 가 난다(404.html 우회는 상태 코드가
// 404 로 남아 메신저 미리보기가 깨질 수 있다). `docs/d/index.html` 하나가 200 으로 받는다.

/** 웹 주소의 앞부분. `docs/d/index.html` 이 `?id=` 로 받는다. */
export const SHARE_LINK_BASE = 'https://eunjbaek12.github.io/NewSokSok/d/';

/** 앱이 직접 열리는 형태. 랜딩의 [앱에서 담기]가 이 주소로 넘긴다. */
export const SHARE_LINK_SCHEME = 'soksokvoca://d/';

/** 공유물 id 는 UUID 다. 경로·스크립트 문자가 섞인 값은 id 로 보지 않는다. */
const SHARE_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function buildShareUrl(themeId: string): string {
  return `${SHARE_LINK_BASE}?id=${themeId}`;
}

/**
 * 들어온 주소에서 공유물 id 를 뽑는다. 두 형태를 받는다:
 * - `soksokvoca://d/<id>` — 랜딩의 [앱에서 담기]가 넘기는 것
 * - `https://…/NewSokSok/d/?id=<id>` — 앱 링크 검증 파일이 붙으면 이 주소로 직접 들어온다(§8)
 *
 * 🔴 **모르는 주소는 null 이다.** `app/+native-intent.tsx` 는 그 경우 지금처럼 홈으로
 * 되돌린다 — 아무 경로나 라우터에 넘기면 없는 화면을 열어 앱이 빈 스택에 갇힌다.
 * `?id=` 도 경로가 `/d/` 로 끝날 때만 읽는다(다른 주소의 같은 이름 파라미터를 줍지 않게).
 */
export function parseShareDeepLink(url: string | null | undefined): string | null {
  if (!url) return null;
  const [beforeHash] = url.split('#');
  const qIndex = beforeHash.indexOf('?');
  const base = qIndex >= 0 ? beforeHash.slice(0, qIndex) : beforeHash;
  const query = qIndex >= 0 ? beforeHash.slice(qIndex + 1) : '';

  // /d/<id> — 뒤에 붙은 쿼리는 버린다(카톡·문자가 추적 파라미터를 붙여 보낼 수 있다).
  const pathMatch = base.match(/(?:^|\/)d\/([^/]+)\/?$/);
  if (pathMatch) return SHARE_ID.test(pathMatch[1]) ? pathMatch[1] : null;

  // /d/?id=<id>
  if (/(?:^|\/)d\/?$/.test(base)) {
    for (const pair of query.split('&')) {
      const [key, value] = pair.split('=');
      if (key === 'id') return value && SHARE_ID.test(value) ? value : null;
    }
  }
  return null;
}

// ─── 온보딩·로그인에 가로막힌 주소 ───────────────────────────────────────────
//
// 루트 레이아웃(app/_layout.tsx)은 첫 실행이면 온보딩으로, 로그아웃 상태면 로그인으로
// `replace` 한다. 그 순간 `/d/<id>` 가 덮여 **주소가 조용히 사라진다.** 받는 사람은 로그인할
// 필요가 없는데도(§2-8) 그 단어장을 다시 볼 길이 없어진다.
//
// 그래서 주소를 읽을 때 id 를 따로 기억해 두고, 온보딩·로그인을 벗어난 뒤 레이아웃이 그
// 화면을 연다. 담기 화면이 스스로 열렸으면 그 자리에서 지운다 — 두 번 열리지 않게.
// 메모리에만 둔다: 온보딩 중에 앱을 끄면 잃지만, 그건 «설치 후 주소가 사라지는» 것과 같은
// 부류라 스펙이 받아들인 범위다(§8).

let pendingShareId: string | null = null;

export function rememberPendingShare(id: string): void {
  pendingShareId = id;
}

/** 기억해 둔 id 를 꺼내면서 지운다. */
export function takePendingShare(): string | null {
  const id = pendingShareId;
  pendingShareId = null;
  return id;
}

/** 담기 화면이 열렸을 때 — 그 id 가 기억돼 있으면 지운다. 다른 id 는 건드리지 않는다. */
export function clearPendingShare(id: string): void {
  if (pendingShareId === id) pendingShareId = null;
}

/**
 * 「{날짜}까지 열 수 있어요」에 쓰는 날짜. 로케일 데이터가 없는 런타임에서 Intl 이 던지면
 * 숫자 표기로 떨어뜨린다(features/stats/CompletionShareCard.tsx 와 같은 방어).
 */
export function formatExpiryDate(expiresAt: number, localeTag: string): string {
  const when = new Date(expiresAt);
  try {
    return when.toLocaleDateString(localeTag, { month: 'long', day: 'numeric' });
  } catch {
    return when.toISOString().slice(0, 10);
  }
}

// ─── 공유 창에서 돌아오기 ────────────────────────────────────────────────────

/** RN `AppState` 에서 쓰는 면만. 여기서 react-native 를 import 하지 않아야 이 파일이 node 테스트에서 돈다. */
export interface AppStateLike {
  currentState: string | null;
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
}

/**
 * 사용자가 앱 화면으로 돌아올 때까지 기다린다.
 *
 * Android 의 `Share.share` 는 공유 창이 **열리는 순간** 돌아온다. 그때 띄운 «공유했어요»는 공유 창
 * 뒤에서 떴다가 사람이 돌아오기 전에 사라졌다(2026-09-11 기기 실측 — 덤프 어디에도 없었다).
 * 그래서 앱이 한 번 떠났다가(background) 다시 앞으로 오는(active) 순간을 기다린다.
 *
 * - 공유 창이 앱을 덮지 않았으면(떠난 적이 없으면) `leaveWithinMs` 뒤 그냥 끝낸다 — 안 기다린다.
 * - 끝내 안 돌아와도 `maxWaitMs` 뒤 구독을 걷는다 — 리스너를 남기지 않는다.
 */
export function waitForAppReturn(
  appState: AppStateLike,
  { leaveWithinMs = 1500, maxWaitMs = 10 * 60 * 1000 }: { leaveWithinMs?: number; maxWaitMs?: number } = {},
): Promise<void> {
  return new Promise(resolve => {
    // 불린 시점에 이미 떠나 있을 수 있다 — 공유 창이 먼저 앱을 덮고 돌아오는 순서가 기기마다 다르다.
    let left = appState.currentState !== 'active';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      sub.remove();
      clearTimeout(leaveTimer);
      clearTimeout(maxTimer);
      resolve();
    };
    const sub = appState.addEventListener('change', state => {
      if (state !== 'active') { left = true; return; }
      if (left) finish();
    });
    const leaveTimer = setTimeout(() => { if (!left) finish(); }, leaveWithinMs);
    const maxTimer = setTimeout(finish, maxWaitMs);
  });
}
