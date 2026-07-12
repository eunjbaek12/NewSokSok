// 단어 저장(WordSaveSchema) 직전 정제 — 제어문자 제거 + 컬럼별 길이 클램프.
//
// 배경: AI 보강/생성은 관대한 수신 스키마(AIWordResultSchema, shared/contracts.ts)로
// 응답을 받는다. 그 한도는 저장 스키마(WordSaveSchema)의 약 3배이고 제어문자도
// 허용한다. 사진 스캔·일괄 추가·AI 생성이 그 결과를 그대로 addWord/addBatchWords에
// 넘기면, AI가 한도 사이 구간(예: 301~900자 뜻)이나 예문 속 개행(\n) 등 제어문자를
// 반환할 때 WordSaveSchema.parse가 throw해 "단어 저장 중 문제가 발생했습니다"가 뜬다.
// (CSV 가져오기는 utils/csv.ts에서 이미 같은 정제를 거쳐 안전했다.)
//
// 여기서 저장 경계(features/vocab/mutations.ts)마다 이 정제를 적용해 어떤 소스든
// 저장이 통과하도록 만든다. WordSaveSchema는 최종 안전망으로 남는다.

// WordSaveSchema(shared/contracts.ts)의 컬럼별 max와 동기화. 스키마 변경 시 여기도
// 함께 갱신할 것 — word-sanitize.test.ts가 둘의 일치를 기계적으로 검증한다.
export const WORD_SAVE_CAPS = {
  term: 50,
  definition: 500,
  meaningKr: 300,
  exampleEn: 300,
  exampleKr: 300,
  phonetic: 80,
  pos: 60,
} as const;

// 제어문자 = NO_CONTROL(shared/contracts.ts)와 동일: U+0000–U+001F, U+007F–U+009F.
// 리터럴 제어문자를 소스에 두지 않도록 코드포인트로 검사한다.
function isControl(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

// 제어문자를 공백으로 치환 → trim → cap 초과 시 자름. 보이는 공백은 보존한다.
export function sanitizeWordField(value: string, cap: number): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    out += isControl(code) ? ' ' : ch;
  }
  out = out.trim();
  return out.length > cap ? out.slice(0, cap) : out;
}

// WordSaveSchema가 검증하는 텍스트 필드만 정제·클램프한 새 객체를 반환한다.
// sourceLang·tags·isStarred 등 다른 필드는 손대지 않고, 존재하는 문자열 필드만
// 변환한다(undefined 필드는 그대로 두어 스키마의 optional/default를 보존).
export function sanitizeWordForSave<T extends object>(word: T): T {
  const out = { ...word } as Record<string, unknown>;
  for (const field of Object.keys(WORD_SAVE_CAPS) as (keyof typeof WORD_SAVE_CAPS)[]) {
    const v = out[field];
    if (typeof v === 'string') {
      out[field] = sanitizeWordField(v, WORD_SAVE_CAPS[field]);
    }
  }
  return out as T;
}
