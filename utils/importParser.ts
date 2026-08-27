export interface ParsedWord {
  id: string;          // 임시 키 (React list key)
  term: string;        // 정제된 단어
  enrichStatus: 'pending' | 'done' | 'failed';
  definition: string;
  phonetic: string;
  pos: string;
  meaningKr: string;
  exampleEn: string;
  exampleKr: string;
}

// 일괄 추가 입력 텍스트를 단어 후보 배열로 변환.
// - 한 줄에 한 단어가 원칙
// - 구분자(탭·콤마·대시·콜론·파이프)가 있는 줄은 첫 컬럼만 단어로 사용
// - 빈 줄, 공백만, 글자 없는 토큰(숫자·기호만) 제외
// - 헤더로 보이는 첫 줄(단어/word/term 등) 자동 스킵
// - 대소문자 무시 중복 제거 (먼저 등장한 표기 보존)
// 컬럼 구분자. 목록을 붙여넣을 때 실제로 쓰이는 형태를 모아 둔다.
//
// 🔴 2026-08-26 실측: "lemon — 레몬" 형태 목록이 통째로 표제어가 되어 enrich 캐시 83행을
//    오염시키고 AI 한도 83단어를 헛되이 썼다(결과가 이상해 사용자가 단어장을 지웠다).
//    원인은 구분자에 탭·콤마밖에 없었던 것 — em dash 가 없어 줄이 갈리지 않았다.
//    🔑 표제어가 깨지면 대가를 **보강이 돌기 전에** 막을 방법이 없다. 한도가 먼저 깎인다.
//
// ⚠️ 하이픈(-)은 e-mail·K-pop 처럼 단어 안에 쓰이므로 **공백에 둘러싸인 경우만** 자른다.
//    em/en dash(—–)·파이프(|)는 단어 안에 나타나지 않아 공백과 무관하게 자른다.
//    콜론은 "word: 뜻" 형태라 **뒤에 공백이 올 때만** 자른다. 붙여 쓴 "word:뜻" 은 드물고,
//    정상 표제어에 콜론이 낀 경우를 먼저 지키는 쪽이 안전하다.
const COLUMN_SEP = /\t|,|\s+-\s+|[–—|]|:\s/;
const HEADER_KEYWORDS = new Set(['단어', 'word', 'term', 'vocab', '어휘', '영단어', 'english']);

export function parseImportedText(text: string): ParsedWord[] {
  if (!text || !text.trim()) return [];

  const lines = text.split(/\r?\n/);
  const seen = new Set<string>();
  const result: ParsedWord[] = [];
  const baseTs = Date.now();
  let idx = 0;
  let isFirstNonEmpty = true;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // 구분자가 있으면 첫 컬럼만 사용. CSV의 따옴표 처리는 안 함 (사용자가 단어만 적는 게 원칙).
    let term = line;
    const sep = line.match(COLUMN_SEP);
    // index 0 이면 줄이 구분자로 시작한 것 — 자르면 빈 표제어가 되므로 그대로 둔다.
    if (sep?.index) {
      term = line.slice(0, sep.index).trim().replace(/^"|"$/g, '');
    }

    // 헤더 스킵 (첫 비어있지 않은 줄에 한해)
    if (isFirstNonEmpty) {
      isFirstNonEmpty = false;
      if (HEADER_KEYWORDS.has(term.toLowerCase())) continue;
    }

    if (!term) continue;
    if (!/\p{L}/u.test(term)) continue;  // 글자 없는 토큰 제외 (숫자·기호만)

    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    result.push({
      id: `import-${baseTs}-${idx++}`,
      term,
      enrichStatus: 'pending',
      definition: '',
      phonetic: '',
      pos: '',
      meaningKr: '',
      exampleEn: '',
      exampleKr: '',
    });
  }

  return result;
}
