// 🔑 '@/i18n' 이 아니라 '@/i18n/locale' 에서 가져온다 — 전자는 import 만으로 i18next 를
// 초기화해(번역 JSON·react-i18next) 순수 함수 테스트가 통째로 못 돈다. 값은 같은 상수다.
import { FALLBACK_LOCALE } from '@/i18n/locale';
import type { LanguageCode } from '@/constants/languages';

/**
 * 고른 뜻 언어에 공식 덱이 **하나도 없을 때** 건네줄 대안. 없으면 null.
 *
 * 🔴 왜 필요한가: 스페인어 UI 가 1.4.0 에 나가면서 실제로 벌어지는 일이다.
 * `deriveTargetLang`(features/settings/store.ts:74)이 첫 실행에 UI 언어를 뜻 언어로
 * 넣는데, 도착어가 es 인 공식 덱은 **0개**다(65덱 실측: ko 46 · en 15 · vi 2 · zh 1 ·
 * ja 1). 그래서 스페인어 사용자의 첫 큐레이션 화면은 "검색 결과가 없습니다"였다 —
 * 검색한 적이 없는데 검색 결과가 없다고 말하고, 바로 아래에서 AI 로 만들기(한도를 쓴다)를
 * 권한다. 한 탭 거리에 무료 덱 15개가 있는데 그 말을 아무도 안 해 준다.
 *
 * 🔑 **뜻 언어를 대신 바꿔 주지는 않는다.** 그 값은 add-word 의 뜻 언어와 AI 생성
 * 도착어까지 함께 정한다(store.ts:176~177 이 같은 함수를 둘에 쓴다). 스페인어 사용자가
 * 스페인어 뜻을 원하는 것은 옳고, 없는 것은 **덱이지 설정이 아니다.** 설정을 몰래 바꾸면
 * 단어 뜻까지 영어로 돌려놓는 셈이라 더 큰 것을 깬다. 그래서 권하기만 하고 누르는 것은
 * 사용자가 한다.
 *
 * 🔑 **"덱이 가장 많은 언어"를 고르지 않는다.** 그건 ko(46)인데, 스페인어 사용자가
 * 한국어 뜻을 읽을 수 있다는 근거가 없다. 앱 자신이 모르는 언어에서 떨어지는 곳
 * (`FALLBACK_LOCALE`)을 권한다 — 덱 수가 아니라 읽을 수 있을 확률로 고르는 것이다.
 *
 * @param counts 뜻 언어별 공식 덱 수. 목록이 아직 안 왔으면 비어 있다.
 * @param current 지금 고른 뜻 언어.
 */
export function pickMeaningLangFallback(
  counts: Map<string, number>,
  current: string,
): { code: LanguageCode; count: number } | null {
  // 지금 언어에 덱이 있으면 안내할 것이 없다.
  if ((counts.get(current) ?? 0) > 0) return null;
  // 이미 대안 언어를 보고 있는데도 0이면 더 권할 곳이 없다.
  if (current === FALLBACK_LOCALE) return null;
  const count = counts.get(FALLBACK_LOCALE) ?? 0;
  // 🔴 목록이 아직 안 왔으면 counts 가 통째로 비어 있어 여기가 0 이다. 그때 안내를 띄우면
  //    "덱이 없다"고 잘못 말하게 된다 — 로딩과 진짜 0 을 이 한 줄이 가른다.
  if (count === 0) return null;
  return { code: FALLBACK_LOCALE as LanguageCode, count };
}
