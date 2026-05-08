import fs from 'fs';
const apiKey = fs.readFileSync('.env','utf8').match(/EXPO_PUBLIC_GEMINI_API_KEY=(.*)/)?.[1].trim();
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

async function probe(wordCount) {
  const prompt = `성인 학습자가 'travel' 상황에서 사용할 수 있는 중급 수준의 영어 단어 ${wordCount}개를 생성해줘.
응답은 오직 JSON 배열만 반환해야 해.
포맷: [{"term": "단어", "definition": "영영뜻", "meaningKr": "한국어 뜻", "exampleEn": "영어 예문", "tags": ["travel"]}]`;

  const t0 = Date.now();
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } }
    })
  });
  const ms = Date.now() - t0;
  const data = await r.json();
  if (!r.ok) {
    console.log(`[${wordCount}] HTTP ${r.status} (${ms}ms): ${data?.error?.status || data?.error?.message?.slice(0,80)}`);
    return;
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const finishReason = data.candidates?.[0]?.finishReason;
  const usage = data.usageMetadata;
  let parsedOK = false, parsedLen = 0;
  try { const arr = JSON.parse(text); parsedOK = Array.isArray(arr); parsedLen = arr?.length; } catch {}
  console.log(`[${wordCount}] (${ms}ms) finish=${finishReason} parsed=${parsedOK} actualLen=${parsedLen} outTokens=${usage?.candidatesTokenCount}`);
}

for (const n of [50, 80, 100, 150]) {
  await probe(n);
}
