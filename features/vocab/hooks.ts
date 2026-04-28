import { useCallback } from 'react';
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
  deleteCloudCuration as apiDeleteCloudCuration,
  fetchCloudCurations as apiFetchCloudCurations,
  DuplicateCurationError,
} from './api';

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

export function useShareList() {
  const lists = useLists();
  const { user, authMode } = useAuth();
  const { profileSettings } = useSettings();

  return useCallback(async (
    listId: string,
    options?: { force?: boolean; updateId?: string; description?: string },
  ): Promise<void> => {
    if (authMode !== 'google') throw new Error('GUEST_CANNOT_SHARE');

    const list = lists.find(l => l.id === listId);
    if (!list) throw new Error('List not found');

    const creatorName = profileSettings.nickname.trim() || user?.displayName || 'Anonymous';

    try {
      await shareCuration(list, {
        creatorName,
        description: options?.description,
        updateId: options?.updateId,
        force: options?.force,
      });
    } catch (e) {
      if (e instanceof DuplicateCurationError) {
        const err = new Error('DUPLICATE_SHARE') as any;
        err.existingId = e.existingId;
        err.existingTitle = e.existingTitle;
        throw err;
      }
      throw e;
    }
  }, [lists, user, authMode, profileSettings]);
}

export function useDeleteCloudCuration() {
  return useCallback(async (curationId: string): Promise<void> => {
    await apiDeleteCloudCuration(curationId);
  }, []);
}

export function useFetchCloudCurations() {
  return useCallback(() => apiFetchCloudCurations(), []);
}
