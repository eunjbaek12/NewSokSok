import fs from 'fs';
import path from 'path';

// Read the EXPO_PUBLIC_GEMINI_API_KEY from .env
const envPath = path.resolve(process.cwd(), '.env');
let GEMINI_API_KEY = '';
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/EXPO_PUBLIC_GEMINI_API_KEY=(.*)/);
    if (match) GEMINI_API_KEY = match[1].trim();
}

if (!GEMINI_API_KEY) {
    console.error("No EXPO_PUBLIC_GEMINI_API_KEY found in .env");
    process.exit(1);
}

// Using v1 with snake_case for generation_config
const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const generateThemeBatch = async (prompt: string, retryCount = 0): Promise<any> => {
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.8,
            // v1 often uses snake_case in JSON or doesn't support mimic type here
            // Let's try response_mime_type
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.text();
            console.error(`Status: ${response.status}, Error: ${err}`);
            if (response.status === 429 && retryCount < 3) {
                console.log(`Rate limited, retrying in 30s...`);
                await sleep(30000);
                return generateThemeBatch(prompt, retryCount + 1);
            }
            throw new Error(`API 오류 (${response.status}): ${err}`);
        }

        const data = await response.json();
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textResponse) throw new Error("API 응답이 비어있습니다.");

        // Clean up markdown if AI returned it
        const cleaned = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e: any) {
        if (retryCount < 1) {
            console.log(`Error: ${e.message}, retrying once...`);
            await sleep(5000);
            return generateThemeBatch(prompt, retryCount + 1);
        }
        throw e;
    }
};

const CATEGORIES = [
    { name: "생활 & 서바이벌", examples: ["시청 여권 발급", "렌터카 사고"] },
    { name: "비즈니스 & 직장", examples: ["연봉 협상", "기술 면접"] }
];

const main = async () => {
    console.log('Generating smaller set (20 themes) using gemini-1.5-flash v1...');

    let allThemes: any[] = [];
    const TOTAL_THEMES = 10; // Let's try 10 first to be safe

    for (const cat of CATEGORIES) {
        console.log(`\n--- Category: ${cat.name} ---`);
        const prompt = `
Generate 5 unique English vocabulary themes related to "${cat.name}".
Examples: ${cat.examples.join(', ')}.
Each theme: title(Korean), icon(emoji), words(Exactly 20 advanced words).
JSON Format: [{ "title": "...", "icon": "...", "words": [{ "term": "...", "definition": "...", "meaningKr": "...", "exampleEn": "...", "exampleKr": "..." }] }]
Return ONLY JSON.
        `;

        try {
            const themes = await generateThemeBatch(prompt);
            if (Array.isArray(themes)) {
                allThemes = allThemes.concat(themes);
                console.log(`Successfully generated ${themes.length} themes.`);
            }
            saveToFile(allThemes);
            await sleep(5000);
        } catch (e: any) {
            console.error(`Failed ${cat.name}:`, e.message);
        }
    }
};

const saveToFile = (themes: any[]) => {
    const finalData = themes.map((theme, i) => ({
        id: `curated-theme-${i + 1}-${Date.now()}`,
        title: theme.title,
        icon: theme.icon || '📚',
        isCurated: true,
        isVisible: true,
        createdAt: Date.now(),
        words: theme.words.map((w: any, j: number) => ({
            id: `word-${i}-${j}-${Date.now()}`,
            term: w.term,
            definition: w.definition,
            meaningKr: w.meaningKr,
            exampleEn: w.exampleEn,
            exampleKr: w.exampleKr || '',
            isMemorized: false,
            isStarred: false,
            tags: ["Contextual"]
        }))
    }));

    const fileContent = `import { VocaList } from '@/lib/types';\n\nexport const curationPresets: VocaList[] = ${JSON.stringify(finalData, null, 2)};\n`;
    const destPath = path.resolve(process.cwd(), 'constants/curationData.ts');
    fs.writeFileSync(destPath, fileContent, 'utf8');
};

main();
