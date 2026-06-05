/**
 * Regression (intermittent): logout → "바로 시작하기" sometimes bounces straight
 * back to the login screen.
 *
 * Root cause: hydrate() re-ran on a RootLayout remount (the dev-client splash
 * remount on logout/login). The zustand store is a module singleton that already
 * holds the live auth state, but hydrate re-read the persisted intent and
 * `set()` it. Right after loginAsGuest set mode='guest' in memory, the
 * AsyncStorage save('guest') hadn't flushed yet — so a remount-triggered hydrate
 * loaded the stale 'none' and clobbered mode back to 'none', and AppStack's guard
 * redirected to /login. Being a save↔remount timing race, it only fired
 * sometimes.
 *
 * Fix: hydrate runs at most once per JS context. A second call (remount) must be
 * a no-op — it must NOT re-read the intent, must NOT clobber the in-memory mode,
 * and must NOT register a duplicate onAuthStateChange listener.
 */
const getSession = jest.fn(async () => ({ data: { session: null } }));
const onAuthStateChange = jest.fn();
const signOut = jest.fn(async () => ({ error: null }));

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
      signOut,
      signInWithIdToken: jest.fn(),
      updateUser: jest.fn(),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    }),
    rpc: jest.fn(),
  },
}));

import { useAuthStore } from '@/features/auth/store';

describe('auth hydrate — once per JS context (remount-safe)', () => {
  it('a remount (second hydrate) does not re-read intent, clobber mode, or re-add the listener', async () => {
    // First mount: hydrate restores from persisted intent (default 'none').
    await useAuthStore.getState().hydrate();
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().mode).toBe('none');

    // A fresh guest login sets the mode in memory; its AsyncStorage write may
    // still be in flight (modeled by NOT awaiting any save here).
    useAuthStore.setState({ mode: 'guest', user: null });

    // RootLayout remounts → AppHydrators effect re-runs → hydrate() again.
    await useAuthStore.getState().hydrate();

    // The in-memory guest session survives — no bounce to /login.
    expect(useAuthStore.getState().mode).toBe('guest');
    // Second hydrate early-returned: no extra getSession read, no duplicate listener.
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(onAuthStateChange).toHaveBeenCalledTimes(1);
  });
});
