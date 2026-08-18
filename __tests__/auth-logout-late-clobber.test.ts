/**
 * Regression: 로그아웃 직후 "게스트로 시작"을 누르면 로그인 화면으로 되튕겨 게스트를 두 번
 * 눌러야 했고, 때로는 앱이 죽었다("Cannot read property 'stale' of undefined").
 *
 * 원인: 호출부(app/(tabs)/settings.tsx)는 logout()을 await하지 않고 곧장 /login으로
 * 넘어가는데, logout()은 flush 재시도(최대 3회 × 400ms + 네트워크)와 SQLite 전체 삭제를
 * 거치느라 수백 ms~수 초 뒤에야 3)·4)단계에 도달한다. 그 사이 사용자가 게스트로 시작하면
 * 뒤늦은 persist({mode:'none'})가 갓 만든 게스트 세션을 덮어썼고(→ /login으로 되튕김,
 * 그리고 탭 네비게이터 언마운트·재마운트 → react-navigation #13011 크래시), 이어지는
 * supabase.auth.signOut()이 그 익명 세션까지 지웠다(익명 계정이 12초 간격으로 두 개
 * 만들어진 것을 서버에서 확인).
 *
 * 수정: 3)·4)단계는 "이 세션"에 속한 부수효과이므로, 그 사이 모드가 바뀌었으면 건너뛴다.
 *
 * 같은 증상의 다른 원인(hydrate 재실행)은 auth-hydrate-once.test.ts 참고.
 */
const getSession = jest.fn(async () => ({ data: { session: null } }));
const onAuthStateChange = jest.fn();
const supabaseSignOut = jest.fn(async () => ({ error: null }));
const googleSignOut = jest.fn(async () => {});
const clearAllData = jest.fn(async () => {});

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    signOut: googleSignOut,
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
jest.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: async (k: string, v: string) => { mem.set(k, v); },
      removeItem: async (k: string) => { mem.delete(k); },
    },
  };
});
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession,
      onAuthStateChange,
      signOut: supabaseSignOut,
      signInWithIdToken: jest.fn(),
      signInAnonymously: jest.fn(),
      updateUser: jest.fn(),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    }),
    rpc: jest.fn(),
  },
}));

// logout()이 동적 import로 끌어오는 것들. 여기서는 로그아웃의 auth 상태 전이만 검증하므로
// 부수효과는 전부 no-op으로 둔다 — 단 clearAllData만은 "느린 로컬 정리"를 흉내 내는
// 지점으로 쓴다(실제로 게스트가 끼어드는 창이 바로 여기다).
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
jest.mock('@/features/vocab/db', () => ({ clearAllData }));
jest.mock('@/features/settings/store', () => ({
  useSettingsStore: { getState: () => ({ clearAccountScopedSettings: jest.fn(async () => {}) }) },
}));
jest.mock('@/features/quota', () => ({
  useQuotaStore: { getState: () => ({ clear: jest.fn() }) },
}));
jest.mock('@/features/auth/guest-session-vault', () => ({
  rememberGuestSession: jest.fn(async () => {}),
  restoreGuestSession: jest.fn(async () => null),
  forgetGuestSession: jest.fn(async () => {}),
}));

import { useAuthStore } from '@/features/auth/store';

const GOOGLE_USER = {
  id: 'u1',
  email: 'a@example.com',
  displayName: null,
  avatarUrl: null,
  isAdmin: false,
  nickname: null,
};

describe('logout() — 늦게 끝나도 그 사이 시작된 세션을 덮어쓰지 않는다', () => {
  beforeEach(() => {
    supabaseSignOut.mockClear();
    googleSignOut.mockClear();
    clearAllData.mockClear();
    clearAllData.mockImplementation(async () => {});
  });

  it('아무도 끼어들지 않으면 평소대로 로그아웃한다 (가드가 정상 경로를 막지 않는다)', async () => {
    useAuthStore.setState({ mode: 'google', user: GOOGLE_USER });

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().mode).toBe('none');
    expect(useAuthStore.getState().user).toBeNull();
    expect(supabaseSignOut).toHaveBeenCalledTimes(1);
  });

  it('로컬 정리 중 게스트가 시작되면 그 세션을 유지하고 익명 세션도 지우지 않는다', async () => {
    // 사용자가 /login 에서 "게스트로 시작"을 눌러 새 세션이 이미 살아 있는 상태를 만든다.
    // 실제 앱에서는 loginAsGuest()가 익명 세션을 만들고 mode='guest'로 바꾼 시점이다.
    clearAllData.mockImplementation(async () => {
      useAuthStore.setState({ mode: 'guest', user: null });
    });
    useAuthStore.setState({ mode: 'google', user: GOOGLE_USER });

    await useAuthStore.getState().logout();

    // 갓 만든 게스트 세션이 살아남는다 — /login 으로 되튕기지 않는다.
    expect(useAuthStore.getState().mode).toBe('guest');
    // 그리고 그 게스트의 익명 supabase 세션도 지워지지 않는다.
    expect(supabaseSignOut).not.toHaveBeenCalled();
    // 네이티브 구글 세션 정리는 게스트와 무관하므로 그대로 수행한다.
    expect(googleSignOut).toHaveBeenCalledTimes(1);
  });
});
