import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
let GEMINI_API_KEY = '';
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/EXPO_PUBLIC_GEMINI_API_KEY=(.*)/);
    if (match) GEMINI_API_KEY = match[1].trim();
}

const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

const testQuota = async () => {
    const payload = {
        contents: [{ parts: [{ text: "Say 'Hello' in JSON format: {\"msg\": \"Hello\"}" }] }],
        generationConfig: { responseMimeType: "application/json" }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    console.log(`Status: ${response.status}`);
    const body = await response.text();
    console.log(`Body: ${body}`);
};

testQuota();
