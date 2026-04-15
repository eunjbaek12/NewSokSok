import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

const AUTH_KEY = '@soksok_auth';
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';

export type AuthMode = 'none' | 'guest' | 'google';

interface GoogleUser {
  id: string;
  googleId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
}

interface AuthState {
  mode: AuthMode;
  user: GoogleUser | null;
  token: string | null;
}

interface AuthContextValue {
  authMode: AuthMode;
  user: GoogleUser | null;
  token: string | null;
  loading: boolean;
  loginAsGuest: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  handleTokenExpired: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_BASE =
  typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_DOMAIN
    ? `http://${process.env.EXPO_PUBLIC_DOMAIN}`
    : 'http://localhost:5000';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({ mode: 'none', user: null, token: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: GOOGLE_CLIENT_ID,
      scopes: ['openid', 'profile', 'email'],
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(AUTH_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as AuthState;
          // 이전 버전 호환: google 모드인데 token이 없으면 재로그인 필요
          if (parsed.mode === 'google' && !parsed.token) {
            await AsyncStorage.removeItem(AUTH_KEY);
          } else if (parsed.mode === 'google' && parsed.token) {
            // JWT 만료 여부 확인 (디코딩만, 서명 검증 불필요)
            try {
              const [, payloadB64] = parsed.token.split('.');
              const payload = JSON.parse(atob(payloadB64)) as { exp?: number };
              if (payload.exp && payload.exp * 1000 < Date.now()) {
                // 만료됨 → 로그아웃 상태로 초기화
                await AsyncStorage.removeItem(AUTH_KEY);
              } else {
                setAuthState(parsed);
              }
            } catch {
              // 디코딩 실패 시 안전하게 초기화
              await AsyncStorage.removeItem(AUTH_KEY);
            }
          } else {
            setAuthState(parsed);
          }
        }
      } catch { }
      setLoading(false);
    })();
  }, []);

  const persist = useCallback(async (state: AuthState) => {
    setAuthState(state);
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(state));
  }, []);

  const loginAsGuest = useCallback(async () => {
    await persist({ mode: 'guest', user: null, token: null });
  }, [persist]);

  const signInWithGoogle = useCallback(async () => {
    if (!GOOGLE_CLIENT_ID) {
      throw new Error('GOOGLE_CLIENT_ID_MISSING');
    }

    await GoogleSignin.hasPlayServices();
    await GoogleSignin.signIn();
    const tokens = await GoogleSignin.getTokens();

    if (!tokens.accessToken) {
      throw new Error('NO_ACCESS_TOKEN');
    }

    const res = await fetch(`${API_BASE}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: tokens.accessToken }),
    });

    if (!res.ok) {
      throw new Error('GOOGLE_LOGIN_FAILED');
    }

    const data = await res.json();
    await persist({ mode: 'google', user: data.user, token: data.token });
  }, [persist]);

  const logout = useCallback(async () => {
    try {
      await GoogleSignin.signOut();
    } catch {
      // Google 세션이 없거나 이미 로그아웃 상태여도 무시
    }
    await persist({ mode: 'none', user: null, token: null });
  }, [persist]);

  // JWT 만료로 인한 401 수신 시 조용히 로그아웃 처리
  const handleTokenExpired = useCallback(async () => {
    try {
      await GoogleSignin.signOut();
    } catch { }
    await persist({ mode: 'none', user: null, token: null });
  }, [persist]);

  return (
    <AuthContext.Provider
      value={{
        authMode: authState.mode,
        user: authState.user,
        token: authState.token,
        loading,
        loginAsGuest,
        signInWithGoogle,
        handleTokenExpired,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
