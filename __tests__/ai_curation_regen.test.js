// Standalone harness mirroring features/curation/screen.tsx::handleRegenerate
// state-machine logic. Run with: node __tests__/ai_curation_regen.test.js
//
// Mirrors the 직전 회차만 배제 + 클라이언트 dedupe 동작:
// - excludeTerms = current selectedTheme.words.map(w => w.term) 전달
// - 응답을 클라이언트에서 한 번 더 dedupe
// - 빈 결과 / 부분 결과 / 정상 분기

const normalizeTerm = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function makeState(initial = {}) {
    return {
        selectedTheme: initial.selectedTheme ?? null,
        lastGenParams: initial.lastGenParams ?? null,
        regenerating: initial.regenerating ?? false,
        snackbar: null,
        _history: [],
    };
}

function setSelectedTheme(state, updaterOrValue) {
    const prev = state.selectedTheme;
    const next = typeof updaterOrValue === 'function' ? updaterOrValue(prev) : updaterOrValue;
    state.selectedTheme = next;
    state._history.push({ kind: 'setSelectedTheme', value: next });
}
function setRegenerating(state, v) {
    state.regenerating = v;
    state._history.push({ kind: 'setRegenerating', value: v });
}
function setSnackbar(state, snack) {
    state.snackbar = snack;
    state._history.push({ kind: 'setSnackbar', value: snack });
}

