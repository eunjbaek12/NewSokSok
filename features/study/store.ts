/**
 * In-memory store for the last study session's per-word results.
 *
 * Why Zustand (non-persisted) instead of router params: serialising
 * `Word[]` through `router.push` risks exceeding URL length limits on
 * large lists, and we don't want this state on disk — it's scoped to a
 * single study → results handoff. A tiny Zustand store gives us a single
 * source of truth that survives the screen transition without persistence.
 */
import { create } from 'zustand';
import type { StudyResult } from '@/lib/types';

interface StudyResultsState {
  results: StudyResult[];
  setResults: (results: StudyResult[]) => void;
  clear: () => void;
}

export const useStudyResultsStore = create<StudyResultsState>((set) => ({
  results: [],
  setResults: (results) => set({ results }),
  clear: () => set({ results: [] }),
}));
