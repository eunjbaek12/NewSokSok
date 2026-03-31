export const fetchWordsFromImage = async (base64Image: string, maxRetries = 3, signal?: AbortSignal) => {
    // Expo 클라이언트 사이드에서 환경변수를 읽으려면 'EXPO_PUBLIC_' 접두사가 반드시 필요합니다.
    const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || 'YOUR_API_KEY_HERE';
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_API_KEY_HERE') {
        throw new Error('EXPO_PUBLIC_GEMINI_API_KEY 환경 변수가 설정되어 있지 않습니다. .env 파일을 확인해주세요.');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
        contents: [
            {
                parts: [
                    { text: "이미지에서 모르는 영단어들을 찾아내고, 각 단어의 [단어, 뜻, 예문]을 JSON 배열 형태로 응답해줘. 응답은 오직 배열만 반환해야 해. JSON 포맷: [{\"word\": \"단어\", \"meaning\": \"뜻\", \"exampleSentence\": \"예문\"}]" },
                    {
                        inlineData: {
                            mimeType: "image/jpeg",
                            data: base64Image
                        }
                    }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
        }
    };

    let lastError: Error = new Error('API 호출에 실패했습니다.');

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = 'API 호출에 실패했습니다.';

                try {
                    const errJson = JSON.parse(errorText);
                    if (errJson.error && errJson.error.message) {
                        errorMessage = errJson.error.message;
                    }
                } catch (e) {
                    // parsing failed, use fallback message
                }

                // If it's a 400 Bad Request (likely a malformed payload or unrecoverable client error) don't retry,
                // otherwise retry for 429 Too Many Requests, 50x Server errors, etc.
                if (response.status === 400) {
                    const finalErr = new Error(`API 오류: ${errorMessage}`);
                    // Setting a flag so the catch block knows it's a 400
                    (finalErr as any).isBadRequest = true;
                    throw finalErr;
                }

                lastError = new Error(`API 오류: ${errorMessage}`);
                throw lastError; // Throw so we catch it and potentially retry
            }

            const data = await response.json();
            const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!textResponse) throw new Error('결과를 파싱할 수 없습니다.');

            try {
                return JSON.parse(textResponse);
            } catch (e) {
                console.error("JSON 파싱 에러:", textResponse);
                throw new Error("API 응답이 올바른 JSON 형식이 아닙니다.");
            }

        } catch (error: any) {
            // AbortError는 retry 없이 즉시 throw
            if (error.name === 'AbortError') throw error;

            // If it's the last attempt OR if it's a specific, unrecoverable error (like JSON parsing failure
            // from a perfectly 200 OK response, or 400 Bad Request thrown from above)
            if (
                attempt === maxRetries ||
                error.message === '결과를 파싱할 수 없습니다.' ||
                error.message === 'API 응답이 올바른 JSON 형식이 아닙니다.' ||
                error.isBadRequest
            ) {
                // If we specifically marked this as a bad request (400), throw immediately
                if (error.isBadRequest) {
                    throw error;
                }

                // To be safe and retry on most network errors or 429s/500s:
                if (attempt === maxRetries) {
                    console.error("Gemini API Error details after max retries:", error);
                    throw error;
                }
            }

            // Wait before next retry. Exponential backoff: 1000ms * 2^attempt
            const delayMs = 1000 * Math.pow(2, attempt);
            console.log(`[Gemini API] Attempt ${attempt + 1} failed, retrying in ${delayMs}ms...`);
            await new Promise((res, rej) => {
                const timer = setTimeout(res, delayMs);
                signal?.addEventListener('abort', () => {
                    clearTimeout(timer);
                    rej(new DOMException('Aborted', 'AbortError'));
                }, { once: true });
            });
        }
    }

    throw lastError;
};
