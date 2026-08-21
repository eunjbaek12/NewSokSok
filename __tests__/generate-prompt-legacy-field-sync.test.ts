import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 응답 필드 이름(meaningKr/exampleKr/exampleEn)은 레거시다 — 실제 언어는 sourceLang/
 * targetLang 이 정한다. 그런데 모델은 이름의 Kr/En 을 언어 지시로 읽고 한국어 라벨
 * (`${tgtLabel} 뜻`)을 이긴다. 2026-08-17 실측(gemini-2.5-flash-lite·temp 0.7):
 *   en>en 6/6 이 뜻을 한국어로, en>es 는 예문 번역을 한국어로 냈다.
 *   주제어를 영어로 넣어도 같았으므로 원인은 주제어가 아니라 필드명이다.
 *
 * 자동완성(analyzeWord)은 2026-05-14 에 이미 같은 사고를 겪고 반박 블록으로 고쳤는데,
 * "수정 시 함께 갱신" 주석만 남기고 **생성 프롬프트에는 반영되지 않았다**. 주석은
 * 동기화를 지켜주지 못한다 — 그래서 파일을 읽어 강제한다.
 * (phonetic-instruction-sync.test.ts 와 같은 방식.)
 */

// AI 단어 생성 프롬프트 사본 3곳. ai_curation_prompt.js 는 screen.tsx 의 standalone 미러.
const GENERATE_COPIES = [
  'features/curation/screen.tsx',
  'supabase/functions/_shared/gemini-vertex.ts',
  'scripts/curation-checks/ai_curation_prompt.js',
];
// 자동완성 프롬프트 2곳 — 원본 문구의 출처. 여기가 바뀌면 생성 쪽도 따라가야 한다.
const ENRICH_COPIES = [
  'lib/ai/gemini-client.ts',
  'supabase/functions/_shared/gemini-vertex.ts',
];

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

/**
 * 반박 블록을 만드는 함수 **본문만** 잘라낸다.
 *
 * 🔴 파일 전체를 검사하면 안 된다 — ai_curation_prompt.js 는 프롬프트와 그 자체 검사
 * 코드를 한 파일에 담고 있어, 검사 코드가 하드코딩한 기대 문자열이 매치돼 버린다.
 * (실제로 이 테스트를 처음 쓴 뒤 프롬프트를 어긋뜨려 봤더니 5개 전부 통과했다.)
 */
function extractLegacyNote(relPath: string): string {
  const src = read(relPath);
  const start = src.indexOf('function buildLegacyFieldNote');
  if (start < 0) throw new Error(`${relPath}: buildLegacyFieldNote 선언을 못 찾았습니다`);
  const end = src.indexOf('\n}', start);
  if (end < 0) throw new Error(`${relPath}: buildLegacyFieldNote 의 끝을 못 찾았습니다`);
  return src.slice(start, end);
}

describe('레거시 필드명 반박 블록 — 5곳 동기화', () => {
  it('생성 프롬프트 3곳이 필드명 세 개를 모두 반박한다', () => {
    for (const path of GENERATE_COPIES) {
      const note = extractLegacyNote(path);
      expect({ path, meaning: note.includes('"meaningKr" is NOT Korean.') })
        .toEqual({ path, meaning: true });
      expect({ path, example: note.includes('"exampleKr" is NOT Korean.') })
        .toEqual({ path, example: true });
      expect({ path, exampleEn: note.includes('"exampleEn" is NOT English.') })
        .toEqual({ path, exampleEn: true });
    }
  });

  it('반박은 라벨이 아니라 언어 이름(영어명)을 넣는다', () => {
    // `${tgtLabel} 뜻`(한국어 라벨)로는 못 이긴다는 게 이 버그의 요지다.
    for (const path of GENERATE_COPIES) {
      const note = extractLegacyNote(path);
      expect({ path, ok: /Put the meaning in \$\{tgtName\}/.test(note) })
        .toEqual({ path, ok: true });
      expect({ path, ok: /Put the example sentence in \$\{srcName\}/.test(note) })
        .toEqual({ path, ok: true });
    }
  });

  it('출발어·도착어 외 다른 언어를 금지하고 pos 만 예외로 둔다', () => {
    for (const path of GENERATE_COPIES) {
      const note = extractLegacyNote(path);
      expect({ path, ok: /never any other language/.test(note) })
        .toEqual({ path, ok: true });
      expect({ path, ok: /"pos", which stays in English/.test(note) })
        .toEqual({ path, ok: true });
    }
    // 자동완성 2곳은 프롬프트가 함수 안 문자열이라 파일 전체로 본다 — 두 파일 모두
    // 자체 검사 코드를 담지 않아 위 함정(기대 문자열 자기매치)이 없다.
    for (const path of ENRICH_COPIES) {
      const src = read(path);
      expect({ path, ok: /never any other language/.test(src) })
        .toEqual({ path, ok: true });
    }
  });

  it('same-language 주석은 반박 블록보다 뒤에 온다 — exampleKr 충돌에서 뒤가 이긴다', () => {
    for (const path of GENERATE_COPIES) {
      const src = read(path);
      // 선언 순서가 아니라 **템플릿에 끼워지는 순서**를 본다.
      const legacyAt = src.indexOf('${buildLegacyFieldNote(sourceLang, targetLang)}');
      const sameAt = src.indexOf('${sameLangNote}');
      expect({ path, found: legacyAt >= 0 && sameAt >= 0 }).toEqual({ path, found: true });
      expect({ path, legacyFirst: legacyAt < sameAt }).toEqual({ path, legacyFirst: true });
    }
  });

  it('pos 지시가 3곳 모두 영어 전체 단어다 — 축약형은 품사 필터를 새게 한다', () => {
    for (const path of GENERATE_COPIES) {
      const src = read(path);
      // 프롬프트 줄 전체를 앵커로 쓴다 — 짧은 조각은 검사 코드와 겹칠 수 있다.
      expect({ path, full: src.includes('- pos: 품사 — 영어 전체 단어로 (예: noun, verb, adjective, adverb)') })
        .toEqual({ path, full: true });
      expect({ path, noAbbrev: !src.includes('품사 (예: noun, verb, adj, adv)') })
        .toEqual({ path, noAbbrev: true });
    }
  });
});
