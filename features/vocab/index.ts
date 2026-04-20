/**
 * Public API surface for `features/vocab`.
 *
 * Row-changing operations live in `./mutations` and automatically mark the
 * sync dirty set + schedule a push. Callers should always prefer the
 * mutation functions over reaching into `./db` for writes — bypassing the
 * mutation layer means the change never reaches the cloud.
 *
 * Low-level primitives from `./db` (id generation, first-run seed, nuclear
 * clear) are re-exported below for the handful of call sites that genuinely
 * need them (device-id bootstrap, initial seed, first-login data choice).
 */
export {
  fetchAllLists,
  useListsQuery,
  invalidateLists,
  LISTS_QUERY_KEY,
  selectWordsForList,
  selectListProgress,
  selectPlanStatus,
  type ListProgress,
} from './queries';

export * from './api';
export * from './mutations';

export { useVocabBootstrap, useBootstrapLoading } from './use-bootstrap';

export {
  useLists,
  useListWords,
  useListProgress,
  usePlanStatus,
  useShareList,
  useDeleteCloudCuration,
  useFetchCloudCurations,
} from './hooks';

export {
  generateId,
  initSeedDataIfEmpty,
  clearAllData,
} from './db';
