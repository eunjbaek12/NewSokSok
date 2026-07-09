import { AutoFillResult } from './types';
import { fetch } from 'expo/fetch';
import { analyzeWord, isQuotaError } from '@/lib/ai/gemini-client';
import { normalizeSenses } from '@/lib/senses';
import { fetchSharedEnrich } from './enrich-cache-shared';
import { enrichWordViaEdge, type EnrichMode } from '@/lib/ai/edge-enrich';
import { supabase } from '@/lib/supabase/client';
import { getCachedEnrich, setCachedEnrich } from './enrich-cache';

const EDGE_ENABLED = process.env.EXPO_PUBLIC_ENRICH_VIA_EDGE === '1';

// 단어 1개를 (sourceLang → targetLang) 페어로 보강한다.
// 우선순위:
//   1. BYOK(사용자 키) → 클라이언트에서 Gemini SDK 직접 호출 (서버 비용 0)
//   2. 로그인 + Edge 활성화 → Supabase Edge Function (운영자 키 + quota)
//   3. 영어 source → dictionaryapi.dev fallback
//   4. 그 외 → null
//
// 단일 추가 흐름(useAddWord.runAutoFill)과 사진 흐름이 공유하는 단일 진입점.
// 사진 흐름은 mode='photo'를 명시해 단어당 15단어 가중치를 적용.
export async function enrichWord(
  term: string,
  sourceLang: string,
  targetLang: string,
  apiKey?: string,
  signal?: AbortSignal,
  mode: EnrichMode = 'autocomplete',
  onByokQuota?: () => void,
): Promise<AutoFillResult | null> {
  const trimmed = term.trim();
  if (!trimmed) return null;

  const cached = await getCachedEnrich(trimmed, sourceLang, targetLang);
  if (cached) return cached;

  const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      if (signal?.aborted) {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });
      promise
        .then(v => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); resolve(v); })
        .catch(e => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); reject(e); });
    });
  };

  try {
    const result = await withTimeout(autoFillWord(trimmed, sourceLang, targetLang, apiKey, mode, signal, onByokQuota), 12000);
    if (result) {
      // 모델이 "이 단어는 실재하지 않는다"고 명시한 경우 — 빈 결과지만 null이 아닌
      // 명시적 not-found 신호를 호출자에게 전달(캐시는 하지 않음). UI에서 "찾지
      // 못함" 안내로 분기시키기 위함.
      if (result.isReal === false) return result;
      if (result.meaningKr || result.exampleEn || result.definition) {
        void setCachedEnrich(trimmed, sourceLang, targetLang, result);
        return result;
      }
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
  }
  return null;
}

