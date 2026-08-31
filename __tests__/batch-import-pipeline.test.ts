/**
 * 일괄 단어 추가 파이프라인 — 시나리오 테스트
 *
 * parseImportedText — 텍스트/CSV/엑셀 붙여넣기를 단어 후보로 정제
 * (worker 큐 알고리즘 테스트는 enrich-queue-core.test.ts로 이전)
 */

import { parseImportedText } from '../utils/importParser';

describe('Scenario A: parseImportedText (단어만 입력)', () => {
    it('한 줄에 한 단어 → 그대로 파싱', () => {
        const result = parseImportedText('apple\nbanana\ncherry');
        expect(result.map(r => r.term)).toEqual(['apple', 'banana', 'cherry']);
    });

    it('빈 줄, 공백 줄은 건너뜀', () => {
        const result = parseImportedText('apple\n\n  \nbanana\n\n');
        expect(result.map(r => r.term)).toEqual(['apple', 'banana']);
    });

    it('대소문자 다른 중복은 한 번만 (먼저 등장한 표기 보존)', () => {
        const result = parseImportedText('Apple\napple\nAPPLE\nbanana');
        expect(result.map(r => r.term)).toEqual(['Apple', 'banana']);
    });

    it('숫자/기호만 있는 토큰은 제외', () => {
        const result = parseImportedText('apple\n123\n???\nbanana');
        expect(result.map(r => r.term)).toEqual(['apple', 'banana']);
    });

    it('각 카드는 enrichStatus=pending + 빈 필드로 초기화', () => {
        const result = parseImportedText('apple');
        expect(result[0].enrichStatus).toBe('pending');
        expect(result[0].meaningKr).toBe('');
        expect(result[0].phonetic).toBe('');
        expect(result[0].exampleEn).toBe('');
    });

    it('id가 카드별로 고유', () => {
        const result = parseImportedText('apple\nbanana\ncherry');
        const ids = new Set(result.map(r => r.id));
        expect(ids.size).toBe(3);
    });
});

describe('Scenario B: parseImportedText (엑셀/CSV 호환)', () => {
    it('탭으로 구분된 6컬럼 텍스트 — 첫 컬럼만 단어로 사용', () => {
        // 기존 사용자가 6컬럼 형식을 붙여넣을 때, 뜻 등은 무시되고 단어만 추출됨
        const text = 'apple\t사과\tround fruit\tI eat apples\t나는 사과를 먹는다\t과일';
        const result = parseImportedText(text);
        expect(result.map(r => r.term)).toEqual(['apple']);
        expect(result[0].meaningKr).toBe(''); // 뜻은 무시됨 (사전 보강 대상)
    });

    it('콤마로 구분된 CSV — 첫 컬럼만 사용', () => {
        const text = 'apple,사과,fruit\nbanana,바나나';
        const result = parseImportedText(text);
        expect(result.map(r => r.term)).toEqual(['apple', 'banana']);
    });

    it('탭+콤마 혼합 — 더 앞에 있는 구분자 기준', () => {
        const text = 'apple,사과\tfruit';
        const result = parseImportedText(text);
        expect(result.map(r => r.term)).toEqual(['apple']);
    });

    it('따옴표로 감싼 단어 — 따옴표 제거', () => {
        const text = '"apple",사과';
        const result = parseImportedText(text);
        expect(result.map(r => r.term)).toEqual(['apple']);
    });
});

describe('Scenario C: parseImportedText (헤더 자동 스킵)', () => {
    it('첫 줄이 "단어"면 헤더로 인식해 스킵', () => {
        const result = parseImportedText('단어\napple\nbanana');
        expect(result.map(r => r.term)).toEqual(['apple', 'banana']);
    });

    it('첫 줄이 "word"여도 헤더로 스킵', () => {
        const result = parseImportedText('word\napple');
        expect(result.map(r => r.term)).toEqual(['apple']);
    });

    it('첫 줄이 헤더가 아니면 그대로 사용', () => {
        const result = parseImportedText('apple\nbanana');
        expect(result.map(r => r.term)).toEqual(['apple', 'banana']);
    });
});

