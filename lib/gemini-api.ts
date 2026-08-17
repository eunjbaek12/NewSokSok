import { GeminiImageResultSchema, type GeminiImageResult } from '@shared/contracts';
import { scanImageViaEdge } from '@/lib/ai/edge-scan';
import { byokGenerateContentUrl } from '@/lib/ai/model';
import { classifyGeminiQuotaError, type GeminiQuotaKind } from '@/lib/ai/gemini-quota';

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

/**
 * 사진 스캔 실패 사유 — 문장이 아니라 **코드**로 던지고 화면에서 번역한다.
 *
 * 예전에는 한국어 문장을 Error.message에 담아 던졌는데, 아래 재시도 판단이 그 문장과
 * 문자열을 비교하고 있었다. 그대로 번역했다면 재시도 여부가 UI 언어에 따라 갈렸을
 * 자리다(마침 그 비교는 아무 효과가 없는 죽은 가지였지만, 남겨 두면 언제든 살아난다).
 */
export type ScanErrorCode =
    | 'byokQuotaExceeded'
    | 'byokPerMinuteQuota'  // 1분이면 풀린다 — 위와 뭉개면 "오늘은 끝났다"로 읽힌다
    | 'quotaExceeded'
    | 'rateLimited'
    | 'unauthorized'
    | 'badResponse'   // 스키마 불일치·JSON 아님·본문 없음 — 사용자에게는 다 같은 말이다
    | 'apiError'      // API가 준 사유(detail)가 있는 경우
    | 'failed';

export class ScanError extends Error {
    readonly code: ScanErrorCode;
    /** API가 돌려준 원문 사유. 우리가 쓴 문장이 아니므로 번역하지 않고 덧붙이기만 한다. */
    readonly detail?: string;
    /** HTTP 400 — payload 문제라 같은 요청을 다시 보내도 결과가 같다. */
    readonly isBadRequest: boolean;

    constructor(code: ScanErrorCode, opts: { detail?: string; isBadRequest?: boolean } = {}) {
        // message는 로그·크래시 리포트용이다. 사용자에게 보이는 문구는 화면에서 code로 만든다.
        super(opts.detail ? `${code}: ${opts.detail}` : code);
        this.name = 'ScanError';
        this.code = code;
        this.detail = opts.detail;
        this.isBadRequest = opts.isBadRequest ?? false;
    }
}

// Edge Function이 주는 실패 종류 → 화면 코드.
const EDGE_ERROR_CODE: Record<string, ScanErrorCode> = {
    quota_exceeded: 'quotaExceeded',
    rate_limited: 'rateLimited',
    unauthorized: 'unauthorized',
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
        if (res.kind !== 'ok') throw new ScanError(EDGE_ERROR_CODE[res.kind] ?? 'failed');
        const parsed = GeminiImageResultSchema.safeParse(res.result);
        if (!parsed.success) {
            console.error('scan-image 응답 스키마 불일치:', parsed.error.issues, 'raw:', res.result);
            throw new ScanError('badResponse');
        }
        return parsed.data;
    }

    const langName = LANG_NAMES[sourceLang] || 'English';
    const url = byokGenerateContentUrl(GEMINI_API_KEY);
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

    let lastError: Error = new ScanError('failed');

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
                let detail: string | undefined;
                let status: string | undefined;
                let quotaKind: GeminiQuotaKind = 'other';

                try {
                    const errJson = JSON.parse(errorText);
                    if (errJson.error && errJson.error.message) {
                        detail = errJson.error.message;
                    }
                    status = errJson.error?.status;
                    quotaKind = classifyGeminiQuotaError(errJson.error);
                } catch (e) {
                    // parsing failed — detail 없이 코드만으로 안내한다
                }

                // BYOK 할당량 소진은 장애가 아니라 사용자가 조치 가능한 정상 상태다.
                // Google 원문은 영어이며 요금제별 상세까지 섞여 있으므로 사용자에게 노출하지
                // 않고, 화면이 현지화된 정식 안내를 만들 수 있도록 코드만 전달한다.
                // 같은 요청을 재시도해도 풀리지 않아 불필요한 호출도 즉시 멈춘다.
                //
                // 🔴 분당 한도는 1분이면 풀린다 — 일일 한도와 같은 코드로 뭉개면 화면이
                // "갱신 시점은 요금제와 설정에 따라 달라질 수 있어요"라고 안내해 오늘 못 쓴다고
                // 읽힌다. AI 단어 생성은 이미 갈라 던지고 있었는데 스캔만 429 를 구분하지 않아
                // 같은 상황에 두 화면이 다른 안내를 했다. 판정은 lib/ai/gemini-quota.ts 공용.
                if (response.status === 429 || status === 'RESOURCE_EXHAUSTED') {
                    throw new ScanError(quotaKind === 'perMinute' ? 'byokPerMinuteQuota' : 'byokQuotaExceeded');
                }

                // If it's a 400 Bad Request (likely a malformed payload or unrecoverable client error) don't retry,
                // otherwise retry for 429 Too Many Requests, 50x Server errors, etc.
                const isBadRequest = response.status === 400;
                const err = new ScanError(detail ? 'apiError' : 'failed', { detail, isBadRequest });
                if (isBadRequest) throw err;

                lastError = err;
                throw lastError; // Throw so we catch it and potentially retry
            }

            const data = await response.json();
            const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!textResponse) throw new ScanError('badResponse');

            let raw: unknown;
            try {
                raw = JSON.parse(textResponse);
            } catch (e) {
                console.error("JSON 파싱 에러:", textResponse);
                throw new ScanError('badResponse');
            }
            const parsed = GeminiImageResultSchema.safeParse(raw);
            if (!parsed.success) {
                console.error("Gemini 이미지 응답 스키마 불일치:", parsed.error.issues, 'raw:', raw);
                throw new ScanError('badResponse');
            }
            return parsed.data;

        } catch (error: any) {
            // AbortError는 retry 없이 즉시 throw
            if (error.name === 'AbortError') throw error;

            // 사용량 소진은 재시도로 회복되지 않는다. Google에 같은 요청을 반복해
            // 지연시키지 말고 화면의 현지화 안내로 즉시 넘긴다.
            // 분당 한도도 마찬가지다 — 백오프가 1·2·4초라 최대 7초뿐이라 60초 창을 못 넘는다.
            if (error instanceof ScanError
                && (error.code === 'byokQuotaExceeded' || error.code === 'byokPerMinuteQuota')) throw error;

            // 400은 payload 문제라 같은 요청을 다시 보내도 결과가 같다 — 즉시 포기.
            if (error.isBadRequest) throw error;

            // 그 밖(네트워크·429·50x·응답 파싱 실패)은 마지막 시도까지 재시도한다.
            //
            // 예전에는 여기에 "파싱 실패는 재시도하지 않는다"는 뜻으로 보이는 메시지 비교
            // 두 줄이 더 있었지만, 두 조건 모두 바깥 if만 통과시키고 안에서 아무것도 하지
            // 않아 실제로는 그대로 재시도로 흘렀다. 있는 그대로 남긴다(동작 동일).
            if (attempt === maxRetries) {
                console.error("Gemini API Error details after max retries:", error);
                throw error;
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
