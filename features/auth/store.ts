import { create } from 'zustand';
import { Platform } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
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
// iOS Google Sign-In은 별도 OAuth 클라이언트(iOS type) 필요. 미설정 시 빈 문자열 →
// configureGoogleSignIn에서 iosClientId 옵션이 빠지면서 webClientId만 사용되는데,
// iOS는 webClientId만으론 DEVELOPER_ERROR(code 10). 빌드 가드(app.config.js)에서도
// production iOS 빌드에 필수 env로 등록 — 미설정 빌드 자체 차단.
const GOOGLE_CLIENT_ID_IOS = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS || '';

// Google·Apple 양쪽을 합쳐 "클라우드 인증 사용자"로 취급. hydrate/logout 분기가
// 사회 로그인 모드 전체에 동일 동작을 해야 해서 별도 헬퍼로 추출.
function isCloudAuthMode(mode: AuthMode): mode is 'google' | 'apple' {
  return mode === 'google' || mode === 'apple';
}

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
  signInWithApple: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

let googleConfigured = false;
function configureGoogleSignIn() {
  if (googleConfigured) return;
  googleConfigured = true;
  GoogleSignin.configure({
    webClientId: GOOGLE_CLIENT_ID,
    // iOS는 iosClientId 없이는 DEVELOPER_ERROR. Android에선 무시되므로 항상 전달해도 무해.
    iosClientId: GOOGLE_CLIENT_ID_IOS || undefined,
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

    // Our own persisted intent (@soksok_auth) is authoritative — NOT whatever
    // supabase.auth.getSession() happens to return. supabase.auth.signOut()
    // skips removing the LOCAL session when its network revoke call fails
    // (auth-js GoTrueClient._signOut early-returns on a non-401/403/404 error),
    // so a logged-out user can have a lingering session in AsyncStorage. If we
    // trusted getSession() here, the root remount that logout triggers (splash)
    // — or the next cold start — would silently resurrect that account. So we
    // honor the saved intent and only restore Google when WE believe we're
    // Google AND a session actually exists.
    const loaded = await authStore.load();
    const { data: { session } } = await supabase.auth.getSession();

    if (isCloudAuthMode(loaded.mode) && session?.user) {
      const user = await buildUser(session.user);
      await persist({ mode: loaded.mode, user }, set);
    } else if (isCloudAuthMode(loaded.mode)) {
      // We believed we were signed in but supabase has no session — external
      // session loss. Drop to logged-out.
      await authStore.remove();
      set({ mode: 'none', user: null });
    } else {
      // Intent is 'none' or 'guest'. Honor it, and proactively clear any orphan
      // session a failed signOut left behind so it can't resurrect later.
      if (session) {
        try { await supabase.auth.signOut({ scope: 'local' }); } catch {}
      }
      set({ mode: loaded.mode, user: null });
    }
    set({ loading: false });

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        // React to SIGNED_OUT ONLY if we still consider ourselves in a cloud
        // (Google/Apple) session. supabase fires this event asynchronously (the
        // callback isn't awaited by signOut()), so a SIGNED_OUT emitted during
        // logout() can land *after* the user has already tapped "게스트로 시작"
        // and loginAsGuest() set mode='guest'. Without this guard it would
        // clobber the fresh guest session back to 'none', and AppStack would
        // bounce the user to /login — exactly the "have to log in as guest
        // twice" bug. Genuine external session loss still works: mode is
        // 'google'/'apple' then.
        if (isCloudAuthMode(useAuthStore.getState().mode)) {
          await persist({ mode: 'none', user: null }, set);
        }
      } else if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        // Preserve current mode (could be 'apple' from a fresh signInWithApple
        // call). Default to 'google' for backward compatibility with any token
        // refresh that fires before our explicit signIn* set the mode.
        const currentMode = useAuthStore.getState().mode;
        const mode: AuthMode = isCloudAuthMode(currentMode) ? currentMode : 'google';
        const user = await buildUser(session.user);
        await persist({ mode, user }, set);
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

  signInWithApple: async () => {
    // iOS only. Android·web에선 isAvailableAsync가 false라 호출부에서 막혀
    // 이 분기 도달 X. 여기서 한번 더 가드.
    if (Platform.OS !== 'ios') throw new Error('APPLE_SIGNIN_UNSUPPORTED');

    // Apple Sign In은 nonce 필수 — Supabase가 raw nonce를 그대로 받아
    // identity token의 sha256 nonce와 매칭. raw를 클라이언트에서 만들고
    // Apple 호출엔 sha256 hex를 nonce로 넘긴다.
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );

    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
    } catch (e: any) {
      // 사용자 취소 → 호출부에서 alert 띄우지 않도록 별도 코드
      if (e?.code === 'ERR_REQUEST_CANCELED') {
        throw new Error('APPLE_SIGNIN_CANCELED');
      }
      throw e;
    }

    if (!credential.identityToken) throw new Error('NO_ID_TOKEN');

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) throw error;

    // Apple은 첫 가입 시에만 fullName·email을 반환한다. 두 번째 로그인부터는
    // credential.fullName / credential.email이 null. 첫 가입 때 Supabase user
    // metadata에 보강해 buildUser가 일관된 이름을 가져갈 수 있게 한다.
    if (credential.fullName && (credential.fullName.givenName || credential.fullName.familyName)) {
      const fullName = [credential.fullName.givenName, credential.fullName.familyName]
        .filter(Boolean)
        .join(' ')
        .trim();
      if (fullName) {
        try {
          await supabase.auth.updateUser({ data: { full_name: fullName } });
        } catch (e: any) {
          console.warn('[auth] apple full_name save failed:', e?.message ?? e);
        }
      }
    }

    const user = await buildUser(data.user!);
    await persist({ mode: 'apple', user }, set);
  },

  logout: async () => {
    // Whether we're leaving a cloud-auth (Google/Apple) session. The destructive
    // local cleanup below is correct ONLY for cloud-auth: the cloud holds the
    // authoritative copy, so wiping local is safe (re-pulled on next login) and
    // needed for account isolation. For a GUEST, local storage is the *only*
    // copy of their words and nickname — and the guest logout prompt explicitly
    // promises "저장된 단어는 이 기기에 유지됩니다". So guests must keep their
    // local data.
    const wasCloudAuth = isCloudAuthMode(useAuthStore.getState().mode);

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

    // 2) Clear local account state BEFORE signing out — cloud-auth only.
    //    supabase.auth.signOut() fires onAuthStateChange('SIGNED_OUT'), which
    //    re-renders the tree (and in dev can remount the root → splash). If
    //    the cleanup ran *after* signOut, that remount could interrupt logout
    //    and skip resetAll()/clearAllData(), leaving lastPulledAt stale — then
    //    the next login can't re-pull the account's data (it stays "behind the
    //    watermark"). This cleanup is local-only and auth-independent, so
    //    running it first is safe and guarantees it completes.
    if (wasCloudAuth) {
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

    // 3) Flip to logged-out and PERSIST it *before* signing out. signOut fires
    //    onAuthStateChange('SIGNED_OUT') and (in dev) can remount the root →
    //    hydrate() re-runs mid-logout. Persisting 'none' first guarantees that
    //    a concurrent hydrate reads logged-out intent, not the stale cloud-auth
    //    mode we're leaving. Pairs with hydrate() treating @soksok_auth as the
    //    source of truth. (The SIGNED_OUT handler's isCloudAuthMode guard then
    //    no-ops, since mode is already 'none'.)
    await persist({ mode: 'none', user: null }, set);

    // 4) Sign out of provider + Supabase (best-effort). scope:'local' wipes the
    //    local session without depending on a server round-trip that could fail
    //    and leave it behind; even if this throws, hydrate() now honors the
    //    'none' intent and clears any orphan session. (No-ops for a guest.)
    //    Apple has no client-side signOut equivalent — only Google needs the
    //    provider-side call.
    try { await GoogleSignin.signOut(); } catch {}
    try { await supabase.auth.signOut({ scope: 'local' }); } catch (e: any) {
      console.warn('[auth] supabase signOut failed:', e?.message ?? e);
    }
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

    // delete_user로 서버 user가 이미 삭제된 상태 → 기본 scope 'global'의 signOut은
    // 서버 /logout 호출이 실패할 수 있고, 그 throw가 아래 persist를 스킵시키면
    // mode가 'google'로 남는다(= 탈퇴 후 로그인 화면으로 못 가고, 앱 reload 시
    // 만료 전 access token으로 세션이 부활). scope:'local'로 서버 호출 없이 로컬
    // 토큰만 확실히 제거하고, 실패해도 로그아웃 상태 전환은 보장한다.
    // (logout()의 try-catch 처리와 대칭.)
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e: any) {
      console.warn('[auth] delete-account signOut failed:', e?.message ?? e);
    }

    await persist({ mode: 'none', user: null }, set);
  },
}));

export function useAuth() {
  const mode = useAuthStore(s => s.mode);
  const user = useAuthStore(s => s.user);
  const loading = useAuthStore(s => s.loading);
  const loginAsGuest = useAuthStore(s => s.loginAsGuest);
  const signInWithGoogle = useAuthStore(s => s.signInWithGoogle);
  const signInWithApple = useAuthStore(s => s.signInWithApple);
  const logout = useAuthStore(s => s.logout);
  const deleteAccount = useAuthStore(s => s.deleteAccount);

  return {
    authMode: mode,
    user,
    loading,
    loginAsGuest,
    signInWithGoogle,
    signInWithApple,
    logout,
    deleteAccount,
  };
}
