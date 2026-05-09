// Standalone harness mirroring features/curation/screen.tsx::generateAIWords
// post-fetch parsing/validation. Run with: node __tests__/ai_curation_parse.test.js
const { z } = require('zod');

const AIWordResultSchema = z.object({
    term: z.string(),
    definition: z.string(),
    exampleEn: z.string(),
    exampleKr: z.string().optional(),
    meaningKr: z.string(),
    mnemonic: z.string().optional(),
    pos: z.string().optional(),
    phonetic: z.string().optional(),
    tags: z.array(z.string()).optional(),
});

const DIFFICULTY_TAG = { beginner: '초급', intermediate: '중급', advanced: '고급' };

function parseGeminiResponse(textResponse, query, difficulty = 'intermediate') {
    textResponse = textResponse.trim();
    if (textResponse.startsWith('```')) {
        const firstNewLine = textResponse.indexOf('\n');
        const lastBacktick = textResponse.lastIndexOf('```');
        if (firstNewLine !== -1 && lastBacktick !== -1) {
            textResponse = textResponse.slice(firstNewLine, lastBacktick).trim();
        }
    }

    let raw;
    try {
        raw = JSON.parse(textResponse);
    } catch (e) {
        throw new Error('응답을 파싱할 수 없습니다.');
    }

    if (!Array.isArray(raw)) {
        throw new Error('AI 응답 형식이 올바르지 않습니다. 다시 시도해주세요.');
    }

    const validated = [];
    let droppedCount = 0;
    for (let i = 0; i < raw.length; i++) {
        const parsed = AIWordResultSchema.safeParse(raw[i]);
        if (parsed.success) validated.push({ item: parsed.data, originalIndex: i });
        else droppedCount++;
    }

    if (validated.length === 0) {
        throw new Error('AI 응답 형식이 올바르지 않습니다. 다시 시도해주세요.');
    }

    const now = Date.now();
    const aiMarker = 'AI생성';
    const difficultyTag = DIFFICULTY_TAG[difficulty];
    const words = validated.map(({ item: w, originalIndex }) => {
        const baseTags = w.tags && w.tags.length > 0 ? w.tags : [query];
        return {
            id: `ai-word-${originalIndex}-${now}`,
            term: w.term,
            definition: w.definition,
            meaningKr: w.meaningKr,
            exampleEn: w.exampleEn,
            exampleKr: w.exampleKr ?? '',
            pos: w.pos ?? '',
            phonetic: w.phonetic ?? '',
            isMemorized: false,
            isStarred: false,
            tags: [...baseTags, aiMarker, difficultyTag],
        };
    });
    return { words, droppedCount };
}

const validWord = (i) => ({
    term: `word${i}`,
    pos: 'noun',
    phonetic: 'wɜːrd',
    definition: `definition of word${i}`,
    meaningKr: `단어${i}`,
    exampleEn: `Example for word${i}.`,
    exampleKr: `예문${i}.`,
    tags: ['test'],
});

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// NS1: 20 valid → 20 returned, droppedCount=0
test('NS1 — 20 valid words: returns 20, droppedCount=0', () => {
    const arr = Array.from({ length: 20 }, (_, i) => validWord(i));
    const result = parseGeminiResponse(JSON.stringify(arr), 'test');
    if (result.words.length !== 20) throw new Error(`expected 20 words, got ${result.words.length}`);
    if (result.droppedCount !== 0) throw new Error(`expected droppedCount=0, got ${result.droppedCount}`);
});

// NS2: 19 valid + 1 invalid (missing required field) → 19 returned, droppedCount=1
test('NS2 — 19 valid + 1 missing definition: returns 19, droppedCount=1', () => {
    const arr = Array.from({ length: 20 }, (_, i) => validWord(i));
    delete arr[5].definition;  // missing required field
    const result = parseGeminiResponse(JSON.stringify(arr), 'test');
    if (result.words.length !== 19) throw new Error(`expected 19, got ${result.words.length}`);
    if (result.droppedCount !== 1) throw new Error(`expected droppedCount=1, got ${result.droppedCount}`);
    // verify no orphan id collision: indices preserved
    const ids = result.words.map(w => w.id);
    if (new Set(ids).size !== 19) throw new Error('id collision detected');
    // verify dropped index 5 is absent — id pattern: ai-word-{originalIndex}-{now}
    const fifthIdx = ids.find(id => id.startsWith('ai-word-5-'));
    if (fifthIdx) throw new Error('dropped item still present (originalIndex 5)');
});

// NS3: 0 valid (all missing required field) → throws
test('NS3 — all invalid: throws', () => {
    const arr = Array.from({ length: 5 }, () => ({ term: 'x' })); // missing many fields
    let threw = false;
    try { parseGeminiResponse(JSON.stringify(arr), 'test'); } catch (e) { threw = true; }
    if (!threw) throw new Error('should have thrown for all-invalid');
});

// NS4: Non-array response (object) → throws
test('NS4 — object response: throws', () => {
    let threw = false;
    try { parseGeminiResponse('{"foo": "bar"}', 'test'); } catch (e) { threw = true; }
    if (!threw) throw new Error('should have thrown for non-array');
});

// NS5: Empty array → throws
test('NS5 — empty array: throws', () => {
    let threw = false;
    try { parseGeminiResponse('[]', 'test'); } catch (e) { threw = true; }
    if (!threw) throw new Error('should have thrown for empty array');
});

