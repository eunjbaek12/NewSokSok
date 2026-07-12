// scan-image가 추출 결과를 반환하기 전에 적용하는 토큰 정제 헬퍼 2종.
// 추출 프롬프트만으로는 모델이 (1) 사진 속 다른 언어 텍스트나 (2) "하는중입니다"
// 같은 문장 덩어리까지 뽑는 것을 막지 못한 실측 사례가 근거.
//
// ⚠️ 클라이언트 lib/stopwords.ts의 matchesSourceScript·isLikelyPhrase와 동일 로직 —
//    수정 시 반드시 함께 갱신 (__tests__/stopwords-script.test.ts·scan-phrase-filter.test.ts
//    패리티 테스트가 검증).

const HANGUL_RE = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
const KANA_RE = /[぀-ヿ]/;
const HAN_RE = /[一-鿿]/;
const LATIN_RE = /[A-Za-zÀ-ɏḀ-ỿ]/; // 라틴 기본 + 확장(es 악센트·vi 성조 문자 포함)

// 단어가 출발어의 문자 체계로 적혀 있는지. 같은 라틴 문자끼리(en↔es↔vi)는
// 구분 불가 — 그 케이스는 enrich isReal 판정에 위임.
export function matchesSourceScript(term: string, sourceLang: string): boolean {
  switch (sourceLang) {
    case 'ko':
      return HANGUL_RE.test(term);
    case 'ja':
      return KANA_RE.test(term) || HAN_RE.test(term);
    case 'zh':
      return HAN_RE.test(term) && !KANA_RE.test(term) && !HANGUL_RE.test(term);
    case 'en':
    case 'es':
    case 'vi':
      return LATIN_RE.test(term) && !HANGUL_RE.test(term) && !KANA_RE.test(term) && !HAN_RE.test(term);
    default:
      return true; // 미지원 언어는 판정 불가 — 통과
  }
}

// 표제어엔 나타나지 않는 한국어 종결어미. 기본형 ~다(하다·예쁘다·먹다)는
// 여기에 없으므로 절대 제외되지 않는다.
const KO_SENTENCE_ENDING = /(니다|어요|아요|여요|에요|예요|세요|셔요|네요|군요|나요|까요|았어요?|었어요?|였어요?)$/;
// 일본어 문장 종결(정중·과거). 辞書形(기본형)은 여기에 없다.
const JA_SENTENCE_ENDING = /(ます|ました|ません|でした|です|でしょう)$/;
const MAX_WORD_LEN = 24;

// 토큰이 단어가 아니라 문장/구로 보이면 true(=제외). 보수적 — 오탐 회피.
export function isLikelyPhrase(term: string, sourceLang: string): boolean {
  const t = term.trim();
  if (!t) return false;
  if (t.split(/\s+/).filter(Boolean).length >= 3) return true;
  if (t.length > MAX_WORD_LEN) return true;
  if (sourceLang === 'ko') return KO_SENTENCE_ENDING.test(t);
  if (sourceLang === 'ja') return JA_SENTENCE_ENDING.test(t);
  return false;
}
