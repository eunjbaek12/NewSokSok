/**
 * 로케일 해석·표시 메타 — **부작용 없는** 순수 모듈.
 *
 * `i18n/index.ts`와 나뉘어 있는 이유: 그쪽은 import만으로 i18next를 초기화한다(번역 JSON
 * 두 개를 통째로 끌고 온다). 순수 헬퍼(`features/study/review/notify-time.ts` 등)와 유닛
 * 테스트가 로케일 한 줄 때문에 i18next 부팅을 떠안지 않도록 여기만 따로 가져가면 된다.
 * `i18n/index.ts`가 전부 re-export하므로 기존 import 경로는 그대로 쓸 수 있다.
 */

import { UI_LOCALE_CODES, type UILocaleCode } from '@shared/contracts';

export type { UILocaleCode };

/**
 * 지원하지 않는 기기 언어가 받게 될 UI 언어.
 *
 * 한국어가 아니라 영어인 이유: 스토어 등록정보는 ko/en/ja/vi/zh 5개 로케일인데
 * UI는 아직 ko/en 둘뿐이다. 일본어 페이지를 보고 설치한 사용자가 한국어 UI를 받으면
 * 읽을 수조차 없지만, 영어면 최소한 진입은 한다. `fallbackLng`(미번역 키가 읽는 언어)와
 * 방향도 이걸로 일치한다 — 예전에는 키는 en으로, 미지원 언어는 ko로 갈려 있었다.
 */
export const FALLBACK_LOCALE: UILocaleCode = 'en';

/**
 * 언어별 표시·포맷 메타.
 *
 * Record<UILocaleCode, …>인 것이 핵심이다 — contracts.ts의 enum에 코드를 추가하면
 * 여기(그리고 i18n/index.ts의 resources)가 컴파일 에러를 내므로, 번역 JSON 없이 언어가
 * 목록에만 등장하는 상태가 원천적으로 불가능하다.
 *
 * bcp47은 날짜·숫자 포맷용 태그다. 앱 언어와 기기 로케일이 다를 수 있으므로
 * (한국 기기에서 영어 UI를 쓰는 사용자) Intl에 넘길 태그는 여기서 가져와야 한다.
 */
const UI_LOCALE_META: Record<UILocaleCode, { nativeLabel: string; flag: string; bcp47: string }> = {
  ko: { nativeLabel: '한국어', flag: '🇰🇷', bcp47: 'ko-KR' },
  en: { nativeLabel: 'English', flag: '🇺🇸', bcp47: 'en-US' },
};

export const UI_LOCALES = UI_LOCALE_CODES.map((code) => ({
  code,
  ...UI_LOCALE_META[code],
}));

function isSupported(code: string): code is UILocaleCode {
  return (UI_LOCALE_CODES as readonly string[]).includes(code);
}

/**
 * 임의의 로케일 문자열을 앱이 지원하는 코드로 좁힌다 — 지원하지 않으면 `FALLBACK_LOCALE`.
 *
 * 앱 안에서 언어로 갈리는 코드는 전부 이걸 거쳐야 한다. 직접 `=== 'ko'`로 비교하면
 * 언어를 추가해도 컴파일이 통과하면서 조용히 영어가 나온다 — 실제로 스킨 이름·명언·
 * 알림 시각 세 곳이 그 상태였다.
 */
export function resolveLocale(code: string | null | undefined): UILocaleCode {
  if (!code) return FALLBACK_LOCALE;
  // 'ko-KR' → 'ko'. i18n.language는 보통 코드만 주지만 기기 로케일은 지역이 붙어 온다.
  const base = code.toLowerCase().split(/[-_]/)[0];
  return isSupported(base) ? base : FALLBACK_LOCALE;
}

/**
 * 앱 언어에 대응하는 BCP-47 태그. toLocaleDateString·Intl에 넘길 값.
 *
 * 지원하지 않는 값이 들어와도 `resolveLocale`이 폴백으로 좁히므로 항상 유효한 태그가
 * 나온다 — Intl 생성자에 넘겼을 때 RangeError가 나지 않는다.
 */
export function localeTag(code: string | null | undefined): string {
  return UI_LOCALE_META[resolveLocale(code)].bcp47;
}