// NS6: Gemini returns 18 items, all valid (LLM quirk vs requested 20) → 18 returned, droppedCount=0
test('NS6 — Gemini returns 18 valid (asked for 20): returns 18, droppedCount=0', () => {
    const arr = Array.from({ length: 18 }, (_, i) => validWord(i));
    const result = parseGeminiResponse(JSON.stringify(arr), 'test');
    if (result.words.length !== 18) throw new Error(`expected 18, got ${result.words.length}`);
    if (result.droppedCount !== 0) throw new Error(`expected droppedCount=0, got ${result.droppedCount}`);
});

// NS7: Non-JSON response → throws "파싱 불가"
test('NS7 — non-JSON ("Sorry"): throws parse error', () => {
    let msg = '';
    try { parseGeminiResponse('Sorry, I cannot help.', 'test'); } catch (e) { msg = e.message; }
    if (!msg.includes('파싱')) throw new Error(`expected parse error, got: "${msg}"`);
});

// NS8: Code-fenced JSON (```json ... ```) — strip and parse
test('NS8 — code-fenced response: strips fences', () => {
    const arr = Array.from({ length: 3 }, (_, i) => validWord(i));
    const fenced = '```json\n' + JSON.stringify(arr) + '\n```';
    const result = parseGeminiResponse(fenced, 'test');
    if (result.words.length !== 3) throw new Error(`expected 3, got ${result.words.length}`);
});

// NS9: Optional fields absent (definition, meaningKr, exampleEn, term required only) — minimal valid
test('NS9 — minimal valid (optionals omitted): accepted', () => {
    const minimal = [{ term: 't', definition: 'd', meaningKr: 'm', exampleEn: 'e' }];
    const result = parseGeminiResponse(JSON.stringify(minimal), 'topic');
    if (result.words.length !== 1) throw new Error('minimal valid should pass');
    if (result.words[0].tags[0] !== 'topic') throw new Error('default tag fallback should be query first');
    if (result.words[0].pos !== '') throw new Error('absent pos should default to ""');
});

// NS11: Tag injection — every word has "AI생성" + difficulty tag appended
test('NS11 — tag injection: every word has AI생성 + difficulty tag', () => {
    const arr = [
        { term: 't1', definition: 'd1', meaningKr: 'm1', exampleEn: 'e1', tags: ['coffee'] },
        { term: 't2', definition: 'd2', meaningKr: 'm2', exampleEn: 'e2', tags: ['ordering', 'cafe'] },
    ];
    const result = parseGeminiResponse(JSON.stringify(arr), 'cafe', 'advanced');
    for (const w of result.words) {
        if (!w.tags.includes('AI생성')) throw new Error(`missing AI생성 tag: ${JSON.stringify(w.tags)}`);
        if (!w.tags.includes('고급')) throw new Error(`missing 고급 tag: ${JSON.stringify(w.tags)}`);
    }
    // verify original tags preserved
    if (!result.words[0].tags.includes('coffee')) throw new Error('original tag dropped');
    if (!result.words[1].tags.includes('ordering')) throw new Error('original tag dropped');
});

// NS12: Tag fallback — when LLM returns no tags, use query + AI marker + difficulty
test('NS12 — tag fallback uses query when w.tags empty', () => {
    const arr = [
        { term: 't1', definition: 'd1', meaningKr: 'm1', exampleEn: 'e1' }, // no tags
        { term: 't2', definition: 'd2', meaningKr: 'm2', exampleEn: 'e2', tags: [] }, // empty array
    ];
    const result = parseGeminiResponse(JSON.stringify(arr), 'travel', 'beginner');
    for (const w of result.words) {
        if (!w.tags.includes('travel')) throw new Error(`expected query fallback "travel": ${JSON.stringify(w.tags)}`);
        if (!w.tags.includes('AI생성')) throw new Error('missing AI생성');
        if (!w.tags.includes('초급')) throw new Error('missing 초급');
    }
});

// NS13: Difficulty tag varies by difficulty argument
test('NS13 — difficulty tag matches argument', () => {
    const arr = [{ term: 't', definition: 'd', meaningKr: 'm', exampleEn: 'e' }];
    const beg = parseGeminiResponse(JSON.stringify(arr), 'q', 'beginner');
    const mid = parseGeminiResponse(JSON.stringify(arr), 'q', 'intermediate');
    const adv = parseGeminiResponse(JSON.stringify(arr), 'q', 'advanced');
    if (!beg.words[0].tags.includes('초급')) throw new Error('beginner should have 초급 tag');
    if (!mid.words[0].tags.includes('중급')) throw new Error('intermediate should have 중급 tag');
    if (!adv.words[0].tags.includes('고급')) throw new Error('advanced should have 고급 tag');
});

// NS10: Mixed — 1 valid, 4 invalid → 1 returned, droppedCount=4 (boundary check)
test('NS10 — 1 valid + 4 invalid: returns 1, droppedCount=4', () => {
    const arr = [
        validWord(0),
        { term: 'x' }, { term: 'y' }, { term: 'z' }, { term: 'w' },
    ];
    const result = parseGeminiResponse(JSON.stringify(arr), 'test');
    if (result.words.length !== 1) throw new Error(`expected 1, got ${result.words.length}`);
    if (result.droppedCount !== 4) throw new Error(`expected droppedCount=4, got ${result.droppedCount}`);
});

let passed = 0, failed = 0;
for (const { name, fn } of tests) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ✗ ${name}\n      ${e.message}`);
        failed++;
    }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
