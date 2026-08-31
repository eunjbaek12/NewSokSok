/**
 * 굴절형 표제어의 원형(base form)과 형태 이름.
 *
 * 왜 필요한가 (2026-08-28 캐시 83,935행 실측):
 *   굴절형으로 저장된 표제어의 72%가 원형을 어디에도 알려주지 않는다. `abandoned` 를 담은
 *   사람은 `abandon` 이라는 원형이 있다는 것을 앱에서 볼 수 없었다.
 *
 * 🔴 그런데 더 나쁜 쪽은 나머지 28%였다. 사전이 불규칙 굴절형을 "plural of mouse" 한 줄로
 *    처리하니 모델이 그대로 따라 해서, **뜻 칸이 문법 설명에 잡아먹힌** 행이 생겼다:
 *      went  → 뜻="'go'의 과거 시제."      ("갔다" 를 못 받는다)
 *      mice  → 뜻="mouse의 복수형"          ("쥐들" 을 못 받는다)
 *      accepts → 뜻="accept의 3인칭 단수 현재형."
 *    뜻 칸은 단어 상세뿐 아니라 **플래시카드 뒷면·퀴즈 선택지·예문 학습 보기**에 그대로
 *    나가는 칸이다. 여기에 문법 설명이 들어가면 외울 것이 사라진다.
 *
 * 그래서 형태 정보에 **전용 자리**를 준다. 갈 곳이 생기면 뜻 칸으로 밀려들 이유가 없어진다.
 *
 * 🔑 형태 이름을 문자열이 아니라 **코드**로 저장하는 이유: 도착어가 6개다. `과거분사` /
 *    `past participle` / `過去分詞` 를 다 저장할 수는 없고, 어순도 언어마다 다르다
 *    (`abandon의 과거분사` vs `past participle of abandon`). 코드로 담고 화면에서
 *    i18n 으로 옮기면 도착어가 늘어도 데이터를 다시 만들 필요가 없다.
 */

/**
 * 담는 형태. 목록을 닫아 두는 것이 요점이다 — 열어 두면 모델이 "동사 원형의 3인칭 단수
 * 직설법 현재" 같은 문장을 만들어 넣고, 그 순간 코드가 아니라 자유 텍스트가 된다.
 *
 * ⚠️ `present`(현재형)는 일부러 없다.
 *   - 영어에서 현재형은 원형과 같은 형태다(3인칭 단수만 예외). `accept` 를 찾으면 그것은
 *     원형이지 굴절형이 아니라서 붙일 대상 자체가 없다.
 *   - 한국어는 `가요`·`드세요` 처럼 현재형 활용이 실재하지만, 활용을 세분하면 현재·과거·
 *     미래·관형·연결·명사형으로 끝이 없다. `conjugated` 하나로 묶고 원형(`가다`)만 주면
 *     학습자가 나머지를 안다.
 *
 * ⚠️ 비교급·최상급은 규칙 판정으로는 못 고른다 — `-er/-est` 로 끝나는 표제어 1,220개의
 *    앞 40개에 비교급이 하나도 없었다(answer·anger·after·banker…). 판정은 모델이 한다.
 */
export const INFLECTION_CODES = [
  'plural',           // abilities, mice
  'past',             // abandoned, went
  'past_participle',  // written, gone
  'third_person',     // accepts
  'ing_form',         // running, meeting — 동명사·현재분사를 가르지 않는다(학습자에겐 같은 칸)
  'comparative',      // better, larger
  'superlative',      // best, largest
  'conjugated',       // 계세요, 드세요 — 한국어 활용형 전반
] as const;

export type InflectionCode = (typeof INFLECTION_CODES)[number];

const CODE_SET = new Set<string>(INFLECTION_CODES);

/** 모델·클라우드가 준 값이 우리가 아는 코드인지. 모르는 값은 통째로 버린다(자유 텍스트 유입 차단). */
export function isInflectionCode(v: unknown): v is InflectionCode {
  return typeof v === 'string' && CODE_SET.has(v);
}

/** 모르는 코드·빈 값을 undefined 로 정규화. 저장·읽기 양쪽 경계에서 쓴다. */
export function normalizeInflection(v: unknown): InflectionCode | undefined {
  return isInflectionCode(v) ? v : undefined;
}

/**
 * 화면에 그릴 한 줄. 어순이 언어마다 다르므로 문장 조립을 i18n 에 맡긴다.
 *   ko: `{{base}}의 {{form}}`  → "abandon의 과거분사"
 *   en: `{{form}} of {{base}}` → "past participle of abandon"
 *
 * 원형만 있고 형태를 모르면(모델이 형태 판정에 실패) 원형만 보여준다 — 반쪽이라도 연결이
 * 생기는 편이 아무것도 없는 것보다 낫다.
 */
export function formatBaseFormLine(
  baseForm: string | undefined,
  inflection: string | undefined,
  t: (key: string, opts?: any) => string,
): string | null {
  const base = (baseForm ?? '').trim();
  if (!base) return null;
  const code = normalizeInflection(inflection);
  if (!code) return base;
  return t('inflection.line', { base, form: t(`inflection.${code}`) });
}
