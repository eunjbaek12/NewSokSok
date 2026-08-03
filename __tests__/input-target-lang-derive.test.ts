/**
 * 뜻 언어(targetLang) 첫 기본값을 앱 언어에서 유도하는 규칙 — features/settings/store.ts.
 *
 * 왜 있나: 큐레이션에만 이 규칙이 걸려 있고 단어 추가(InputSettings)는 빠져 있었다.
 * 그래서 영어로 앱을 쓰는 사람이 단어를 추가하면 뜻 칸이 "한국어 뜻"으로 뜨고 AI 보강도
 * 한국어 뜻을 채웠다 — 첫 실행 샘플 단어장과 큐레이션은 이미 영어인데 거기만 반대였다.
 *
 * 규칙이 두 저장소에 걸리므로 회귀 지점도 둘이다. 특히 "기존 사용자 설정은 절대
 * 덮어쓰지 않는다"는 보장이 깨지면 조용히 남의 언어 설정을 바꾸는 사고가 된다.
 */

const asyncStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: (k: string) => Promise.resolve(asyncStore.has(k) ? asyncStore.get(k)! : null),
        setItem: (k: string, v: string) => { asyncStore.set(k, v); return Promise.resolve(); },
        removeItem: (k: string) => { asyncStore.delete(k); return Promise.resolve(); },
    },
}));

const i18nMock = { language: 'ko' };
jest.mock('@/i18n', () => ({ __esModule: true, default: i18nMock }));

jest.mock('@/lib/supabase', () => ({
    supabase: { auth: { getSession: async () => ({ data: { session: null } }), updateUser: async () => ({}) } },
}));

jest.mock('@/features/settings/api-key-storage', () => ({
    loadAndMigrateApiKey: async () => '',
    saveApiKey: async () => {},
}));

import { useSettingsStore } from '@/features/settings/store';

const INPUT_KEY = '@soksok_user_input_settings';
const AI_KEY = '@soksok_ai_curation_settings';

/** 앱을 특정 언어로 새로 깐 상태에서 설정을 hydrate한다. */
async function freshInstall(uiLang: string) {
    asyncStore.clear();
    i18nMock.language = uiLang;
    await useSettingsStore.getState().hydrate();
    return useSettingsStore.getState();
}

describe('신규 설치 — 뜻 언어가 앱 언어를 따라간다', () => {
    test('영어로 깔면 단어 추가 뜻 언어가 en (기존 버그: ko로 남았다)', async () => {
        const s = await freshInstall('en');
        expect(s.inputSettings.targetLang).toBe('en');
    });

    test('영어로 깔면 큐레이션 뜻 언어도 en — 두 화면이 같은 답을 준다', async () => {
        const s = await freshInstall('en');
        expect(s.aiCurationSettings.targetLang).toBe('en');
        expect(s.inputSettings.targetLang).toBe(s.aiCurationSettings.targetLang);
    });

    test('한국어로 깔면 ko 그대로 — 스키마 기본값과 같아 저장조차 하지 않는다', async () => {
        const s = await freshInstall('ko');
        expect(s.inputSettings.targetLang).toBe('ko');
        expect(asyncStore.get(INPUT_KEY)).toBeUndefined();
    });

    test('배울 언어(sourceLang)는 앱 언어로 추론하지 않는다', async () => {
        const s = await freshInstall('en');
        expect(s.inputSettings.sourceLang).toBe('en');
    });

    test('지역이 붙은 기기 로케일(en-US)은 유도 대상이 아니다 — 스키마가 거른다', async () => {
        const s = await freshInstall('en-US');
        expect(s.inputSettings.targetLang).toBe('ko');
    });

    test('학습 언어에 없는 앱 언어(fr)는 무시하고 기본값을 지킨다', async () => {
        const s = await freshInstall('fr');
        expect(s.inputSettings.targetLang).toBe('ko');
    });
});

describe('기존 사용자 — 저장된 선택은 어떤 경우에도 덮지 않는다', () => {
    test('en 앱에서 뜻 언어를 ko로 골라 둔 사람은 그대로 ko', async () => {
        asyncStore.clear();
        i18nMock.language = 'en';
        asyncStore.set(INPUT_KEY, JSON.stringify({ sourceLang: 'ja', targetLang: 'ko' }));

        await useSettingsStore.getState().hydrate();
        expect(useSettingsStore.getState().inputSettings.targetLang).toBe('ko');
    });

    test('저장된 값이 우연히 스키마 기본값과 같아도 유도가 끼어들지 않는다', async () => {
        // load()만으로는 "값이 없어서 기본값"과 구분되지 않는 자리 — 키 존재로 갈라야 한다.
        asyncStore.clear();
        i18nMock.language = 'en';
        asyncStore.set(INPUT_KEY, JSON.stringify({ sourceLang: 'en', targetLang: 'ko' }));

        await useSettingsStore.getState().hydrate();
        expect(useSettingsStore.getState().inputSettings.targetLang).toBe('ko');
    });

    test('한쪽만 저장돼 있으면 나머지 한쪽만 유도된다', async () => {
        asyncStore.clear();
        i18nMock.language = 'en';
        asyncStore.set(AI_KEY, JSON.stringify({ sourceLang: 'en', targetLang: 'ko', difficulty: 'intermediate', wordCount: 20 }));

        await useSettingsStore.getState().hydrate();
        const s = useSettingsStore.getState();
        expect(s.aiCurationSettings.targetLang).toBe('ko');
        expect(s.inputSettings.targetLang).toBe('en');
    });
});

describe('유도 결과가 디스크에 남는다 — 다음 실행에서 다시 계산하지 않도록', () => {
    test('en 신규 설치 후 저장된 값에도 targetLang=en이 들어 있다', async () => {
        await freshInstall('en');

        const saved = JSON.parse(asyncStore.get(INPUT_KEY)!);
        expect(saved.targetLang).toBe('en');
    });

    test('유도 후 앱 언어를 ko로 바꿔도 뜻 언어는 en으로 남는다 (이미 사용자 값이므로)', async () => {
        await freshInstall('en');

        i18nMock.language = 'ko';
        await useSettingsStore.getState().hydrate();
        expect(useSettingsStore.getState().inputSettings.targetLang).toBe('en');
    });
});
