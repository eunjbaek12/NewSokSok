/**
 * Curation REST client. Extracted from contexts/VocabContext (step 7b).
 *
 * Centralises every call to `/api/curations*` behind `apiFetch` + Zod so the
 * surrounding VocabContext (removed in 7c) stops owning raw `fetch` +
 * API_BASE. Auth identity (Bearer token vs. device-scoped x-user-id) is passed
 * in explicitly — these helpers have no opinions about which one applies.
 */
import type { VocaList } from '@/lib/types';
import { apiFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import {
  CurationListResponseSchema,
  CurationMutationResponseSchema,
  CurationDeleteResponseSchema,
  CurationDuplicateBodySchema,
  type CuratedThemeWithWords,
} from '@shared/contracts';

export type { CuratedThemeWithWords };

/**
 * Identity for endpoints that require caller attribution. `google` users send
 * a JWT Bearer; guests/local users send a stable device id via `x-user-id`.
 */
export type CurationAuth =
  | { kind: 'google'; token: string }
  | { kind: 'device'; deviceId: string };

function authHeaders(auth: CurationAuth): { token?: string; headers?: Record<string, string> } {
  if (auth.kind === 'google') return { token: auth.token };
  return { headers: { 'x-user-id': auth.deviceId } };
}

/**
 * GET /api/curations — community-shared curation themes. Best-effort: network
 * or validation failures resolve to `[]` so the UI can degrade gracefully
 * (matches legacy VocabContext.fetchCloudCurations behaviour).
 */
export async function fetchCloudCurations(): Promise<CuratedThemeWithWords[]> {
  try {
    return await apiFetch('/api/curations', { schema: CurationListResponseSchema });
  } catch (e) {
    console.warn('Failed to fetch curations from cloud:', e);
    return [];
  }
}

/**
 * DELETE /api/curations/:id. Requires identity so the server can authorise.
 * Throws ApiError on non-2xx; caller decides how to surface it.
 */
export async function deleteCloudCuration(
  curationId: string,
  auth: CurationAuth,
): Promise<void> {
  const { token, headers } = authHeaders(auth);
  await apiFetch(`/api/curations/${curationId}`, {
    method: 'DELETE',
    schema: CurationDeleteResponseSchema,
    token,
    headers,
  });
}

export interface ShareCurationRequest {
  theme: Record<string, unknown> & { title: string };
  words: Array<Record<string, unknown>>;
}

export interface ShareCurationOptions {
  /** If set, PUT /api/curations/:id instead of POST. */
  updateId?: string;
  /** POST ?force=true bypasses the server-side duplicate check. */
  force?: boolean;
}

/**
 * Thrown when POST /api/curations returns 409 DUPLICATE_CURATION. Carries the
 * existing curation coordinates so the UI can offer "overwrite" vs "cancel".
 */
export class DuplicateCurationError extends Error {
  constructor(
    public readonly existingId: string,
    public readonly existingTitle: string,
    message?: string,
  ) {
    super(message ?? 'DUPLICATE_CURATION');
    this.name = 'DuplicateCurationError';
  }
}

/**
 * POST /api/curations (create) or PUT /api/curations/:id (update) depending on
 * `options.updateId`. Returns the server-persisted curation row (with words).
 *
 * On HTTP 409 (POST duplicate) this throws a `DuplicateCurationError` so the
 * caller can read `existingId` / `existingTitle` without reparsing the body.
 */
export async function shareCuration(
  body: ShareCurationRequest,
  options: ShareCurationOptions = {},
): Promise<CuratedThemeWithWords> {
  const { updateId, force } = options;
  if (updateId) {
    return apiFetch(`/api/curations/${updateId}`, {
      method: 'PUT',
      body,
      schema: CurationMutationResponseSchema,
    });
  }

  const path = force ? '/api/curations?force=true' : '/api/curations';
  try {
    return await apiFetch(path, {
      method: 'POST',
      body,
      schema: CurationMutationResponseSchema,
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      const parsed = CurationDuplicateBodySchema.safeParse(e.body);
      if (parsed.success) {
        throw new DuplicateCurationError(
          parsed.data.existingId,
          parsed.data.existingTitle,
          parsed.data.message,
        );
      }
    }
    throw e;
  }
}

/**
 * Attribution for a share. `creatorName` and `creatorId` are server-facing
 * fields; the resolution between logged-in user / nickname / device is the
 * caller's responsibility — this module stays unaware of settings state.
 */
export interface ShareIdentity {
  creatorName: string;
  creatorId: string;
}

/**
 * Convert an app-level `VocaList` into the `{ theme, words }` payload the
 * server's `/api/curations` endpoint accepts. Extracted from VocabContext
 * (step 7c-3) so the call site is just a `shareCuration(buildShareRequest(...))`
 * two-liner.
 */
export function buildShareRequest(
  list: VocaList,
  identity: ShareIdentity,
  description?: string,
): ShareCurationRequest {
  return {
    theme: {
      title: list.title,
      icon: list.icon || '✨',
      description: description || undefined,
      isUserShared: true,
      creatorName: identity.creatorName,
      creatorId: identity.creatorId,
      sourceLanguage: list.sourceLanguage || 'en',
      targetLanguage: list.targetLanguage || 'ko',
    },
    words: list.words.map(w => ({
      term: w.term,
      definition: w.definition,
      meaningKr: w.meaningKr,
      exampleEn: w.exampleEn,
    })),
  };
}
