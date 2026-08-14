import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * 모델명이 앱 안에 흩어지는 것을 막는다.
 *
 * BYOK 경로 세 곳이 각자 'gemini-2.5-flash-lite' 문자열을 들고 있었다. 흩어진 상수는
 * 세다가 틀린다 — 이 모델명은 실제로 "앱 두 곳"으로 잘못 세고 있었고 세 번째(AI 단어
 * 생성)를 놓칠 뻔했다. 2.5 는 2026-10-16 이후 은퇴하므로, 한 곳이라도 빠지면 그 기능만
 * 조용히 죽는다. PHONETIC_INSTRUCTION 4곳 동기화 테스트와 같은 취지다.
 */

// 앱 번들에 들어가는 소스만 본다. scripts/ 는 운영자 도구라 사용자에게 안 닿고,
// supabase/functions/ 는 Deno 로 따로 번들돼 이 상수를 import 할 수 없다(아래에서 따로 본다).
const APP_DIRS = ['app', 'components', 'constants', 'features', 'hooks', 'lib', 'shared', 'utils'];
const ALLOWED = 'lib/ai/model.ts';   // 유일한 선언 자리
const MODEL_LITERAL = /gemini-\d/;

function walk(dir: string, out: string[] = []): string[] {
  // 디렉터리가 사라졌는데 조용히 건너뛰면 검사가 빈 통을 지키게 된다. 목록을 고치라고 알린다.
  if (!existsSync(dir)) throw new Error(`APP_DIRS 에 적힌 ${dir} 가 없습니다 — 목록을 갱신하세요`);
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('Gemini 모델명은 한 곳에서만 선언된다', () => {
  const root = process.cwd();
  const files = APP_DIRS.flatMap((d) => walk(join(root, d)))
    .map((p) => relative(root, p).split(sep).join('/'));

  it('앱 소스에 모델명 리터럴이 lib/ai/model.ts 밖에 없다', () => {
    const offenders = files
      .filter((f) => f !== ALLOWED)
      .filter((f) => MODEL_LITERAL.test(readFileSync(join(root, f), 'utf8')));
    // 어느 파일이 걸렸는지 실패 메시지에 그대로 드러나게 배열로 비교한다.
    expect(offenders).toEqual([]);
  });

  it('선언은 실제로 그 파일에 있다 — 검사가 빈 통을 지키고 있지 않게', () => {
    const src = readFileSync(join(root, ALLOWED), 'utf8');
    expect(MODEL_LITERAL.test(src)).toBe(true);
    expect(/export const GEMINI_BYOK_MODEL\s*=/.test(src)).toBe(true);
  });

  it('BYOK 세 경로가 모두 공통 모델 선언을 실제로 사용한다', () => {
    const consumers = {
      '단어 자동완성': 'lib/ai/gemini-client.ts',
      '사진 스캔': 'lib/gemini-api.ts',
      'AI 단어 생성': 'features/curation/screen.tsx',
    } as const;

    for (const [label, file] of Object.entries(consumers)) {
      const src = readFileSync(join(root, file), 'utf8');
      const usesSharedModel = file === 'lib/ai/gemini-client.ts'
        ? /import\s*\{[^}]*GEMINI_BYOK_MODEL[^}]*\}\s*from\s*['"]@\/lib\/ai\/model['"]/.test(src)
          && /model:\s*GEMINI_BYOK_MODEL/.test(src)
        : /import\s*\{[^}]*byokGenerateContentUrl[^}]*\}\s*from\s*['"]@\/lib\/ai\/model['"]/.test(src)
          && /byokGenerateContentUrl\(/.test(src);
      expect({ label, file, usesSharedModel }).toEqual({ label, file, usesSharedModel: true });
    }
  });
});

/**
 * 서버(Vertex) 기본 모델과의 대조.
 *
 * ⚠️ 두 값이 **같아야 한다는 뜻이 아니다.** BYOK 비용은 사용자 몫이고 Vertex 는 운영자
 * 몫이라 교체 시점이 갈릴 수 있다(2026-08-12 결정: 서버는 2.5 유지, 앱은 다음 정기
 * 릴리스에 교체). 이 검사는 **모르는 새 갈라지는 것**을 막는다 — 한쪽을 의도적으로
 * 옮겼다면 아래 EXPECTED 를 함께 고치면 되고, 그 커밋이 곧 결정의 기록이 된다.
 */
describe('서버 기본 모델', () => {
  const EXPECTED_VERTEX_DEFAULT = 'gemini-2.5-flash-lite';
  const VERTEX = 'supabase/functions/_shared/gemini-vertex.ts';

  it('gemini-vertex.ts 의 DEFAULT_MODEL 이 예상값 그대로다', () => {
    const src = readFileSync(join(process.cwd(), VERTEX), 'utf8');
    const m = /const DEFAULT_MODEL = '([^']+)'/.exec(src);
    if (!m) throw new Error(`${VERTEX}: DEFAULT_MODEL 선언을 못 찾았습니다`);
    expect(m[1]).toBe(EXPECTED_VERTEX_DEFAULT);
  });
});
