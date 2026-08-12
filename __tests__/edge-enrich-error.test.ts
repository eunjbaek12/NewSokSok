import { classifyEnrichHttpError } from '@/lib/ai/edge-enrich-error';

describe('classifyEnrichHttpError', () => {
  it('keeps a missing word distinct from an AI connection failure', () => {
    expect(classifyEnrichHttpError(404, 'not_found')).toBe('not_found');
    expect(classifyEnrichHttpError(500, 'upstream_failure')).toBe('upstream');
  });
});
