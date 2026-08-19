import fs from 'fs';
import { GoogleGenAI, Type } from '@google/genai';
import { SCRIPT_GEMINI_MODEL } from './_shared/model.mjs';

const apiKey = fs.readFileSync('.env', 'utf8').match(/EXPO_PUBLIC_GEMINI_API_KEY=(.*)/)?.[1].trim() || '';
const ai = new GoogleGenAI({ apiKey });
const MODEL_NAME = SCRIPT_GEMINI_MODEL;

console.log(`[A] analyzeWord 시뮬레이션 — 단어 추가 AI 분석 경로`);
const t0 = Date.now();
const r1 = await ai.models.generateContent({
  model: MODEL_NAME,
  contents: `Analyze the English word "ephemeral". Provide: definition, example sentence, Korean meaning, mnemonic, pos, phonetic, Korean example translation.`,
  config: {
    responseMimeType: 'application/json',
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
      required: ['term', 'definition', 'exampleEn', 'meaningKr', 'mnemonic', 'pos', 'phonetic'],
    },
  },
});
const parsed1 = JSON.parse(r1.text);
console.log(`  HTTP OK (${Date.now() - t0}ms)`);
console.log(`  term=${parsed1.term} pos=${parsed1.pos} phonetic=${parsed1.phonetic}`);
console.log(`  meaningKr=${parsed1.meaningKr}`);

console.log(`\n✅ SDK path PASSED — analyzeWord 새 모델로 동작`);
