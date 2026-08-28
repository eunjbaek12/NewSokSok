/**
 * enrichWord 의 클라이언트 표제어 게이트.
 *
 * 🔑 서버(enrich-word Edge)에도 같은 게이트가 있는데 여기 또 두는 이유는 **BYOK 가
 *    Edge 를 타지 않기 때문**이다 — 사용자 키로 곧장 Gemini 를 부르므로 서버 게이트가
 *    닿지 않는다. 여기서 막아야 BYOK 사용자도 깨진 표제어에 자기 키를 헛되이 쓰지 않는다.
 *
 * 이 파일이 검증하는 것은 "게이트에 걸리면 **네트워크를 아예 타지 않는다**" 이다.
 * 판정 규칙 자체는 headword-guard.test.ts 가 본다.
 */

const analyzeWord = jest.fn();
const enrichWordViaEdge = jest.fn();
const getDictionary = jest.fn();

jest.mock('@/lib/ai/gemini-client', () => ({
  analyzeWord: (...a: unknown[]) => analyzeWord(...a),
  isQuotaError: () => false,
  isInvalidKeyError: () => false,
}));
jest.mock('@/lib/ai/edge-enrich', () => ({
  enrichWordViaEdge: (...a: unknown[]) => enrichWordViaEdge(...a),
}));
jest.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));
jest.mock('@/lib/enrich-cache', () => ({
  getCachedEnrich: async () => null,
  setCachedEnrich: async () => {},
}));
jest.mock('expo/fetch', () => ({
  fetch: (...a: unknown[]) => getDictionary(...a),
}));

import { enrichWord } from '@/lib/translation-api';

beforeEach(() => {
  analyzeWord.mockReset();
  enrichWordViaEdge.mockReset();
  getDictionary.mockReset();
  analyzeWord.mockResolvedValue({ meaningKr: '사과', definition: 'a fruit', exampleEn: 'x' });
  getDictionary.mockResolvedValue({ ok: false });
});

describe('깨진 표제어는 AI 를 부르지 않는다', () => {
  const broken: [string, string, string][] = [
    ['lemon — 레몬', 'en', '8/26 사고 — em dash'],
    ['appropriate : 적절한', 'en', '7/6 사고 — 공백 콜론'],
    ['in the last + 시간', 'en', '7/24 사고 — 플러스'],
    ['encouragement:격려', 'en', '붙은 콜론 — script_mix 가 받는다'],
    ['독일', 'en', '모드 불일치'],
    ['ターゲット', 'en', '모드 불일치'],
    ['apple\t사과', 'en', '탭'],
  ];

  test.each(broken)('%s (%s) — %s', async (term, lang) => {
    // BYOK 경로(apiKey 있음)로 부른다 — 서버 게이트가 닿지 않는 그 경로다.
    const r = await enrichWord(term, lang, 'ko', 'fake-byok-key');
    expect(r).toMatchObject({ isReal: false, meaningKr: '' });
    expect(r?.headwordDefect).toBeTruthy();
    // 🔑 핵심 — 어떤 AI 도 호출되지 않았다(사용자 키도, Edge 도).
    expect(analyzeWord).not.toHaveBeenCalled();
    expect(enrichWordViaEdge).not.toHaveBeenCalled();
  });

  test('사유가 안내 문구를 가를 수 있게 실려 온다', async () => {
    const mix = await enrichWord('독일', 'en', 'ko', 'k');
    expect(mix?.headwordDefect).toBe('script_mix');
    const sep = await enrichWord('lemon — 레몬', 'en', 'ko', 'k');
    expect(sep?.headwordDefect).toBe('separator');
  });
});

describe('🔴 정상 표제어는 그대로 AI 로 간다', () => {
  const ok: [string, string][] = [
    ['apple', 'en'],
    ['e-mail', 'en'],
    ['shift+tab', 'en'],
    ['off with their heads!', 'en'],
    ['cognitive behavioral therapy (cbt)', 'en'],
    ['~匹', 'ja'],
    ['데워 드릴까요?', 'ko'],
    ['독일', 'ko'],
  ];

  test.each(ok)('%s (%s) — 게이트를 통과한다', async (term, lang) => {
    await enrichWord(term, lang, 'en', 'fake-byok-key');
    expect(analyzeWord).toHaveBeenCalled();
  });
});

describe('정규화 — 잡티는 벗기고 그 표제어로 조회한다', () => {
  test('Apple? 는 apple 로 조회된다 (기존 캐시를 히트한다)', async () => {
    await enrichWord('Apple?', 'en', 'ko', 'k');
    expect(analyzeWord).toHaveBeenCalled();
    // autoFillWord 가 소문자로 낮춘 뒤 넘긴다 — 물음표만 사라졌는지 본다
    expect(analyzeWord.mock.calls[0][0]).toBe('apple');
  });

  test('1. apple 도 apple 로 조회된다', async () => {
    await enrichWord('1. apple', 'en', 'ko', 'k');
    expect(analyzeWord.mock.calls[0][0]).toBe('apple');
  });

  test('🔴 여러 단어의 구두점은 살아남는다', async () => {
    await enrichWord('off with their heads!', 'en', 'ko', 'k');
    expect(analyzeWord.mock.calls[0][0]).toBe('off with their heads!');
  });
});
