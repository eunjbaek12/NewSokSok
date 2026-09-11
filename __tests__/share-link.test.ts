import {
  buildShareUrl,
  parseShareDeepLink,
  rememberPendingShare,
  takePendingShare,
  clearPendingShare,
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
