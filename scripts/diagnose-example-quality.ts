/**
 * 예문 학습 빈칸 품질 진단 (로컬 전용, service role 필요).
 *
 * 예문 학습은 예문에서 표제어 자리를 찾아 빈칸으로 가린다. 못 찾으면 그 카드는
 * 출제에서 빠지고(lib/example-blank.ts), 예전에는 예문이 통째로 노출돼 정답이 공개됐다.
 * 이 스크립트는 실제 앱 로직(segmentExample)을 클라우드 단어에 그대로 돌려
 * **언어별 실패율**을 측정한다. 프롬프트를 바꾸거나 새 언어를 추가한 뒤 회귀를 잡는 용도.
 *
 * SQL만으로는 대신할 수 없다 — 한국어 어간 폴백·라틴 굴절 처리는 앱 코드에만 있다.
 * (대시보드에서 빠르게 근사치만 볼 때는 docs/ops-analytics-queries.md의 Q7을 쓴다.)
 *
 * ⚠️ SUPABASE_SERVICE_ROLE_KEY는 서버 전용 시크릿이다. 절대 코드/깃에 넣지 말고
 *    실행 시 환경변수로만 주입한다. 출력에 키 원문은 찍지 않는다.
 *
 * 사용법 (PowerShell):
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
 *   npx ts-node scripts/diagnose-example-quality.ts
 *
 *   # 표본 수 조절(기본 4000, 0이면 전체)
 *   npx ts-node scripts/diagnose-example-quality.ts --limit 10000
 *
 *   # 실패 사례를 함께 보고 싶을 때
 *   npx ts-node scripts/diagnose-example-quality.ts --samples 20
 *
 * 기준선 (2026-07-26, 표본 4000):
 *   라틴 표제어  출제 제외 0.5%   빈칸 오배치 0%
 *   한국어 표제어 출제 제외 2.8%   (수정 전에는 31.0%가 정답 노출이었다)
 *   중·일 표제어  출제 제외 6.4%
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { segmentExample } from '../lib/example-blank';

type Row = { term: string; example_en: string; source_lang: string | null };

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

function supabaseUrl(): string {
  const fromEnv = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (fromEnv) return fromEnv;
  const env = readFileSync('.env', 'utf8');
  const m = env.match(/EXPO_PUBLIC_SUPABASE_URL=(.+)/);
  if (!m) throw new Error('SUPABASE_URL을 찾을 수 없습니다 (.env의 EXPO_PUBLIC_SUPABASE_URL)');
  return m[1].trim();
}

const HANGUL = /[가-힣]/;
const CJK = /[぀-ヿ一-鿿]/;
const LATIN_CHAR = /[A-Za-zÀ-ɏḀ-ỿ]/;

/** 표제어의 문자 체계로 묶는다 — source_lang은 오염된 행이 많아 신뢰하지 않는다. */
function scriptOf(term: string): 'ko' | 'cjk' | 'latin' | 'other' {
  if (HANGUL.test(term)) return 'ko';
  if (CJK.test(term)) return 'cjk';
  if (LATIN_CHAR.test(term)) return 'latin';
  return 'other';
}

async function main() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다. (사용법은 파일 상단 주석 참고)');
    process.exit(1);
  }

  const limit = arg('limit', 0); // 0 = 전체
  const sampleCount = arg('samples', 8);
  const supabase = createClient(supabaseUrl(), key, { auth: { persistSession: false } });

  // ⚠️ PostgREST는 한 번에 1000행까지만 주고 **조용히 잘라낸다**(sync engine이 겪었던 그 문제).
  //    .limit(3000)을 줘도 1000행만 오므로 range로 페이지를 넘겨야 한다.
  //    --limit로 줄여 보는 건 빠르지만 id 순 앞부분만 보게 되어 단어장 편중이 생긴다.
  const PAGE = 1000;
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const take = limit > 0 ? Math.min(PAGE, limit - rows.length) : PAGE;
    if (take <= 0) break;
    const { data, error } = await supabase
      .from('cloud_words')
      .select('term, example_en, source_lang')
      .eq('is_deleted', false)
      .not('example_en', 'is', null)
      .neq('example_en', '')
      .order('id')
      .range(from, from + take - 1);
    if (error) {
      console.error('❌ 조회 실패:', error.message);
      process.exit(1);
    }
    const batch = (data ?? []) as Row[];
    rows.push(...batch);
    if (batch.length < take) break;
    process.stdout.write(`\r불러오는 중… ${rows.length}건`);
  }
  process.stdout.write('\r');
  type Stat = { n: number; dropped: number; misplaced: number; multi: number };
  const stats: Record<string, Stat> = {};
  const failures: Row[] = [];

  for (const r of rows) {
    if (!r.term || !r.example_en) continue;
    const bucket = scriptOf(r.term);
    const s = (stats[bucket] ??= { n: 0, dropped: 0, misplaced: 0, multi: 0 });
    s.n++;

    const segs = segmentExample(r.example_en, r.term);
    if (!segs) {
      s.dropped++;
      if (failures.length < sampleCount) failures.push(r);
      continue;
    }
    const blanks = segs.filter(x => x.isBlank).length;
    if (blanks >= 2) s.multi++;

    // 라틴 표제어인데 빈칸에 알파벳이 붙어 있으면 단어 경계가 깨진 것이다.
    // (한국어 조사·CJK는 붙어 있는 게 정상이라 검사하지 않는다.)
    if (bucket === 'latin') {
      for (let i = 0; i < segs.length; i++) {
        if (!segs[i].isBlank) continue;
        const prev = segs[i - 1]?.text.slice(-1) ?? '';
        const next = segs[i + 1]?.text.slice(0, 1) ?? '';
        if (LATIN_CHAR.test(prev) || LATIN_CHAR.test(next)) { s.misplaced++; break; }
      }
    }
  }

  const pct = (x: number, n: number) => `${((100 * x) / n).toFixed(1)}%`;
  console.log(`\n예문 빈칸 품질 — 표본 ${rows.length}건\n`);
  console.log('표제어      전체    출제 제외      빈칸 오배치    빈칸 2개+');
  for (const [bucket, s] of Object.entries(stats).sort((a, b) => b[1].n - a[1].n)) {
    console.log(
      `${bucket.padEnd(10)} ${String(s.n).padEnd(7)} ${pct(s.dropped, s.n).padEnd(14)} ` +
      `${(bucket === 'latin' ? pct(s.misplaced, s.n) : '-').padEnd(14)} ${pct(s.multi, s.n)}`
    );
  }

  if (failures.length > 0) {
    console.log('\n=== 빈칸을 못 만든 사례(출제 제외) ===');
    for (const f of failures) {
      console.log(`  ${f.term}  ::  ${f.example_en.slice(0, 64)}`);
    }
  }
  console.log('\n※ "출제 제외"는 정답 노출이 아니라 그 카드가 예문 학습에서 빠진다는 뜻이다.');
}

main().catch(e => {
  console.error('❌', e instanceof Error ? e.message : e);
  process.exit(1);
});
