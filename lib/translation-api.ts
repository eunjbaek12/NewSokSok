import { AutoFillResult, AIWordResult } from './types';
import { fetch } from 'expo/fetch';

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : 'http://localhost:5000';

let _geminiAvailable: boolean | null = null;

export async function isGeminiAvailable(): Promise<boolean> {
  if (_geminiAvailable !== null) return _geminiAvailable;
  try {
    const res = await fetch(`${API_BASE}/api/ai/status`);
    if (res.ok) {
      const data = await res.json();
      _geminiAvailable = !!data.available;
    } else {
      _geminiAvailable = false;
    }
  } catch {
    _geminiAvailable = false;
  }
  return _geminiAvailable;
}

export async function autoFillWord(term: string): Promise<AutoFillResult> {
  const trimmed = term.trim().toLowerCase();
  if (!trimmed) {
    return { definition: '', meaningKr: '', exampleEn: '' };
  }

  const gemini = await isGeminiAvailable();
  if (gemini) {
    try {
      const res = await fetch(`${API_BASE}/api/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: trimmed }),
      });
      if (res.ok) {
        const data = await res.json();
        return {
          definition: data.definition || '',
          meaningKr: data.meaningKr || '',
          exampleEn: data.exampleEn || '',
        };
      }
    } catch {}
  }

  const [dictResult, translationResult] = await Promise.allSettled([
    getDictionaryData(trimmed),
    translateToKorean(trimmed),
  ]);

  const dict =
    dictResult.status === 'fulfilled'
      ? dictResult.value
      : { definition: '', exampleEn: '' };
  const meaningKr =
    translationResult.status === 'fulfilled' ? translationResult.value : '';

  return {
    definition: dict.definition,
    meaningKr,
    exampleEn: dict.exampleEn,
  };
}

async function translateToKorean(word: string): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|ko`;
  const res = await fetch(url);
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
): Promise<{ definition: string; exampleEn: string }> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Dictionary lookup failed');
  const data = await res.json();

  let definition = '';
  let exampleEn = '';

  if (Array.isArray(data) && data.length > 0) {
    for (const entry of data) {
      if (entry.meanings) {
        for (const meaning of entry.meanings) {
          if (meaning.definitions) {
            for (const def of meaning.definitions) {
              if (!definition && def.definition) {
                definition = def.definition;
              }
              if (!exampleEn && def.example) {
                exampleEn = def.example;
              }
              if (definition && exampleEn) break;
            }
          }
          if (definition && exampleEn) break;
        }
      }
      if (definition && exampleEn) break;
    }

    if (!exampleEn && definition) {
      exampleEn = `${word.charAt(0).toUpperCase() + word.slice(1)} means "${definition}".`;
    }
  }

  return { definition, exampleEn };
}

export async function generateThemeWords(
  theme: string,
  difficulty?: string,
  count?: number,
  existingWords?: string[]
): Promise<AIWordResult[]> {
  const trimmed = theme.trim().toLowerCase();
  if (!trimmed) return [];

  const gemini = await isGeminiAvailable();
  if (gemini) {
    try {
      const res = await fetch(`${API_BASE}/api/ai/generate-theme`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: trimmed,
          difficulty: difficulty || 'Intermediate',
          count: count || 20,
          existingWords: existingWords || [],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.words || [];
      }
    } catch {}
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
          translateToKorean(wordStr),
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
  existingWords: string[]
): Promise<AIWordResult[]> {
  const gemini = await isGeminiAvailable();
  if (!gemini) {
    return generateThemeWords(theme);
  }

  try {
    const res = await fetch(`${API_BASE}/api/ai/generate-more`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        theme: theme.trim(),
        difficulty,
        count,
        existingWords,
      }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {}
  return [];
}
