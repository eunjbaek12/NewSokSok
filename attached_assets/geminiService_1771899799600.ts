import { GoogleGenAI, Type } from "@google/genai";
import { AIWordResult } from "../types";

// Initialize Gemini Client via a helper to allow lazy loading
const getAIClient = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please set VITE_GEMINI_API_KEY in your .env.local.");
  }
  return new GoogleGenAI({ apiKey });
};

const MODEL_NAME = "gemini-1.5-flash"; // Updated to stable model name if needed, or keep preview

/**
 * Analyzes a single word to provide definition, example, and Korean meaning.
 */
export const analyzeWordWithGemini = async (word: string): Promise<AIWordResult> => {
  try {
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
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    // Return a fallback instead of crashing
    return {
      term: word,
      definition: "Definition unavailable (API Key missing or Error).",
      exampleEn: "Example unavailable.",
      meaningKr: "분석 실패 (API 키 확인 필요)",
    };
  }
};

/**
 * Generates a full vocabulary list based on a user-provided theme, difficulty, and count.
 */
export const generateThemeListWithGemini = async (theme: string, difficulty: string = 'Intermediate', count: number = 20): Promise<{ title: string; words: AIWordResult[] }> => {
  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Generate a vocabulary list for the theme: "${theme}". Level: ${difficulty}.
      Return a JSON object with a suitable title for the list and an array of ${count} relevant English words suitable for this level.
      For each word, provide the definition, an example sentence, and Korean meaning.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "A creative title for the vocabulary list" },
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
  } catch (error) {
    console.error("Gemini Theme Generation Error:", error);
    // Throw descriptive error for UI to handle
    throw new Error("Failed to generate theme. Please check your API Key configuration.");
  }
};

/**
 * Generates additional words for an existing list, excluding current words.
 */
export const generateMoreWordsWithGemini = async (
  theme: string,
  difficulty: string,
  count: number,
  existingWords: string[]
): Promise<AIWordResult[]> => {
  try {
    const ai = getAIClient();
    // Limit existing words sent to prompt to avoid token limits, though 3-flash has large context.
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
  } catch (error) {
    console.error("Gemini More Words Generation Error:", error);
    throw new Error("Failed to generate more words. Please check your API Key configuration.");
  }
};