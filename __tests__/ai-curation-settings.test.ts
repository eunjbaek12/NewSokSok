/**
 * Scenario tests for AiCurationSettings — the new persisted store that backs
 * the curation AI generation modal (sourceLang/targetLang/difficulty/wordCount).
 *
 * Why this matters: the previous behavior pulled language pair from
 * inputSettings (the learner's word-input language). If those two stores leak
 * into each other, changing the AI modal would silently mutate the user's
 * everyday input language — the exact bug this refactor exists to prevent.
 */

jest.mock('@react-native-async-storage/async-storage', () => {
    const store = new Map<string, string>();
    return {
        __esModule: true,
        default: {
            getItem: (k: string) => Promise.resolve(store.has(k) ? store.get(k)! : null),
            setItem: (k: string, v: string) => { store.set(k, v); return Promise.resolve(); },
            removeItem: (k: string) => { store.delete(k); return Promise.resolve(); },
            __reset: () => store.clear(),
            __setRaw: (k: string, v: string) => store.set(k, v),
            __getRaw: (k: string) => (store.has(k) ? store.get(k)! : null),
        },
    };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    AiCurationSettingsSchema,
    InputSettingsSchema,
    type AiCurationSettings,
    type InputSettings,
} from '@shared/contracts';
import { persisted } from '@/lib/storage/persisted';

const AsyncStorageMock = AsyncStorage as unknown as { __reset: () => void; __setRaw: (k: string, v: string) => void; __getRaw: (k: string) => string | null };

const AI_KEY = '@soksok_ai_curation_settings';
const INPUT_KEY = '@soksok_user_input_settings';

const DEFAULT_AI: AiCurationSettings = AiCurationSettingsSchema.parse({});
const DEFAULT_INPUT: InputSettings = InputSettingsSchema.parse({}) as InputSettings;

beforeEach(() => {
    AsyncStorageMock.__reset();
});

// ─────────────────────────────────────────────────────────────────────────────
// Schema: defaults and validation
// ─────────────────────────────────────────────────────────────────────────────

describe('AiCurationSettingsSchema — defaults', () => {
    test('empty object yields en/ko/intermediate/20 defaults', () => {
        const parsed = AiCurationSettingsSchema.parse({});
        expect(parsed).toEqual({
            sourceLang: 'en',
            targetLang: 'ko',
            difficulty: 'intermediate',
            wordCount: 20,
        });
    });

    test('defaults match the pre-refactor hardcoded values in curation/screen.tsx', () => {
        // Pre-refactor: useState(20), useState('intermediate'), inputSettings.sourceLang ('en' default), inputSettings.targetLang ('ko' default)
        expect(DEFAULT_AI.wordCount).toBe(20);
        expect(DEFAULT_AI.difficulty).toBe('intermediate');
        expect(DEFAULT_AI.sourceLang).toBe('en');
        expect(DEFAULT_AI.targetLang).toBe('ko');
    });
});

describe('AiCurationSettingsSchema — valid values', () => {
    test.each(['en', 'ko', 'ja', 'zh'])('accepts sourceLang=%s', (code) => {
        expect(AiCurationSettingsSchema.safeParse({ sourceLang: code }).success).toBe(true);
    });

    test.each(['beginner', 'intermediate', 'advanced'])('accepts difficulty=%s', (d) => {
        expect(AiCurationSettingsSchema.safeParse({ difficulty: d }).success).toBe(true);
    });

    test.each([10, 20, 30, 50])('accepts wordCount=%i (matches UI buttons)', (n) => {
        expect(AiCurationSettingsSchema.safeParse({ wordCount: n }).success).toBe(true);
    });

    test('accepts source === target (same-language synonym mode is intentional)', () => {
        const r = AiCurationSettingsSchema.safeParse({ sourceLang: 'en', targetLang: 'en' });
        expect(r.success).toBe(true);
    });
});

describe('AiCurationSettingsSchema — rejects invalid values', () => {
    test('rejects unknown language code', () => {
        expect(AiCurationSettingsSchema.safeParse({ sourceLang: 'fr' }).success).toBe(false);
        expect(AiCurationSettingsSchema.safeParse({ targetLang: 'de' }).success).toBe(false);
    });

    test('rejects unknown difficulty', () => {
        expect(AiCurationSettingsSchema.safeParse({ difficulty: 'expert' }).success).toBe(false);
        expect(AiCurationSettingsSchema.safeParse({ difficulty: '' }).success).toBe(false);
    });

    test.each([0, 15, 25, 100, -1, 1.5])('rejects wordCount=%s (must be one of 10/20/30/50)', (n) => {
        expect(AiCurationSettingsSchema.safeParse({ wordCount: n }).success).toBe(false);
    });

    test('rejects wrong types', () => {
        expect(AiCurationSettingsSchema.safeParse({ wordCount: '20' }).success).toBe(false);
        expect(AiCurationSettingsSchema.safeParse({ sourceLang: 42 }).success).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Persistence: AsyncStorage round-trip
// ─────────────────────────────────────────────────────────────────────────────

describe('aiCurationStore — persistence round-trip', () => {
    test('first load (empty storage) returns defaults', async () => {
        const store = persisted(AI_KEY, AiCurationSettingsSchema, DEFAULT_AI);
        const loaded = await store.load();
        expect(loaded).toEqual(DEFAULT_AI);
    });

    test('save then load preserves chosen language pair', async () => {
        const store = persisted(AI_KEY, AiCurationSettingsSchema, DEFAULT_AI);
        await store.save({ ...DEFAULT_AI, sourceLang: 'ja', targetLang: 'en', difficulty: 'advanced', wordCount: 50 });

        const loaded = await store.load();
        expect(loaded).toEqual({
            sourceLang: 'ja',
            targetLang: 'en',
            difficulty: 'advanced',
            wordCount: 50,
        });
    });

    test('settings survive a simulated app restart (fresh store instance)', async () => {
        // 첫 세션: 사용자가 zh→ko, 30개로 변경
        const session1 = persisted(AI_KEY, AiCurationSettingsSchema, DEFAULT_AI);
        await session1.save({ ...DEFAULT_AI, sourceLang: 'zh', targetLang: 'ko', wordCount: 30 });

        // 앱 재실행: 새 persisted 인스턴스가 같은 키를 hydrate
        const session2 = persisted(AI_KEY, AiCurationSettingsSchema, DEFAULT_AI);
        const loaded = await session2.load();
        expect(loaded.sourceLang).toBe('zh');
        expect(loaded.wordCount).toBe(30);
    });

    test('corrupt JSON in storage falls back to defaults (no crash)', async () => {
        AsyncStorageMock.__setRaw(AI_KEY, '{not valid json');
        const store = persisted(AI_KEY, AiCurationSettingsSchema, DEFAULT_AI);
        const loaded = await store.load();
        expect(loaded).toEqual(DEFAULT_AI);
    });

    test('schema-violating stored value falls back to defaults', async () => {
        // 사용자가 이전 빌드에서 wordCount: 99 같은 비호환 값을 저장했다고 가정
        AsyncStorageMock.__setRaw(AI_KEY, JSON.stringify({ sourceLang: 'en', targetLang: 'ko', difficulty: 'intermediate', wordCount: 99 }));
        const store = persisted(AI_KEY, AiCurationSettingsSchema, DEFAULT_AI);
        const loaded = await store.load();
        expect(loaded).toEqual(DEFAULT_AI);
    });

    test('partial stored object gets filled with defaults via schema', async () => {
        // sourceLang만 저장된 상태 — 나머지는 default()가 채워야 함
        AsyncStorageMock.__setRaw(AI_KEY, JSON.stringify({ sourceLang: 'ja' }));
        const store = persisted(AI_KEY, AiCurationSettingsSchema, DEFAULT_AI);
        const loaded = await store.load();
        expect(loaded.sourceLang).toBe('ja');
        expect(loaded.targetLang).toBe('ko');
        expect(loaded.difficulty).toBe('intermediate');
        expect(loaded.wordCount).toBe(20);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Isolation: AI settings must NOT leak into inputSettings (regression guard)
// ─────────────────────────────────────────────────────────────────────────────

describe('aiCuration vs inputSettings — isolation guarantee', () => {
    test('updating AI language pair does not touch inputSettings storage key', async () => {
        const ai = persisted(AI_KEY, AiCurationSettingsSchema, DEFAULT_AI);
        const input = persisted(INPUT_KEY, InputSettingsSchema, DEFAULT_INPUT);

        // 사용자가 학습용 언어쌍을 en→ko로 설정 (기본값 그대로지만 명시적으로 저장)
        await input.save(DEFAULT_INPUT);
        const inputBefore = AsyncStorageMock.__getRaw(INPUT_KEY);
        expect(inputBefore).not.toBeNull();

        // 사용자가 AI 모달에서 ja→en으로 변경
        await ai.save({ sourceLang: 'ja', targetLang: 'en', difficulty: 'advanced', wordCount: 50 });

        // 학습용 inputSettings는 변동 없어야 함
        const inputAfter = AsyncStorageMock.__getRaw(INPUT_KEY);
        expect(inputAfter).toBe(inputBefore);

        // 그리고 다시 load해도 학습용 언어쌍은 그대로
        const inputReloaded = await input.load();
        expect(inputReloaded.sourceLang).toBe(DEFAULT_INPUT.sourceLang);
        expect(inputReloaded.targetLang).toBe(DEFAULT_INPUT.targetLang);
    });

    test('AI store uses distinct key from input store', () => {
        expect(AI_KEY).not.toBe(INPUT_KEY);
    });

    test('AI sourceLang change does not appear in inputSettings reload (cross-contamination guard)', async () => {
        const ai = persisted(AI_KEY, AiCurationSettingsSchema, DEFAULT_AI);
        const input = persisted(INPUT_KEY, InputSettingsSchema, DEFAULT_INPUT);

        await ai.save({ sourceLang: 'zh', targetLang: 'ja', difficulty: 'beginner', wordCount: 10 });

        const inputLoaded = await input.load();
        expect(inputLoaded.sourceLang).not.toBe('zh');
        expect(inputLoaded.targetLang).not.toBe('ja');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Update semantics: partial merge (mirrors updateAiCurationSettings)
// ─────────────────────────────────────────────────────────────────────────────

describe('updateAiCurationSettings semantics (partial merge)', () => {
    test('changing only difficulty preserves language pair and wordCount', async () => {
        const store = persisted(AI_KEY, AiCurationSettingsSchema, DEFAULT_AI);
        const initial: AiCurationSettings = { sourceLang: 'ja', targetLang: 'ko', difficulty: 'intermediate', wordCount: 30 };
        await store.save(initial);

        // store.ts: const next = { ...get().aiCurationSettings, ...updates };
        const merged: AiCurationSettings = { ...initial, difficulty: 'advanced' };
        await store.save(merged);

        const loaded = await store.load();
        expect(loaded.sourceLang).toBe('ja');
        expect(loaded.targetLang).toBe('ko');
        expect(loaded.wordCount).toBe(30);
        expect(loaded.difficulty).toBe('advanced');
    });

    test('changing only sourceLang via picker preserves the rest', async () => {
        const store = persisted(AI_KEY, AiCurationSettingsSchema, DEFAULT_AI);
        const initial: AiCurationSettings = { sourceLang: 'en', targetLang: 'ko', difficulty: 'beginner', wordCount: 50 };
        await store.save(initial);

        await store.save({ ...initial, sourceLang: 'zh' });

        const loaded = await store.load();
        expect(loaded).toEqual({ sourceLang: 'zh', targetLang: 'ko', difficulty: 'beginner', wordCount: 50 });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Picker filter logic — mirrors curation/screen.tsx SUPPORTED_LANGUAGES.filter
// ─────────────────────────────────────────────────────────────────────────────

describe('picker filter logic — source/target exclusion', () => {
    const codes = ['en', 'ko', 'ja', 'zh'];
    const filterFor = (exclude: string) => codes.filter(c => c !== exclude);

    test('source picker excludes current target', () => {
        // 도착어가 ko면 출발어 옵션에서 ko 제외
        expect(filterFor('ko')).toEqual(['en', 'ja', 'zh']);
    });

    test('target picker excludes current source', () => {
        expect(filterFor('en')).toEqual(['ko', 'ja', 'zh']);
    });

    test('each filter shrinks list by exactly one', () => {
        for (const code of codes) {
            expect(filterFor(code).length).toBe(codes.length - 1);
            expect(filterFor(code)).not.toContain(code);
        }
    });
});
