/**
 * 구글 계정 선택 창을 닫으면 「로그인 실패」가 아니라 조용히 돌아가야 한다.
 *
 * 문제(실기 2026-09-11): 게스트가 [구글로 연결하기]를 눌렀다가 계정 선택 창을 닫으면
 * 「로그인 실패 — Google 로그인에 실패했습니다. 다시 시도해 주세요」가 떴다. 로그인 화면·설정·
 * 공유 단어장 입구 모두 같았다.
 *
 * 원인: @react-native-google-signin 16.x 의 `signIn()` 은 취소를 **던지지 않고**
 * `{ type: 'cancelled', data: null }` 로 돌려준다. 스토어가 그걸 보지 않고 `getTokens()` 로
 * 넘어가 거기서 던졌고, 호출부는 그걸 실패로 알렸다. 이제 스토어가 취소를 따로
 * `GOOGLE_SIGNIN_CANCELED` 로 던진다(Apple 의 `APPLE_SIGNIN_CANCELED` 와 같은 모양).
 */
const signIn = jest.fn();
const getTokens = jest.fn();
const signInWithIdToken = jest.fn();

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    signOut: jest.fn(async () => {}),
    hasPlayServices: jest.fn(async () => true),
    signIn,
    getTokens,
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
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: jest.fn(),
      signOut: jest.fn(async () => ({ error: null })),
      signInWithIdToken,
      signInAnonymously: jest.fn(async () => ({ error: null })),
      updateUser: jest.fn(),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    }),
    rpc: jest.fn(),
  },
}));
jest.mock('@/features/auth/guest-session-vault', () => ({
  restoreGuestSession: jest.fn(async () => null),
  rememberGuestSession: jest.fn(async () => {}),
  forgetGuestSession: jest.fn(async () => {}),
}));
jest.mock('@/features/sync/engine', () => ({ flushPush: jest.fn(async () => {}) }));
jest.mock('@/features/sync/store', () => ({
  useSyncStore: { getState: () => ({ resetAll: jest.fn(async () => {}) }) },
}));
jest.mock('@/features/vocab/db', () => ({ clearAllData: jest.fn(async () => {}) }));

// GOOGLE_CLIENT_ID 는 모듈을 읽는 순간 굳는다 — 비어 있으면 signIn 까지 가지도 않는다.
function loadStore() {
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID = 'test-web-client-id';
  let store: any;
  jest.isolateModules(() => {
    store = require('@/features/auth/store').useAuthStore;
  });
  return store;
}

beforeEach(() => {
  signIn.mockReset();
  getTokens.mockReset();
  signInWithIdToken.mockReset();
});

describe('signInWithGoogle — 취소와 실패를 가른다', () => {
  it('계정 선택 창을 닫으면 GOOGLE_SIGNIN_CANCELED 로 끝나고 토큰을 요청하지 않는다', async () => {
    signIn.mockResolvedValue({ type: 'cancelled', data: null });
    const store = loadStore();
    store.setState({ mode: 'guest', user: null });

    await expect(store.getState().signInWithGoogle()).rejects.toThrow('GOOGLE_SIGNIN_CANCELED');

    expect(getTokens).not.toHaveBeenCalled();
    expect(signInWithIdToken).not.toHaveBeenCalled();
    // 게스트는 게스트로 남는다.
    expect(store.getState().mode).toBe('guest');
  });

  it('계정을 고르면 취소 검사를 지나 토큰 교환까지 간다', async () => {
    signIn.mockResolvedValue({ type: 'success', data: { idToken: 'tok' } });
    getTokens.mockResolvedValue({ idToken: 'tok', accessToken: 'acc' });
    // 교환 단계에서 멈춰 세운다 — 여기까지 왔다는 것만 본다.
    signInWithIdToken.mockResolvedValue({ data: {}, error: new Error('EXCHANGE_REACHED') });
    const store = loadStore();

    await expect(store.getState().signInWithGoogle()).rejects.toThrow('EXCHANGE_REACHED');

    expect(getTokens).toHaveBeenCalledTimes(1);
    expect(signInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'tok' });
  });
});
