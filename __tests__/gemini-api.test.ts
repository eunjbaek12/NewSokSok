// BYOK(직접 호출) 경로만 검사한다. edge-scan을 목으로 끊지 않으면 supabase client를
// 거쳐 react-native까지 로드돼(Flow 문법) 스위트 전체가 뜨지 않는다.
jest.mock('../lib/ai/edge-scan', () => ({ scanImageViaEdge: jest.fn() }));

import { fetchWordsFromImage, ScanError } from '../lib/gemini-api';

describe('Gemini API fetchWordsFromImage', () => {
    let originalFetch: typeof global.fetch;
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        originalFetch = global.fetch;
        originalEnv = process.env;
        process.env = { ...originalEnv, EXPO_PUBLIC_GEMINI_API_KEY: 'TEST_API_KEY' };

        // Mock setTimeout to execute immediately so we don't wait for exponential backoff during tests
        jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
            cb();
            return 0 as any;
        });
    });

    afterEach(() => {
        global.fetch = originalFetch;
        process.env = originalEnv;
        jest.restoreAllMocks();
    });

    it('should call fetch with the correct preview model URL and proper payload', async () => {
        const mockResponse = {
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: JSON.stringify([
                                        { word: 'apple', meaning: '사과', exampleSentence: 'I eat an apple.' },
                                    ]),
                                },
                            ],
                        },
                    },
                ],
            }),
        };
        global.fetch = jest.fn().mockResolvedValue(mockResponse) as jest.Mock;

        const result = await fetchWordsFromImage('testBase64', 3, undefined, 'TEST_API_KEY');

        expect(global.fetch).toHaveBeenCalledTimes(1);
        const fetchArgs = (global.fetch as jest.Mock).mock.calls[0];

        // 모델명이 URL에 그대로 박히므로 바뀌면 여기서 잡힌다.
        // (스위트가 오래 로드조차 안 되던 사이 preview 모델명이 정식명으로 바뀌어 있었다.)
        expect(fetchArgs[0]).toContain('models/gemini-2.5-flash-lite:generateContent');
        expect(fetchArgs[0]).toContain('key=TEST_API_KEY');

        // Check the payload structure and standard request options
        expect(fetchArgs[1].method).toBe('POST');
        expect(fetchArgs[1].headers).toEqual({ 'Content-Type': 'application/json' });

        const payload = JSON.parse(fetchArgs[1].body);
        expect(payload.contents[0].parts[1].inlineData.data).toBe('testBase64');

        // Assert the result parsing
        expect(result).toEqual([{ word: 'apple', meaning: '사과', exampleSentence: 'I eat an apple.' }]);
    });

    it('should not retry on a 400 Bad Request error', async () => {
        const mockResponse = {
            ok: false,
            status: 400,
            text: jest.fn().mockResolvedValue(JSON.stringify({ error: { message: 'Bad params' } })),
        };
        global.fetch = jest.fn().mockResolvedValue(mockResponse) as jest.Mock;

        await expect(fetchWordsFromImage('testBase64', 3, undefined, 'TEST_API_KEY')).rejects.toMatchObject({ code: 'apiError', detail: 'Bad params', isBadRequest: true });
        expect(global.fetch).toHaveBeenCalledTimes(1); // Should fail immediately without retry
    });

    it('should retry on 500 error and succeed eventually', async () => {
        const errorResponse = {
            ok: false,
            status: 500,
            text: jest.fn().mockResolvedValue(JSON.stringify({ error: { message: 'Internal Server Error' } })),
        };

        const successResponse = {
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({
                candidates: [{ content: { parts: [{ text: JSON.stringify([{ word: 'test', meaning: '시험', exampleSentence: 'test' }]) }] } }]
            }),
        };

        let callCount = 0;
        global.fetch = jest.fn().mockImplementation(() => {
            callCount++;
            if (callCount < 3) return Promise.resolve(errorResponse);
            return Promise.resolve(successResponse);
        }) as jest.Mock;

        const result = await fetchWordsFromImage('testBase64', 3, undefined, 'TEST_API_KEY');
        expect(global.fetch).toHaveBeenCalledTimes(3);
        expect(result).toEqual([{ word: 'test', meaning: '시험', exampleSentence: 'test' }]);
    });

    it('should exhaust retries and throw error (max retry test)', async () => {
        const errorResponse = {
            ok: false,
            status: 429,
            text: jest.fn().mockResolvedValue(JSON.stringify({ error: { message: 'Rate limit exceeded' } })),
        };

        global.fetch = jest.fn().mockResolvedValue(errorResponse) as jest.Mock;

        // Try with 1 max retry (2 calls total)
        await expect(fetchWordsFromImage('testBase64', 1, undefined, 'TEST_API_KEY')).rejects.toMatchObject({ code: 'apiError', detail: 'Rate limit exceeded' });
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw an error when API request fails (auth error format check)', async () => {
        const mockResponse = {
            ok: false,
            status: 403,
            text: jest.fn().mockResolvedValue(JSON.stringify({ error: { message: 'Invalid API key' } })),
        };
        global.fetch = jest.fn().mockResolvedValue(mockResponse) as jest.Mock;

        await expect(fetchWordsFromImage('testBase64', 1, undefined, 'TEST_API_KEY')).rejects.toMatchObject({ code: 'apiError', detail: 'Invalid API key' });
    });

    it('should handle malformed JSON response correctly', async () => {
        const mockResponse = {
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({
                candidates: [
                    {
                        content: {
                            parts: [{ text: 'This is not valid JSON' }],
                        },
                    },
                ],
            }),
        };
        global.fetch = jest.fn().mockResolvedValue(mockResponse) as jest.Mock;

        await expect(fetchWordsFromImage('testBase64', 1, undefined, 'TEST_API_KEY')).rejects.toMatchObject({ code: 'badResponse' });
    });

    // 실패 사유가 한국어 문장이 아니라 코드로 오는 것이 이 모듈의 계약이다. 화면이
    // 그 코드로 번역문을 고르므로, 여기서 문장이 새어 나오면 그 화면은 영어로 못 뜬다.
    it('실패는 ScanError(코드)로 던진다 — 사람이 읽는 문장을 담지 않는다', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 500,
            text: jest.fn().mockResolvedValue('{}'),
        }) as jest.Mock;

        const err = await fetchWordsFromImage('testBase64', 0, undefined, 'TEST_API_KEY').catch((e) => e);
        expect(err).toBeInstanceOf(ScanError);
        expect(err.code).toBe('failed');
        expect(err.message).not.toMatch(/[가-힣]/);
    });
});
