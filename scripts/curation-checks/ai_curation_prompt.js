// Standalone harness mirroring features/curation/screen.tsx::buildPrompt.
// Run with: node scripts/curation-checks/ai_curation_prompt.js

const DIFFICULTY_PROMPT = {
    beginner: '초급 수준의 쉬운',
    intermediate: '중급 수준의',
    advanced: '고급/전문적인',
};

const LANG_LABEL_KO = {
    en: '영어',
    ko: '한국어',
    ja: '일본어',
    zh: '중국어',
    vi: '베트남어',
    es: '스페인어',
};

// 발음 표기는 도착어 독립(세계인 대상): en/es/vi=IPA, ja=후리가나, zh=병음, ko=로마자(RR).
const PHONETIC_INSTRUCTION = {
    en: 'IPA 발음기호 (슬래시 없이, 예: prəˈnʌnsiˌeɪʃən)',
    ko: '로마자 표기 (국립국어원 로마자 표기법, 예: 안녕 → annyeong, 값 → gap)',
    ja: '후리가나 (예: ありがとう)',
    zh: '병음 (성조 포함, 예: nǐ hǎo)',
    vi: 'IPA 발음기호 (성조 막대 기호 없이 분절음만 — 성조는 철자의 성조 부호로 충분, 예: đi → ɗi)',
    es: 'IPA 발음기호 (예: gracias → ˈɡɾasjas)',
};