describe('Scenario D: parseImportedText (엣지)', () => {
    it('빈 입력 → 빈 배열', () => {
        expect(parseImportedText('')).toEqual([]);
        expect(parseImportedText('   ')).toEqual([]);
        expect(parseImportedText('\n\n\n')).toEqual([]);
    });

    it('단어에 한국어가 섞인 경우 — 한글도 글자로 인정되어 통과', () => {
        // stopwords 필터를 적용하지 않으므로 사용자가 적은 그대로 보존
        const result = parseImportedText('apple\n사과');
        expect(result.map(r => r.term)).toEqual(['apple', '사과']);
    });
});

describe('Scenario F: 통합 흐름 (BatchImportWorkflow.handleNextStage 시뮬)', () => {
    const PAGE_SIZE = 30;

    // BatchImportWorkflow의 stage 1 → stage 2 핵심 로직 재현
    function simulateHandleNextStage(rawText: string, existingTerms: string[]) {
        const parsed = parseImportedText(rawText);
        const existing = new Set(existingTerms.map(s => s.trim().toLowerCase()));
        const filtered = parsed.filter(p => !existing.has(p.term.toLowerCase()));
        if (filtered.length === 0) return { firstPage: [], rest: [], aborted: true };
        return {
            firstPage: filtered.slice(0, PAGE_SIZE),
            rest: filtered.slice(PAGE_SIZE).map(p => p.term),
            aborted: false,
        };
    }

    it('사용자가 텍스트 5개 입력 + 기존 단어장에 그 중 2개 이미 있음 → 카드 3개', () => {
        const text = 'apple\nbanana\ncherry\ndate\nelderberry';
        const existing = ['Apple', 'BANANA']; // 대소문자 무시 매칭
        const { firstPage, aborted } = simulateHandleNextStage(text, existing);
        expect(aborted).toBe(false);
        expect(firstPage.map(c => c.term)).toEqual(['cherry', 'date', 'elderberry']);
    });

    it('전부 기존 단어장에 있을 때 → 진입 거부 (Alert)', () => {
        const text = 'apple\nbanana';
        const existing = ['apple', 'banana'];
        const { aborted, firstPage } = simulateHandleNextStage(text, existing);
        expect(aborted).toBe(true);
        expect(firstPage).toEqual([]);
    });

    it('100개 입력 → 첫 30개 카드 + 나머지 70개 pending', () => {
        const terms = Array.from({ length: 100 }, (_, i) => `word${i}`).join('\n');
        const { firstPage, rest } = simulateHandleNextStage(terms, []);
        expect(firstPage).toHaveLength(30);
        expect(rest).toHaveLength(70);
        expect(firstPage[0].term).toBe('word0');
        expect(firstPage[29].term).toBe('word29');
        expect(rest[0]).toBe('word30');
    });

    it('29개 입력 → 페이지네이션 없음 (모두 첫 페이지)', () => {
        const terms = Array.from({ length: 29 }, (_, i) => `w${i}`).join('\n');
        const { firstPage, rest } = simulateHandleNextStage(terms, []);
        expect(firstPage).toHaveLength(29);
        expect(rest).toHaveLength(0);
    });

    it('탭 구분된 엑셀 붙여넣기 + 헤더 + 일부 기존 → 단어만 추출, 중복 제외', () => {
        const text = '단어\t뜻\napple\t사과\nbanana\t바나나\ncherry\t체리';
        const existing = ['banana'];
        const { firstPage } = simulateHandleNextStage(text, existing);
        expect(firstPage.map(c => c.term)).toEqual(['apple', 'cherry']);
    });

    it('보강이 끝난 카드의 enrichStatus 전환 시뮬', async () => {
        // handleNextStage → 카드 생성 → enrichBatch → onUpdate 시뮬
        const { firstPage } = simulateHandleNextStage('apple\nbanana', []);

        // handleEnrichUpdate가 호출되었을 때 카드 갱신
        const fakeUpdate = (cards: typeof firstPage, id: string, result: any) =>
            cards.map(w => {
                if (w.id !== id) return w;
                if (result) return { ...w, ...result, enrichStatus: 'done' as const };
                return { ...w, enrichStatus: 'failed' as const };
            });

        let cards = firstPage;
        cards = fakeUpdate(cards, cards[0].id, { meaningKr: '사과', phonetic: 'ǽpl' });
        cards = fakeUpdate(cards, cards[1].id, null); // 보강 실패

        expect(cards[0].enrichStatus).toBe('done');
        expect(cards[0].meaningKr).toBe('사과');
        expect(cards[0].phonetic).toBe('ǽpl');
        expect(cards[1].enrichStatus).toBe('failed');
        expect(cards[1].meaningKr).toBe(''); // 보강 실패한 카드는 빈 값 유지
    });
});

