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
import {
  forgetGuestSession,
  rememberGuestSession,
  restoreGuestSession,
} from './guest-session-vault';

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';
// iOS Google Sign-In은 별도 OAuth 클라이언트(iOS type) 필요. 미설정 시 빈 문자열 →
// configureGoogleSignIn에서 iosClientId 옵션이 빠지면서 webClientId만 사용되는데,
// iOS는 webClientId만으론 DEVELOPER_ERROR(code 10). 빌드 가드(app.config.js)에서도
// production iOS 빌드에 필수 env로 등록 — 미설정 빌드 자체 차단.
const GOOGLE_CLIENT_ID_IOS = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS || '';

// Google·Apple 양쪽을 합쳐 "클라우드 인증 사용자"로 취급. hydrate/logout 분기가
// 사회 로그인 모드 전체에 동일 동작을 해야 해서 별도 헬퍼로 추출.
export function isCloudAuthMode(mode: AuthMode): mode is 'google' | 'apple' {
  return mode === 'google' || mode === 'apple';
}

/**
 * Push every pending sync change before logout, retrying a few times so a
 * transient network blip doesn't cost the user their un-pushed edits/deletes.
 * Returns true only once the dirty set is fully drained.
 *
 * This gates the destructive local wipe in logout(): silently clearing local
 * data while a soft-delete hasn't reached the cloud is exactly how a "deleted"
 * list resurrects from its still-alive cloud copy on the next login. A guest /
 * apple session has nothing to push (flushPush early-returns when not
 * google-authed and the dirty set is never marked), so this returns true
 * immediately and logout proceeds unchanged.
 *
 * Dynamic imports break the auth ↔ sync require cycle (sync/engine imports
 * useAuthStore).
 */
