// Standalone harness mirroring ListCard.tsx::statusType/isAiGenerated logic.
// Run with: node __tests__/ai_curation_badge.test.js

const AI_GENERATED_TAG = 'AI생성';

// Mirrors ListCard.tsx isAiGenerated useMemo
function detectAiGenerated(words) {
    return words.some(w => w.tags?.includes(AI_GENERATED_TAG));
}

// Mirrors ListCard.tsx statusType useMemo
function selectStatusType({ planStatus, isAiGenerated, isCurated }) {
    if (planStatus === 'in-progress') return 'learning';
    if (isAiGenerated) return 'ai-generated';
    if (isCurated) return 'curated';
    return null;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// === isAiGenerated detection ===

test('B1 — words with AI tag in some words: detected as AI', () => {
    const words = [
        { tags: ['coffee', 'AI생성', '중급'] },
        { tags: ['ordering'] },
    ];
    if (detectAiGenerated(words) !== true) throw new Error('expected true');
});

test('B2 — every word has AI tag: detected as AI', () => {
    const words = Array.from({ length: 20 }, () => ({ tags: ['AI생성', '초급'] }));
    if (detectAiGenerated(words) !== true) throw new Error('expected true');
});

test('B3 — single word with AI tag: detected as AI', () => {
    const words = [{ tags: ['AI생성'] }];
    if (detectAiGenerated(words) !== true) throw new Error('expected true');
});

test('B4 — no AI tag anywhere: NOT detected', () => {
    const words = [
        { tags: ['coffee', '초급'] },
        { tags: ['ordering'] },
    ];
    if (detectAiGenerated(words) !== false) throw new Error('expected false');
});

test('B5 — empty words array: NOT detected', () => {
    if (detectAiGenerated([]) !== false) throw new Error('expected false');
});

test('B6 — words with empty tags arrays: NOT detected', () => {
    const words = [{ tags: [] }, { tags: [] }];
    if (detectAiGenerated(words) !== false) throw new Error('expected false');
});

test('B7 — words with undefined tags: NOT detected (no crash)', () => {
    const words = [{}, { tags: undefined }];
    if (detectAiGenerated(words) !== false) throw new Error('expected false');
});

test('B8 — case sensitivity: "ai생성" lowercase: NOT detected', () => {
    const words = [{ tags: ['ai생성'] }];
    if (detectAiGenerated(words) !== false) throw new Error('case-sensitive match expected');
});

test('B9 — substring "AI생성됨" should NOT match exact tag', () => {
    const words = [{ tags: ['AI생성됨'] }];
    if (detectAiGenerated(words) !== false) throw new Error('substring should not match');
});

// === statusType priority ===

test('S1 — plain user list (nothing): null', () => {
    const r = selectStatusType({ planStatus: 'none', isAiGenerated: false, isCurated: false });
    if (r !== null) throw new Error(`expected null, got ${r}`);
});

test('S2 — imported curation: curated', () => {
    const r = selectStatusType({ planStatus: 'none', isAiGenerated: false, isCurated: true });
    if (r !== 'curated') throw new Error(`expected curated, got ${r}`);
});

test('S3 — AI list (also has isCurated=true): ai-generated wins over curated', () => {
    const r = selectStatusType({ planStatus: 'none', isAiGenerated: true, isCurated: true });
    if (r !== 'ai-generated') throw new Error(`expected ai-generated, got ${r}`);
});

test('S4 — AI list without isCurated: ai-generated', () => {
    const r = selectStatusType({ planStatus: 'none', isAiGenerated: true, isCurated: false });
    if (r !== 'ai-generated') throw new Error(`expected ai-generated, got ${r}`);
});

test('S5 — learning + AI: learning wins', () => {
    const r = selectStatusType({ planStatus: 'in-progress', isAiGenerated: true, isCurated: true });
    if (r !== 'learning') throw new Error(`expected learning, got ${r}`);
});

test('S6 — learning + curated: learning wins', () => {
    const r = selectStatusType({ planStatus: 'in-progress', isAiGenerated: false, isCurated: true });
    if (r !== 'learning') throw new Error(`expected learning, got ${r}`);
});

test('S7 — learning plain: learning', () => {
    const r = selectStatusType({ planStatus: 'in-progress', isAiGenerated: false, isCurated: false });
    if (r !== 'learning') throw new Error(`expected learning, got ${r}`);
});

// === Integration scenarios ===

test('I1 — full flow: AI generation result detected as AI list', () => {
    // Simulates words after generateAIWords (per features/curation/screen.tsx logic)
    const words = Array.from({ length: 20 }, (_, i) => ({
        tags: ['cafe', AI_GENERATED_TAG, '중급'],
    }));
    const isAi = detectAiGenerated(words);
    const status = selectStatusType({ planStatus: 'none', isAiGenerated: isAi, isCurated: true });
    if (status !== 'ai-generated') throw new Error(`expected ai-generated, got ${status}`);
});

test('I2 — legacy AI list (pre-tag-injection): falls through to curated', () => {
    // Simulates AI list created BEFORE tag injection was added (no AI tag in words)
    // Title may start with "AI: ..." but tags don't have marker
    const words = Array.from({ length: 20 }, () => ({ tags: ['cafe'] }));
    const isAi = detectAiGenerated(words);
    const status = selectStatusType({ planStatus: 'none', isAiGenerated: isAi, isCurated: true });
    // Expected: 'curated' (the accepted trade-off — legacy lists show old badge)
    if (status !== 'curated') throw new Error(`expected curated for legacy, got ${status}`);
});

test('I3 — official curation import: curated badge', () => {
    // Simulates importing a preset curation theme
    const words = [
        { tags: ['travel', 'beginner'] },
        { tags: ['vocabulary'] },
    ];
    const isAi = detectAiGenerated(words);
    const status = selectStatusType({ planStatus: 'none', isAiGenerated: isAi, isCurated: true });
    if (status !== 'curated') throw new Error(`expected curated, got ${status}`);
});

test('I4 — user adds AI words to existing manual list: detected as AI mix', () => {
    // User selects "기존 단어장에 추가" — AI words mixed into manual list
    const words = [
        { tags: ['my-tag-1'] },
        { tags: ['my-tag-2'] },
        // AI words appended
        { tags: ['cafe', AI_GENERATED_TAG, '중급'] },
        { tags: ['cafe', AI_GENERATED_TAG, '중급'] },
    ];
    const isAi = detectAiGenerated(words);
    // Even one AI word → list shows AI badge
    if (isAi !== true) throw new Error('mixed list should detect AI');
    const status = selectStatusType({ planStatus: 'none', isAiGenerated: isAi, isCurated: false });
    if (status !== 'ai-generated') throw new Error(`expected ai-generated for mixed list`);
});

test('I5 — multilingual AI list (ja→ko): tag is locale-fixed, still detected', () => {
    // AI生成 tag is hardcoded Korean even for Japanese learner
    const words = Array.from({ length: 20 }, () => ({
        tags: ['カフェ', AI_GENERATED_TAG, '초급'],
    }));
    if (detectAiGenerated(words) !== true) throw new Error('locale-fixed tag should still detect');
});

let passed = 0, failed = 0;
for (const { name, fn } of tests) {
    try { fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.log(`  ✗ ${name}\n      ${e.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
