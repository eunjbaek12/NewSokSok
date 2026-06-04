import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Flag: an offline logout left an un-synced cloud-auth (Google/Apple) account's
 * data on this device. See logout()'s preservation branch in store.ts — when
 * the pre-logout flush can't drain the dirty set (offline / server error), the
 * destructive local wipe is SKIPPED so an un-pushed soft-delete doesn't get
 * resurrected from its still-alive cloud copy on the next login.
 *
 * The downside that flag closes: with local data preserved, tapping "게스트로
 * 시작" right after such a logout would expose the *previous account's* words
 * in the guest view (same device, same person, but still surprising). The guest
 * entry path reads this flag and offers a choice (re-login to sync, or discard)
 * instead of silently showing the old account's data.
 *
 * Lifecycle (logout() keeps the invariant "set iff preserved data exists while
 * logged out"): set on offline logout, cleared on a synced logout, on the
 * bootstrap account-switch wipe, and on discard below. deleteAccount() wipes all
 * @soksok_* keys, so it clears this implicitly.
 */
const PRESERVED_CLOUD_DATA_KEY = '@soksok_preserved_cloud_data';

export async function markPreservedCloudData(): Promise<void> {
  try {
    await AsyncStorage.setItem(PRESERVED_CLOUD_DATA_KEY, '1');
  } catch {
    // Best-effort: a missed write only means the next guest entry won't prompt,
    // which degrades gracefully to the pre-existing (silently-visible) behavior.
  }
}

export async function clearPreservedCloudData(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PRESERVED_CLOUD_DATA_KEY);
  } catch {}
}

export async function hasPreservedCloudData(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PRESERVED_CLOUD_DATA_KEY)) === '1';
  } catch {
    return false;
  }
}

/**
 * Discard the preserved cloud-auth data so a guest can start clean. Wipes the
 * exact same surfaces logout()'s destructive branch does (local SQLite, sync
 * watermark + dirty set, account-scoped settings incl. nickname/BYOK, in-memory
 * quota), then clears the flag. The un-synced deletes are given up by this — the
 * cloud copies stay as-is, so a later same-account login simply re-pulls them.
 *
 * Dynamic imports mirror logout()/deleteAccount() and avoid pulling the vocab /
 * sync / settings / quota graphs into the auth entry path.
 */
export async function discardPreservedCloudData(): Promise<void> {
  const { clearAllData } = await import('@/features/vocab/db');
  await clearAllData();
  const { useSyncStore } = await import('@/features/sync/store');
  await useSyncStore.getState().resetAll();
  const { useSettingsStore } = await import('@/features/settings/store');
  await useSettingsStore.getState().clearAccountScopedSettings();
  const { useQuotaStore } = await import('@/features/quota');
  useQuotaStore.getState().clear();
  await clearPreservedCloudData();
}
