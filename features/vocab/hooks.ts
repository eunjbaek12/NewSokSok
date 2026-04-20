/**
 * Ergonomic React hooks over the raw `features/vocab` primitives.
 *
 * The raw primitives (`useListsQuery` + the pure selectors) give callers
 * full control, but they require plumbing the `lists` snapshot into every
 * selector call. These hooks pre-wire that for the common cases:
 *
 *   - `useLists()`            — `VocaList[]` directly, defaulted to `[]`.
 *   - `useListWords(id)`      — the visible words for a list (or custom).
 *   - `useListProgress(id)`   — memorized/total/percent for a list.
 *   - `usePlanStatus(id)`     — current plan status for a list.
 *   - `useShareList()`        — returns `(listId, options?) => Promise<void>`
 *     with the same `DUPLICATE_SHARE` legacy contract the old
 *     `useVocab().shareList` exposed, re-using the current auth/profile.
 *
 * Consumers that were previously pulling multiple fields out of
 * `useVocab()` can mix these hooks with direct mutation imports from
 * `@/features/vocab` without paying a provider dependency.
 */
import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { VocaList, Word, PlanStatus } from '@/lib/types';
import { useAuth } from '@/features/auth';
import { useSettings } from '@/features/settings';
import { useListsQuery } from './queries';
import {
  selectWordsForList,
  selectListProgress,
  selectPlanStatus,
  type ListProgress,
} from './queries';
import {
  shareCuration,
  buildShareRequest,
  DuplicateCurationError,
  type CurationAuth,
} from './api';
import {
  fetchCloudCurations as apiFetchCloudCurations,
  deleteCloudCuration as apiDeleteCloudCuration,
} from './api';
import { generateId } from './db';

const DEVICE_ID_KEY = '@soksok_device_id';

async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = generateId();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/** Current vocab lists snapshot (empty array if the query hasn't resolved). */
export function useLists(): VocaList[] {
  return useListsQuery().data ?? [];
}

export function useListWords(listId: string): Word[] {
  const lists = useLists();
  return selectWordsForList(lists, listId);
}

export function useListProgress(listId: string): ListProgress {
  const lists = useLists();
  return selectListProgress(lists, listId);
}

export function usePlanStatus(listId: string): PlanStatus {
  const lists = useLists();
  return selectPlanStatus(lists, listId);
}

/**
 * Drop-in replacement for `useVocab().shareList`. Resolves the current
 * user + nickname from the auth and settings stores, builds the curation
 * payload, and translates the 409 response into the legacy
 * `DUPLICATE_SHARE` error shape that `components/ListContextMenu` still
 * consumes.
 */
export function useShareList() {
  const lists = useLists();
  const { user } = useAuth();
  const { profileSettings } = useSettings();

  return useCallback(async (
    listId: string,
    options?: { force?: boolean; updateId?: string; description?: string },
  ): Promise<void> => {
    const list = lists.find(l => l.id === listId);
    if (!list) throw new Error('List not found');

    const identity = {
      creatorName: profileSettings.nickname.trim() || user?.displayName || 'Anonymous',
      creatorId: user?.id || await getDeviceId(),
    };
    const body = buildShareRequest(list, identity, options?.description);

    try {
      await shareCuration(body, { updateId: options?.updateId, force: options?.force });
    } catch (e) {
      if (e instanceof DuplicateCurationError) {
        const err = new Error('DUPLICATE_SHARE') as any;
        err.existingId = e.existingId;
        err.existingTitle = e.existingTitle;
        throw err;
      }
      throw e;
    }
  }, [lists, user, profileSettings]);
}

/**
 * Drop-in replacement for `useVocab().deleteCloudCuration`. Falls back to
 * the device id for guests so the server can still authorise ownership.
 */
export function useDeleteCloudCuration() {
  const { authMode, token } = useAuth();

  return useCallback(async (curationId: string): Promise<void> => {
    const auth: CurationAuth = authMode === 'google' && token
      ? { kind: 'google', token }
      : { kind: 'device', deviceId: await getDeviceId() };
    await apiDeleteCloudCuration(curationId, auth);
  }, [authMode, token]);
}

/** Mirror of the legacy `useVocab().fetchCloudCurations` (no-auth GET). */
export function useFetchCloudCurations() {
  return useCallback(() => apiFetchCloudCurations(), []);
}
