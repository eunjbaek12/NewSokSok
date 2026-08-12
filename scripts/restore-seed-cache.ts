/**
 * Vertex 호출은 하지 않고 seed-cache-unsaved.json의 결과만 enrich_cache에 복구한다.
 *
 * 사용:
 *   $env:SUPABASE_URL="..."
 *   $env:SERVICE_ROLE_KEY="..."
 *   pnpm exec tsx scripts/restore-seed-cache.ts [파일]
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { stripControlChars } from '../utils/word-sanitize';

const url = process.env.SUPABASE_URL;
const key = process.env.SERVICE_ROLE_KEY;
const path = process.argv[2] ?? 'seed-cache-unsaved.json';

if (!url || !key) {
  console.error('SUPABASE_URL 과 SERVICE_ROLE_KEY 가 필요합니다.');
  process.exit(1);
}
const supabaseUrl = url as string;
const serviceRoleKey = key as string;

type CacheRow = {
  source_lang: string;
  target_lang: string;
  term: string;
  result: unknown;
  prompt_version: number;
  updated_at?: string;
};

function validRow(value: unknown): value is CacheRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<CacheRow>;
  return typeof row.source_lang === 'string'
    && typeof row.target_lang === 'string'
    && typeof row.term === 'string'
    && row.term.trim().length > 0
    && row.result !== undefined
    && Number.isInteger(row.prompt_version);
}

function scrub<T>(value: T): T {
  if (typeof value === 'string') return stripControlChars(value) as unknown as T;
  if (Array.isArray(value)) return value.map(scrub) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [name, child] of Object.entries(value)) out[name] = scrub(child);
    return out as T;
  }
  return value;
}

async function main() {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(raw)) throw new Error(`${path}가 JSON 배열이 아닙니다.`);

  const invalid = raw.length - raw.filter(validRow).length;
  if (invalid) throw new Error(`유효하지 않은 행 ${invalid}건이 있어 복구를 중단했습니다.`);

  // 파일 안에서도 마지막 결과 하나만 남긴다. DB upsert도 동일 키 중복을 허용하지 않는다.
  const unique = new Map<string, CacheRow>();
  for (const row of raw as CacheRow[]) {
    row.term = row.term.trim().toLowerCase();
    const cleaned = { ...row, result: scrub(row.result) };
    unique.set(`${row.source_lang}|${row.target_lang}|${row.term}`, cleaned);
  }
  const rows = [...unique.values()];
  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let restored = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await db.from('enrich_cache')
      .upsert(chunk, { onConflict: 'source_lang,target_lang,term' });
    if (error) throw new Error(`복구 실패(${i + 1}..${i + chunk.length}): ${error.message}`);
    restored += chunk.length;
    console.log(`복구 ${restored}/${rows.length}`);
  }
  console.log(`완료: ${restored}건 복구 · Vertex 호출 0건`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
