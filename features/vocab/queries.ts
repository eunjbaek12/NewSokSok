/**
 * Vocab read-side queries & selectors. Extracted from contexts/VocabContext
 * (step 7b), TanStack Query integration added in 7c-2.
 *
 * - `fetchAllLists()` is the single canonical entry to SQLite row → domain
 *   assembly; callers who just need the freshest snapshot of lists/words go
 *   through here rather than reaching into `./db` directly.
 * - `useListsQuery()` is the canonical React subscription for the current
 *   `VocaList[]` cache. Mutations in `./mutations` should trigger
 *   `invalidateLists()` (or the re-exported helper) to refetch.
 * - Selectors are pure — given a `VocaList[]` snapshot they return derived
 *   views without touching SQLite.
 */
import { useQuery } from '@tanstack/react-query';
import type { VocaList, Word, PlanStatus } from '@/lib/types';
import * as PlanEngine from '@/features/study/plan/engine';
import { queryClient } from '@/lib/api/client';
import { getLists } from './db';

export const LISTS_QUERY_KEY = ['vocab', 'lists'] as const;

export async function fetchAllLists(): Promise<VocaList[]> {
  return getLists();
}

/**
 * Subscribe to the canonical `VocaList[]` cache. `staleTime: Infinity` matches
 * the default QueryClient config — SQLite reads are cheap but we still avoid
 * refetching on mount when the cache is populated. Mutations drive
 * invalidation explicitly.
 */
export function useListsQuery() {
  return useQuery<VocaList[], Error>({
    queryKey: LISTS_QUERY_KEY,
    queryFn: fetchAllLists,
    staleTime: Infinity,
  });
}

/**
 * Invalidate the lists cache so the next subscriber sees fresh data. Called
 * by every mutation wrapper in VocabContext after the write succeeds.
 * Returns the promise so callers that need to await the refetch can do so
 * (e.g. a mutation whose UI depends on the new `lists` snapshot).
 */
export function invalidateLists(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY });
}

/**
 * Words visible to a study session. The sentinel `__custom__` means "every
 * visible list flattened" — used by the custom-study flow where the user
 * picked words across lists.
 */
export function selectWordsForList(lists: VocaList[], listId: string): Word[] {
  if (listId === '__custom__') {
    return lists.filter(l => l.isVisible).flatMap(l => l.words);
  }
  const list = lists.find(l => l.id === listId);
  return list ? list.words : [];
}

export interface ListProgress {
  total: number;
  memorized: number;
  percent: number;
}

export function selectListProgress(lists: VocaList[], listId: string): ListProgress {
  const list = lists.find(l => l.id === listId);
  const words = list ? list.words : [];
  const total = words.length;
  const memorized = words.filter(w => w.isMemorized).length;
  return { total, memorized, percent: total > 0 ? Math.round((memorized / total) * 100) : 0 };
}

export function selectPlanStatus(lists: VocaList[], listId: string): PlanStatus {
  const list = lists.find(l => l.id === listId);
  if (!list) return 'none';
  return PlanEngine.computePlanStatus(list, list.words, Date.now());
}
