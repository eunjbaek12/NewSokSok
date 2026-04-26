import { AutoFillResult, AIWordResult } from './types';
import { fetch } from 'expo/fetch';
import {
  analyzeWord,
  generateThemeList,
  generateMoreWords as geminiGenerateMoreWords,
} from '@/lib/ai/gemini-client';

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
      // AI 실패 시 무료 사전 fallback
    }
  }

  return externalFallback(trimmed, sourceLang);
}

async function externalFallback(trimmed: string, sourceLang: string): Promise<AutoFillResult> {
  const fallbacks: Promise<any>[] = [
    translateWord(trimmed, sourceLang, 'ko'),
  ];
  if (sourceLang === 'en') {
    fallbacks.push(getDictionaryData(trimmed));
  }
  const results = await Promise.allSettled(fallbacks);
  const meaningKr = results[0].status === 'fulfilled' ? results[0].value : '';
  const dict = (sourceLang === 'en' && results[1]?.status === 'fulfilled')
    ? results[1].value
    : { definition: '', exampleEn: '' };
  return {
    definition: dict.definition,
    meaningKr,
    exampleEn: dict.exampleEn,
    pos: dict.pos,
    phonetic: dict.phonetic,
  };
}

function fetchWithTimeout(url: string, ms = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function translateWord(word: string, from: string = 'en', to: string = 'ko'): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${from}|${to}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error('Translation failed');
  const data = await res.json();
  const translation = data?.responseData?.translatedText;
  if (!translation || translation === word) {
    throw new Error('No translation found');
  }
  return translation;
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

export async function generateThemeWords(
  theme: string,
  difficulty?: string,
  count?: number,
  existingWords?: string[],
  apiKey?: string,
): Promise<AIWordResult[]> {
  const trimmed = theme.trim().toLowerCase();
  if (!trimmed) return [];

  if (apiKey) {
    try {
      const data = await generateThemeList(
        trimmed,
        difficulty || 'Intermediate',
        count || 20,
        existingWords || [],
        apiKey,
      );
      return data.words || [];
    } catch {
      // AI 실패 시 datamuse fallback
    }
  }

  try {
    const [mlRes, relRes] = await Promise.allSettled([
      fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(trimmed)}&max=15&md=d`),
      fetch(`https://api.datamuse.com/words?rel_trg=${encodeURIComponent(trimmed)}&max=10&md=d`),
    ]);

    let allData: any[] = [];
    if (mlRes.status === 'fulfilled' && mlRes.value.ok) {
      const d = await mlRes.value.json();
      if (Array.isArray(d)) allData.push(...d);
    }
    if (relRes.status === 'fulfilled' && relRes.value.ok) {
      const d = await relRes.value.json();
      if (Array.isArray(d)) allData.push(...d);
    }

    if (allData.length === 0) return [];

    const existingSet = new Set((existingWords || []).map(w => w.toLowerCase()));
    const seen = new Set<string>();
    const candidates = allData
      .filter((item: any) => {
        if (!item.word || item.word.length < 3 || item.word.includes(' ') || !(/^[a-zA-Z]+$/.test(item.word))) return false;
        const w = item.word.toLowerCase();
        if (seen.has(w) || existingSet.has(w)) return false;
        seen.add(w);
        return true;
      })
      .slice(0, 10);

    const results: AIWordResult[] = [];

    for (const candidate of candidates) {
      try {
        const wordStr = candidate.word as string;
        const [dictResult, transResult] = await Promise.allSettled([
          getDictionaryData(wordStr),
          translateWord(wordStr),
        ]);

        const dict =
          dictResult.status === 'fulfilled'
            ? dictResult.value
            : { definition: '', exampleEn: '' };
        const kr = transResult.status === 'fulfilled' ? transResult.value : '';

        if (dict.definition || kr) {
          results.push({
            term: wordStr.charAt(0).toUpperCase() + wordStr.slice(1),
            definition: dict.definition || `Related to ${theme}`,
            exampleEn: dict.exampleEn || `I studied the word "${wordStr}" today.`,
            meaningKr: kr || wordStr,
          });
        }
      } catch {
        continue;
      }
    }

    return results;
  } catch {
    return [];
  }
}

export async function generateMoreWords(
  theme: string,
  difficulty: string,
  count: number,
  existingWords: string[],
  apiKey?: string,
): Promise<AIWordResult[]> {
  if (!apiKey) {
    return generateThemeWords(theme, difficulty, count, existingWords);
  }

  try {
    return await geminiGenerateMoreWords(theme.trim(), difficulty, count, existingWords, apiKey);
  } catch {
    return [];
  }
}
