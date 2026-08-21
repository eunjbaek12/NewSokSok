const secure = new Map<string, string>();
const refreshSession = jest.fn();

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('@/lib/storage/secure-string', () => ({
  getSecureString: async (key: string) => secure.get(key) ?? null,
  setSecureString: async (key: string, value: string) => { secure.set(key, value); },
  deleteSecureString: async (key: string) => { secure.delete(key); },
}));
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { refreshSession } },
}));

const anonSession = (refreshToken: string) => ({
  refresh_token: refreshToken,
  user: { id: 'anon-1', is_anonymous: true },
});

beforeEach(() => {
  secure.clear();
  refreshSession.mockReset();
});

describe('guest-session-vault', () => {
  it('익명 세션만 저장한다', async () => {
    const { rememberGuestSession, GUEST_REFRESH_TOKEN_KEY } = require('@/features/auth/guest-session-vault');

    await rememberGuestSession(anonSession('guest-token'));
    expect(secure.get(GUEST_REFRESH_TOKEN_KEY)).toBe('guest-token');

    await rememberGuestSession({ refresh_token: 'google-token', user: { is_anonymous: false } });
    expect(secure.get(GUEST_REFRESH_TOKEN_KEY)).toBe('guest-token');
  });

  it('저장 토큰으로 같은 익명 세션을 복원하고 회전된 토큰을 다시 저장한다', async () => {
    const { rememberGuestSession, restoreGuestSession, GUEST_REFRESH_TOKEN_KEY } = require('@/features/auth/guest-session-vault');
    await rememberGuestSession(anonSession('old-token'));
    refreshSession.mockResolvedValue({ data: { session: anonSession('rotated-token') }, error: null });

    const restored = await restoreGuestSession();

    expect(refreshSession).toHaveBeenCalledWith({ refresh_token: 'old-token' });
    expect(restored?.user.id).toBe('anon-1');
    expect(secure.get(GUEST_REFRESH_TOKEN_KEY)).toBe('rotated-token');
  });

  it('폐기된 토큰만 지우고 새 게스트 생성을 허용한다', async () => {
    const { rememberGuestSession, restoreGuestSession, GUEST_REFRESH_TOKEN_KEY } = require('@/features/auth/guest-session-vault');
    await rememberGuestSession(anonSession('invalid-token'));
    refreshSession.mockResolvedValue({
      data: { session: null },
      error: { code: 'refresh_token_not_found', message: 'Refresh Token Not Found' },
    });

    await expect(restoreGuestSession()).resolves.toBeNull();
    expect(secure.has(GUEST_REFRESH_TOKEN_KEY)).toBe(false);
  });

  it('일시적 네트워크 오류에는 토큰을 버리지 않는다', async () => {
    const { rememberGuestSession, restoreGuestSession, GUEST_REFRESH_TOKEN_KEY } = require('@/features/auth/guest-session-vault');
    await rememberGuestSession(anonSession('keep-token'));
    const networkError = { code: 'request_timeout', message: 'network timeout' };
    refreshSession.mockResolvedValue({ data: { session: null }, error: networkError });

    await expect(restoreGuestSession()).rejects.toBe(networkError);
    expect(secure.get(GUEST_REFRESH_TOKEN_KEY)).toBe('keep-token');
  });
});
