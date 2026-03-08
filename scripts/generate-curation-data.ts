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

const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const generateThemeBatch = async (prompt: string) => {
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            responseMimeType: "application/json",
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`API 오류: ${err}`);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return JSON.parse(textResponse);
};

const main = async () => {
    console.log('Generating 50+ curated themes...');

    const prompts = [
        {
            topic: "Medical & Health (Medical checkup, ER, Pharmacy, Dental)",
            prompt: "Generate 15 advanced English vocabulary themes related to Medical & Health for Korean adult learners. Each theme must have an icon (emoji), title (Korean), and 10 advanced words. JSON Format: [{ \"title\": \"산부인과 정기 검진\", \"icon\": \"🩺\", \"words\": [{\"term\": \"ultrasound\", \"definition\": \"Sound waves with frequencies higher than the upper audible limit of human hearing.\", \"meaningKr\": \"초음파\", \"exampleEn\": \"The doctor ordered an ultrasound to check the baby's development.\", \"exampleKr\": \"의사가 아기 발달 확인을 위해 초음파를 지시했다.\", \"tags\": [\"Medical\", \"Advanced\"]}] }]"
        },
        {
            topic: "Business & Career (Negotiation, Tech Interview, Pitch, Contracts)",
            prompt: "Generate 15 advanced English vocabulary themes related to Business & Career for Korean adult learners. Each theme must have an icon (emoji), title (Korean), and 10 advanced words. JSON Format: same as above."
        },
        {
            topic: "Travel & Survival (Car rental accident, Immigration emergency, Hotel complaint)",
            prompt: "Generate 10 advanced English vocabulary themes related to Travel & Survival emergencies for Korean adult learners. Each theme must have an icon (emoji), title (Korean), and 10 advanced words. JSON Format: same as above."
        },
        {
            topic: "Academic & Exam (Essential TOEIC, Essay writing, University lecture)",
            prompt: "Generate 10 advanced English vocabulary themes related to Academic & Exam (TOEIC, TOEFL, University) for Korean adult learners. Each theme must have an icon (emoji), title (Korean), and 10 advanced words. JSON Format: same as above."
        }
    ];

    let allThemes: any[] = [];

    for (const p of prompts) {
        console.log(`Generating: ${p.topic}`);
        try {
            const themes = await generateThemeBatch(p.prompt);
            allThemes = allThemes.concat(themes);
        } catch (e: any) {
            console.error(`Error generating ${p.topic}:`, e.message);
        }
    }

    console.log(`Successfully generated ${allThemes.length} themes.`);

    // Transform to VocaList format
    const finalData = allThemes.map((theme, i) => ({
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
            tags: w.tags || []
        }))
    }));

    const fileContent = `import { VocaList } from '@/lib/types';\n\nexport const curationPresets: VocaList[] = ${JSON.stringify(finalData, null, 2)};\n`;

    const destPath = path.resolve(process.cwd(), 'constants/curationData.ts');
    fs.writeFileSync(destPath, fileContent, 'utf8');
    console.log(`Saved curation data to ${destPath}`);
};

main();
