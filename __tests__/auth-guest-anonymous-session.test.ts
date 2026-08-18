/**
 * 게스트의 익명 세션은 로그아웃해도 남는다 — AI 한도 리셋 차단.
 *
 * 문제: 게스트가 로그아웃하면 익명 세션이 지워지고, 다시 "바로 시작하기"를 누르면
 * loginAsGuest 가 **새 익명 계정**을 만든다. ai_usage_daily 키가 (user_id, usage_date)라
 * 사용량이 0에서 다시 시작한다. 실측(8/13 한 기기): 01:40 계정이 한도 10 소진 → 광고
 * 보너스 10 소진 → 01:52 새 계정에서 10을 또 사용 = 12분에 30단어(한도의 3배).
 * 로컬 단어는 그대로라 사용자가 잃는 게 없어 "다시 시작하기"로 보이고, 한도 10은 사진
 * 스캔 한 장이면 소진돼 정상 사용자가 자연히 이 경로에 닿는다.
 *
 * 고친 곳은 둘이고 **둘 다 필요하다**: logout() 이 세션을 남겨도 hydrate() 가 다음
 * 콜드 스타트에 고아로 보고 지우면 리셋이 되살아난다.
 *
 * 클라우드(Google/Apple) 세션 부활 방어는 그대로다 — 그쪽은 is_anonymous 가 false 라
 * 두 지점 모두 예전처럼 지운다. [[project_logout_session_resurrection]]
 */
const getSession = jest.fn(async () => ({ data: { session: null } }) as any);
const onAuthStateChange = jest.fn();
const supabaseSignOut = jest.fn(async () => ({ error: null }));
const signInAnonymously = jest.fn(async () => ({ error: null }));

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    signOut: jest.fn(async () => {}),
    hasPlayServices: jest.fn(),
    signIn: jest.fn(),
    getTokens: jest.fn(),
    revokeAccess: jest.fn(),
  },
}));
jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => 'nonce',
  digestStringAsync: async () => 'hashed',
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
}));

const mem = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: async (k: string, v: string) => { mem.set(k, v); },
    removeItem: async (k: string) => { mem.delete(k); },
  },
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession,
      onAuthStateChange,
      signOut: supabaseSignOut,
      signInWithIdToken: jest.fn(),
      signInAnonymously,
      updateUser: jest.fn(),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    }),
    rpc: jest.fn(),
  },
}));

jest.mock('@/features/sync/engine', () => ({ flushPush: jest.fn(async () => {}) }));
jest.mock('@/features/sync/store', () => ({
  useSyncStore: {
    getState: () => ({
      dirtyListIds: new Set<string>(),
      dirtyWordIds: new Set<string>(),
      resetAll: jest.fn(async () => {}),
    }),
  },
}));
jest.mock('@/features/vocab/db', () => ({ clearAllData: jest.fn(async () => {}) }));
jest.mock('@/features/settings/store', () => ({
  useSettingsStore: { getState: () => ({ clearAccountScopedSettings: jest.fn(async () => {}) }) },
}));
jest.mock('@/features/quota', () => ({
  useQuotaStore: { getState: () => ({ clear: jest.fn() }) },
}));

const anonSession = { user: { id: 'anon-1', is_anonymous: true } };
const cloudSession = { user: { id: 'u1', is_anonymous: false, email: 'a@example.com' } };

beforeEach(() => {
  mem.clear();
  supabaseSignOut.mockClear();
  signInAnonymously.mockClear();
  getSession.mockImplementation(async () => ({ data: { session: null } }) as any);
});

describe('logout() — 게스트의 익명 세션은 남긴다', () => {
  it('게스트 로그아웃은 supabase 세션을 지우지 않는다', async () => {
    const { useAuthStore } = require('@/features/auth/store');
    useAuthStore.setState({ mode: 'guest', user: null });

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().mode).toBe('none');
    // 익명 세션이 살아 있어야 다음 진입에서 loginAsGuest 가 재사용한다.
    expect(supabaseSignOut).not.toHaveBeenCalled();
  });

  it('클라우드 로그아웃은 예전처럼 세션을 지운다', async () => {
    const { useAuthStore } = require('@/features/auth/store');
    useAuthStore.setState({
      mode: 'google',
      user: { id: 'u1', email: 'a@example.com', displayName: null, avatarUrl: null, isAdmin: false, nickname: null },
    });

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().mode).toBe('none');
    expect(supabaseSignOut).toHaveBeenCalledTimes(1);
  });
});

describe('hydrate() — 의도가 none 이어도 익명 세션은 고아가 아니다', () => {
  beforeEach(() => { jest.resetModules(); });

  it('익명 세션은 남긴다 (다음 게스트 진입이 재사용한다)', async () => {
    mem.set('@soksok_auth', JSON.stringify({ mode: 'none', user: null }));
    getSession.mockImplementation(async () => ({ data: { session: anonSession } }) as any);

    const { useAuthStore } = require('@/features/auth/store');
    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().mode).toBe('none');
    expect(supabaseSignOut).not.toHaveBeenCalled();
  });

  it('클라우드 세션은 지운다 (로그아웃 후 부활 방어는 그대로)', async () => {
    mem.set('@soksok_auth', JSON.stringify({ mode: 'none', user: null }));
    getSession.mockImplementation(async () => ({ data: { session: cloudSession } }) as any);

    const { useAuthStore } = require('@/features/auth/store');
    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().mode).toBe('none');
    expect(supabaseSignOut).toHaveBeenCalledTimes(1);
  });
});
