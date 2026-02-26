import { GoogleGenAI, Type } from "@google/genai";

interface AIWordResult {
  term: string;
  definition: string;
  exampleEn: string;
  meaningKr: string;
}

const MODEL_NAME = "gemini-2.0-flash";

function getAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return new GoogleGenAI({ apiKey });
}

export function isGeminiAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export async function analyzeWord(word: string): Promise<AIWordResult> {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: `Analyze the English word "${word}". Provide a simple English definition, one English example sentence, and the Korean meaning.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
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
  });

  const text = response.text;
  if (!text) throw new Error("No response from AI");
  return JSON.parse(text) as AIWordResult;
}

export async function generateThemeList(
  theme: string,
  difficulty: string = "Intermediate",
  count: number = 20,
  existingWords: string[] = []
): Promise<{ title: string; words: AIWordResult[] }> {
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

  const text = response.text;
  if (!text) throw new Error("No response from AI");
  return JSON.parse(text) as { title: string; words: AIWordResult[] };
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

  const text = response.text;
  if (!text) throw new Error("No response from AI");
  return JSON.parse(text) as AIWordResult[];
}
