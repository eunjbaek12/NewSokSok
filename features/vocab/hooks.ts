import { useCallback } from 'react';
import type { VocaList, Word, PlanStatus } from '@/lib/types';
import { useAuth, isCloudAuthMode } from '@/features/auth';
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
  sendListToFriend,
  deleteCloudCuration as apiDeleteCloudCuration,
  fetchCloudCurations as apiFetchCloudCurations,
  DuplicateCurationError,
  type SentShare,
} from './api';
import { resolveShareCreatorName } from './share-preview';

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

export type ShareListOptions = {
  force?: boolean;
  updateId?: string;
  description?: string;
  /** 공유 창에서 방금 입력한 닉네임. 없으면 저장된 닉네임을 쓴다. */
  creatorName?: string;
};

export function useShareList() {
  const lists = useLists();
  const { authMode } = useAuth();
  const { profileSettings } = useSettings();

  return useCallback(async (listId: string, options?: ShareListOptions): Promise<void> => {
    if (!isCloudAuthMode(authMode)) throw new Error('GUEST_CANNOT_SHARE');

    const list = lists.find(l => l.id === listId);
    if (!list) throw new Error('List not found');

    // 닉네임만 쓴다 — Google 계정 이름(user.displayName)으로 대신하지 않는다.
    // 비어 있으면 공유 창이 먼저 받는다(share-preview.ts 의 resolveShareCreatorName 주석).
    const creatorName = resolveShareCreatorName(options?.creatorName ?? profileSettings.nickname);
    if (!creatorName) throw new Error('NICKNAME_REQUIRED');

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
  }, [lists, authMode, profileSettings]);
}

/**
 * 친구에게 보내기. 「공유 단어장에 올리기」(useShareList)와 **다른 일**이라 훅도 다르다 —
 * 결과(목록에 실리지 않는다)도 수명(30일)도 갈리므로, 한 함수에 플래그로 묶으면
 * 부르는 쪽에서 어느 쪽인지 읽을 수 없게 된다.
 *
 * 보내는 이름은 닉네임이 아니라 **보내는 이름**(profileSettings.senderName)이다 —
 * 기본값만 닉네임에서 온다(docs/share-to-friend-spec.md §2-10).
 */
export function useSendListToFriend() {
  const lists = useLists();
  const { authMode } = useAuth();

  return useCallback(async (listId: string, senderName: string): Promise<SentShare> => {
    if (!isCloudAuthMode(authMode)) throw new Error('GUEST_CANNOT_SHARE');

    const list = lists.find(l => l.id === listId);
    if (!list) throw new Error('List not found');

    const name = resolveShareCreatorName(senderName);
    if (!name) throw new Error('NICKNAME_REQUIRED');

    return sendListToFriend(list, { senderName: name });
  }, [lists, authMode]);
}

export function useDeleteCloudCuration() {
  return useCallback(async (curationId: string): Promise<void> => {
    await apiDeleteCloudCuration(curationId);
  }, []);
}

export function useFetchCloudCurations() {
  return useCallback(() => apiFetchCloudCurations(), []);
}
