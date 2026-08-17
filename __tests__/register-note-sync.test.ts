import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 예문의 화계(speech level) 지시 — 4곳 동기화.
 *
 * 지시가 없으면 모델이 문장마다 화계를 임의로 고른다. 2026-08-17 레딧 제보: 세종한국어
 * 교재로 공부하는 학습자가 "AI가 해요체로 예문을 뽑게 해줄 수 있나"고 물었다. 교재는
 * 해요체를 먼저 가르치는데 앱이 합쇼체·반말을 섞어 주면 초급자는 어느 쪽을 따라야 할지
 * 모른다. ko>en 은 이 앱의 2위 언어쌍이다(실측 17명·28단어장).
 *
 * 프롬프트 사본이 4개 파일에 흩어져 있고, 이 저장소에서 "수정 시 함께 갱신" 주석은
 * 두 번 실패했다 — 자동완성만 고치고 생성 3곳을 빠뜨렸고(레거시 필드명), 발음 지시는
 * 3곳인 줄 알았는데 4곳이었다. 그래서 파일을 읽어 강제한다.
 *
 * 🔴 파일 전체를 검사하면 안 된다 — ai_curation_prompt.js 는 프롬프트와 자체 검사 코드를
 * 한 파일에 담고 있어, 검사 코드가 하드코딩한 기대 문자열이 매치돼 버린다.
 * (generate-prompt-legacy-field-sync.test.ts 가 실제로 이 함정에 빠졌던 기록이 있다.)
 */

const COPIES = [
  'lib/ai/gemini-client.ts',
  'features/curation/screen.tsx',
  'supabase/functions/_shared/gemini-vertex.ts',
  'scripts/curation-checks/ai_curation_prompt.js',
];

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

/** `startMarker` 로 시작해 첫 `\n};` 또는 `\n}` 까지 — 선언 본문만 잘라낸다. */
function extractBlock(relPath: string, startMarker: string): string {
  const src = read(relPath);
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error(`${relPath}: ${startMarker} 선언을 못 찾았습니다`);
  const objEnd = src.indexOf('\n};', start);
  const fnEnd = src.indexOf('\n}', start);
  const end = objEnd >= 0 && (fnEnd < 0 || objEnd < fnEnd) ? objEnd : fnEnd;
  if (end < 0) throw new Error(`${relPath}: ${startMarker} 의 끝을 못 찾았습니다`);
  return src.slice(start, end);
}

const levelMap = (path: string) => extractBlock(path, 'const REGISTER_LEVEL');
const noteFn = (path: string) => extractBlock(path, 'function buildRegisterNote');

describe('예문 화계 지시 — 4곳 동기화', () => {
  it('한국어는 해요체를 지정하고 합쇼체·반말을 둘 다 금지한다', () => {
    // 금지를 빠뜨리면 안 된다 — 합쇼체(-습니다)도 "polite" 라서, 화계 이름만 적으면
    // 모델이 그쪽을 고를 수 있다. 실제 Basic Korean 500 덱이 해요체 89%·합쇼체 11% 로
    // 섞여 있는데 그게 지시 없이 생성한 결과다.
    for (const path of COPIES) {
      const map = levelMap(path);
      expect({ path, haeyo: map.includes('해요체 (-아요/-어요/-예요/-세요)') })
        .toEqual({ path, haeyo: true });
      expect({ path, noHapsyo: map.includes('never 합쇼체 (-습니다/-ㅂ니다)') })
        .toEqual({ path, noHapsyo: true });
      expect({ path, noBanmal: map.includes('never 반말') })
        .toEqual({ path, noBanmal: true });
    }
  });

  it('일본어는 です/ます를 지정하고 常体를 금지한다', () => {
    for (const path of COPIES) {
      const map = levelMap(path);
      expect({ path, desu: map.includes('です/ます') }).toEqual({ path, desu: true });
      expect({ path, noPlain: map.includes('never 常体 (だ/である)') })
        .toEqual({ path, noPlain: true });
    }
  });

  it('화계가 문법적으로 필수가 아닌 언어는 맵에 넣지 않는다', () => {
    // 특히 스페인어: UI 번역을 tú 로 통일해 둔 터라(usted→tú 52곳 교체) 예문만 usted 로
    // 갈라지면 오히려 어긋난다. 영어·중국어는 화계가 문법적으로 필수가 아니다.
    for (const path of COPIES) {
      const map = levelMap(path);
      for (const lang of ['en:', 'es:', 'zh:', 'vi:']) {
        expect({ path, lang, absent: !map.includes(lang) }).toEqual({ path, lang, absent: true });
      }
    }
  });

  it('지정이 없는 언어에는 빈 문자열을 반환한다 — 프롬프트를 건드리지 않는다', () => {
    for (const path of COPIES) {
      expect({ path, ok: /if \(!level\) return '';/.test(noteFn(path)) })
        .toEqual({ path, ok: true });
    }
  });

  it('지시문이 4곳 모두 같다', () => {
    for (const path of COPIES) {
      const fn = noteFn(path);
      expect({ path, ok: fn.includes('REGISTER — write EVERY example sentence in ${level}.') })
        .toEqual({ path, ok: true });
      expect({ path, ok: fn.includes('the everyday polite level textbooks teach first') })
        .toEqual({ path, ok: true });
      // 동음이의어 칩은 senses[] 의 예문을 따로 보여준다 — 여기가 빠지면 칩마다 화계가 흔들린다.
      expect({ path, ok: fn.includes('including those inside "senses"') })
        .toEqual({ path, ok: true });
    }
  });

  it('선언만 하지 않고 프롬프트 템플릿에 실제로 끼운다', () => {
    // 함수를 만들어 두고 템플릿에 안 넣으면 지시가 통째로 사라진다. 편집 중 실제로
    // "declared but never read" 상태를 거쳤으므로 결과로 고정해 둔다.
    for (const path of COPIES) {
      const src = read(path);
      const used = /\$\{buildRegisterNote\(sourceLang\)\}|\$\{registerNote\}/.test(src);
      expect({ path, used }).toEqual({ path, used: true });
    }
    // 자동완성(gemini-vertex)은 호출부에서 계산해 buildPrompt 로 넘긴다 — 그 배선도 본다.
    const vertex = read('supabase/functions/_shared/gemini-vertex.ts');
    expect(vertex).toContain('const registerNote = buildRegisterNote(sourceLang);');
    expect(vertex).toMatch(/buildPrompt\([^)]*registerNote\)/);
  });
});