async function flushPendingForLogout(attempts = 3, delayMs = 400): Promise<boolean> {
  const { flushPush } = await import('@/features/sync/engine');
  const { useSyncStore } = await import('@/features/sync/store');
  const isClean = () => {
    const { dirtyListIds, dirtyWordIds } = useSyncStore.getState();
    return dirtyListIds.size === 0 && dirtyWordIds.size === 0;
  };
  for (let i = 0; i < attempts; i++) {
    try {
      await flushPush();
    } catch (e: any) {
      console.warn(`[auth] pre-logout flush attempt ${i + 1}/${attempts} failed:`, e?.message ?? e);
    }
    if (isClean()) return true;
    if (i < attempts - 1) await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return isClean();
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

// hydrate() must run at most once per JS context. The zustand store is a module
// singleton that survives a React tree remount, so once we've restored auth from
// the persisted intent the in-memory state is authoritative. Re-running hydrate
// on a remount (the dev-client RootLayout remounts to splash on logout/login)
// would (a) register a duplicate onAuthStateChange listener every time, and
// (b) re-read the persisted intent and `set()` it — racing the AsyncStorage
// write of a just-made login. A remount right after "게스트로 시작" could load
// the still-'none' persisted value (the save('guest') hasn't flushed yet) and
// clobber mode back to 'none', which makes AppStack bounce the user to /login.
let authHydrated = false;

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

/**
 * `app_admins` 조회 결과 메모(로그인 세션 1회). buildUser는 로그인 한 번에 두 번
 * 돈다 — signInWith*가 명시적으로 한 번, 그 안의 signInWithIdToken이 발생시킨
 * onAuthStateChange('SIGNED_IN')가 한 번 — 여기에 콜드 스타트의 hydrate까지
 * 더하면 같은 왕복을 세 번 한다. 관리자 여부는 세션 중에 바뀌지 않으므로 첫
 * 조회만 네트워크를 태운다.
 *
 * ⚠️ 실패는 캐시하지 않는다. 네트워크 블립으로 잡은 false를 고착시키면 관리자가
 * 로그아웃할 때까지 권한을 잃는다(기존 동작도 그 회차엔 false였지만, 다음
 * 호출에서 회복될 여지는 있었다).
 */
let adminCache: { userId: string; isAdmin: boolean } | null = null;

function clearAdminCache(): void {
  adminCache = null;
}

async function fetchIsAdmin(userId: string): Promise<boolean> {
  if (adminCache?.userId === userId) return adminCache.isAdmin;
  const { data, error } = await supabase
    .from('app_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return false;
  const isAdmin = !!data;
  adminCache = { userId, isAdmin };
  return isAdmin;
}

async function buildUser(supabaseUser: SupabaseUser): Promise<GoogleUser> {
  const isAdmin = await fetchIsAdmin(supabaseUser.id);
  return {
    id: supabaseUser.id,
    email: supabaseUser.email ?? '',
    displayName: supabaseUser.user_metadata?.full_name ?? null,
    avatarUrl: supabaseUser.user_metadata?.avatar_url ?? null,
    isAdmin,
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

async function rememberGuestSessionSafely(session: Parameters<typeof rememberGuestSession>[0]): Promise<void> {
  try {
    await rememberGuestSession(session);
  } catch (e: any) {
    // SecureStore 장애가 소셜 로그인을 막지는 않게 한다. 이 경우에만 나중 게스트 복원이
    // 불가능할 수 있으므로 원인을 남긴다.
    console.warn('[auth] guest session backup failed:', e?.message ?? e);
  }
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  mode: 'none',
  user: null,
  loading: true,

  hydrate: async () => {
    // Once per JS context — see authHydrated note above. A remount must NOT
    // re-read the persisted intent (it would race a fresh login's save) or
    // re-add the auth listener.
    if (authHydrated) return;
    authHydrated = true;
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

    if (loaded.mode === 'guest' && session?.user?.is_anonymous) {
      // Guest data remains local-only, but the anonymous Supabase session owns
      // server quota and rewarded-ad state.
      await rememberGuestSessionSafely(session);
      set({ mode: 'guest', user: null });
    } else if (loaded.mode === 'guest') {
      // Upgrade legacy device-only guests on first launch after this policy.
      // Local vocabulary stays untouched; only a server identity for quota and
      // rewarded-ad state is added.
      if (session) await supabase.auth.signOut({ scope: 'local' });
      let restored = false;
      let restoreFailed = false;
      try {
        restored = !!(await restoreGuestSession());
      } catch (e: any) {
        // 일시적 네트워크 오류라면 저장 토큰을 보존하고 새 UUID도 만들지 않는다. 다음
        // foreground/기능 호출에서 세션을 다시 회복할 여지를 남긴다.
        restoreFailed = true;
        console.warn('[auth] anonymous guest session restore failed:', e?.message ?? e);
      }
      if (!restored && !restoreFailed) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) {
          console.warn('[auth] anonymous guest session failed:', error.message);
        } else {
          await rememberGuestSessionSafely(data.session);
        }
      }
      set({ mode: 'guest', user: null });
    } else if (isCloudAuthMode(loaded.mode) && session?.user && !session.user.is_anonymous) {
      const user = await buildUser(session.user);
      await persist({ mode: loaded.mode, user }, set);
    } else if (isCloudAuthMode(loaded.mode)) {
      // We believed we were signed in but supabase has no session — external
      // session loss. Drop to logged-out.
      await authStore.remove();
      set({ mode: 'none', user: null });
    } else {
      // Intent is 'none' (or a legacy guest without an anonymous session).
      // Honor it, and proactively clear any orphan
      // session a failed signOut left behind so it can't resurrect later.
      //
      // 🔴 단 익명 세션은 고아로 보지 않는다. 게스트가 로그아웃한 뒤의 정상 상태이고,
      // 여기서 지우면 logout() 이 남겨 둔 세션이 다음 콜드 스타트에 사라져 한도 리셋이
      // 되살아난다 — 두 곳을 함께 고쳐야 하는 이유가 이것이다. 클라우드 세션 부활
      // (@soksok_auth 가 SoT) 방어는 그대로다: 그쪽은 is_anonymous 가 false 다.
      if (session && !session.user?.is_anonymous) {
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
        if (session.user.is_anonymous) {
          // refresh token은 사용할 때마다 회전한다. Google 로그인 전에 저장한 값이 오래된
          // 토큰이 되지 않도록 익명 세션이 현재일 때마다 최신값을 보관한다.
          await rememberGuestSessionSafely(session);
          // Anonymous SIGNED_IN belongs to guest mode. Never interpret it as a
          // Google login and never attach a cloud-sync user to it.
          if (useAuthStore.getState().mode === 'guest') return;
          await persist({ mode: 'guest', user: null }, set);
          return;
        }
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
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.is_anonymous) {
      await rememberGuestSessionSafely(session);
    } else {
      if (session) await supabase.auth.signOut({ scope: 'local' });
      const restored = await restoreGuestSession();
      if (!restored) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        await rememberGuestSessionSafely(data.session);
      }
    }
    await persist({ mode: 'guest', user: null }, set);
  },

  signInWithGoogle: async () => {
    if (!GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID_MISSING');

    // signInWithIdToken은 현재 익명 세션을 Google 세션으로 교체한다. 그 전에 게스트
    // refresh token을 별도로 남겨야 Google 로그아웃 뒤 같은 UUID/한도를 복원할 수 있다.
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    await rememberGuestSessionSafely(currentSession);

    await GoogleSignin.hasPlayServices();
    // Force the account chooser on every sign-in. logout()'s GoogleSignin.signOut()
    // is best-effort (try/catch) and can fail on a network blip — or the app may
    // have been killed mid-logout — leaving the native session cached. signIn()
    // then silently reuses the last account instead of prompting. Clearing right
    // before signIn() guarantees a clean slate so the picker always appears.
    try { await GoogleSignin.signOut(); } catch {}
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

    const { data: { session: currentSession } } = await supabase.auth.getSession();
    await rememberGuestSessionSafely(currentSession);

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
    // 로그아웃을 시작한 시점의 모드. 아래 3)·4)는 "이 세션"에 속한 부수효과라,
    // 그 사이 사용자가 다른 세션을 시작했다면 실행해선 안 된다 — 각 가드 참고.
    const startingMode = useAuthStore.getState().mode;
    const wasCloudAuth = isCloudAuthMode(startingMode);

    // 1) Flush pending changes while still authenticated (RLS passes), with
    //    retries. The destructive wipe in step 2 is GATED on this succeeding —
    //    see flushPendingForLogout. (No-op → returns true for guest/apple.)
    let synced = true;
    if (wasCloudAuth) {
      synced = await flushPendingForLogout();
    }

    // 2) Clear local account state BEFORE signing out — cloud-auth only, and
    //    ONLY when the flush fully drained the dirty set.
    //    supabase.auth.signOut() fires onAuthStateChange('SIGNED_OUT'), which
    //    re-renders the tree (and in dev can remount the root → splash). If
    //    the cleanup ran *after* signOut, that remount could interrupt logout
    //    and skip resetAll()/clearAllData(), leaving lastPulledAt stale — then
    //    the next login can't re-pull the account's data (it stays "behind the
    //    watermark"). This cleanup is local-only and auth-independent, so
    //    running it first is safe and guarantees it completes.
    //
    //    If changes remain un-pushed (offline logout / server error), we do NOT
    //    wipe: that's how un-synced soft-deletes used to resurrect from the
    //    still-alive cloud copy on the next login. Instead we PRESERVE local
    //    data + dirty set + watermark so a same-account re-login retries the
    //    push (and the pull tombstone guard keeps deletes from resurrecting).
    //    Isolation for a *different* account is still enforced by the bootstrap
    //    account-switch guard (it keys off @soksok_last_google_id, which is now
    //    kept across logout precisely so this stays safe).
    if (wasCloudAuth && synced) {
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
        // Data was wiped — there's nothing left to leak into a later guest
        // session, so drop the preservation flag if a prior offline logout set it.
        const { clearPreservedCloudData } = await import('./preserved-cloud-data');
        await clearPreservedCloudData();
      } catch (e: any) {
        console.warn('[auth] logout local clear failed:', e?.message ?? e);
      }
    } else if (wasCloudAuth) {
      console.warn(
        '[auth] logout: unsynced changes remain after retries — preserving local data so they reach the cloud on next login (account isolation still enforced on account switch).',
      );
      // Local data is preserved (above) — flag it so a "게스트로 시작" right after
      // this offline logout doesn't silently expose the previous account's words.
      // The guest entry path (app/login.tsx) reads this and prompts instead.
      const { markPreservedCloudData } = await import('./preserved-cloud-data');
      await markPreservedCloudData();
    }

    // 3) Flip to logged-out and PERSIST it *before* signing out. signOut fires
    //    onAuthStateChange('SIGNED_OUT') and (in dev) can remount the root →
    //    hydrate() re-runs mid-logout. Persisting 'none' first guarantees that
    //    a concurrent hydrate reads logged-out intent, not the stale cloud-auth
    //    mode we're leaving. Pairs with hydrate() treating @soksok_auth as the
    //    source of truth. (The SIGNED_OUT handler's isCloudAuthMode guard then
    //    no-ops, since mode is already 'none'.)
    //
    //    관리자 메모도 버린다. 캐시 키가 user id라 계정 전환은 어차피 미스지만,
    //    권한이 바뀐 같은 계정은 재로그인으로 갱신할 수 있어야 한다.
    clearAdminCache();
    //    ⚠️ 단, 그 사이 사용자가 이미 다른 세션을 시작했다면 덮어써선 안 된다. 호출부
    //    (app/(tabs)/settings.tsx)는 logout()을 기다리지 않고 곧장 /login으로 넘어가는데,
    //    위 1)·2)는 flush 재시도(최대 3회 × 400ms + 네트워크)와 SQLite 전체 삭제를 거치느라
    //    수백 ms~수 초가 걸린다. 그 사이 "게스트로 시작"을 누르면 새 세션이 이미 살아 있고,
    //    여기서 'none'을 덮어쓰면 그 세션이 무효가 된다 — 로그인 화면으로 되튕겨 게스트를
    //    두 번 눌러야 하고, 탭 네비게이터가 언마운트·재마운트되면서 react-navigation이
    //    죽기도 한다(getRehydratedState(undefined), upstream #13011). SIGNED_OUT 핸들러가
    //    같은 이유로 두는 가드를 여기에도 둔다.
    const stillOurSession = useAuthStore.getState().mode === startingMode;
    if (stillOurSession) {
      await persist({ mode: 'none', user: null }, set);
    }

    // 4) Sign out of provider + Supabase (best-effort). scope:'local' wipes the
    //    local session without depending on a server round-trip that could fail
    //    and leave it behind; even if this throws, hydrate() now honors the
    //    'none' intent and clears any orphan session. (No-ops for a guest.)
    //    Apple has no client-side signOut equivalent — only Google needs the
    //    provider-side call.
    //
    //    GoogleSignin.signOut()은 네이티브 구글 세션만 건드리므로 무조건 실행해도 안전하다
    //    (게스트 세션과 무관하고, 다음 구글 로그인의 계정 선택을 위해 지워두는 게 맞다).
    try { await GoogleSignin.signOut(); } catch {}
    //    반면 supabase 세션 제거는 "지금 로그아웃 상태일 때만" 안전하다. 위 가드가 걸렸거나
    //    GoogleSignin.signOut()을 기다리는 사이에 게스트가 시작됐다면, 이 호출은 그 게스트의
    //    익명 세션까지 지워 버린다 — 서버엔 익명 계정만 남고 앱은 세션을 잃어, 다시 누르면
    //    익명 계정이 또 만들어진다(실제로 12초 간격 2건 관측).
    //    🔴 그리고 게스트에서 나온 것이라면 익명 세션을 **남긴다**. 지우면 재진입 때
    //    loginAsGuest 가 새 익명 계정을 만들어 AI 한도가 0에서 다시 시작한다
    //    (실측 8/13: 한도 10 소진 → 광고 보너스 10 소진 → 12분 뒤 새 계정에서 10을 또 씀
    //    = 12분에 30단어). 로컬 단어는 그대로 남으니 사용자에겐 "다시 시작하기"로 보이고,
    //    한도 10은 사진 스캔 한 장이면 소진돼 정상 사용자가 자연히 이 경로에 닿는다.
    //    세션이 남아도 앱 동작에는 영향이 없다 — mode(@soksok_auth)가 SoT 라 화면은
    //    로그아웃 상태이고, 그 세션은 다음 게스트 진입에서 재사용될 뿐이다.
    if (wasCloudAuth && useAuthStore.getState().mode === 'none') {
      try { await supabase.auth.signOut({ scope: 'local' }); } catch (e: any) {
        console.warn('[auth] supabase signOut failed:', e?.message ?? e);
      }
    }
  },

  deleteAccount: async () => {
    const { error } = await supabase.rpc('delete_user');
    if (error) throw error;

    clearAdminCache();

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
    try { await forgetGuestSession(); } catch (e: any) {
      console.warn('[auth] guest session credential clear failed:', e?.message ?? e);
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
