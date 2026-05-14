import { AutoFillResult } from './types';
import { fetch } from 'expo/fetch';
import { analyzeWord } from '@/lib/ai/gemini-client';
import { searchNaverDict } from '@/lib/naver-dict-api';

// 단어 1개를 (sourceLang → targetLang) 페어로 보강한다.
// 우선순위: Naver 사전 → 실패 시 autoFillWord(사용자 키 있으면 Gemini, 없으면 무료 사전).
// 단일 추가 흐름(useAddWord.runAutoFill)과 사진 흐름이 공유하는 단일 진입점.
export async function enrichWord(
  term: string,
  sourceLang: string,
  targetLang: string,
  apiKey?: string,
  signal?: AbortSignal,
): Promise<AutoFillResult | null> {
  const trimmed = term.trim();
  if (!trimmed) return null;

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
    const naver = await withTimeout(searchNaverDict(trimmed, sourceLang, targetLang), 5000).catch(() => null);
    if (naver && (naver.meaningKr || naver.exampleEn || naver.phonetic)) {
      return naver;
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
  }

  try {
    const result = await withTimeout(autoFillWord(trimmed, sourceLang, targetLang, apiKey), 8000);
    if (result && (result.meaningKr || result.exampleEn || result.definition)) {
      return result;
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
): Promise<AutoFillResult> {
  const trimmed = term.trim().toLowerCase();
  if (!trimmed) {
    return { definition: '', meaningKr: '', exampleEn: '' };
  }

  if (apiKey) {
    try {
      const data = await analyzeWord(trimmed, sourceLang, targetLang, apiKey);
      return {
        definition: data.definition || '',
        meaningKr: data.meaningKr || '',
        exampleEn: data.exampleEn || '',
        exampleKr: data.exampleKr || '',
        mnemonic: data.mnemonic || '',
        pos: data.pos || '',
        phonetic: data.phonetic || '',
      };
    } catch {
      // AI 실패 시 사전 fallback
    }
  }

  // API 키 없을 때: 영어만 무료 사전 사용, 그 외 언어는 빈 결과 반환
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

