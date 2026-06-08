// Standalone harness mirroring features/curation/screen.tsx::handleImport
// dedupe logic. Run with: node scripts/curation-checks/ai_curation_import.js
//
// Mirrors the in-screen dedupe path (sourceLang gate + term normalization)
// without touching the actual DB layer; addBatchWords is mocked.

const normalizeTerm = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function makeState(initial = {}) {
    return {
        selectedTheme: initial.selectedTheme ?? null,
        lists: initial.lists ?? [],
        saving: false,
        snackbar: null,
        navigatedTo: null,
        addBatchCalls: [],
        _history: [],
    };
}

// Mirrors handleImport from screen.tsx
async function handleImport(state, targetListId, mockAddBatchWords) {
    if (!state.selectedTheme) return;
    state.saving = true;
    const incomingWords = state.selectedTheme.words.map(w => ({ term: w.term, meaningKr: w.meaningKr }));
    const targetList = state.lists.find(l => l.id === targetListId);

    const sameSourceLang = !!targetList && targetList.sourceLanguage === state.selectedTheme.sourceLanguage;

    let wordsToAdd = incomingWords;
    let skippedCount = 0;
    if (sameSourceLang && targetList) {
        const existing = new Set(targetList.words.map(w => normalizeTerm(w.term)));
        wordsToAdd = incomingWords.filter(w => !existing.has(normalizeTerm(w.term)));
        skippedCount = incomingWords.length - wordsToAdd.length;
    }

    try {
        if (wordsToAdd.length === 0) {
            state.snackbar = { message: 'allDuplicates', actionLabel: null };
            return;
        }
        await mockAddBatchWords(targetListId, wordsToAdd);
        state.addBatchCalls.push({ targetListId, count: wordsToAdd.length });
        const message = skippedCount > 0
            ? `addedWithSkipped:${wordsToAdd.length}/${skippedCount}`
            : `addedToExistingList`;
        state.snackbar = {
            message,
            actionLabel: 'goToVocabList',
            onAction: () => { state.navigatedTo = `/list/${targetListId}`; },
        };
        state.selectedTheme = null;
    } catch (e) {
        state.snackbar = { message: 'saveError' };
    } finally {
        state.saving = false;
    }
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const word = (term, meaningKr = `m-${term}`) => ({ term, meaningKr });
const themeFixture = (words, sourceLanguage = 'en') => ({
    id: 'ai-theme-1',
    title: 'AI: test',
    icon: '✨',
    words,
    sourceLanguage,
    targetLanguage: 'ko',
});
const listFixture = (id, words, sourceLanguage = 'en', title = id) => ({
    id, title, words, sourceLanguage, targetLanguage: 'ko',
});

const mockAdd = async () => { /* no-op */ };

// I1 — 중복 없음: 모든 단어 추가, 평범한 스낵바
test('I1 — no duplicates: all words added, plain snackbar', async () => {
    const state = makeState({
        selectedTheme: themeFixture([word('apple'), word('banana')]),
        lists: [listFixture('L1', [word('cat'), word('dog')])],
    });
    await handleImport(state, 'L1', mockAdd);

    if (state.addBatchCalls.length !== 1) throw new Error('addBatchWords should be called once');
    if (state.addBatchCalls[0].count !== 2) throw new Error(`expected 2 added, got ${state.addBatchCalls[0].count}`);
    if (state.snackbar.message !== 'addedToExistingList') throw new Error(`unexpected message: ${state.snackbar.message}`);
    if (state.snackbar.actionLabel !== 'goToVocabList') throw new Error('action should be enabled');
    if (state.selectedTheme !== null) throw new Error('selectedTheme should be cleared');
});

// I2 — 부분 중복: 새것만 추가, 카운트 스낵바
test('I2 — partial duplicates: skip overlap, snackbar shows counts', async () => {
    const state = makeState({
        selectedTheme: themeFixture([word('apple'), word('banana'), word('cherry')]),
        lists: [listFixture('L1', [word('apple'), word('grape')])],
    });
    await handleImport(state, 'L1', mockAdd);

    if (state.addBatchCalls[0].count !== 2) throw new Error(`expected 2 added (banana, cherry), got ${state.addBatchCalls[0].count}`);
    if (state.snackbar.message !== 'addedWithSkipped:2/1') throw new Error(`unexpected: ${state.snackbar.message}`);
    if (state.snackbar.actionLabel !== 'goToVocabList') throw new Error('action should still be enabled');
    if (state.selectedTheme !== null) throw new Error('selectedTheme should be cleared');
});

// I3 — 전체 중복: DB 호출 없음, 단어장 이동 액션 비활성, selectedTheme 유지
test('I3 — all duplicates: no DB call, no navigation action, theme preserved', async () => {
    const state = makeState({
        selectedTheme: themeFixture([word('apple'), word('banana')]),
        lists: [listFixture('L1', [word('apple'), word('banana'), word('cherry')])],
    });
    await handleImport(state, 'L1', mockAdd);

    if (state.addBatchCalls.length !== 0) throw new Error('addBatchWords should NOT be called for all-duplicates');
    if (state.snackbar.message !== 'allDuplicates') throw new Error(`unexpected: ${state.snackbar.message}`);
    if (state.snackbar.actionLabel !== null) throw new Error('navigation action must be disabled');
    if (state.selectedTheme === null) throw new Error('selectedTheme should be PRESERVED on all-duplicates');
});

// I4 — 언어쌍 다름: dedupe 비활성, 모두 추가
test('I4 — different sourceLang: dedupe skipped, all added', async () => {
    const state = makeState({
        selectedTheme: themeFixture([word('apple'), word('banana')], 'en'),
        lists: [listFixture('L1', [word('apple')], 'ja')],
    });
    await handleImport(state, 'L1', mockAdd);

    if (state.addBatchCalls[0].count !== 2) throw new Error(`expected 2 added (no dedupe across langs), got ${state.addBatchCalls[0].count}`);
    if (state.snackbar.message !== 'addedToExistingList') throw new Error(`unexpected: ${state.snackbar.message}`);
});

// I5 — 대소문자 정규화: 'Apple' / 'apple' 같은 단어로 인식
test('I5 — case-insensitive: Apple matches apple', async () => {
    const state = makeState({
        selectedTheme: themeFixture([word('Apple'), word('Banana')]),
        lists: [listFixture('L1', [word('apple')])],
    });
    await handleImport(state, 'L1', mockAdd);

    if (state.addBatchCalls[0].count !== 1) throw new Error(`expected 1 added (Banana only), got ${state.addBatchCalls[0].count}`);
    if (state.snackbar.message !== 'addedWithSkipped:1/1') throw new Error(`unexpected: ${state.snackbar.message}`);
});

// I6 — 공백 정규화: 'pick up' / ' pick  up ' 같은 단어로 인식
test('I6 — whitespace normalization: variant spacing matches', async () => {
    const state = makeState({
        selectedTheme: themeFixture([word(' pick  up '), word('hand over')]),
        lists: [listFixture('L1', [word('pick up')])],
    });
    await handleImport(state, 'L1', mockAdd);

    if (state.addBatchCalls[0].count !== 1) throw new Error(`expected 1 added (hand over only), got ${state.addBatchCalls[0].count}`);
    if (state.snackbar.message !== 'addedWithSkipped:1/1') throw new Error(`unexpected: ${state.snackbar.message}`);
});

// I7 — 타겟 리스트 비어있음: 모든 단어 추가 (existing set이 비어있음)
test('I7 — empty target list: all incoming words added', async () => {
    const state = makeState({
        selectedTheme: themeFixture([word('apple'), word('banana')]),
        lists: [listFixture('L1', [])],
    });
    await handleImport(state, 'L1', mockAdd);

    if (state.addBatchCalls[0].count !== 2) throw new Error(`expected 2 added, got ${state.addBatchCalls[0].count}`);
    if (state.snackbar.message !== 'addedToExistingList') throw new Error(`unexpected: ${state.snackbar.message}`);
});

// I8 — 타겟 리스트의 sourceLanguage가 undefined: 큐레이션 sourceLanguage와 비교
test('I8 — target list with undefined sourceLanguage: dedupe disabled', async () => {
    const state = makeState({
        selectedTheme: themeFixture([word('apple'), word('banana')], 'en'),
        // sourceLanguage 없음 (legacy 리스트 가정)
        lists: [{ id: 'L1', title: 'L1', words: [word('apple')], sourceLanguage: undefined }],
    });
    await handleImport(state, 'L1', mockAdd);

    // sourceLang 다름(undefined !== 'en')으로 처리 → dedupe 비활성 → 모두 추가
    if (state.addBatchCalls[0].count !== 2) throw new Error(`legacy list without sourceLanguage should bypass dedupe, got ${state.addBatchCalls[0].count}`);
});

// I9 — DB 실패 시 selectedTheme 유지 + 에러 스낵바
test('I9 — addBatchWords throws: selectedTheme preserved, error snackbar', async () => {
    const state = makeState({
        selectedTheme: themeFixture([word('apple')]),
        lists: [listFixture('L1', [])],
    });
    const failingMock = async () => { throw new Error('DB write failed'); };
    await handleImport(state, 'L1', failingMock);

    if (state.snackbar.message !== 'saveError') throw new Error(`expected saveError, got: ${state.snackbar.message}`);
    if (state.selectedTheme === null) throw new Error('selectedTheme should be preserved on error');
    if (state.saving !== false) throw new Error('saving should be cleared');
});

// I10 — 큰 리스트에서도 정규화 캐시(Set) 한 번만 만들면 되는지(implicit perf)
test('I10 — large existing list: dedupe still correct', async () => {
    const existing = Array.from({ length: 500 }, (_, i) => word(`word${i}`));
    const incoming = [word('word0'), word('word499'), word('newone')];
    const state = makeState({
        selectedTheme: themeFixture(incoming),
        lists: [listFixture('L1', existing)],
    });
    await handleImport(state, 'L1', mockAdd);

    if (state.addBatchCalls[0].count !== 1) throw new Error(`expected 1 added (newone), got ${state.addBatchCalls[0].count}`);
    if (state.snackbar.message !== 'addedWithSkipped:1/2') throw new Error(`unexpected: ${state.snackbar.message}`);
});

// I11 — 타겟 리스트가 lists에 없음 (방어): dedupe 비활성, 그래도 추가 시도
test('I11 — missing target list in state: dedupe bypassed, addBatchWords still called', async () => {
    const state = makeState({
        selectedTheme: themeFixture([word('apple')]),
        lists: [], // 타겟 ID와 매칭되는 리스트 없음
    });
    await handleImport(state, 'L1', mockAdd);

    // sameSourceLang === false (targetList undefined) → dedupe 안 함 → 그대로 추가
    if (state.addBatchCalls[0].count !== 1) throw new Error(`expected 1 added (no dedupe possible), got ${state.addBatchCalls[0].count}`);
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
