import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// PHONETIC_INSTRUCTION 은 네 곳에 복제돼 있다. 한 곳만 고치면 조용히 어긋나고,
// 생성·검색·큐레이션이 서로 다른 발음 표기 규칙으로 돌아간다(실제로 ja 항목의
// 빈약한 예시가 ja>ko 후리가나 48% 오염으로 이어졌다). 복사본을 믿지 말고
// 원본을 읽어 대조한다 — seed-cache.ts 의 assertVersionSync 와 같은 방식.
const KO_COPIES = [
  'supabase/functions/_shared/gemini-vertex.ts',
  'features/curation/screen.tsx',
  'scripts/curation-checks/ai_curation_prompt.js',
];
// 영어판은 문구가 영어라 값까지 같을 수 없다. 변수명도 map 이라 앵커가 다르다.
const EN_COPY = 'lib/ai/gemini-client.ts';
const LANGS = ['en', 'ko', 'ja', 'zh', 'vi', 'es'];

// 앵커는 반드시 '선언'을 잡아야 한다. 이름만 찾으면 파일 앞쪽의 사용처
// (gemini-vertex.ts:54 의 PHONETIC_INSTRUCTION[sourceLang])나 함수 본문의 여는
// 중괄호를 먼저 물어 엉뚱한 블록을 읽는다.
function extractMap(relPath: string, declRe: RegExp): Record<string, string> {
  const src = readFileSync(join(process.cwd(), relPath), 'utf8');
  const decl = declRe.exec(src);
  if (!decl) throw new Error(`${relPath}: 선언 ${declRe} 을 못 찾았습니다`);
  const open = decl.index + decl[0].length - 1;   // 매치가 여는 중괄호로 끝난다
  const close = src.indexOf('}', open + 1);    // 값에 중괄호가 없으므로 첫 닫힘이 끝
  if (close < 0) throw new Error(`${relPath}: 맵 블록의 끝을 못 찾았습니다`);
  const block = src.slice(open + 1, close);

  const out: Record<string, string> = {};
  const re = /(\w+):\s*'((?:[^'\\]|\\.)*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) out[m[1]] = m[2];
  return out;
}

describe('PHONETIC_INSTRUCTION 4곳 동기화', () => {
  const koMaps = KO_COPIES.map(
    (p) => [p, extractMap(p, /(?:const\s+)?PHONETIC_INSTRUCTION[^=\n]*=\s*\{/)] as const,
  );
  const enMap = extractMap(EN_COPY, /function getPhoneticInstruction[\s\S]*?const map[^=\n]*=\s*\{/);

  it('네 곳 모두 6개 언어를 빠짐없이 담는다', () => {
    for (const [path, map] of koMaps) {
      expect({ path, keys: Object.keys(map).sort() }).toEqual({ path, keys: [...LANGS].sort() });
    }
    expect(Object.keys(enMap).sort()).toEqual([...LANGS].sort());
  });

  it('한국어판 3곳은 값까지 글자 그대로 같다', () => {
    const [, base] = koMaps[0];
    for (const [path, map] of koMaps.slice(1)) {
      for (const lang of LANGS) {
        // 어긋난 파일과 언어가 실패 메시지에 드러나게 라벨을 붙여 비교한다.
        expect({ path, lang, text: map[lang] }).toEqual({ path, lang, text: base[lang] });
      }
    }
  });

  it('ja 는 네 곳 모두 가나 전용·도착어 전사 금지를 명시한다', () => {
    for (const [path, map] of koMaps) {
      expect({ path, hasKanaOnly: /히라가나|가나로만/.test(map.ja) }).toEqual({ path, hasKanaOnly: true });
      expect({ path, forbidsHangul: /한글/.test(map.ja) }).toEqual({ path, forbidsHangul: true });
      expect({ path, keepsKanaTerm: /그대로 반복/.test(map.ja) }).toEqual({ path, keepsKanaTerm: true });
    }
    expect(/kana only/i.test(enMap.ja)).toBe(true);
    expect(/Hangul/i.test(enMap.ja)).toBe(true);
    expect(/already all kana/i.test(enMap.ja)).toBe(true);
  });

  it('vi 는 네 곳 모두 성조 막대 금지를 유지한다 — stripToneBars 의 전제', () => {
    for (const [path, map] of koMaps) {
      expect({ path, ok: /성조 막대/.test(map.vi) }).toEqual({ path, ok: true });
    }
    expect(/tone letters|tone bars/i.test(enMap.vi)).toBe(true);
  });
});
