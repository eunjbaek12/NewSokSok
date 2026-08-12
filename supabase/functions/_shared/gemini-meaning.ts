import { getVertexAccessToken } from './vertex-auth.ts';

const LANG_NAME: Record<string, string> = {
  en: 'English', ko: 'Korean', ja: 'Japanese', zh: 'Chinese', vi: 'Vietnamese', es: 'Spanish',
};

/** Low-token fallback used after operator quota is exhausted. */
export async function translateMeaningOnly(term: string, sourceLang: string, targetLang: string) {
  const project = Deno.env.get('VERTEX_PROJECT_ID');
  const location = Deno.env.get('VERTEX_LOCATION') ?? 'us-central1';
  const model = Deno.env.get('VERTEX_MODEL') ?? 'gemini-2.5-flash-lite';
  if (!project) throw new Error('VERTEX_PROJECT_ID not configured');
  const token = await getVertexAccessToken();
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
  const prompt = `Decide whether the EXACT spelling "${term}" is a real, recognized ${LANG_NAME[sourceLang] ?? sourceLang} word, phrase, idiom, or common abbreviation, then return a short learner-friendly meaning in ${LANG_NAME[targetLang] ?? targetLang}.
- Judge the exact input as written. NEVER silently correct it, remove or add letters, or return the meaning of a similar-looking word. For example, an invalid extension of a real word must be rejected instead of inheriting the real word's meaning.
- If the exact spelling is a typo, gibberish, random characters, only a word from another language, or has no recognized meaning in ${LANG_NAME[sourceLang] ?? sourceLang}, set isReal to false and meaning to an empty string.
- When uncertain, set isReal to false. Do not invent or infer a plausible meaning.
Return no examples, pronunciation, part of speech, correction suggestion, or explanation.`;
  const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2, responseSchema: { type: 'OBJECT', properties: { meaning: { type: 'STRING' }, isReal: { type: 'BOOLEAN' } }, required: ['meaning', 'isReal'] } },
  }) });
  if (!res.ok) throw new Error(`meaning call failed (${res.status})`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('meaning call returned no text');
  const parsed = JSON.parse(text) as { meaning?: string; isReal?: boolean };
  return { term, definition: '', exampleEn: '', exampleKr: '', meaningKr: parsed.meaning?.trim() ?? '', pos: '', phonetic: '', isReal: parsed.isReal !== false };
}
