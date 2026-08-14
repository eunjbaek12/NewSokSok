export type EnrichHttpErrorKind =
  | 'unauthorized'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'not_found'
  | 'upstream'
  | 'invalid';

export function classifyEnrichHttpError(status?: number, code?: string): EnrichHttpErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 404 && code === 'not_found') return 'not_found';
  if (status === 429 && code === 'quota_exceeded') return 'quota_exceeded';
  if (status === 429 && code === 'rate_limited') return 'rate_limited';
  if (status === 400) return 'invalid';
  return 'upstream';
}
