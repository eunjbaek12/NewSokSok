import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('seed-cache existing-key pagination', () => {
  it('uses a deterministic unique-key order before range pagination', () => {
    const source = readFileSync(join(process.cwd(), 'scripts/seed-cache.ts'), 'utf8');
    const block = source.slice(
      source.indexOf('async function loadExistingKeys'),
      source.indexOf('// ── 3. Edge 호출'),
    );

    expect(block).toContain(".order('source_lang', { ascending: true })");
    expect(block).toContain(".order('target_lang', { ascending: true })");
    expect(block).toContain(".order('term', { ascending: true })");
    expect(block.indexOf(".order('term'" )).toBeLessThan(block.indexOf('.range('));
  });
});
