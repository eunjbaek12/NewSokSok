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
// - 탭/콤마가 포함된 줄(엑셀·CSV 붙여넣기)은 첫 컬럼만 단어로 사용
// - 빈 줄, 공백만, 글자 없는 토큰(숫자·기호만) 제외
// - 헤더로 보이는 첫 줄(단어/word/term 등) 자동 스킵
// - 대소문자 무시 중복 제거 (먼저 등장한 표기 보존)
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

    // 탭/콤마가 있으면 첫 컬럼만 사용. CSV의 따옴표 처리는 안 함 (사용자가 단어만 적는 게 원칙).
    let term = line;
    const tabIdx = line.indexOf('\t');
    const commaIdx = line.indexOf(',');
    const splitAt = tabIdx >= 0
      ? (commaIdx >= 0 ? Math.min(tabIdx, commaIdx) : tabIdx)
      : commaIdx;
    if (splitAt >= 0) {
      term = line.slice(0, splitAt).trim().replace(/^"|"$/g, '');
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
