import * as dotenv from 'dotenv';
import path from 'path';

// Load .env relative to the script execution path
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error('EXPO_PUBLIC_GEMINI_API_KEY is not defined in .env');
    process.exit(1);
}

async function listModels() {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.error('Failed to fetch models:', await response.text());
            return;
        }

        const data = await response.json();
        console.log('Available models:');

        // Filter for models that support generateContent and are flash or pro
        const supportedModels = data.models.filter((m: any) =>
            m.supportedGenerationMethods.includes('generateContent') &&
            (m.name.includes('flash') || m.name.includes('pro'))
        );

        supportedModels.forEach((m: any) => {
            console.log(`- ${m.name}`);
            console.log(`  Description: ${m.description}`);
        });

    } catch (error) {
        console.error('Error fetching models:', error);
    }
}

listModels();
