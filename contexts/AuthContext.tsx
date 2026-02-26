import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_KEY = '@soksok_auth';

export type AuthMode = 'none' | 'guest' | 'google';

interface GoogleUser {
  id: string;
  googleId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface AuthState {
  mode: AuthMode;
  user: GoogleUser | null;
}

interface AuthContextValue {
  authMode: AuthMode;
  user: GoogleUser | null;
  loading: boolean;
  loginAsGuest: () => Promise<void>;
  loginWithGoogle: (accessToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_BASE =
  typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : 'http://localhost:5000';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({ mode: 'none', user: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(AUTH_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as AuthState;
          setAuthState(parsed);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const persist = useCallback(async (state: AuthState) => {
    setAuthState(state);
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(state));
  }, []);

  const loginAsGuest = useCallback(async () => {
    await persist({ mode: 'guest', user: null });
  }, [persist]);

  const loginWithGoogle = useCallback(async (accessToken: string) => {
    const res = await fetch(`${API_BASE}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken }),
    });

    if (!res.ok) {
      throw new Error('Google login failed');
    }

    const data = await res.json();
    await persist({ mode: 'google', user: data.user });
  }, [persist]);

  const logout = useCallback(async () => {
    await persist({ mode: 'none', user: null });
  }, [persist]);

  return (
    <AuthContext
      value={{
        authMode: authState.mode,
        user: authState.user,
        loading,
        loginAsGuest,
        loginWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
