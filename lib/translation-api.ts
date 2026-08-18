import { AutoFillResult } from './types';
import { fetch } from 'expo/fetch';
import { analyzeWord, isQuotaError, isInvalidKeyError } from '@/lib/ai/gemini-client';
import { normalizeSenses } from '@/lib/senses';
import { enrichWordViaEdge, type EnrichMode } from '@/lib/ai/edge-enrich';
import { supabase } from '@/lib/supabase/client';
import { getCachedEnrich, setCachedEnrich } from './enrich-cache';
import { cleanPhonetic } from './phonetic';
import { RateLimitedError } from './enrich-queue-core';

/**
 * AI 보강이 실패해 무료 사전(dictionaryapi.dev)으로 떨어진 이유.
 *
 * 사전은 뜻(meaningKr)을 줄 수 없어 그 칸만 비는데, 화면은 지금까지 "왜 비었는지"를
 * 알 방법이 없었다 — 결과만 돌아오고 출처가 없었기 때문이다. 사용자 눈에는 AI가
 * 일부만 채운 것처럼 보인다.
 *
 * ⚠️ quotaExceeded는 UI가 안내를 띄우면 안 된다 — edge-enrich가 이미
 * notifyQuotaExceeded()로 전역 보상형 광고 모달을 띄우므로 안내가 겹친다.
 */
export type EnrichFallback =
  | 'invalidKey'     // BYOK 키가 거부됨. 기다려도 안 풀린다 → 키를 고치라고 안내
  | 'byokFailed'     // BYOK 그 외 실패(네트워크·모델 오류)
  | 'quotaExceeded'  // 일일 한도 초과. 광고 모달이 따로 뜬다(위 주의 참조)
  | 'serverFailed';  // 세션 없음 · Edge 인증 실패 · 업스트림 오류
// 🔑 'guest' 는 없앴다. 이름은 "비로그인"이었지만 실제 조건은 **세션이 없을 때**이고,
// 1.5.0 부터 게스트는 익명 세션을 가지므로 게스트에게는 애초에 뜨지 않았다. 게스트와
// Free 의 한도가 같아지면 그 안내("로그인하면 AI가 채워줘요")는 거짓이 되기도 한다.
// 사용자에게 할 말이 serverFailed 와 같으므로(원인만 알리고 행동은 시키지 않는다) 합쳤다.

export interface EnrichOpts {
  /**
   * 사전으로 떨어졌을 때 그 사유를 알린다. 결과가 아니라 콜백인 이유는 캐시다 —
   * enrichWord는 캐시를 먼저 조회해 그대로 반환하므로(아래 getCachedEnrich), 사유를
   * 결과 객체에 실으면 캐시에 저장돼 다음 히트 때 옛 사유가 딸려 나온다. 캐시 히트는
   * 애초에 안내가 필요 없는 성공 결과라 콜백을 부르지 않는 것이 의미상으로도 맞다.
   */
  onFallback?: (reason: EnrichFallback) => void;
  /**
   * 배치 흐름(사진 스캔·일괄 추가 큐) 표시. true면:
   * - 타임아웃 12초 → 30초. 배치는 백그라운드 진행이라 길어도 UX 손해가 없고,
   *   12초에 끊으면 서버는 완료해 quota만 차감되고 결과를 버리는 낭비가 생긴다
   *   (실측: 클라 실패로 표시된 단어가 서버 캐시엔 완전한 결과로 존재).
   * - Edge 429(rate_limited)를 사전 폴백으로 삼키는 대신 RateLimitedError로
   *   던진다 — 큐가 retry_after만큼 대기 후 재시도(enrich-queue-core.ts).
   * 실시간 단건 검색(autocomplete UI)은 false: 짧은 타임아웃 + 조용한 폴백 유지.
   */
  batch?: boolean;
}

const EDGE_ENABLED = process.env.EXPO_PUBLIC_ENRICH_VIA_EDGE === '1';

// 발음 표기 정리(vi 성조 막대·ja 한글 전사) — enrichWord가 단일 진입점이라 여기 한 번이면
// BYOK·Edge·공용캐시·로컬캐시 전 경로를 덮는다. 근거는 lib/phonetic.ts.
function cleanPhonetics(r: AutoFillResult, sourceLang: string, term: string): AutoFillResult {
  const clean = (p: string) => cleanPhonetic(p, sourceLang, term);
  return {
    ...r,
    ...(r.phonetic ? { phonetic: clean(r.phonetic) } : {}),
    ...(r.senses
      ? { senses: r.senses.map(s => (s.phonetic ? { ...s, phonetic: clean(s.phonetic) } : s)) }
      : {}),
  };
}

