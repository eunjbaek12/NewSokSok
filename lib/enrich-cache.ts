import AsyncStorage from '@react-native-async-storage/async-storage';
import { SHARED_ENRICH_PROMPT_VERSION } from './enrich-cache-shared';
import type { AutoFillResult } from './types';

// 단어 보강 결과 캐시. 같은 (term, sourceLang, targetLang) 재검색을 즉시 처리하고
// Gemini 호출량을 줄여 모델 과부하(503) 노출도 낮춘다.
//
// 한국어 뜻(meaningKr)이 있는 "완전한" 결과만 캐시한다. 영어 전용 dict fallback
// 결과는 캐시하지 않아, 나중에 AI가 살아나면 한국어를 받을 수 있게 둔다.

const PREFIX = '@soksok_enrich_';

// 키에 프롬프트 버전이 들어간다 — 이게 없으면 이 기기(L1)가 버전과 무관하게 옛 결과를
// 반환하고, L1이 서버 캐시(L2)보다 먼저 걸리므로 프롬프트를 고쳐도 이미 그 단어를 조회한
// 기기에는 영영 반영되지 않는다. bump하면 옛 키는 고아가 되지만 따로 지우지 않는다 —
// 항목당 수백 바이트인데 정리하려면 앱 시작 시 AsyncStorage 전 키 스캔이 필요해,
// 콜드 스타트를 늘리는 값이 아낀 용량보다 비싸다.
function keyFor(term: string, sourceLang: string, targetLang: string): string {
  return `${PREFIX}v${SHARED_ENRICH_PROMPT_VERSION}_${sourceLang}_${targetLang}_${term.trim().toLowerCase()}`;
}

export async function getCachedEnrich(
  term: string,
  sourceLang: string,
  targetLang: string,
): Promise<AutoFillResult | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(term, sourceLang, targetLang));
    if (!raw) return null;
    return JSON.parse(raw) as AutoFillResult;
  } catch {
    return null;
  }
}

export async function setCachedEnrich(
  term: string,
  sourceLang: string,
  targetLang: string,
  result: AutoFillResult,
): Promise<void> {
  if (!result?.meaningKr) return; // 완전한 결과만 캐시
  try {
    await AsyncStorage.setItem(keyFor(term, sourceLang, targetLang), JSON.stringify(result));
  } catch {
    // 캐시 실패는 무시 — 다음 호출이 다시 시도
  }
}
