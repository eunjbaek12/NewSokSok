import { create } from 'zustand';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  deleteAccount: () => Promise<void>;
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
    // Custom nickname is stored under a non-standard key so Google's OAuth
    // claims (full_name/name/avatar_url) re-applied on each signInWithIdToken
    // never clobber it.
    nickname: typeof supabaseUser.user_metadata?.nickname === 'string'
      ? supabaseUser.user_metadata.nickname
      : null,
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
    // Whether we're leaving a Google session. The destructive local cleanup
    // below is correct ONLY for Google: the cloud holds the authoritative copy,
    // so wiping local is safe (re-pulled on next login) and needed for account
    // isolation. For a GUEST, local storage is the *only* copy of their words
    // and nickname — and the guest logout prompt explicitly promises "저장된
    // 단어는 이 기기에 유지됩니다". So guests must keep their local data.
    const wasGoogle = useAuthStore.getState().mode === 'google';

    // 1) Best-effort flush while still authenticated (RLS passes), so edits
    //    made within the push debounce window aren't lost. (No-op for guest:
    //    flushPush early-returns when not Google-authed.)
    // Dynamic imports break the auth ↔ sync require cycle (sync/engine imports
    // useAuthStore).
    try {
      const { flushPush } = await import('@/features/sync/engine');
      await flushPush();
    } catch (e: any) {
      console.warn('[auth] pre-logout flush failed:', e?.message ?? e);
    }

    // 2) Clear local account state BEFORE signing out — Google only.
    //    supabase.auth.signOut() fires onAuthStateChange('SIGNED_OUT'), which
    //    re-renders the tree (and in dev can remount the root → splash). If
    //    the cleanup ran *after* signOut, that remount could interrupt logout
    //    and skip resetAll()/clearAllData(), leaving lastPulledAt stale — then
    //    the next login can't re-pull the account's data (it stays "behind the
    //    watermark"). This cleanup is local-only and auth-independent, so
    //    running it first is safe and guarantees it completes.
    if (wasGoogle) {
      try {
        const { clearAllData } = await import('@/features/vocab/db');
        await clearAllData();
        const { useSyncStore } = await import('@/features/sync/store');
        await useSyncStore.getState().resetAll();
        // Account-scoped settings (nickname, custom study selection referencing
        // now-cleared list IDs, BYOK key). Device preferences are preserved.
        const { useSettingsStore } = await import('@/features/settings/store');
        await useSettingsStore.getState().clearAccountScopedSettings();
        // In-memory quota status belongs to the logged-out account.
        const { useQuotaStore } = await import('@/features/quota');
        useQuotaStore.getState().clear();
      } catch (e: any) {
        console.warn('[auth] logout local clear failed:', e?.message ?? e);
      }
    }

    // 3) Sign out of Google + Supabase. Each wrapped so a failure can't skip
    //    the final state flip below. (Harmless no-ops for a guest.)
    try { await GoogleSignin.signOut(); } catch {}
    try { await supabase.auth.signOut(); } catch (e: any) {
      console.warn('[auth] supabase signOut failed:', e?.message ?? e);
    }

    await persist({ mode: 'none', user: null }, set);
  },

  deleteAccount: async () => {
    const { error } = await supabase.rpc('delete_user');
    if (error) throw error;

    // logout()이 추가한 격리 단계와 동일하게: SQLite + sync watermark +
    // account-scoped settings(닉네임·customStudy·SecureStore BYOK 키)까지
    // 비운다. logout보다 한 단계 더 — AsyncStorage @soksok_* 전체 wipe로
    // device-preference(타이핑·학습·자동재생 설정)까지 초기화한다. 계정
    // 삭제 의미가 "이 기기에서 흔적 제거"라 정상 logout보다 강하게 처리.
    //
    // 동적 import는 sync/engine ↔ auth 순환참조 회피용 (first-login.ts와
    // 동일 패턴).
    try {
      const { clearAllData } = await import('@/features/vocab/db');
      await clearAllData();
      const { useSyncStore } = await import('@/features/sync/store');
      await useSyncStore.getState().resetAll();
      const { useSettingsStore } = await import('@/features/settings/store');
      // clearAccountScopedSettings가 SecureStore의 BYOK Gemini 키도 함께
      // 삭제한다. 이게 누락되면 계정 삭제 후에도 키가 SecureStore에 남아
      // 다음 사용자가 동일 키로 비용 도용 가능 (보안 이슈).
      await useSettingsStore.getState().clearAccountScopedSettings();
      const { useQuotaStore } = await import('@/features/quota');
      useQuotaStore.getState().clear();
    } catch (e: any) {
      console.warn('[auth] delete-account store reset failed:', e?.message ?? e);
    }

    // device-preference까지 전부 wipe. clearAccountScopedSettings는
    // account-scoped만 비우므로 나머지는 여기서 일괄 정리.
    const keys = await AsyncStorage.getAllKeys();
    const soksokKeys = keys.filter(k => k.startsWith('@soksok_'));
    await AsyncStorage.multiRemove(soksokKeys);

    try {
      await GoogleSignin.revokeAccess();
      await GoogleSignin.signOut();
    } catch {}

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
  const deleteAccount = useAuthStore(s => s.deleteAccount);

  return {
    authMode: mode,
    user,
    loading,
    loginAsGuest,
    signInWithGoogle,
    logout,
    deleteAccount,
  };
}
