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

/**
 * In-memory store for the word ids a study session should cover.
 *
 * Why not router params: ids are `Crypto.randomUUID()` (36 chars each), so a
 * 1,000-word set joined with commas is a ~37KB param. Passing that through
 * navigation puts us in `TransactionTooLargeException` territory on Android
 * once the navigation state gets serialised into a Bundle. The screen now
 * receives only a token and reads the list from memory — same reasoning as
 * `useStudyResultsStore` above.
 *
 * The token exists so a screen can tell "the list I was handed" apart from
 * "whatever is in the store now". If another session overwrote the selection,
 * the token no longer matches and the screen falls back to its own filters
 * rather than silently studying someone else's set.
 */
interface StudySelectionState {
  token: string | null;
  wordIds: string[];
  setSelection: (wordIds: string[]) => string;
  clear: () => void;
}

let selectionSeq = 0;

export const useStudySelectionStore = create<StudySelectionState>((set) => ({
  token: null,
  wordIds: [],
  setSelection: (wordIds) => {
    const token = `sel${++selectionSeq}`;
    set({ token, wordIds });
    return token;
  },
  clear: () => set({ token: null, wordIds: [] }),
}));

/**
 * Hands a word list to the next study screen and returns the token to pass as
 * the `sel` route param. Call from an event handler, not during render.
 */
export function setStudySelection(wordIds: string[]): string {
  return useStudySelectionStore.getState().setSelection(wordIds);
}

/** Pure form of the lookup below, so it can be tested without a renderer. */
export function selectStudySelection(
  state: Pick<StudySelectionState, 'token' | 'wordIds'>,
  token?: string,
): string[] | null {
  return token && state.token === token ? state.wordIds : null;
}

/**
 * The word ids for this screen's session, or `null` when the screen wasn't
 * given a selection (or was given a stale token).
 */
export function useStudySelection(token?: string): string[] | null {
  return useStudySelectionStore(s => selectStudySelection(s, token));
}

/**
 * Narrows `words` to the selection and puts them in the selection's order.
 *
 * Builds the index map first and filters through it. Filtering with
 * `selectedIds.includes(...)` walks the array once per word — 1,000 selected
 * against 3,000 stored is ~3M comparisons, which stalls the study screen
 * visibly on entry.
 */
export function applyStudySelection<T extends { id: string }>(words: T[], selectedIds: string[]): T[] {
  const order = new Map(selectedIds.map((wordId, index) => [wordId, index]));
  return words
    .filter(w => order.has(w.id))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}