// 단어 1개를 (sourceLang → targetLang) 페어로 보강한다.
// 우선순위:
//   1. BYOK(사용자 키) → 클라이언트에서 Gemini SDK 직접 호출 (서버 비용 0)
//   2. 로그인 + Edge 활성화 → Supabase Edge Function (운영자 키 + quota)
//   3. 영어 source → dictionaryapi.dev fallback
//   4. 그 외 → null
//
// 단일 추가 흐름(useAddWord.runAutoFill)과 사진 흐름이 공유하는 단일 진입점.
// 사진 흐름은 mode='photo'를 명시한다 — 차감은 자동완성과 같은 단어당 1이다
// (COST_BY_MODE, supabase/functions/enrich-word/index.ts).
export async function enrichWord(
  term: string,
  sourceLang: string,
  targetLang: string,
  apiKey?: string,
  signal?: AbortSignal,
  mode: EnrichMode = 'autocomplete',
  onByokQuota?: () => void,
  opts?: EnrichOpts,
): Promise<AutoFillResult | null> {
  const trimmed = term.trim();
  if (!trimmed) return null;

  // Operator-path requests always go through Edge, including local/cache hits,
  // because quota now measures product entitlement rather than Vertex cost.
  const cached = apiKey ? await getCachedEnrich(trimmed, sourceLang, targetLang) : null;
  if (cached) return cleanPhonetics(cached, sourceLang, trimmed);

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
    const timeoutMs = opts?.batch ? 30000 : 12000;
    const result = cleanPhonetics(await withTimeout(autoFillWord(trimmed, sourceLang, targetLang, apiKey, mode, signal, onByokQuota, opts), timeoutMs), sourceLang, trimmed);
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
    // RateLimitedError는 배치 큐가 대기·재시도로 처리하므로 null로 뭉개지 않는다.
    if (e?.name === 'AbortError' || e instanceof RateLimitedError) throw e;
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
  opts?: EnrichOpts,
): Promise<AutoFillResult> {
  const trimmed = term.trim().toLowerCase();
  if (!trimmed) {
    return { definition: '', meaningKr: '', exampleEn: '' };
  }

  // 1) BYOK
  if (apiKey) {
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
      if (isQuotaError(e)) {
        onByokQuota?.();
        // 한도는 호출부가 이미 안내한다 — 사전 안내까지 겹치지 않게 같은 사유로 넘긴다.
        opts?.onFallback?.('quotaExceeded');
      } else {
        opts?.onFallback?.(isInvalidKeyError(e) ? 'invalidKey' : 'byokFailed');
      }
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
            enrichmentLevel: edge.enrichmentLevel,
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
        // 서버가 입력 철자를 검증해 없는 단어로 확정했다. 연결 실패가 아니며,
        // 무료 사전으로 재시도하면 잘못된 fallback 안내만 남으므로 여기서 종료한다.
        if (edge.kind === 'not_found') {
          return { definition: '', meaningKr: '', exampleEn: '', isReal: false };
        }
        // 배치 흐름은 429를 큐가 retry_after 대기 후 재시도할 수 있게 신호로 올린다.
        // (autocomplete 단건은 기존대로 조용히 사전 폴백 — 아래 계속)
        if (edge.kind === 'rate_limited' && opts?.batch) {
          throw new RateLimitedError(edge.retryAfter);
        }
        // 사진 스캔은 AI로 완성 가능한 단어만 저장을 허용한다. quota_exceeded를
        // 영어 사전으로 폴백하면 한국어 뜻 없는 반쪽 카드가 저장 가능해져, 한도 밖
        // 후보까지 추가되는 결과가 된다. 호출부가 이 신호를 받아 대기 목록으로 돌린다.
        if (edge.kind === 'quota_exceeded' && mode === 'photo') {
          opts?.onFallback?.('quotaExceeded');
          return { definition: '', meaningKr: '', exampleEn: '', photoQuotaExceeded: true };
        }
        // unauthorized(재시도 후도 실패)/quota_exceeded/rate_limited/upstream → 사전 fallback으로 계속
        opts?.onFallback?.(edge.kind === 'quota_exceeded' ? 'quotaExceeded' : 'serverFailed');
      } else {
        // 세션이 없으면 운영자 키 경로 자체를 못 탄다 — 사전만 남는다. 탭 화면은
        // authMode==='none' 을 /login 으로 돌려보내므로(app/(tabs)/_layout.tsx),
        // 여기 오는 사용자는 이미 시작한 상태이고 세션만 만료·무효화된 것이다.
        // 사용자가 고칠 수 있는 일이 아니라 행동을 시키지 않는다.
        opts?.onFallback?.('serverFailed');
      }
    } catch (e: any) {
      // RateLimitedError·AbortError는 호출자 몫 — 나머지(세션 조회 실패 등)만 사전 fallback
      if (e instanceof RateLimitedError || e?.name === 'AbortError') throw e;
      opts?.onFallback?.('serverFailed');
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

