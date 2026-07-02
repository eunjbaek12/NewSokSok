// 언어별 음성(voice) 선택 로직 — 순수 함수로 분리해 유닛 테스트를 가능하게 한다.
// expo-speech 런타임(네이티브 모듈)에 의존하지 않도록 음성 형태를 자체 정의한다.
// Speech.Voice[]는 구조적으로 SelectableVoice[]에 호환되므로 tts.ts에서 그대로 넘길 수 있다.

/** pickVoice가 필요로 하는 최소 음성 정보. expo-speech Voice의 부분집합. */
export interface SelectableVoice {
  identifier: string;
  language: string;
  /** expo-speech VoiceQuality: 'Default' | 'Enhanced' */
  quality: string;
}

/** BCP-47 태그를 소문자·하이픈으로 정규화 ('zh_CN' → 'zh-cn'). */
export const normalizeLang = (tag: string): string => tag.toLowerCase().replace(/_/g, '-');

// 안드로이드 TTS는 표준중국어를 'zh'가 아니라 'cmn'(ISO 639-3)으로 보고하기도
// 한다(구글 음성 언어/identifier가 'cmn-cn-...' 형태). 기본 언어 비교 시 동일 취급.
export const primarySubtag = (tag: string): string => {
  const p = normalizeLang(tag).split('-')[0];
  return p === 'cmn' ? 'zh' : p;
};

/**
 * language 태그(예: 'zh-CN')에 가장 잘 맞는 음성 identifier를 결정적으로 선택한다.
 * 우선순위: 기본 언어 일치 → 지역/스크립트 일치 → Enhanced 품질 → identifier 정렬.
 * 매칭 음성이 없으면 undefined → 호출부가 language 기준으로 폴백.
 *
 * 결정적 선택이 핵심: language만 지정하면 OS가 호출마다 다른 음성을 골라 중국어에서
 * 단어마다 음색이 바뀐다. 항상 같은 음성이 나오도록 identifier로 tie-break 한다.
 */
export function pickVoice(
  voices: SelectableVoice[],
  language: string,
): string | undefined {
  const target = normalizeLang(language);
  const [, region] = target.split('-'); // 'zh-cn' → region 'cn'
  const primary = primarySubtag(language);

  const sameLang = voices.filter((v) => primarySubtag(v.language) === primary);
  if (sameLang.length === 0) return undefined;

  // 중국어 간체는 지역 코드가 'cn' 또는 스크립트 'hans'로 표기된다.
  const hints = [region, primary === 'zh' && region === 'cn' ? 'hans' : ''].filter(Boolean);
  const regionMatch = sameLang.filter((v) =>
    hints.some((h) => normalizeLang(v.language).includes(h)),
  );
  const pool = regionMatch.length > 0 ? regionMatch : sameLang;

  const sorted = [...pool].sort((a, b) => {
    const qa = a.quality === 'Enhanced' ? 0 : 1;
    const qb = b.quality === 'Enhanced' ? 0 : 1;
    if (qa !== qb) return qa - qb; // 고품질 우선
    return a.identifier.localeCompare(b.identifier); // 결정적 tie-break (실행마다 동일)
  });
  return sorted[0]?.identifier;
}
