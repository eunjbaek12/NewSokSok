import fs from 'fs';
import { scriptGenerateContentUrl } from './_shared/model.mjs';
const apiKey = fs.readFileSync('.env','utf8').match(/EXPO_PUBLIC_GEMINI_API_KEY=(.*)/)?.[1].trim();
const url = scriptGenerateContentUrl(apiKey);

// 사용자가 시도한 시나리오: 고급, 30개, query는 'travel' 가정
const wordCount = 30;
const diffLabel = '고급/전문적인';
const query = 'travel';
const prompt = `성인 학습자가 '${query}' 상황에서 사용할 수 있는 ${diffLabel} 영어 단어 ${wordCount}개를 생성해줘.
응답은 오직 JSON 배열만 반환해야 해.
포맷: [{"term": "단어", "definition": "영영뜻", "meaningKr": "한국어 뜻", "exampleEn": "영어 예문", "tags": ["${query}"]}]`;

async function call(label, generationConfig) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig })
  });
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const finishReason = data.candidates?.[0]?.finishReason;
  const usage = data.usageMetadata;
  let parsedOK = false, parsedLen = 0;
  try { const arr = JSON.parse(text); parsedOK = Array.isArray(arr); parsedLen = arr?.length; } catch {}
  console.log(`\n[${label}]`);
  console.log(`  finishReason=${finishReason} parsedOK=${parsedOK} parsedLen=${parsedLen}`);
  console.log(`  usage: prompt=${usage?.promptTokenCount} candidates=${usage?.candidatesTokenCount} total=${usage?.totalTokenCount}`);
  console.log(`  textLen=${text.length}`);
  console.log(`  head="${text.slice(0, 80)}"`);
  console.log(`  tail="${text.slice(-120)}"`);
}

await call('A. thinkingBudget=0 만 (현재 수정과 동일)', {
  temperature: 0.7,
  responseMimeType: 'application/json',
  thinkingConfig: { thinkingBudget: 0 },
});

await call('B. thinkingBudget=0 + maxOutputTokens=8192', {
  temperature: 0.7,
  responseMimeType: 'application/json',
  thinkingConfig: { thinkingBudget: 0 },
  maxOutputTokens: 8192,
});

await call('C. thinkingBudget=0 + maxOutputTokens=16384', {
  temperature: 0.7,
  responseMimeType: 'application/json',
  thinkingConfig: { thinkingBudget: 0 },
  maxOutputTokens: 16384,
});
