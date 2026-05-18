/**
 * 사진 임포트 파이프라인 — 시나리오 기반 테스트
 *
 * 1) filterExtractedWords — Gemini가 뽑은 raw 단어 배열을 학습용 후보로 정제
 *    - 영어 textbook 사진, 일본어/중국어 페이지, OCR 노이즈, 중복 케이스
 * 2) enrichWord — Naver 우선 → Gemini fallback
 *    - 성공/실패/취소 시나리오
 */

import { filterExtractedWords } from '../lib/stopwords';

describe('Scenario A: filterExtractedWords (영어 교과서 사진)', () => {
    it('교과서 본문에서 stopwords(a, the, is, of, in...)는 제거하고 학습어만 남긴다', () => {
        // 사용자가 영어 교과서 한 문단 사진을 찍었을 때 Gemini가 추출하는 전형적 결과
        const raw = ['The', 'apple', 'is', 'a', 'fruit', 'that', 'grows', 'on', 'trees', 'in', 'orchards'];
        const result = filterExtractedWords(raw, 'en');
        expect(result).toEqual(['apple', 'fruit', 'grows', 'trees', 'orchards']);
    });

    it('같은 단어가 대소문자 다르게 여러 번 나와도 한 번만 살아남는다 (원본 형태 보존)', () => {
        const raw = ['Apple', 'apple', 'APPLE', 'apples'];
        const result = filterExtractedWords(raw, 'en');
        expect(result).toEqual(['Apple', 'apples']);
    });

    it('숫자만/기호만 토큰은 제거 (페이지 번호·각주 마커 등 OCR 노이즈)', () => {
        const raw = ['vocabulary', '123', '???', '!!!', 'chapter', '5'];
        const result = filterExtractedWords(raw, 'en');
        expect(result).toEqual(['vocabulary', 'chapter']);
    });

    it('한 글자 영문 토큰은 제거 ("I", "a"가 한 글자라 학습 대상 아님)', () => {
        const raw = ['I', 'a', 'go', 'to', 'school'];
        const result = filterExtractedWords(raw, 'en');
        expect(result).toEqual(['go', 'school']);
    });

    it('빈 문자열/공백/null-like 토큰은 안전하게 무시', () => {
        const raw = ['', '   ', 'word', null as any, undefined as any, 123 as any];
        const result = filterExtractedWords(raw, 'en');
        expect(result).toEqual(['word']);
    });

    it('입력 순서를 보존한다 (사진 위→아래 읽기 순서가 카드 순서)', () => {
        const raw = ['zebra', 'apple', 'mango', 'banana'];
        const result = filterExtractedWords(raw, 'en');
        expect(result).toEqual(['zebra', 'apple', 'mango', 'banana']);
    });
});

describe('Scenario B: filterExtractedWords (일본어 만화 페이지)', () => {
    it('일본어 stopwords(の, は, を, です...)는 제거', () => {
        const raw = ['猫', 'は', '魚', 'を', '食べる', 'の', 'です'];
        const result = filterExtractedWords(raw, 'ja');
        expect(result).toEqual(['猫', '魚', '食べる']);
    });

    it('한자/가나 한 글자(漢, あ)는 의미 단위로 유지', () => {
        const raw = ['猫', '犬', '走る'];
        const result = filterExtractedWords(raw, 'ja');
        expect(result).toEqual(['猫', '犬', '走る']);
    });
});

describe('Scenario C: filterExtractedWords (중국어 텍스트)', () => {
    it('중국어 stopwords(的, 了, 是, 在...)는 제거', () => {
        const raw = ['苹果', '是', '一', '种', '水果'];
        const result = filterExtractedWords(raw, 'zh');
        expect(result).toEqual(['苹果', '种', '水果']);
    });
});

describe('Scenario D: filterExtractedWords (지원 언어 외)', () => {
    it('알 수 없는 sourceLang이면 stopwords 필터링은 건너뛰지만 길이/노이즈 필터는 동작', () => {
        const raw = ['hola', 'el', 'mundo', '123'];
        const result = filterExtractedWords(raw, 'es');
        // 스페인어 stopwords는 등록 안 했으므로 'el'도 통과 — 사용자는 검토 화면에서 직접 제거
        expect(result).toEqual(['hola', 'el', 'mundo']);
    });
});

// ── Scenario E~G: enrichWord ─────────────────────────────────────────────
// expo/fetch와 gemini-client를 mock해서 실제 모듈 내부 호출 경로(Naver→fallback)를 검증.

jest.mock('expo/fetch', () => ({
    fetch: jest.fn(),
}));
jest.mock('../lib/ai/gemini-client', () => ({
    analyzeWord: jest.fn(),
}));

import { enrichWord } from '../lib/translation-api';
import { analyzeWord } from '../lib/ai/gemini-client';
import { fetch as expoFetch } from 'expo/fetch';

const mockedAnalyzeWord = analyzeWord as jest.MockedFunction<typeof analyzeWord>;
const mockedExpoFetch = expoFetch as unknown as jest.Mock;

