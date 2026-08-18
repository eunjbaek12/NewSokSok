import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  deleteSecureString,
  getSecureString,
  setSecureString,
} from '@/lib/storage/secure-string';

/**
 * Google/Apple 로그인이 현재 Supabase 세션을 덮어써도 이전 게스트의 익명 UUID를
 * 되살릴 수 있게 보관하는 refresh token. 토큰은 계정 비밀번호와 같은 자격 증명이므로
 * AsyncStorage가 아니라 SecureStore에 둔다.
 */
export const GUEST_REFRESH_TOKEN_KEY = 'soksok_guest_refresh_token';

type GuestSessionCandidate = Pick<Session, 'refresh_token' | 'user'> | null | undefined;

export async function rememberGuestSession(session: GuestSessionCandidate): Promise<void> {
  if (!session?.user?.is_anonymous || !session.refresh_token) return;
  await setSecureString(GUEST_REFRESH_TOKEN_KEY, session.refresh_token);
}

export async function forgetGuestSession(): Promise<void> {
  await deleteSecureString(GUEST_REFRESH_TOKEN_KEY);
}

function isPermanentlyInvalidRefreshToken(error: { code?: string } | null): boolean {
  return error?.code === 'refresh_token_not_found' ||
    error?.code === 'refresh_token_already_used' ||
    error?.code === 'session_not_found' ||
    error?.code === 'session_expired';
}

/**
 * 클라우드 로그아웃 뒤 이전 게스트 세션을 복원한다.
 *
 * refresh token은 사용 시 회전하므로 성공 응답의 새 토큰을 즉시 덮어쓴다. 네트워크
 * 오류에서는 보관 토큰을 지우지 않고 오류를 올린다. 그때 새 익명 계정으로 폴백하면
 * 일시적 장애 하나가 한도 리셋으로 굳어지기 때문이다.
 */
export async function restoreGuestSession(): Promise<Session | null> {
  const refreshToken = await getSecureString(GUEST_REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error) {
    if (isPermanentlyInvalidRefreshToken(error)) {
      await forgetGuestSession();
      return null;
    }
    throw error;
  }

  const session = data.session;
  if (!session?.user?.is_anonymous) {
    // 저장값이 손상됐거나 예상과 다른 계정 토큰이면 게스트 자격 증명으로 재사용하지 않는다.
    await forgetGuestSession();
    return null;
  }

  await rememberGuestSession(session);
  return session;
}
