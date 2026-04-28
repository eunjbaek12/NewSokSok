import { create } from 'zustand';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import {
  AuthStateSchema,
  type AuthMode,
  type AuthState,
  type GoogleUser,
} from '@shared/contracts';
import { persisted } from '@/lib/storage/persisted';
import { supabase } from '@/lib/supabase';

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';

const DEFAULT_AUTH: AuthState = { mode: 'none', user: null };

const authStore = persisted('@soksok_auth', AuthStateSchema, DEFAULT_AUTH, {
  onDrift: () => DEFAULT_AUTH,
});

interface AuthStoreState {
  mode: AuthMode;
  user: GoogleUser | null;
  loading: boolean;

  hydrate: () => Promise<void>;
  loginAsGuest: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
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

async function buildUser(supabaseUser: SupabaseUser): Promise<GoogleUser> {
  const { data } = await supabase
    .from('app_admins')
    .select('user_id')
    .eq('user_id', supabaseUser.id)
    .maybeSingle();
  return {
    id: supabaseUser.id,
    email: supabaseUser.email ?? '',
    displayName: supabaseUser.user_metadata?.full_name ?? null,
    avatarUrl: supabaseUser.user_metadata?.avatar_url ?? null,
    isAdmin: !!data,
  };
}

async function persist(state: AuthState, setState: (p: Partial<AuthStoreState>) => void) {
  setState({ mode: state.mode, user: state.user });
  await authStore.save(state);
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  mode: 'none',
  user: null,
  loading: true,

  hydrate: async () => {
    configureGoogleSignIn();

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const user = await buildUser(session.user);
      await persist({ mode: 'google', user }, set);
    } else {
      const loaded = await authStore.load();
      if (loaded.mode === 'google') {
        // No valid Supabase session — reset to logged-out
        await authStore.remove();
        set({ mode: 'none', user: null });
      } else {
        set({ mode: loaded.mode, user: null });
      }
    }
    set({ loading: false });

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        await persist({ mode: 'none', user: null }, set);
      } else if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        const user = await buildUser(session.user);
        await persist({ mode: 'google', user }, set);
      }
    });
  },

  loginAsGuest: async () => {
    await persist({ mode: 'guest', user: null }, set);
  },

  signInWithGoogle: async () => {
    if (!GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID_MISSING');

    await GoogleSignin.hasPlayServices();
    await GoogleSignin.signIn();
    const tokens = await GoogleSignin.getTokens();
    const idToken = tokens.idToken;
    if (!idToken) throw new Error('NO_ID_TOKEN');

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) throw error;

    const user = await buildUser(data.user!);
    await persist({ mode: 'google', user }, set);
  },

  logout: async () => {
    try { await GoogleSignin.signOut(); } catch {}
    await supabase.auth.signOut();
    await persist({ mode: 'none', user: null }, set);
  },
}));

export function useAuth() {
  const mode = useAuthStore(s => s.mode);
  const user = useAuthStore(s => s.user);
  const loading = useAuthStore(s => s.loading);
  const loginAsGuest = useAuthStore(s => s.loginAsGuest);
  const signInWithGoogle = useAuthStore(s => s.signInWithGoogle);
  const logout = useAuthStore(s => s.logout);

  return {
    authMode: mode,
    user,
    loading,
    loginAsGuest,
    signInWithGoogle,
    logout,
  };
}