// Mirrors handleRegenerate from screen.tsx
async function handleRegenerate(state, mockGenerateAIWords) {
    if (!state.lastGenParams || state.regenerating || !state.selectedTheme) return;
    setRegenerating(state, true);
    try {
        const excludeTerms = state.selectedTheme.words.map(w => w.term);
        const { words } = await mockGenerateAIWords(
            state.lastGenParams.topic,
            'fake-key',
            state.lastGenParams.wordCount,
            state.lastGenParams.difficulty,
            state.lastGenParams.sourceLang,
            state.lastGenParams.targetLang,
            excludeTerms,
        );
        const seenLower = new Set(excludeTerms.map(normalizeTerm));
        const fresh = words.filter(w => !seenLower.has(normalizeTerm(w.term)));

        if (fresh.length === 0) {
            setSnackbar(state, { message: 'aiNoNewWords' });
            return;
        }
        setSelectedTheme(state, prev => prev ? { ...prev, words: fresh } : prev);
        if (fresh.length < state.lastGenParams.wordCount) {
            setSnackbar(state, { message: `aiRegeneratePartial:${fresh.length}` });
        }
    } catch (e) {
        setSnackbar(state, { message: e.message || 'generic-error' });
    } finally {
        setRegenerating(state, false);
    }
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const sampleWord = (i, term) => ({ id: `w-${i}`, term: term ?? `t${i}`, meaningKr: `m${i}` });
const themeFixture = (words) => ({
    id: 'ai-theme-1',
    title: 'AI: test',
    icon: '✨',
    words,
    isVisible: true,
    createdAt: 1,
    isCurated: true,
});

// R1 — 정상 케이스: 모든 새 단어가 기존과 다르면 그대로 교체, 스낵바 없음
test('R1 — all-fresh regen replaces words silently', async () => {
    const state = makeState({
        selectedTheme: themeFixture([sampleWord('a', 'ta'), sampleWord('b', 'tb')]),
        lastGenParams: { topic: 'test', difficulty: 'intermediate', wordCount: 3, sourceLang: 'en', targetLang: 'ko' },
    });
    const mock = async () => ({ words: [sampleWord('x', 'tx'), sampleWord('y', 'ty'), sampleWord('z', 'tz')], droppedCount: 0 });
    await handleRegenerate(state, mock);

    if (state.selectedTheme.words.length !== 3) throw new Error('words not replaced');
    if (state.selectedTheme.words[0].term !== 'tx') throw new Error('replacement words wrong');
    if (state.selectedTheme.id !== 'ai-theme-1') throw new Error('theme id changed');
    if (state.regenerating) throw new Error('regenerating not cleared');
    if (state.snackbar !== null) throw new Error(`snackbar should not fire when fresh.length === wordCount, got: ${state.snackbar?.message}`);
});

// R2 — regenerating 플래그 전이: false → true → false
test('R2 — regenerating flag transitions correctly', async () => {
    const state = makeState({
        selectedTheme: themeFixture([sampleWord('a', 'ta')]),
        lastGenParams: { topic: 'test', difficulty: 'beginner', wordCount: 1, sourceLang: 'en', targetLang: 'ko' },
    });
    let regenStateDuringFetch = null;
    const mock = async () => {
        regenStateDuringFetch = state.regenerating;
        return { words: [sampleWord('x', 'tx')], droppedCount: 0 };
    };
    await handleRegenerate(state, mock);

    if (regenStateDuringFetch !== true) throw new Error('regenerating should be true during fetch');
    if (state.regenerating !== false) throw new Error('regenerating should be false after');
    const flagHistory = state._history.filter(h => h.kind === 'setRegenerating').map(h => h.value);
    if (JSON.stringify(flagHistory) !== '[true,false]') throw new Error(`unexpected flag transitions: ${flagHistory}`);
});

// R3 — excludeTerms 정확하게 LLM에 전달되는지 검증
test('R3 — excludeTerms passed to generateAIWords as 7th arg', async () => {
    const state = makeState({
        selectedTheme: themeFixture([sampleWord('a', 'apple'), sampleWord('b', 'banana')]),
        lastGenParams: { topic: 'fruits', difficulty: 'intermediate', wordCount: 3, sourceLang: 'en', targetLang: 'ko' },
    });
    let receivedExclude = null;
    const mock = async (topic, key, count, diff, src, tgt, exclude) => {
        receivedExclude = exclude;
        return { words: [sampleWord('x', 'cherry')], droppedCount: 0 };
    };
    await handleRegenerate(state, mock);

    if (!Array.isArray(receivedExclude)) throw new Error('excludeTerms must be passed as array');
    if (receivedExclude.length !== 2) throw new Error(`expected 2 exclude terms, got ${receivedExclude.length}`);
    if (!receivedExclude.includes('apple') || !receivedExclude.includes('banana')) {
        throw new Error(`excludeTerms missing expected values: ${receivedExclude}`);
    }
});

// R4 — LLM이 지시 무시하고 중복 반환 → 클라이언트 dedupe로 거름
test('R4 — LLM returns duplicates, client dedupe filters them', async () => {
    const state = makeState({
        selectedTheme: themeFixture([sampleWord('a', 'apple'), sampleWord('b', 'banana')]),
        lastGenParams: { topic: 'fruits', difficulty: 'intermediate', wordCount: 3, sourceLang: 'en', targetLang: 'ko' },
    });
    // LLM이 'apple'을 다시 반환 + 새것 2개
    const mock = async () => ({
        words: [sampleWord('x', 'apple'), sampleWord('y', 'cherry'), sampleWord('z', 'date')],
        droppedCount: 0,
    });
    await handleRegenerate(state, mock);

    if (state.selectedTheme.words.length !== 2) throw new Error(`expected 2 fresh after dedupe, got ${state.selectedTheme.words.length}`);
    const terms = state.selectedTheme.words.map(w => w.term);
    if (terms.includes('apple')) throw new Error('apple should have been deduped');
    if (!terms.includes('cherry') || !terms.includes('date')) throw new Error('fresh words missing');
    // 부분 결과 스낵바 발사
    if (!state.snackbar?.message.startsWith('aiRegeneratePartial:2')) throw new Error(`expected partial snackbar, got: ${state.snackbar?.message}`);
});

// R5 — 정규화 (대소문자/공백): 기존 'Apple' / LLM 'apple' 같은 단어로 처리
test('R5 — normalization deduplicates case+whitespace variants', async () => {
    const state = makeState({
        selectedTheme: themeFixture([sampleWord('a', 'Apple'), sampleWord('b', 'pick up')]),
        lastGenParams: { topic: 'mixed', difficulty: 'intermediate', wordCount: 3, sourceLang: 'en', targetLang: 'ko' },
    });
    const mock = async () => ({
        words: [
            sampleWord('x', 'apple'),       // 대소문자 변형
            sampleWord('y', ' pick  up '),  // 공백 변형
            sampleWord('z', 'cherry'),      // 신규
        ],
        droppedCount: 0,
    });
    await handleRegenerate(state, mock);

    if (state.selectedTheme.words.length !== 1) throw new Error(`expected 1 fresh after normalization, got ${state.selectedTheme.words.length}`);
    if (state.selectedTheme.words[0].term !== 'cherry') throw new Error('cherry should be the only fresh word');
});

// R6 — 모두 중복 → fresh.length === 0 → 빈 결과 스낵바, selectedTheme 보존
test('R6 — all duplicates: snackbar fires, selectedTheme preserved', async () => {
    const originalWords = [sampleWord('a', 'apple'), sampleWord('b', 'banana')];
    const state = makeState({
        selectedTheme: themeFixture(originalWords),
        lastGenParams: { topic: 'fruits', difficulty: 'intermediate', wordCount: 2, sourceLang: 'en', targetLang: 'ko' },
    });
    // LLM이 모두 기존 단어만 반환
    const mock = async () => ({
        words: [sampleWord('x', 'apple'), sampleWord('y', 'BANANA')],
        droppedCount: 0,
    });
    await handleRegenerate(state, mock);

    if (state.snackbar?.message !== 'aiNoNewWords') throw new Error(`expected aiNoNewWords, got: ${state.snackbar?.message}`);
    // 기존 단어가 보존되어야 함 (덮어쓰지 않음)
    if (state.selectedTheme.words !== originalWords) throw new Error('selectedTheme.words should be preserved on all-duplicates');
    if (state.regenerating !== false) throw new Error('regenerating should be cleared');
});

// R7 — fetch 실패: selectedTheme 보존, 에러 스낵바
test('R7 — fetch failure preserves selectedTheme', async () => {
    const originalWords = [sampleWord('a', 'apple')];
    const state = makeState({
        selectedTheme: themeFixture(originalWords),
        lastGenParams: { topic: 'fruits', difficulty: 'intermediate', wordCount: 1, sourceLang: 'en', targetLang: 'ko' },
    });
    const mock = async () => { throw new Error('Gemini quota exhausted'); };
    await handleRegenerate(state, mock);

    if (state.selectedTheme.words !== originalWords) throw new Error('words should be preserved on error');
    if (!state.snackbar?.message.includes('quota')) throw new Error(`expected error snackbar, got: ${state.snackbar?.message}`);
    if (state.regenerating) throw new Error('regenerating not cleared');
});

// R8 — re-entrancy: 이미 regenerating=true면 즉시 종료
test('R8 — re-entrancy guard prevents double regen', async () => {
    const state = makeState({
        selectedTheme: themeFixture([sampleWord('a', 'apple')]),
        lastGenParams: { topic: 'fruits', difficulty: 'beginner', wordCount: 1, sourceLang: 'en', targetLang: 'ko' },
        regenerating: true,
    });
    let callCount = 0;
    const mock = async () => { callCount++; return { words: [sampleWord('x', 'cherry')], droppedCount: 0 }; };
    await handleRegenerate(state, mock);

    if (callCount !== 0) throw new Error('mock should not be called when regenerating=true');
});

// R9 — lastGenParams 없음: 즉시 종료
test('R9 — missing lastGenParams returns without action', async () => {
    const state = makeState({
        selectedTheme: themeFixture([sampleWord('a', 'apple')]),
        lastGenParams: null,
    });
    let callCount = 0;
    const mock = async () => { callCount++; return { words: [], droppedCount: 0 }; };
    await handleRegenerate(state, mock);

    if (callCount !== 0) throw new Error('mock should not be called');
    if (state._history.length !== 0) throw new Error('no state mutation expected');
});

// R10 — selectedTheme 없음(이전엔 없던 가드): 즉시 종료
test('R10 — missing selectedTheme returns without action', async () => {
    const state = makeState({
        selectedTheme: null,
        lastGenParams: { topic: 'fruits', difficulty: 'beginner', wordCount: 1, sourceLang: 'en', targetLang: 'ko' },
    });
    let callCount = 0;
    const mock = async () => { callCount++; return { words: [], droppedCount: 0 }; };
    await handleRegenerate(state, mock);

    if (callCount !== 0) throw new Error('mock should not be called');
});

// R11 — 부분 결과: fresh.length < wordCount → 부분 스낵바
test('R11 — partial fresh count fires partial snackbar', async () => {
    const state = makeState({
        selectedTheme: themeFixture([sampleWord('a', 'apple')]),
        lastGenParams: { topic: 'fruits', difficulty: 'intermediate', wordCount: 5, sourceLang: 'en', targetLang: 'ko' },
    });
    // wordCount=5 인데 LLM이 3개만 반환 (모두 fresh)
    const mock = async () => ({
        words: [sampleWord('x', 'cherry'), sampleWord('y', 'date'), sampleWord('z', 'elderberry')],
        droppedCount: 0,
    });
    await handleRegenerate(state, mock);

    if (state.selectedTheme.words.length !== 3) throw new Error(`expected 3, got ${state.selectedTheme.words.length}`);
    if (!state.snackbar?.message.startsWith('aiRegeneratePartial:3')) throw new Error(`expected partial snackbar, got: ${state.snackbar?.message}`);
});

// R12 — 연속 재생성: 2회차 호출 시 1회차 결과가 excludeTerms로 들어가는지
test('R12 — sequential regens: 2nd call excludes 1st-batch terms', async () => {
    const state = makeState({
        selectedTheme: themeFixture([sampleWord('a', 'apple')]),
        lastGenParams: { topic: 'fruits', difficulty: 'intermediate', wordCount: 2, sourceLang: 'en', targetLang: 'ko' },
    });
    let callIdx = 0;
    const excludeHistory = [];
    const mock = async (topic, key, count, diff, src, tgt, exclude) => {
        callIdx++;
        excludeHistory.push([...exclude]);
        if (callIdx === 1) return { words: [sampleWord('x', 'banana'), sampleWord('y', 'cherry')], droppedCount: 0 };
        return { words: [sampleWord('z', 'date'), sampleWord('w', 'elderberry')], droppedCount: 0 };
    };
    await handleRegenerate(state, mock);
    await handleRegenerate(state, mock);

    if (excludeHistory[0].sort().join(',') !== 'apple') throw new Error(`1st call should exclude initial term, got: ${excludeHistory[0]}`);
    if (excludeHistory[1].sort().join(',') !== 'banana,cherry') {
        throw new Error(`2nd call should exclude 1st batch (banana, cherry), got: ${excludeHistory[1]}`);
    }
});

(async () => {
    let passed = 0, failed = 0;
    for (const { name, fn } of tests) {
        try {
            await fn();
            console.log(`  ✓ ${name}`);
            passed++;
        } catch (e) {
            console.log(`  ✗ ${name}\n      ${e.message}`);
            failed++;
        }
    }
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
})();
