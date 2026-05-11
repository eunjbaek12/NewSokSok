/**
 * Verifies the SecureStore migration of the Gemini API key.
 * Reason: a regression here either (a) loses an existing user's key on
 * upgrade or (b) leaves the plaintext key in AsyncStorage forever.
 */

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: (k: string) => Promise.resolve(store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, v); return Promise.resolve(); },
      removeItem: (k: string) => { store.delete(k); return Promise.resolve(); },
      __reset: () => store.clear(),
      __setRaw: (k: string, v: string) => store.set(k, v),
      __getRaw: (k: string) => (store.has(k) ? store.get(k)! : null),
    },
  };
});

jest.mock('@/lib/storage/secure-string', () => {
  const store = new Map<string, string>();
  return {
    getSecureString: (k: string) => Promise.resolve(store.has(k) ? store.get(k)! : null),
    setSecureString: (k: string, v: string) => { store.set(k, v); return Promise.resolve(); },
    deleteSecureString: (k: string) => { store.delete(k); return Promise.resolve(); },
    __reset: () => store.clear(),
    __setRaw: (k: string, v: string) => store.set(k, v),
    __getRaw: (k: string) => (store.has(k) ? store.get(k)! : null),
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureMock from '@/lib/storage/secure-string';
import {
  loadAndMigrateApiKey,
  saveApiKey,
  PROFILE_STORAGE_KEY,
  SECURE_API_KEY,
} from '@/features/settings/api-key-storage';

const Async = AsyncStorage as unknown as {
  __reset: () => void;
  __setRaw: (k: string, v: string) => void;
  __getRaw: (k: string) => string | null;
};
const Secure = SecureMock as unknown as {
  __reset: () => void;
  __setRaw: (k: string, v: string) => void;
  __getRaw: (k: string) => string | null;
};

beforeEach(() => {
  Async.__reset();
  Secure.__reset();
});

describe('loadAndMigrateApiKey', () => {
  test('returns existing SecureStore key when present (idempotent)', async () => {
    Secure.__setRaw(SECURE_API_KEY, 'AIza-existing');
    Async.__setRaw(
      PROFILE_STORAGE_KEY,
      JSON.stringify({ nickname: 'kim', startupTab: 'index', geminiApiKey: 'AIza-stale' }),
    );

    const key = await loadAndMigrateApiKey();

    expect(key).toBe('AIza-existing');
    // Should NOT touch AsyncStorage since already migrated
    const profile = JSON.parse(Async.__getRaw(PROFILE_STORAGE_KEY)!);
    expect(profile.geminiApiKey).toBe('AIza-stale');
  });

  test('migrates legacy plaintext key from AsyncStorage to SecureStore', async () => {
    Async.__setRaw(
      PROFILE_STORAGE_KEY,
      JSON.stringify({ nickname: 'kim', startupTab: 'index', geminiApiKey: 'AIza-legacy' }),
    );

    const key = await loadAndMigrateApiKey();

    expect(key).toBe('AIza-legacy');
    expect(Secure.__getRaw(SECURE_API_KEY)).toBe('AIza-legacy');
    // Profile JSON should no longer contain the key field
    const profile = JSON.parse(Async.__getRaw(PROFILE_STORAGE_KEY)!);
    expect('geminiApiKey' in profile).toBe(false);
    expect(profile.nickname).toBe('kim');
    expect(profile.startupTab).toBe('index');
  });

  test('strips empty geminiApiKey field from profile JSON without writing to SecureStore', async () => {
    Async.__setRaw(
      PROFILE_STORAGE_KEY,
      JSON.stringify({ nickname: 'kim', startupTab: 'index', geminiApiKey: '' }),
    );

    const key = await loadAndMigrateApiKey();

    expect(key).toBe('');
    expect(Secure.__getRaw(SECURE_API_KEY)).toBeNull();
    const profile = JSON.parse(Async.__getRaw(PROFILE_STORAGE_KEY)!);
    expect('geminiApiKey' in profile).toBe(false);
  });

  test('returns empty string when no profile JSON exists (fresh install)', async () => {
    const key = await loadAndMigrateApiKey();
    expect(key).toBe('');
    expect(Secure.__getRaw(SECURE_API_KEY)).toBeNull();
  });

  test('returns empty string when profile JSON has no geminiApiKey field', async () => {
    Async.__setRaw(
      PROFILE_STORAGE_KEY,
      JSON.stringify({ nickname: 'kim', startupTab: 'vocab-lists' }),
    );

    const key = await loadAndMigrateApiKey();

    expect(key).toBe('');
    expect(Secure.__getRaw(SECURE_API_KEY)).toBeNull();
    // Profile should be untouched
    const profile = JSON.parse(Async.__getRaw(PROFILE_STORAGE_KEY)!);
    expect(profile.nickname).toBe('kim');
    expect(profile.startupTab).toBe('vocab-lists');
  });

  test('returns empty string when profile JSON is malformed', async () => {
    Async.__setRaw(PROFILE_STORAGE_KEY, '{ not valid json');
    const key = await loadAndMigrateApiKey();
    expect(key).toBe('');
    expect(Secure.__getRaw(SECURE_API_KEY)).toBeNull();
  });
});

describe('saveApiKey', () => {
  test('stores non-empty key in SecureStore', async () => {
    await saveApiKey('AIza-new');
    expect(Secure.__getRaw(SECURE_API_KEY)).toBe('AIza-new');
  });

  test('removes key from SecureStore when given empty string', async () => {
    Secure.__setRaw(SECURE_API_KEY, 'AIza-old');
    await saveApiKey('');
    expect(Secure.__getRaw(SECURE_API_KEY)).toBeNull();
  });

  test('overwrites existing key', async () => {
    Secure.__setRaw(SECURE_API_KEY, 'AIza-old');
    await saveApiKey('AIza-new');
    expect(Secure.__getRaw(SECURE_API_KEY)).toBe('AIza-new');
  });
});
