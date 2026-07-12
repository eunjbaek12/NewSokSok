// 출발어 스크립트(문자 체계) 검사 — scan-image가 추출 결과를 반환하기 전에
// 출발어가 아닌 언어의 토큰(ko 덱의 영어 혼입 등)을 서버에서 제거한다.
// 추출 프롬프트("Extract every Korean word...")만으로는 모델이 사진 속 다른
// 언어 텍스트까지 뽑는 것을 막지 못한 실측 사례가 근거.
//
// ⚠️ 클라이언트 lib/stopwords.ts의 matchesSourceScript와 동일 로직 —
//    수정 시 반드시 함께 갱신 (__tests__/stopwords-script.test.ts 패리티 테스트가 검증).

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