function buildPrompt(query, wordCount, difficulty, sourceLang, targetLang) {
    const diffLabel = DIFFICULTY_PROMPT[difficulty];
    const srcLabel = LANG_LABEL_KO[sourceLang] ?? sourceLang;
    const tgtLabel = LANG_LABEL_KO[targetLang] ?? targetLang;
    const phoneticInstr = PHONETIC_INSTRUCTION[sourceLang] ?? '해당 언어의 표준 발음 표기';
    const sameLangNote = sourceLang === targetLang
        ? `\n  (참고: 학습 언어와 모국어가 같음. 동의어·유의어 또는 고급 어휘 위주로 생성. meaningKr=같은 언어의 쉬운 뜻풀이, exampleKr=빈 문자열 "" — 같은 언어로의 예문 번역은 무의미. 다른 언어 절대 금지.)`
        : '';
    return `성인 학습자가 '${query}' 상황에서 사용할 수 있는 ${diffLabel} ${srcLabel} 단어 ${wordCount}개를 생성해줘.${sameLangNote}
  응답은 오직 JSON 배열만 반환해야 해. 모든 필드를 빠짐없이 채워야 하며, 비워두지 마.
  - term: ${srcLabel} 단어
  - pos: 품사 (예: noun, verb, adj, adv)
  - phonetic: ${phoneticInstr}
  - definition: ${srcLabel}로 작성한 정의
  - meaningKr: ${tgtLabel} 뜻
  - exampleEn: ${srcLabel} 예문
  - exampleKr: 위 예문의 ${tgtLabel} 번역
  - tags: 주제 태그 배열
  포맷: [{"term": "단어", "pos": "noun", "phonetic": "발음기호", "definition": "${srcLabel} 정의", "meaningKr": "${tgtLabel} 뜻", "exampleEn": "${srcLabel} 예문", "exampleKr": "${tgtLabel} 번역", "tags": ["${query}"]}]`;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// P1: en → ko (default English learner from Korean)
test('P1 — en→ko: includes 영어 + IPA, no same-lang note', () => {
    const p = buildPrompt('cafe', 20, 'intermediate', 'en', 'ko');
    if (!p.includes('영어 단어 20개')) throw new Error('missing source lang label');
    if (!p.includes('IPA 발음기호')) throw new Error('missing IPA instruction');
    if (!p.includes('한국어 뜻')) throw new Error('missing target lang label');
    if (p.includes('학습 언어와 모국어가 같음')) throw new Error('should NOT have same-lang note');
});

// P2: ja → ko (Japanese learner)
test('P2 — ja→ko: includes 일본어 + 후리가나', () => {
    const p = buildPrompt('カフェ', 20, 'beginner', 'ja', 'ko');
    if (!p.includes('일본어 단어')) throw new Error('missing 일본어');
    if (!p.includes('후리가나')) throw new Error('missing 후리가나 instruction');
    if (p.includes('IPA')) throw new Error('should NOT include IPA for ja');
    if (!p.includes('초급 수준의 쉬운')) throw new Error('missing beginner difficulty label');
});

// P3: zh → ko (Chinese learner)
test('P3 — zh→ko: includes 중국어 + 병음', () => {
    const p = buildPrompt('咖啡店', 30, 'advanced', 'zh', 'ko');
    if (!p.includes('중국어 단어')) throw new Error('missing 중국어');
    if (!p.includes('병음')) throw new Error('missing 병음 instruction');
    if (!p.includes('고급/전문적인')) throw new Error('missing advanced difficulty');
});

// P4: ko → en (Korean as source for English speaker) — 로마자(RR), 도착어 독립
test('P4 — ko→en: phonetic instruction = 로마자(RR), not 비워두기', () => {
    const p = buildPrompt('카페', 10, 'intermediate', 'ko', 'en');
    if (!p.includes('한국어 단어')) throw new Error('missing 한국어');
    if (!p.includes('로마자 표기')) throw new Error('Korean should instruct Revised Romanization');
    if (p.includes('비워두기')) throw new Error('Korean phonetic must NOT be blank anymore');
    if (!p.includes('영어 뜻')) throw new Error('English target label missing');
});

// P4b: es/vi → ko — 도착어 독립 IPA (한글 전사 아님)
test('P4b — es→ko & vi→ko: phonetic = IPA, never 한글 전사', () => {
    const es = buildPrompt('gracias', 20, 'beginner', 'es', 'ko');
    if (!es.includes('스페인어 단어')) throw new Error('missing 스페인어 label');
    if (!es.includes('IPA 발음기호')) throw new Error('es should instruct IPA');
    if (es.includes('비워두기')) throw new Error('es phonetic must NOT be blank');
    const vi = buildPrompt('xin chào', 20, 'beginner', 'vi', 'ko');
    if (!vi.includes('베트남어 단어')) throw new Error('missing 베트남어 label');
    if (!vi.includes('IPA 발음기호')) throw new Error('vi should instruct IPA');
    if (vi.includes('비워두기')) throw new Error('vi phonetic must NOT be blank');
});

// P5: same-lang edge case
test('P5 — en→en: includes same-lang note', () => {
    const p = buildPrompt('synonyms', 20, 'advanced', 'en', 'en');
    if (!p.includes('학습 언어와 모국어가 같음')) throw new Error('should warn LLM about same-lang');
});

// P6: query interpolation
test('P6 — query is interpolated into prompt body and example', () => {
    const p = buildPrompt('tea ceremony', 20, 'intermediate', 'en', 'ko');
    if (!p.includes("'tea ceremony'")) throw new Error('query missing in prompt body');
    if (!p.includes('"tags": ["tea ceremony"]')) throw new Error('query missing in tags example');
});

// P7: word count interpolation
test('P7 — wordCount appears in prompt', () => {
    const p = buildPrompt('q', 50, 'intermediate', 'en', 'ko');
    if (!p.includes('단어 50개')) throw new Error('wordCount missing');
});

// P8: unknown language code falls back gracefully
test('P8 — unknown language code: falls back to code itself', () => {
    const p = buildPrompt('q', 20, 'intermediate', 'fr', 'ko');
    // fallback uses raw code 'fr' as label, generic phonetic instruction
    if (!p.includes('fr 단어')) throw new Error('fallback to code label failed');
    if (!p.includes('표준 발음 표기')) throw new Error('generic phonetic fallback missing');
});

let passed = 0, failed = 0;
for (const { name, fn } of tests) {
    try { fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.log(`  ✗ ${name}\n      ${e.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
