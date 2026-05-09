// Standalone harness mirroring features/curation/screen.tsx::handleRegenerate
// state-machine logic. Run with: node __tests__/ai_curation_regen.test.js
//
// We model React state transitions imperatively. Each test creates a fresh
// `state` object + a mock `generateAIWords` to simulate fetch results, then
// invokes `handleRegenerate` and asserts on resulting state.

function makeState(initial = {}) {
    return {
        selectedTheme: initial.selectedTheme ?? null,
        lastGenParams: initial.lastGenParams ?? null,
        regenerating: initial.regenerating ?? false,
        snackbar: null,
        // history of state mutations for assertions
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
    if (!state.lastGenParams || state.regenerating) return;
    setRegenerating(state, true);
    try {
        const { words, droppedCount } = await mockGenerateAIWords(
            state.lastGenParams.topic,
            'fake-key',
            state.lastGenParams.wordCount,
            state.lastGenParams.difficulty,
        );
        setSelectedTheme(state, prev => prev ? { ...prev, words } : prev);
        if (droppedCount > 0) {
            setSnackbar(state, { message: `partial:${words.length}/${droppedCount}` });
        }
    } catch (e) {
        setSnackbar(state, { message: e.message || 'generic-error' });
    } finally {
        setRegenerating(state, false);
    }
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const sampleWord = (i) => ({ id: `w-${i}`, term: `t${i}`, meaningKr: `m${i}` });
const themeFixture = (words) => ({
    id: 'ai-theme-1',
    title: 'AI: test',
    icon: '✨',
    words,
    isVisible: true,
    createdAt: 1,
    isCurated: true,
});

// R1 — Happy path: regen replaces words, preserves theme metadata
test('R1 — regen replaces words, preserves title/icon/id', async () => {
    const state = makeState({
        selectedTheme: themeFixture([sampleWord('a'), sampleWord('b')]),
        lastGenParams: { topic: 'test', difficulty: 'intermediate', wordCount: 20 },
    });
    const mock = async () => ({ words: [sampleWord('x'), sampleWord('y'), sampleWord('z')], droppedCount: 0 });
    await handleRegenerate(state, mock);

    if (state.selectedTheme.words.length !== 3) throw new Error('words not replaced');
    if (state.selectedTheme.words[0].id !== 'w-x') throw new Error('replacement words wrong');
    if (state.selectedTheme.id !== 'ai-theme-1') throw new Error('theme id changed');
    if (state.selectedTheme.title !== 'AI: test') throw new Error('title changed');
    if (state.selectedTheme.icon !== '✨') throw new Error('icon changed');
    if (state.regenerating) throw new Error('regenerating not cleared');
});

// R2 — regenerating flag transitions: false → true → false
test('R2 — regenerating flag set during, cleared after', async () => {
    const state = makeState({
        selectedTheme: themeFixture([sampleWord('a')]),
        lastGenParams: { topic: 'test', difficulty: 'beginner', wordCount: 10 },
    });
    let regenStateDuringFetch = null;
    const mock = async () => {
        regenStateDuringFetch = state.regenerating;
        return { words: [sampleWord('x')], droppedCount: 0 };
    };
    await handleRegenerate(state, mock);

    if (regenStateDuringFetch !== true) throw new Error('regenerating should be true during fetch');
    if (state.regenerating !== false) throw new Error('regenerating should be false after');
    const flagHistory = state._history.filter(h => h.kind === 'setRegenerating').map(h => h.value);
    if (JSON.stringify(flagHistory) !== '[true,false]') throw new Error(`unexpected flag transitions: ${flagHistory}`);
});

// R3 — Partial result: snackbar fired with correct counts
test('R3 — partial result fires snackbar with kept/dropped', async () => {
    const state = makeState({
        selectedTheme: themeFixture([sampleWord('a')]),
        lastGenParams: { topic: 'test', difficulty: 'advanced', wordCount: 20 },
    });
    const mock = async () => ({
        words: Array.from({ length: 19 }, (_, i) => sampleWord(i)),
        droppedCount: 1,
    });
    await handleRegenerate(state, mock);

    if (!state.snackbar) throw new Error('snackbar should fire');
    if (!state.snackbar.message.includes('19/1')) throw new Error(`unexpected snackbar: ${state.snackbar.message}`);
    if (state.selectedTheme.words.length !== 19) throw new Error('partial words not applied');
});

// R4 — Failure: selectedTheme preserved (no replacement)
test('R4 — fetch failure preserves previous selectedTheme', async () => {
    const originalWords = [sampleWord('a'), sampleWord('b'), sampleWord('c')];
    const state = makeState({
        selectedTheme: themeFixture(originalWords),
        lastGenParams: { topic: 'test', difficulty: 'intermediate', wordCount: 20 },
    });
    const mock = async () => { throw new Error('Gemini quota exhausted'); };
    await handleRegenerate(state, mock);

    if (state.selectedTheme.words !== originalWords) throw new Error('original words should be preserved');
    if (!state.snackbar?.message.includes('quota')) throw new Error(`expected error snackbar, got: ${state.snackbar?.message}`);
    if (state.regenerating) throw new Error('regenerating not cleared after failure');
});

// R5 — Re-entrancy guard: second call while regenerating returns early
test('R5 — re-entrancy guard prevents double regen', async () => {
    const state = makeState({
        selectedTheme: themeFixture([sampleWord('a')]),
        lastGenParams: { topic: 'test', difficulty: 'beginner', wordCount: 10 },
        regenerating: true, // already in-flight
    });
    let callCount = 0;
    const mock = async () => { callCount++; return { words: [sampleWord('x')], droppedCount: 0 }; };
    await handleRegenerate(state, mock);

    if (callCount !== 0) throw new Error('mock should not be called when regenerating=true');
    if (state.selectedTheme.words[0].id !== 'w-a') throw new Error('words should not change');
});

// R6 — No lastGenParams: returns early
test('R6 — missing lastGenParams returns without action', async () => {
    const state = makeState({
        selectedTheme: themeFixture([sampleWord('a')]),
        lastGenParams: null,
    });
    let callCount = 0;
    const mock = async () => { callCount++; return { words: [], droppedCount: 0 }; };
    await handleRegenerate(state, mock);

    if (callCount !== 0) throw new Error('mock should not be called');
    if (state._history.length !== 0) throw new Error('no state mutation expected');
});

// R7 — Race: user backs out (selectedTheme=null) while fetch in flight
test('R7 — concurrent back-out: setSelectedTheme(null) wins, fetch result discarded', async () => {
    const state = makeState({
        selectedTheme: themeFixture([sampleWord('a')]),
        lastGenParams: { topic: 'test', difficulty: 'intermediate', wordCount: 20 },
    });
    const mock = () => new Promise(resolve => {
        // mid-flight, simulate user back-out
        setTimeout(() => {
            setSelectedTheme(state, null);
            resolve({ words: [sampleWord('x')], droppedCount: 0 });
        }, 10);
    });
    await handleRegenerate(state, mock);

    // Final state: selectedTheme should remain null because the
    // updater `prev => prev ? { ...prev, words } : prev` receives null.
    if (state.selectedTheme !== null) throw new Error('selectedTheme should remain null after back-out');
    if (state.regenerating) throw new Error('regenerating should be cleared');
});

// R8 — Sequential regens: each one swaps words correctly
test('R8 — three sequential regens swap words correctly', async () => {
    const state = makeState({
        selectedTheme: themeFixture([sampleWord('init')]),
        lastGenParams: { topic: 'test', difficulty: 'intermediate', wordCount: 5 },
    });
    let call = 0;
    const mock = async () => {
        call++;
        return { words: [sampleWord(`gen${call}`)], droppedCount: 0 };
    };
    await handleRegenerate(state, mock);
    await handleRegenerate(state, mock);
    await handleRegenerate(state, mock);

    if (state.selectedTheme.words[0].id !== 'w-gen3') throw new Error(`final word should be gen3, got ${state.selectedTheme.words[0].id}`);
    if (call !== 3) throw new Error(`expected 3 fetches, got ${call}`);
});

// R9 — droppedCount === 0 should NOT trigger snackbar
test('R9 — droppedCount=0 does not fire snackbar', async () => {
    const state = makeState({
        selectedTheme: themeFixture([sampleWord('a')]),
        lastGenParams: { topic: 'test', difficulty: 'intermediate', wordCount: 20 },
    });
    const mock = async () => ({ words: [sampleWord('x')], droppedCount: 0 });
    await handleRegenerate(state, mock);

    if (state.snackbar !== null) throw new Error(`snackbar should not fire on clean regen, got: ${state.snackbar?.message}`);
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
