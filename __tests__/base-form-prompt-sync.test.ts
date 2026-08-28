import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INFLECTION_CODES, normalizeInflection, formatBaseFormLine } from '../lib/inflection';

/**
 * 굴절형 원형 안내가 **두 경로에 같은 문구로** 있는지, 그리고 형태 코드 목록이 앱·서버·DB
 * 세 곳에서 어긋나지 않는지 강제한다.
 *
 * 왜 파일을 읽어서 검사하나: 이 저장소에서 "수정 시 함께 갱신" 주석은 세 번 지켜지지 않았다
 * (레거시 필드명 반박 블록 · 발음 표기 규칙 · 화계 지시). 주석은 동기화를 지켜주지 못해서
 * register-note-sync · phonetic-instruction-sync · generate-prompt-legacy-field-sync 가
 * 차례로 생겼다. 같은 방식이다.
 *
 * 🔴 특히 마지막 케이스가 중요하다 — 이 프롬프트의 존재 이유가 "뜻 칸에 문법 설명을 넣지
 *    말라"는 것이라, 그 한 줄이 사라지면 기능이 조용히 무효가 된다(went → "'go'의 과거 시제"
 *    가 다시 돌아온다).
 */

const ENRICH_PROMPT_COPIES = [
  'lib/ai/gemini-client.ts',                          // BYOK
  'supabase/functions/_shared/gemini-vertex.ts',      // 운영자 키(Edge)
];

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

/** BASE_FORM_BLOCK 선언부만 잘라낸다 — 파일 전체를 훑으면 주석의 예시 문자열에 걸린다. */
function extractBlock(rel: string): string {
  const src = read(rel);
  const start = src.indexOf('const BASE_FORM_BLOCK = `');
  if (start < 0) throw new Error(`${rel}: BASE_FORM_BLOCK 선언을 못 찾았습니다`);
  const end = src.indexOf('`;', start);
  if (end < 0) throw new Error(`${rel}: BASE_FORM_BLOCK 의 끝을 못 찾았습니다`);
  return src.slice(start, end);
}

describe('굴절형 원형 프롬프트 — 두 경로 동기화', () => {
  it('BYOK 와 Edge 의 블록이 한 글자도 다르지 않다', () => {
    const [byok, edge] = ENRICH_PROMPT_COPIES.map(extractBlock);
    expect(byok).toBe(edge);
  });

  it('형태 코드 8개를 모두 열거한다 — 열린 목록이면 모델이 문장을 써넣는다', () => {
    for (const path of ENRICH_PROMPT_COPIES) {
      const block = extractBlock(path);
      for (const code of INFLECTION_CODES) {
        expect({ path, code, present: block.includes(code) })
          .toEqual({ path, code, present: true });
      }
    }
  });

  it('🔴 "뜻 칸에 문법 설명을 넣지 말라"는 지시가 살아 있다', () => {
    for (const path of ENRICH_PROMPT_COPIES) {
      const block = extractBlock(path);
      // 이 세 가지가 이 블록의 핵심이다. 하나라도 빠지면 went·mice 결함이 되돌아온다.
      expect({ path, keepsMeaning: block.includes('STILL FILL "meaningKr" WITH THE ACTUAL MEANING') })
        .toEqual({ path, keepsMeaning: true });
      expect({ path, banned: block.includes('NEVER put a grammatical description') })
        .toEqual({ path, banned: true });
      expect({ path, example: block.includes('"mice" means') })
        .toEqual({ path, example: true });
    }
  });

  it('원형이 아닐 때는 두 칸을 비우라고 지시한다', () => {
    for (const path of ENRICH_PROMPT_COPIES) {
      expect({ path, ok: extractBlock(path).includes('leave BOTH fields as empty strings') })
        .toEqual({ path, ok: true });
    }
  });
});

