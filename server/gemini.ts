import { GoogleGenAI, Type } from "@google/genai";
import {
  AIWordResultSchema,
  AIThemeGenerateResponseSchema,
  AIWordResultArraySchema,
  type AIWordResult,
  type AIThemeGenerateResponse,
} from "@shared/contracts";
import { fromZodError } from "zod-validation-error";

const MODEL_NAME = "gemini-2.0-flash";

function getAIClient(apiKey?: string) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return new GoogleGenAI({ apiKey: key });
}

export function isGeminiAvailable(apiKey?: string): boolean {
  return !!(apiKey || process.env.GEMINI_API_KEY);
}

function getFullLanguageName(code: string): string {
  const map: Record<string, string> = {
    en: 'English', ko: 'Korean', ja: 'Japanese', zh: 'Chinese',
  };
  return map[code] || code;
}

function parseAIJson<T>(text: string | undefined, schema: { safeParse(v: unknown): { success: boolean; data?: T; error?: any } }, context: string): T {
  if (!text) throw new Error(`No response from AI (${context})`);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e: any) {
    throw new Error(`AI response was not valid JSON (${context}): ${e?.message}`);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const readable = fromZodError(result.error);
    console.error(`AI ${context} schema mismatch:`, readable.message, 'raw:', raw);
    throw new Error(`AI response failed validation (${context}): ${readable.message}`);
  }
  return result.data as T;
}

export async function analyzeWord(word: string, sourceLang: string = 'en', targetLang: string = 'ko', apiKey?: string): Promise<AIWordResult> {
  const ai = getAIClient(apiKey);
  const srcName = getFullLanguageName(sourceLang);
  const tgtName = getFullLanguageName(targetLang);

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: `Analyze the ${srcName} word/phrase "${word}". Provide:
      1. A simple definition in ${srcName}.
      2. One example sentence in ${srcName}.
      3. The meaning translated into ${tgtName}.
      4. A "mnemonic" (암기법) to help remember the word easily, written in ${tgtName}.
      5. The part of speech (pos, e.g., noun, verb).
      6. The phonetic transcription (발음기호).
      7. A translation of the example sentence in ${tgtName}.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          definition: { type: Type.STRING },
          exampleEn: { type: Type.STRING },
          exampleKr: { type: Type.STRING },
          meaningKr: { type: Type.STRING },
          mnemonic: { type: Type.STRING },
          pos: { type: Type.STRING },
          phonetic: { type: Type.STRING },
        },
        required: ["term", "definition", "exampleEn", "meaningKr", "mnemonic", "pos", "phonetic"],
      },
    },
  });

  return parseAIJson<AIWordResult>(response.text, AIWordResultSchema, 'analyzeWord');
}

export async function generateThemeList(
  theme: string,
  difficulty: string = "Intermediate",
  count: number = 20,
  existingWords: string[] = []
): Promise<AIThemeGenerateResponse> {
  const ai = getAIClient();
  const exclusionNote = existingWords.length > 0
    ? `\nIMPORTANT: Do NOT include any of the following words that already exist: ${existingWords.slice(0, 500).join(", ")}.`
    : '';
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: `Generate a vocabulary list for the theme: "${theme}". Level: ${difficulty}.
      Return a JSON object with a suitable title for the list and an array of ${count} relevant English words suitable for this level.
      For each word, provide the definition, an example sentence, and Korean meaning.${exclusionNote}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: "A creative title for the vocabulary list",
          },
          words: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                definition: { type: Type.STRING },
                exampleEn: { type: Type.STRING },
                meaningKr: { type: Type.STRING },
              },
              required: ["term", "definition", "exampleEn", "meaningKr"],
            },
          },
        },
        required: ["title", "words"],
      },
    },
  });

  return parseAIJson<AIThemeGenerateResponse>(response.text, AIThemeGenerateResponseSchema, 'generateThemeList');
}

export async function generateMoreWords(
  theme: string,
  difficulty: string,
  count: number,
  existingWords: string[]
): Promise<AIWordResult[]> {
  const ai = getAIClient();
  const exclusionList = existingWords.slice(0, 300).join(", ");

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: `Generate ${count} NEW unique English vocabulary words related to the theme "${theme}" at a ${difficulty} level.
      IMPORTANT: Do NOT include any of the following words: ${exclusionList}.
      Return a JSON array of objects.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            term: { type: Type.STRING },
            definition: { type: Type.STRING },
            exampleEn: { type: Type.STRING },
            meaningKr: { type: Type.STRING },
          },
          required: ["term", "definition", "exampleEn", "meaningKr"],
        },
      },
    },
  });

  return parseAIJson<AIWordResult[]>(response.text, AIWordResultArraySchema, 'generateMoreWords');
}
