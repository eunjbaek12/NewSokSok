import { create } from 'zustand';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  AuthStateSchema,
  GoogleAuthResponseSchema,
  type AuthMode,
  type AuthState,
  type GoogleUser,
} from '@shared/contracts';
import { persisted } from '@/lib/storage/persisted';
import { apiFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';

const DEFAULT_AUTH: AuthState = { mode: 'none', user: null, token: null };

const authStore = persisted('@soksok_auth', AuthStateSchema, DEFAULT_AUTH);

interface AuthStoreState {
  mode: AuthMode;
  user: GoogleUser | null;
  token: string | null;
  loading: boolean;

  hydrate: () => Promise<void>;
  loginAsGuest: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  handleTokenExpired: () => Promise<void>;
}

let googleConfigured = false;
function configureGoogleSignIn() {
  if (googleConfigured) return;
  googleConfigured = true;
  GoogleSignin.configure({
    webClientId: GOOGLE_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
  });
}

function isJwtExpired(token: string): boolean {
  try {
    const [, payloadB64] = token.split('.');
    const payload = JSON.parse(atob(payloadB64)) as { exp?: number };
    return !!(payload.exp && payload.exp * 1000 < Date.now());
  } catch {
    return true;
  }
}

async function persist(state: AuthState, setState: (p: Partial<AuthStoreState>) => void) {
  setState({ mode: state.mode, user: state.user, token: state.token });
  await authStore.save(state);
}

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  mode: 'none',
  user: null,
  token: null,
  loading: true,

  hydrate: async () => {
    configureGoogleSignIn();
    const loaded = await authStore.load();

    // Refuse stale google sessions (missing or expired token).
    if (loaded.mode === 'google') {
      if (!loaded.token || isJwtExpired(loaded.token)) {
        await authStore.remove();
        set({ mode: 'none', user: null, token: null, loading: false });
        return;
      }
    }
    set({ mode: loaded.mode, user: loaded.user, token: loaded.token, loading: false });
  },

  loginAsGuest: async () => {
    await persist({ mode: 'guest', user: null, token: null }, set);
  },

  signInWithGoogle: async () => {
    if (!GOOGLE_CLIENT_ID) {
      throw new Error('GOOGLE_CLIENT_ID_MISSING');
    }

    await GoogleSignin.hasPlayServices();
    await GoogleSignin.signIn();
    const tokens = await GoogleSignin.getTokens();
    if (!tokens.accessToken) {
      throw new Error('NO_ACCESS_TOKEN');
    }

    const data = await apiFetch('/api/auth/google', {
      schema: GoogleAuthResponseSchema,
      method: 'POST',
      body: { accessToken: tokens.accessToken },
    });

    await persist({ mode: 'google', user: data.user, token: data.token }, set);
  },

  logout: async () => {
    try { await GoogleSignin.signOut(); } catch {}
    await persist({ mode: 'none', user: null, token: null }, set);
  },

  handleTokenExpired: async () => {
    try { await GoogleSignin.signOut(); } catch {}
    await persist({ mode: 'none', user: null, token: null }, set);
  },
}));

/** Selector-friendly hook mirroring the old useAuth() context API. */
export function useAuth() {
  const mode = useAuthStore(s => s.mode);
  const user = useAuthStore(s => s.user);
  const token = useAuthStore(s => s.token);
  const loading = useAuthStore(s => s.loading);
  const loginAsGuest = useAuthStore(s => s.loginAsGuest);
  const signInWithGoogle = useAuthStore(s => s.signInWithGoogle);
  const logout = useAuthStore(s => s.logout);
  const handleTokenExpired = useAuthStore(s => s.handleTokenExpired);

  return {
    authMode: mode,
    user,
    token,
    loading,
    loginAsGuest,
    signInWithGoogle,
    logout,
    handleTokenExpired,
  };
}

// Re-export for callers that also need to use the 401 handler outside the hook.
export { ApiError };
