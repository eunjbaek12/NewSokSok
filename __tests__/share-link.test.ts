import {
  buildShareUrl,
  parseShareDeepLink,
  rememberPendingShare,
  takePendingShare,
  clearPendingShare,
  waitForAppReturn,
} from '@/features/curation/share-link';
import { redirectSystemPath } from '@/app/+native-intent';

const ID = '49b64a78-e0c2-4812-9f7b-da1189349a08';

describe('친구에게 보낸 주소', () => {
  it('보낸 웹 주소를 그대로 되읽는다', () => {
    expect(buildShareUrl(ID)).toBe(`https://eunjbaek12.github.io/NewSokSok/d/?id=${ID}`);
    expect(parseShareDeepLink(buildShareUrl(ID))).toBe(ID);
  });

  it('랜딩이 넘기는 앱 스킴 형태를 읽는다', () => {
    expect(parseShareDeepLink(`soksokvoca://d/${ID}`)).toBe(ID);
    expect(parseShareDeepLink(`soksokvoca://d/${ID}/`)).toBe(ID);
    expect(parseShareDeepLink(`/d/${ID}`)).toBe(ID);
  });

  it('메신저가 붙인 추적 파라미터를 무시한다', () => {
    expect(parseShareDeepLink(`${buildShareUrl(ID)}&utm_source=kakao`)).toBe(ID);
    expect(parseShareDeepLink(`https://eunjbaek12.github.io/NewSokSok/d/?from=kakao&id=${ID}`)).toBe(ID);
    expect(parseShareDeepLink(`soksokvoca://d/${ID}?from=kakao#top`)).toBe(ID);
  });

  // native-intent 는 null 이면 지금처럼 홈으로 보낸다. 여기서 id 를 잘못 주우면
  // 없는 화면이 열리거나 엉뚱한 RPC 가 나간다.
  it('다른 주소는 모두 null 이다', () => {
    const others = [
      'soksokvoca://',
      'soksokvoca://list/abc12345',
      'https://eunjbaek12.github.io/NewSokSok/privacy-policy.html',
      `https://example.com/?id=${ID}`,           // /d/ 경로가 아니면 id 파라미터를 줍지 않는다
      `https://eunjbaek12.github.io/NewSokSok/list/?id=${ID}`,
      'soksokvoca://d/',
      'soksokvoca://d/short',
      'https://eunjbaek12.github.io/NewSokSok/d/',
      '',
      null,
      undefined,
    ];
    for (const url of others) expect(parseShareDeepLink(url)).toBeNull();
  });

  it('경로·스크립트 문자가 섞인 id 는 받지 않는다', () => {
    expect(parseShareDeepLink(`soksokvoca://d/${ID}/../x`)).toBeNull();
    expect(parseShareDeepLink('https://eunjbaek12.github.io/NewSokSok/d/?id=<script>alert(1)</script>')).toBeNull();
    expect(parseShareDeepLink('https://eunjbaek12.github.io/NewSokSok/d/?id=')).toBeNull();
  });
});

describe('+native-intent', () => {
  afterEach(() => { takePendingShare(); });

  it('공유 주소만 담기 화면으로 넘기고 나머지는 지금처럼 홈으로 보낸다', () => {
    expect(redirectSystemPath({ path: `soksokvoca://d/${ID}`, initial: true })).toBe(`/d/${ID}`);
    expect(redirectSystemPath({ path: 'soksokvoca://list/abc12345', initial: false })).toBe('/');
    expect(redirectSystemPath({ path: 'soksokvoca://', initial: true })).toBe('/');
  });

  // 온보딩·로그인이 /d/<id> 를 덮어도 id 가 남아 있어야 레이아웃이 다시 연다.
  it('공유 주소를 읽으면 id 를 기억해 둔다', () => {
    redirectSystemPath({ path: `soksokvoca://d/${ID}`, initial: true });
    expect(takePendingShare()).toBe(ID);
    expect(takePendingShare()).toBeNull(); // 꺼내면 지워진다 — 두 번 열리지 않게
  });
});

describe('가로막힌 주소 기억', () => {
  afterEach(() => { takePendingShare(); });

  it('담기 화면이 스스로 열렸으면 그 id 만 지운다', () => {
    rememberPendingShare(ID);
    clearPendingShare('ffffffff-0000-0000-0000-000000000000');
    expect(takePendingShare()).toBe(ID);

    rememberPendingShare(ID);
    clearPendingShare(ID);
    expect(takePendingShare()).toBeNull();
  });
});

// Android 의 Share.share 는 공유 창이 열리는 순간 돌아온다 — 그때 알리면 안내가 공유 창 뒤에서
// 떴다 사라진다(2026-09-11 기기 실측). 떠났다 돌아오는 순간을 제대로 잡는지 본다.
describe('공유 창에서 돌아오기', () => {
  function fakeAppState(initial = 'active') {
    const listeners = new Set<(s: string) => void>();
    const app = {
      currentState: initial as string | null,
      addEventListener: (_type: 'change', fn: (s: string) => void) => {
        listeners.add(fn);
        return { remove: () => { listeners.delete(fn); } };
      },
      emit(s: string) { app.currentState = s; for (const fn of [...listeners]) fn(s); },
      listenerCount: () => listeners.size,
    };
    return app;
  }
  const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('공유 창이 앱을 덮은 동안은 기다리고, 돌아오는 순간 끝난다', async () => {
    const app = fakeAppState();
    let done = false;
    void waitForAppReturn(app).then(() => { done = true; });
    app.emit('background');            // 공유 창이 앱을 덮었다
    jest.advanceTimersByTime(60_000);  // 카톡에서 친구를 고르는 동안
    await tick();
    expect(done).toBe(false);
    app.emit('active');                // 앱으로 돌아왔다
    await tick();
    expect(done).toBe(true);
    expect(app.listenerCount()).toBe(0);
  });

  it('불린 시점에 이미 떠나 있었어도 돌아올 때 끝난다', async () => {
    const app = fakeAppState('background');
    let done = false;
    void waitForAppReturn(app).then(() => { done = true; });
    jest.advanceTimersByTime(5_000);   // «떠나지 않았다»로 오판해 먼저 끝나면 안 된다
    await tick();
    expect(done).toBe(false);
    app.emit('active');
    await tick();
    expect(done).toBe(true);
  });

  it('공유 창이 앱을 덮지 않았으면 오래 기다리지 않는다', async () => {
    const app = fakeAppState();
    let done = false;
    void waitForAppReturn(app, { leaveWithinMs: 1500 }).then(() => { done = true; });
    jest.advanceTimersByTime(1_499);
    await tick();
    expect(done).toBe(false);
    jest.advanceTimersByTime(1);
    await tick();
    expect(done).toBe(true);
    expect(app.listenerCount()).toBe(0);
  });

  it('끝내 안 돌아와도 구독을 걷는다', async () => {
    const app = fakeAppState();
    let done = false;
    void waitForAppReturn(app, { maxWaitMs: 10_000 }).then(() => { done = true; });
    app.emit('background');
    jest.advanceTimersByTime(10_000);
    await tick();
    expect(done).toBe(true);
    expect(app.listenerCount()).toBe(0);
  });
});
