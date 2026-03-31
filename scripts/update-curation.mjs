/**
 * 기존 curationData 프리셋 단어에 phonetic, pos 필드를 추가하는 스크립트
 * 사용법: node scripts/update-curation.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
if (!API_KEY) {
    console.error('EXPO_PUBLIC_GEMINI_API_KEY not found in .env');
    process.exit(1);
}

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`;

async function fetchPhoneticAndPos(words) {
    const wordList = words.map(w => w.term);

    const prompt = `다음 영어 단어/표현 목록에 대해 각각 IPA 발음기호(phonetic)와 품사(pos)를 알려줘.
품사는 영어 약어로: noun, verb, adjective, adverb, phrase, idiom 등.
구(phrase)나 관용구(idiom)는 해당하는 것으로 표기해.

단어 목록:
${wordList.map((w, i) => `${i}. ${w}`).join('\n')}

응답은 오직 JSON 배열만 반환해. 인덱스 순서대로:
[{"phonetic": "/IPA/", "pos": "품사"}]`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
    };

    const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    text = text.trim();
    if (text.startsWith('```')) {
        const first = text.indexOf('\n');
        const last = text.lastIndexOf('```');
        text = text.slice(first, last).trim();
    }

    return JSON.parse(text);
}

async function main() {
    const dataPath = path.join(__dirname, '..', 'constants', 'curationData.ts');
    const raw = fs.readFileSync(dataPath, 'utf-8');

    // Extract the array content from the TS file (skip "VocaList[]", find "= [")
    const assignIdx = raw.indexOf('= [');
    const startIdx = assignIdx + 2; // point to '['
    const endIdx = raw.lastIndexOf(']') + 1;
    let jsonStr = raw.slice(startIdx, endIdx);
    // Remove trailing commas before } or ] (TS allows them, JSON doesn't)
    jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');

    const presets = JSON.parse(jsonStr);

    console.log(`Found ${presets.length} presets, total ${presets.reduce((s, p) => s + (p.words?.length || 0), 0)} words`);

    for (let i = 0; i < presets.length; i++) {
        const preset = presets[i];
        const words = preset.words || [];
        if (words.length === 0) continue;

        // 이미 phonetic 필드가 있으면 건너뛰기
        if (words[0]?.phonetic !== undefined) {
            console.log(`[${i + 1}/${presets.length}] "${preset.title}" — already updated, skipping`);
            continue;
        }

        console.log(`[${i + 1}/${presets.length}] "${preset.title}" (${words.length} words)...`);

        try {
            const results = await fetchPhoneticAndPos(words);

            if (results.length !== words.length) {
                console.warn(`  ⚠ Expected ${words.length} results, got ${results.length}. Applying partial.`);
            }

            for (let j = 0; j < Math.min(words.length, results.length); j++) {
                words[j].phonetic = results[j]?.phonetic || '';
                words[j].pos = results[j]?.pos || '';
            }

            console.log(`  ✓ Updated ${words.length} words`);
        } catch (err) {
            console.error(`  ✗ Error: ${err.message}`);
        }

        // Rate limit - 5초 대기
        if (i < presets.length - 1) {
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    // Write back
    const output = `import { VocaList } from '@/lib/types';\n\nexport const curationPresets: VocaList[] = ${JSON.stringify(presets, null, 2)};\n`;
    fs.writeFileSync(dataPath, output, 'utf-8');
    console.log('\n✓ curationData.ts updated successfully!');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