describe('형태 코드 목록 — 앱·서버·DB 동기화', () => {
  it('Edge 응답 검증기가 앱과 같은 코드 집합을 쓴다', () => {
    const src = read('supabase/functions/_shared/gemini-vertex.ts');
    const m = src.match(/const INFLECTION_CODES = new Set\(\[([\s\S]*?)\]\)/);
    expect(m).not.toBeNull();
    const serverCodes = [...m![1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]).sort();
    expect(serverCodes).toEqual([...INFLECTION_CODES].sort());
  });

  it('DB CHECK 제약이 앱과 같은 코드 집합을 쓴다', () => {
    const sql = read('supabase/migrations/20260828000000_add_word_base_form.sql');
    // cloud_words · official_words 두 제약 모두 같은 목록이어야 한다.
    const blocks = [...sql.matchAll(/inflection in \(([\s\S]*?)\)/g)];
    expect(blocks.length).toBe(2);
    for (const b of blocks) {
      const codes = [...b[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]).sort();
      expect(codes).toEqual([...INFLECTION_CODES].sort());
    }
  });

  it('세 UI 언어가 코드마다 이름을 갖는다', () => {
    for (const lang of ['ko', 'en', 'es']) {
      const json = JSON.parse(read(`i18n/locales/${lang}.json`));
      expect({ lang, hasLine: typeof json.inflection?.line === 'string' })
        .toEqual({ lang, hasLine: true });
      // 어순이 언어마다 달라 문장 조립을 i18n 에 맡긴다 — 자리표시자 둘이 다 있어야 한다.
      expect({ lang, base: json.inflection.line.includes('{{base}}') })
        .toEqual({ lang, base: true });
      expect({ lang, form: json.inflection.line.includes('{{form}}') })
        .toEqual({ lang, form: true });
      for (const code of INFLECTION_CODES) {
        expect({ lang, code, named: typeof json.inflection[code] === 'string' && json.inflection[code].length > 0 })
          .toEqual({ lang, code, named: true });
      }
    }
  });

  it('present(현재형)는 일부러 목록에 없다', () => {
    // 영어에서 현재형은 원형과 같은 형태라 붙일 대상이 없고, 한국어는 활용을 세분하면
    // 끝이 없어 conjugated 로 묶기로 했다. 무심코 되살아나는 것을 막는다.
    expect(INFLECTION_CODES).not.toContain('present' as any);
  });
});

describe('normalizeInflection — 모르는 값은 버린다', () => {
  it('목록 안의 코드는 통과시킨다', () => {
    expect(normalizeInflection('past_participle')).toBe('past_participle');
  });

  it('모델이 문장을 써 보내면 버린다', () => {
    // 이것이 걸러지지 않으면 화면에 i18n 키가 그대로 노출된다.
    expect(normalizeInflection('third-person singular simple present')).toBeUndefined();
    expect(normalizeInflection('과거분사')).toBeUndefined();
    expect(normalizeInflection('')).toBeUndefined();
    expect(normalizeInflection(null)).toBeUndefined();
    expect(normalizeInflection(undefined)).toBeUndefined();
  });
});

describe('formatBaseFormLine — 화면 한 줄', () => {
  const t = (key: string, opts?: any) => {
    if (key === 'inflection.line') return `${opts.base}의 ${opts.form}`;
    return key.replace('inflection.', '');
  };

  it('원형과 형태가 다 있으면 조립한다', () => {
    expect(formatBaseFormLine('abandon', 'past_participle', t)).toBe('abandon의 past_participle');
  });

  it('형태를 모르면 원형만 보여준다 — 반쪽이라도 연결이 낫다', () => {
    expect(formatBaseFormLine('abandon', 'nonsense', t)).toBe('abandon');
    expect(formatBaseFormLine('abandon', undefined, t)).toBe('abandon');
  });

  it('원형이 없으면 줄 자체를 그리지 않는다', () => {
    expect(formatBaseFormLine(undefined, 'plural', t)).toBeNull();
    expect(formatBaseFormLine('   ', 'plural', t)).toBeNull();
  });
});