describe('Scenario E: enrichWord — 사용자 키로 Gemini 호출', () => {
    beforeEach(() => {
        mockedAnalyzeWord.mockReset();
        mockedExpoFetch.mockReset();
    });

    it('apiKey 있으면 Gemini로 채운다', async () => {
        mockedAnalyzeWord.mockResolvedValue({
            term: 'apple',
            meaningKr: '사과',
            definition: 'a round fruit',
            exampleEn: 'I ate an apple.',
            exampleKr: '나는 사과를 먹었다.',
            phonetic: 'ǽpl',
            pos: 'noun',
            mnemonic: '',
        });

        const result = await enrichWord('apple', 'en', 'ko', 'fake-api-key');

        expect(result?.meaningKr).toBe('사과');
        expect(result?.exampleKr).toBe('나는 사과를 먹었다.');
        expect(mockedAnalyzeWord).toHaveBeenCalledWith('apple', 'en', 'ko', 'fake-api-key');
    });

    it('term의 앞뒤 공백은 제거되어 호출된다', async () => {
        mockedAnalyzeWord.mockResolvedValue({
            term: 'apple', meaningKr: '사과', definition: '', exampleEn: '', exampleKr: '', phonetic: '', pos: '', mnemonic: '',
        });

        await enrichWord('  apple  ', 'en', 'ko', 'key');

        expect(mockedAnalyzeWord).toHaveBeenCalledWith('apple', 'en', 'ko', 'key');
    });
});

describe('Scenario F: enrichWord — apiKey 없을 때', () => {
    beforeEach(() => {
        mockedAnalyzeWord.mockReset();
        mockedExpoFetch.mockReset();
    });

    it('apiKey 없으면 영어는 dictionaryapi.dev로 fallback', async () => {
        mockedExpoFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve([{
                phonetics: [{ text: '/fri/' }],
                meanings: [{
                    partOfSpeech: 'adjective',
                    definitions: [{ definition: 'not under the control', example: 'free man' }],
                }],
            }]),
        });

        const result = await enrichWord('free', 'en', 'ko');

        expect(result?.definition).toBe('not under the control');
        expect(result?.phonetic).toBe('fri');
        expect(mockedAnalyzeWord).not.toHaveBeenCalled();
    });

    it('apiKey 없고 영어가 아니면 빈 결과로 null 반환', async () => {
        const result = await enrichWord('사과', 'ko', 'en');

        expect(result).toBeNull();
        expect(mockedAnalyzeWord).not.toHaveBeenCalled();
    });

    it('Gemini가 의미 없는 빈 결과만 주면 null', async () => {
        mockedAnalyzeWord.mockResolvedValue({
            term: 'xyzabc', definition: '', meaningKr: '', exampleEn: '', exampleKr: '', phonetic: '', pos: '', mnemonic: '',
        });

        const result = await enrichWord('xyzabc', 'en', 'ko', 'key');

        expect(result).toBeNull();
    });
});

describe('Scenario H: 사진 흐름 — 추출 → 필터 → 단어별 enrichWord 호출 시퀀스', () => {
    beforeEach(() => {
        mockedAnalyzeWord.mockReset();
        mockedExpoFetch.mockReset();
    });

    it('Gemini가 8개 단어를 뽑고 stopwords 4개가 제거되면, 남은 4개가 각각 enrich 호출된다', async () => {
        const geminiRaw = ['The', 'apple', 'is', 'a', 'fruit', 'that', 'grows', 'tree'];
        const filtered = filterExtractedWords(geminiRaw, 'en');
        expect(filtered).toEqual(['apple', 'fruit', 'grows', 'tree']);

        mockedAnalyzeWord.mockImplementation(async (term: string) => ({
            term,
            meaningKr: `${term}-뜻`,
            definition: '',
            phonetic: `phon-${term}`,
            pos: '',
            exampleEn: `Sentence with ${term}.`,
            exampleKr: `${term} 예문 번역.`,
            mnemonic: '',
        }));

        const results = await Promise.all(filtered.map(t => enrichWord(t, 'en', 'ko', 'key')));

        expect(mockedAnalyzeWord).toHaveBeenCalledTimes(4);
        expect(results.every(r => r?.meaningKr && r?.phonetic)).toBe(true);
    });

    it('기존 리스트에 있는 단어는 사진 흐름 진입 전에 제외되어 enrichWord 호출도 안 됨', async () => {
        const geminiRaw = ['apple', 'banana', 'cherry'];
        const existing = new Set(['apple', 'banana']);
        const filtered = filterExtractedWords(geminiRaw, 'en').filter(t => !existing.has(t.toLowerCase()));
        expect(filtered).toEqual(['cherry']);

        mockedAnalyzeWord.mockResolvedValue({
            term: 'cherry', meaningKr: '체리', definition: '', exampleEn: '', exampleKr: '', phonetic: 'tʃéri', pos: '', mnemonic: '',
        });

        await Promise.all(filtered.map(t => enrichWord(t, 'en', 'ko', 'key')));

        expect(mockedAnalyzeWord).toHaveBeenCalledTimes(1);
        expect(mockedAnalyzeWord).toHaveBeenCalledWith('cherry', 'en', 'ko', 'key');
    });
});

describe('Scenario G: enrichWord — 엣지 케이스', () => {
    beforeEach(() => {
        mockedAnalyzeWord.mockReset();
        mockedExpoFetch.mockReset();
    });

    it('AbortSignal이 이미 abort된 상태로 호출되면 AbortError', async () => {
        const controller = new AbortController();
        controller.abort();
        mockedAnalyzeWord.mockImplementation(() => new Promise(() => {})); // 응답 없음

        await expect(enrichWord('apple', 'en', 'ko', 'key', controller.signal))
            .rejects.toMatchObject({ name: 'AbortError' });
    });

    it('빈 단어가 들어오면 즉시 null (API 호출 없음)', async () => {
        const result = await enrichWord('   ', 'en', 'ko');
        expect(result).toBeNull();
        expect(mockedAnalyzeWord).not.toHaveBeenCalled();
    });
});