export async function autoFillWord(
  term: string,
  sourceLang: string = 'en',
  targetLang: string = 'ko',
  apiKey?: string,
  mode: EnrichMode = 'autocomplete',
  signal?: AbortSignal,
  onByokQuota?: () => void,
): Promise<AutoFillResult> {
  const trimmed = term.trim().toLowerCase();
  if (!trimmed) {
    return { definition: '', meaningKr: '', exampleEn: '' };
  }

  // 1) BYOK
  if (apiKey) {
    // 본인 키 호출 전에 공용 캐시(L2) 확인 — 다른 사용자가 이미 만든 결과면 즉시 반환.
    const shared = await fetchSharedEnrich(trimmed, sourceLang, targetLang);
    if (shared && shared.meaningKr) return shared;
    try {
      const data = await analyzeWord(trimmed, sourceLang, targetLang, apiKey);
      // 모델이 실재하지 않는 단어로 판정 → 빈 결과 + isReal=false 신호.
      if (data.isReal === false) {
        return { definition: '', meaningKr: '', exampleEn: '', isReal: false };
      }
      const byokSenses = normalizeSenses(data.senses);
      return {
        definition: data.definition || '',
        meaningKr: data.meaningKr || '',
        exampleEn: data.exampleEn || '',
        exampleKr: data.exampleKr || '',
        mnemonic: data.mnemonic || '',
        pos: data.pos || '',
        phonetic: data.phonetic || '',
        ...(byokSenses ? { senses: byokSenses } : {}),
      };
    } catch (e: any) {
      if (isQuotaError(e)) onByokQuota?.();
      // BYOK 실패 시에도 Edge로 fallback하지 않음 — 사용자가 명시적으로 키 등록한 의도 존중
    }
  }

  // 2) Edge Function (운영자 키, quota 적용)
  if (!apiKey && EDGE_ENABLED) {
    try {
      const session = await supabase.auth.getSession();
      if (session.data.session) {
        let edge = await enrichWordViaEdge(trimmed, sourceLang, targetLang, mode, signal);
        // Stale access token이 첨부돼 401이 떨어지는 케이스가 있다. 한 번 강제로
        // refresh 후 재시도하면 사용자가 앱 재시작 없이 복구된다.
        if (edge.kind === 'unauthorized') {
          await supabase.auth.refreshSession();
          edge = await enrichWordViaEdge(trimmed, sourceLang, targetLang, mode, signal);
        }
        if (edge.kind === 'ok') {
          const d = edge.result;
          // 모델이 실재하지 않는 단어로 판정 → 빈 결과 + isReal=false 신호.
          if (d.isReal === false) {
            return { definition: '', meaningKr: '', exampleEn: '', isReal: false };
          }
          const edgeSenses = normalizeSenses(d.senses);
          return {
            definition: d.definition || '',
            meaningKr: d.meaningKr || '',
            exampleEn: d.exampleEn || '',
            exampleKr: d.exampleKr || '',
            mnemonic: d.mnemonic || '',
            pos: d.pos || '',
            phonetic: d.phonetic || '',
            ...(edgeSenses ? { senses: edgeSenses } : {}),
          };
        }
        // unauthorized(재시도 후도 실패)/quota_exceeded/rate_limited/upstream → 사전 fallback으로 계속
      }
    } catch {
      // 세션 조회 실패 등 → 사전 fallback
    }
  }

  // 3) API 키 없을 때: 영어만 무료 사전 사용, 그 외 언어는 빈 결과 반환
  // (MyMemory 등 저품질 번역 서비스 사용 안 함 — 오역 저장 방지)
  if (sourceLang === 'en') {
    try {
      const dict = await getDictionaryData(trimmed);
      return {
        definition: dict.definition,
        meaningKr: '',
        exampleEn: dict.exampleEn,
        pos: dict.pos,
        phonetic: dict.phonetic,
      };
    } catch {
      return { definition: '', meaningKr: '', exampleEn: '' };
    }
  }

  return { definition: '', meaningKr: '', exampleEn: '' };
}

function fetchWithTimeout(url: string, ms = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function getDictionaryData(
  word: string
): Promise<{ definition: string; exampleEn: string; pos?: string; phonetic?: string }> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error('Dictionary lookup failed');
  const data = await res.json();

  let definition = '';
  let exampleEn = '';
  let pos = '';
  let phonetic = '';

  if (Array.isArray(data) && data.length > 0) {
    const entry = data[0];

    if (entry.phonetics && Array.isArray(entry.phonetics)) {
      const p = entry.phonetics.find((ph: any) => ph.text);
      if (p) phonetic = p.text.replace(/\//g, '');
    }

    if (entry.meanings) {
      const posSet = new Set<string>();
      for (const meaning of entry.meanings) {
        if (meaning.partOfSpeech) posSet.add(meaning.partOfSpeech);

        if (meaning.definitions) {
          for (const def of meaning.definitions) {
            if (!definition && def.definition) {
              definition = def.definition;
            }
            if (!exampleEn && def.example) {
              exampleEn = def.example;
            }
          }
        }
      }
      pos = Array.from(posSet).join(', ');
    }

    if (!exampleEn && definition) {
      exampleEn = `${word.charAt(0).toUpperCase() + word.slice(1)} means "${definition}".`;
    }
  }

  return { definition, exampleEn, pos, phonetic };
}

