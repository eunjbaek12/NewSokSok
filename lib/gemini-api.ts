import { GeminiImageResultSchema, type GeminiImageResult } from '@shared/contracts';
import { scanImageViaEdge } from '@/lib/ai/edge-scan';

const LANG_NAMES: Record<string, string> = {
    en: 'English',
    ko: 'Korean',
    ja: 'Japanese',
    zh: 'Chinese',
    vi: 'Vietnamese',
    es: 'Spanish',
};

// 사진 추출 프롬프트(BYOK 경로). 교착어(ko/ja)는 사전 기본형을 요청해 "하는중입니다"
// 같은 문장 덩어리 추출을 줄인다. 그 외는 표면형 유지.
// ⚠️ Edge supabase/functions/_shared/gemini-vertex.ts의 buildExtractPrompt와 동일 문구 유지.
function buildExtractPrompt(langName: string, sourceLang: string): string {
    const isAgglutinative = sourceLang === 'ko' || sourceLang === 'ja';
    const formInstr = isAgglutinative
        ? `Return each entry in its DICTIONARY BASE FORM (the headword a learner would look up): strip attached particles and verb/adjective conjugation endings. For example, Korean "하는중입니다" → "하다", "학교에서" → "학교"; Japanese conjugated forms → 辞書形 (dictionary form).`
        : `Preserve each word's surface form exactly as it appears; do not lemmatize.`;
    return `Extract the ${langName} vocabulary visible in the image. Extract individual vocabulary words only — never full sentences, clauses, or particle-attached phrases. ${formInstr} Only include words written in ${langName}. IGNORE any text in other languages or scripts. Return ONLY a JSON array. Format: [{"word":"..."}]`;
}

const scanEdgeErrorMessage = (kind: string): string => {
    switch (kind) {
        case 'quota_exceeded':
            return '오늘의 AI 한도를 모두 사용했어요. 광고를 보거나 잠시 후 다시 시도해주세요.';
        case 'rate_limited':
            return '요청이 많아요. 잠시 후 다시 시도해주세요.';
        case 'unauthorized':
            return '로그인이 필요해요. 다시 로그인한 뒤 시도해주세요.';
        default:
            return '사진 분석에 실패했어요. 잠시 후 다시 시도해주세요.';
    }
};

export const fetchWordsFromImage = async (
    base64Image: string,
    maxRetries = 3,
    signal?: AbortSignal,
    apiKey?: string,
    sourceLang: string = 'en',
): Promise<GeminiImageResult> => {
    const GEMINI_API_KEY = apiKey || '';

    // BYOK 키가 없으면 운영자 키(Edge, quota 적용) 경로로 추출.
    if (!GEMINI_API_KEY) {
        const res = await scanImageViaEdge(base64Image, sourceLang, signal);
        if (res.kind !== 'ok') throw new Error(scanEdgeErrorMessage(res.kind));
        const parsed = GeminiImageResultSchema.safeParse(res.result);
        if (!parsed.success) {
            console.error('scan-image 응답 스키마 불일치:', parsed.error.issues, 'raw:', res.result);
            throw new Error('API 응답 형식이 예상과 다릅니다. 다시 시도해주세요.');
        }
        return parsed.data;
    }

    const langName = LANG_NAMES[sourceLang] || 'English';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
        contents: [
            {
                parts: [
                    { text: buildExtractPrompt(langName, sourceLang) },
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

            let raw: unknown;
            try {
                raw = JSON.parse(textResponse);
            } catch (e) {
                console.error("JSON 파싱 에러:", textResponse);
                throw new Error("API 응답이 올바른 JSON 형식이 아닙니다.");
            }
            const parsed = GeminiImageResultSchema.safeParse(raw);
            if (!parsed.success) {
                console.error("Gemini 이미지 응답 스키마 불일치:", parsed.error.issues, 'raw:', raw);
                throw new Error("API 응답 형식이 예상과 다릅니다. 다시 시도해주세요.");
            }
            return parsed.data;

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
