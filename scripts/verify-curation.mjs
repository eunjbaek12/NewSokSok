import fs from 'fs';
import path from 'path';
import { scriptGenerateContentUrl } from './_shared/model.mjs';

const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const apiKey = envContent.match(/EXPO_PUBLIC_GEMINI_API_KEY=(.*)/)?.[1].trim() || '';
if (!apiKey) { console.error('No key'); process.exit(1); }

const query = 'cafe';
const wordCount = 5;
const diffLabel = '중급 수준의';
const url = scriptGenerateContentUrl(apiKey);
const prompt = `성인 학습자가 '${query}' 상황에서 사용할 수 있는 ${diffLabel} 영어 단어 ${wordCount}개를 생성해줘.
응답은 오직 JSON 배열만 반환해야 해.
포맷: [{"term": "단어", "definition": "영영뜻", "meaningKr": "한국어 뜻", "exampleEn": "영어 예문", "tags": ["${query}"]}]`;

const payload = {
  contents: [{ parts: [{ text: prompt }] }],
  generationConfig: { temperature: 0.7, responseMimeType: 'application/json' }
};

const t0 = Date.now();
const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
const ms = Date.now() - t0;
console.log(`[1] HTTP ${response.status} (${ms}ms)`);

if (!response.ok) {
  const body = await response.json().catch(() => null);
  console.error('[FAIL] error body:', JSON.stringify(body, null, 2));
  process.exit(1);
}

const data = await response.json();
let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
console.log(`[2] response text length: ${textResponse.length}`);

textResponse = textResponse.trim();
if (textResponse.startsWith('```')) {
  const firstNewLine = textResponse.indexOf('\n');
  const lastBacktick = textResponse.lastIndexOf('```');
  if (firstNewLine !== -1 && lastBacktick !== -1) {
    textResponse = textResponse.slice(firstNewLine, lastBacktick).trim();
  }
}

let raw;
try {
  raw = JSON.parse(textResponse);
} catch (e) {
  console.error('[FAIL] JSON.parse error:', e.message);
  console.error('raw:', textResponse.slice(0, 500));
  process.exit(1);
}
console.log(`[3] JSON.parse OK, isArray=${Array.isArray(raw)}, length=${raw?.length}`);

const required = ['term', 'definition', 'meaningKr', 'exampleEn'];
const issues = [];
if (!Array.isArray(raw)) issues.push('not an array');
else raw.forEach((w, i) => {
  required.forEach(k => {
    if (typeof w?.[k] !== 'string' || !w[k]) issues.push(`item[${i}].${k} missing`);
  });
});

if (issues.length) {
  console.error('[FAIL] schema mismatch:', issues);
  console.error('raw[0]:', raw?.[0]);
  process.exit(1);
}
console.log(`[4] schema OK — all ${raw.length} items have required fields`);

const words = raw.map((w, index) => ({
  id: `ai-word-${index}-${Date.now()}`,
  term: w.term,
  definition: w.definition,
  meaningKr: w.meaningKr,
  exampleEn: w.exampleEn,
  isMemorized: false,
  isStarred: false,
  tags: w.tags ?? [query],
}));
console.log(`[5] mapped to Word[] — sample:`);
console.log(JSON.stringify(words[0], null, 2));
console.log(`\n✅ End-to-end verification PASSED for query="${query}"`);