describe('Scenario E: parseImportedText (대시·콜론 구분자 — 2026-08-26 실사고)', () => {
    // 사용자가 "영어 — 한국어" 목록을 붙여넣었는데 줄이 갈리지 않아 통째로 표제어가 되었다.
    // 그대로 AI 보강이 돌아 enrich 캐시 83행이 오염되고 한도 83단어가 헛되이 나갔다.
    test('em dash 로 구분된 목록은 첫 컬럼만 표제어가 된다', () => {
        const result = parseImportedText('lemon — 레몬\nstrawberry — 딸기\nbroccoli — 브로콜리');
        expect(result.map(w => w.term)).toEqual(['lemon', 'strawberry', 'broccoli']);
    });

    test('en dash 와 공백 하이픈도 자른다', () => {
        expect(parseImportedText('apple – 사과')[0].term).toBe('apple');
        expect(parseImportedText('banana - 바나나')[0].term).toBe('banana');
    });

    test('콜론은 뒤에 공백이 있을 때만 자른다', () => {
        expect(parseImportedText('hello: 안녕')[0].term).toBe('hello');
        // 붙여 쓴 콜론은 자르지 않는다 (정상 표제어에 낀 콜론을 먼저 지킨다)
        expect(parseImportedText('note:memo')[0].term).toBe('note:memo');
    });

    test('파이프로 구분된 목록도 자른다', () => {
        expect(parseImportedText('water|물')[0].term).toBe('water');
    });

    // 🔴 여기가 이 수정에서 깨뜨리면 안 되는 자리다 — 단어 안의 하이픈은 구분자가 아니다.
    test('단어 안에 붙어 있는 하이픈은 자르지 않는다', () => {
        const result = parseImportedText('e-mail\nK-pop\nself-esteem\nT-shirt');
        expect(result.map(w => w.term)).toEqual(['e-mail', 'K-pop', 'self-esteem', 'T-shirt']);
    });

    test('구분자로 시작하는 줄은 컬럼 분리로 자르지 않는다 (빈 표제어 방지)', () => {
        // COLUMN_SEP 은 index 0 에서 자르지 않는다 — 자르면 표제어가 빈다.
        // 대신 normalizeHeadword 가 목록 표지로 보고 벗겨 `레몬` 을 남긴다.
        // 🔑 원래 의도(빈 표제어 방지)는 그대로이고 결과만 나아졌다 — 예전에는
        //    `— 레몬` 이 통째로 표제어가 돼 게이트에 걸렸다.
        const result = parseImportedText('— 레몬');
        expect(result[0].term).toBe('레몬');
    });

    test('목록 표지를 벗긴다 — 번호·불릿 (COLUMN_SEP 이 전혀 못 자르던 형태)', () => {
        const result = parseImportedText('1. apple\n2) banana\n• cherry\n#3 date');
        expect(result.map(w => w.term)).toEqual(['apple', 'banana', 'cherry', 'date']);
    });

    test('🔴 목록 표지처럼 보이는 정상 표제어는 건드리지 않는다', () => {
        const result = parseImportedText('1.5kg\n-apple\n24시간');
        expect(result.map(w => w.term)).toEqual(['1.5kg', '-apple', '24시간']);
    });

    test('단일 토큰의 끝 구두점을 벗긴다 — 여러 단어면 남긴다', () => {
        expect(parseImportedText('Apple?')[0].term).toBe('Apple');
        expect(parseImportedText('"자랑스러운')[0].term).toBe('자랑스러운');
        // 구두점이 의미의 일부인 표현은 그대로 (덱에 실재하는 형태)
        expect(parseImportedText('off with their heads!')[0].term).toBe('off with their heads!');
    });

    test('탭·콤마가 대시보다 앞서면 탭·콤마에서 자른다', () => {
        expect(parseImportedText('apple\t사과 — fruit')[0].term).toBe('apple');
        expect(parseImportedText('apple,사과 — fruit')[0].term).toBe('apple');
    });
});
