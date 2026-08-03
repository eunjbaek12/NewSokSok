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
    LanguageCodeSchema,
    type AiCurationSettings,
    type InputSettings,
} from '@shared/contracts';
import { persisted } from '@/lib/storage/persisted';
import { SUPPORTED_LANGUAGES, getLanguageFlag } from '@/constants/languages';

/** 스키마가 아는 언어 전부 — 하드코딩하면 언어를 늘릴 때마다 낡는다. */
const LANG_CODES = LanguageCodeSchema.options;

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
    test.each(LANG_CODES)('accepts sourceLang=%s', (code) => {
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
// 언어 목록 — 선택기의 원천과 저장 스키마가 갈리지 않는지
// ─────────────────────────────────────────────────────────────────────────────

/*
 * 여기 있던 'picker filter logic — source/target exclusion'을 걷어냈다. 두 군데가
 * 틀려 있었다.
 *
 * ① 코드를 import하지 않았다. describe 안에서 filterFor를 새로 정의해 그걸 검증했으니
 *    프로덕션 코드가 어떻게 바뀌든 늘 통과했다. 실제로 아는 언어가 4개(en·ko·ja·zh)에
 *    멈춰 vi·es가 빠진 채였는데도 아무도 깨지 않았다.
 * ② 검증하려던 동작이 존재하지 않는다. add-word.tsx·curation/screen.tsx의 ModalPicker는
 *    SUPPORTED_LANGUAGES를 통째로 넘긴다 — 출발어와 도착어를 서로 배제하지 않고, 배제해서도
 *    안 된다. 같은 언어 쌍은 지원되는 모드다(lib/ai/gemini-client.ts의 sameLang 분기가
 *    동의어용으로 프롬프트를 갈아끼우고 예문 번역을 비운다).
 *
 * 대신 실제로 갈릴 수 있는 것을 지킨다. 선택기 목록(constants/languages.ts)과 저장
 * 스키마(shared/contracts.ts)가 언어 목록을 각자 들고 있어서, 언어를 늘릴 때 한쪽만
 * 고치면 "고를 수는 있는데 저장이 안 되는" 또는 그 반대 상태가 된다.
 */
describe('언어 목록 — 선택기와 저장 스키마가 갈리지 않는다', () => {
    test('SUPPORTED_LANGUAGES와 LanguageCodeSchema가 같은 언어를 같은 순서로 담는다', () => {
        expect(SUPPORTED_LANGUAGES.map(l => l.code)).toEqual([...LANG_CODES]);
    });

    test('선택기의 모든 코드가 출발어·도착어로 저장된다', () => {
        for (const { code } of SUPPORTED_LANGUAGES) {
            expect(AiCurationSettingsSchema.safeParse({ sourceLang: code, targetLang: code }).success).toBe(true);
            expect(InputSettingsSchema.safeParse({ sourceLang: code, targetLang: code }).success).toBe(true);
        }
    });

    test('모든 언어에 국기가 있다 — 🌐 폴백을 타는 코드가 없어야 한다', () => {
        for (const { code } of SUPPORTED_LANGUAGES) {
            expect(getLanguageFlag(code)).not.toBe('🌐');
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 같은 언어 쌍 — 배제 대상이 아니라 지원되는 모드
// ─────────────────────────────────────────────────────────────────────────────

describe('같은 언어 쌍이 성립한다', () => {
    test.each(LANG_CODES)('%s 단어를 %s 뜻으로 저장할 수 있다 (동의어 모드)', (code) => {
        expect(InputSettingsSchema.safeParse({ sourceLang: code, targetLang: code }).success).toBe(true);
    });

    test('영어 UI의 첫 조합 en→en이 성립한다', () => {
        // features/settings/store.ts의 deriveTargetLang이 신규 설치에서 만드는 상태.
        // 선택기에 배제가 들어오면 이 조합이 UI에서 닿을 수 없게 된다.
        const parsed = InputSettingsSchema.parse({ sourceLang: 'en', targetLang: 'en' });
        expect(parsed.sourceLang).toBe('en');
        expect(parsed.targetLang).toBe('en');
    });
});
