import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AutoFillResult } from './types';

// 단어 보강 결과 캐시. 같은 (term, sourceLang, targetLang) 재검색을 즉시 처리하고
// Gemini 호출량을 줄여 모델 과부하(503) 노출도 낮춘다.
//
// 한국어 뜻(meaningKr)이 있는 "완전한" 결과만 캐시한다. 영어 전용 dict fallback
// 결과는 캐시하지 않아, 나중에 AI가 살아나면 한국어를 받을 수 있게 둔다.

const PREFIX = '@soksok_enrich_';

function keyFor(term: string, sourceLang: string, targetLang: string): string {
  return `${PREFIX}${sourceLang}_${targetLang}_${term.trim().toLowerCase()}`;
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
