import { getRelevanceScore, filterAndRankResults, getTopTags } from '../lib/search';
import type { Word } from '../lib/types';
import type { AllDataItem } from '../lib/search';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeWord(overrides: Partial<Word> = {}): Word {
    return {
        id: Math.random().toString(36).slice(2),
        term: 'word',
        definition: 'a definition',
        exampleEn: '',
        meaningKr: '뜻',
        isMemorized: false,
        isStarred: false,
        tags: [],
        assignedDay: null,
        ...overrides,
    };
}

function makeItem(overrides: Partial<Word> = {}, listId = 'list1', listName = '테스트'): AllDataItem {
    return { word: makeWord(overrides), listId, listName };
}

// ─── getRelevanceScore ────────────────────────────────────────────────────────

describe('getRelevanceScore', () => {
    describe('완전 일치 (0점)', () => {
        test('term이 쿼리와 정확히 같으면 0', () => {
            expect(getRelevanceScore(makeWord({ term: 'apple' }), 'apple')).toBe(0);
        });

        test('대소문자 달라도 완전 일치면 0', () => {
            expect(getRelevanceScore(makeWord({ term: 'Apple' }), 'apple')).toBe(0);
            expect(getRelevanceScore(makeWord({ term: 'APPLE' }), 'apple')).toBe(0);
        });
    });

    describe('term 앞부분 일치 (1점)', () => {
        test('term이 쿼리로 시작하면 1', () => {
            expect(getRelevanceScore(makeWord({ term: 'applet' }), 'apple')).toBe(1);
        });

        test('대소문자 달라도 앞부분 일치면 1', () => {
            expect(getRelevanceScore(makeWord({ term: 'Applet' }), 'apple')).toBe(1);
        });
    });

    describe('term 부분 포함 (2점)', () => {
        test('term 중간에 쿼리가 포함되면 2', () => {
            expect(getRelevanceScore(makeWord({ term: 'pineapple' }), 'apple')).toBe(2);
        });
    });

    describe('뜻 앞부분 일치 (3점)', () => {
        test('meaningKr이 쿼리로 시작하면 3', () => {
            const word = makeWord({ term: 'other', meaningKr: '사과 (과일)' });
            expect(getRelevanceScore(word, '사과')).toBe(3);
        });

        test('대소문자 달라도 뜻 앞부분 일치면 3', () => {
            const word = makeWord({ term: 'other', meaningKr: 'Apple fruit' });
            expect(getRelevanceScore(word, 'apple')).toBe(3);
        });
    });

    describe('뜻 부분 포함 (4점)', () => {
        test('meaningKr 중간에 쿼리가 포함되면 4', () => {
            const word = makeWord({ term: 'other', meaningKr: '빨간 사과' });
            expect(getRelevanceScore(word, '사과')).toBe(4);
        });
    });

    describe('태그 완전 일치 (5점)', () => {
        test('태그 중 쿼리와 정확히 같은 게 있으면 5', () => {
            const word = makeWord({ term: 'other', meaningKr: '다른', tags: ['과일', 'food'] });
            expect(getRelevanceScore(word, '과일')).toBe(5);
        });

        test('대소문자 달라도 태그 완전 일치면 5', () => {
            const word = makeWord({ term: 'other', meaningKr: '다른', tags: ['Food'] });
            expect(getRelevanceScore(word, 'food')).toBe(5);
        });
    });

    describe('태그 부분 포함 (6점)', () => {
        test('태그 중 쿼리를 포함하는 게 있으면 6', () => {
            const word = makeWord({ term: 'other', meaningKr: '다른', tags: ['과일종류'] });
            expect(getRelevanceScore(word, '과일')).toBe(6);
        });
    });

    describe('영어 정의 포함 (7점)', () => {
        test('definition에만 쿼리가 있으면 7', () => {
            const word = makeWord({ term: 'other', meaningKr: '다른', definition: 'a red fruit' });
            expect(getRelevanceScore(word, 'fruit')).toBe(7);
        });
    });

    describe('우선순위 비교', () => {
        test('term 일치 단어가 meaning 일치 단어보다 낮은 점수', () => {
            const termWord = makeWord({ term: 'apple', meaningKr: '다른' });
            const meaningWord = makeWord({ term: 'other', meaningKr: '사과' });
            expect(getRelevanceScore(termWord, 'apple')).toBeLessThan(getRelevanceScore(meaningWord, '사과'));
        });

        test('태그 일치가 definition 일치보다 낮은 점수', () => {
            const tagWord = makeWord({ term: 'other', meaningKr: '다른', tags: ['fruit'] });
            const defWord = makeWord({ term: 'other2', meaningKr: '다른2', definition: 'a fruit' });
            expect(getRelevanceScore(tagWord, 'fruit')).toBeLessThan(getRelevanceScore(defWord, 'fruit'));
        });
    });

    describe('엣지 케이스', () => {
        test('tags가 빈 배열이어도 크래시 없음', () => {
            const word = makeWord({ term: 'other', meaningKr: '다른', definition: 'def', tags: [] });
            expect(() => getRelevanceScore(word, 'query')).not.toThrow();
        });
    });
});

// ─── filterAndRankResults — 필터링 ────────────────────────────────────────────

describe('filterAndRankResults — 필터링', () => {
    describe('빈 쿼리', () => {
        test('쿼리 없고 starredOnly=false → 빈 배열', () => {
            const pool = [makeItem({ term: 'apple' }), makeItem({ term: 'banana' })];
            expect(filterAndRankResults(pool, '', null, false)).toEqual([]);
        });

        test('공백만 있는 쿼리 → 빈 배열', () => {
            const pool = [makeItem({ term: 'apple' })];
            expect(filterAndRankResults(pool, '   ', null, false)).toEqual([]);
        });

        test('쿼리 없고 starredOnly=true → 별표 단어 전체 반환', () => {
            const pool = [
                makeItem({ term: 'apple', isStarred: true }),
                makeItem({ term: 'banana', isStarred: false }),
                makeItem({ term: 'cherry', isStarred: true }),
            ];
            const result = filterAndRankResults(pool, '', null, true);
            expect(result).toHaveLength(2);
            expect(result.map(r => r.word.term)).toEqual(expect.arrayContaining(['apple', 'cherry']));
        });
    });

    describe('단어장 필터', () => {
        test('selectedListId 지정 → 해당 단어장 단어만 반환', () => {
            const pool = [
                makeItem({ term: 'apple' }, 'list1'),
                makeItem({ term: 'banana' }, 'list2'),
                makeItem({ term: 'cherry' }, 'list1'),
            ];
            const result = filterAndRankResults(pool, 'a', 'list1', false);
            expect(result.every(r => r.listId === 'list1')).toBe(true);
        });

        test('selectedListId=null → 전체 단어장 검색', () => {
            const pool = [
                makeItem({ term: 'apple' }, 'list1'),
                makeItem({ term: 'apricot' }, 'list2'),
            ];
            const result = filterAndRankResults(pool, 'ap', null, false);
            expect(result).toHaveLength(2);
        });
    });

    describe('별표 필터', () => {
        test('starredOnly=true + 쿼리 있음 → 별표 단어 중에서만 검색', () => {
            const pool = [
                makeItem({ term: 'apple', isStarred: true }),
                makeItem({ term: 'apricot', isStarred: false }),
            ];
            const result = filterAndRankResults(pool, 'ap', null, true);
            expect(result).toHaveLength(1);
            expect(result[0].word.term).toBe('apple');
        });

        test('starredOnly=false → 별표 여부 무관하게 검색', () => {
            const pool = [
                makeItem({ term: 'apple', isStarred: true }),
                makeItem({ term: 'apricot', isStarred: false }),
            ];
            const result = filterAndRankResults(pool, 'ap', null, false);
            expect(result).toHaveLength(2);
        });
    });

    describe('매칭 필드', () => {
        test('term에 쿼리 포함 → 결과에 포함', () => {
            const pool = [makeItem({ term: 'apple', meaningKr: '기타', definition: '기타' })];
            expect(filterAndRankResults(pool, 'apple', null, false)).toHaveLength(1);
        });

        test('meaningKr에 쿼리 포함 → 결과에 포함', () => {
            const pool = [makeItem({ term: '기타', meaningKr: '사과', definition: '기타' })];
            expect(filterAndRankResults(pool, '사과', null, false)).toHaveLength(1);
        });

        test('definition에 쿼리 포함 → 결과에 포함', () => {
            const pool = [makeItem({ term: '기타', meaningKr: '기타', definition: 'a red fruit' })];
            expect(filterAndRankResults(pool, 'fruit', null, false)).toHaveLength(1);
        });

        test('tags에 쿼리 포함 → 결과에 포함', () => {
            const pool = [makeItem({ term: '기타', meaningKr: '기타', definition: '기타', tags: ['과일'] })];
            expect(filterAndRankResults(pool, '과일', null, false)).toHaveLength(1);
        });

        test('4개 필드 모두 불일치 → 결과에 미포함', () => {
            const pool = [makeItem({ term: 'apple', meaningKr: '사과', definition: 'red fruit', tags: ['food'] })];
            expect(filterAndRankResults(pool, 'xyz123', null, false)).toHaveLength(0);
        });
    });

    describe('복합 조건', () => {
        test('selectedListId + starredOnly + 쿼리 → 세 조건 모두 만족하는 것만', () => {
            const pool = [
                makeItem({ term: 'apple', isStarred: true }, 'list1'),
                makeItem({ term: 'apricot', isStarred: false }, 'list1'),  // 별표 아님
                makeItem({ term: 'avocado', isStarred: true }, 'list2'),   // 다른 단어장
            ];
            const result = filterAndRankResults(pool, 'a', 'list1', true);
            expect(result).toHaveLength(1);
            expect(result[0].word.term).toBe('apple');
        });

        test('같은 단어가 두 단어장에 있으면 각각 별개 결과로 2개 반환', () => {
            const sharedWord = makeWord({ term: 'apple' });
            const pool: AllDataItem[] = [
                { word: sharedWord, listId: 'list1', listName: '단어장1' },
                { word: sharedWord, listId: 'list2', listName: '단어장2' },
            ];
            const result = filterAndRankResults(pool, 'apple', null, false);
            expect(result).toHaveLength(2);
            expect(result.map(r => r.listId)).toEqual(expect.arrayContaining(['list1', 'list2']));
        });
    });
});

// ─── filterAndRankResults — 정렬 ─────────────────────────────────────────────

describe('filterAndRankResults — 정렬', () => {
    test('완전 일치가 앞부분 일치보다 먼저', () => {
        const pool = [
            makeItem({ term: 'applet' }),   // 앞부분 일치 (score 1)
            makeItem({ term: 'apple' }),    // 완전 일치 (score 0)
        ];
        const result = filterAndRankResults(pool, 'apple', null, false);
        expect(result[0].word.term).toBe('apple');
        expect(result[1].word.term).toBe('applet');
    });

    test('앞부분 일치가 부분 포함보다 먼저', () => {
        const pool = [
            makeItem({ term: 'pineapple' }), // 부분 포함 (score 2)
            makeItem({ term: 'applet' }),    // 앞부분 일치 (score 1)
        ];
        const result = filterAndRankResults(pool, 'apple', null, false);
        expect(result[0].word.term).toBe('applet');
        expect(result[1].word.term).toBe('pineapple');
    });

    test('term 일치가 meaning 일치보다 먼저', () => {
        const pool = [
            makeItem({ term: '기타', meaningKr: '사과', definition: '기타' }),  // meaning 일치
            makeItem({ term: '사과', meaningKr: '기타', definition: '기타' }),  // term 완전 일치
        ];
        const result = filterAndRankResults(pool, '사과', null, false);
        expect(result[0].word.term).toBe('사과');
    });

    test('meaning 일치가 tag 일치보다 먼저', () => {
        const pool = [
            makeItem({ term: '기타', meaningKr: '기타', tags: ['과일'] }),         // tag 포함 (score 6)
            makeItem({ term: '기타2', meaningKr: '과일 종류', tags: [] }),         // meaning 포함 (score 4)
        ];
        const result = filterAndRankResults(pool, '과일', null, false);
        expect(result[0].word.meaningKr).toBe('과일 종류');
    });

    test('tag 일치가 definition 일치보다 먼저', () => {
        const pool = [
            makeItem({ term: '기타', meaningKr: '기타', definition: 'a fruit food', tags: [] }),     // definition 일치 (score 7)
            makeItem({ term: '기타2', meaningKr: '기타', definition: '기타', tags: ['fruit'] }),     // tag 완전 일치 (score 5)
        ];
        const result = filterAndRankResults(pool, 'fruit', null, false);
        expect(result[0].word.tags).toContain('fruit');
    });

    test('동점 결과는 원래 순서 유지 (stable sort)', () => {
        // 모두 term 부분 포함 (score 2)
        const pool = [
            makeItem({ term: 'pineapple', id: 'w1' }),
            makeItem({ term: 'snapple', id: 'w2' }),
            makeItem({ term: 'dapple', id: 'w3' }),
        ];
        const result = filterAndRankResults(pool, 'apple', null, false);
        expect(result.map(r => r.word.term)).toEqual(['pineapple', 'snapple', 'dapple']);
    });

    test('결과가 1개일 때 정렬 크래시 없음', () => {
        const pool = [makeItem({ term: 'apple' })];
        expect(() => filterAndRankResults(pool, 'apple', null, false)).not.toThrow();
    });
});

// ─── filterAndRankResults — 플래그 ───────────────────────────────────────────

describe('filterAndRankResults — 플래그', () => {
    describe('isTagMatch', () => {
        test('tag만 일치 → isTagMatch=true', () => {
            const pool = [makeItem({ term: '기타', meaningKr: '기타', definition: '기타', tags: ['과일'] })];
            const result = filterAndRankResults(pool, '과일', null, false);
            expect(result[0].isTagMatch).toBe(true);
        });

        test('term + tag 동시 일치 → isTagMatch=false', () => {
            const pool = [makeItem({ term: '과일', meaningKr: '기타', definition: '기타', tags: ['과일'] })];
            const result = filterAndRankResults(pool, '과일', null, false);
            expect(result[0].isTagMatch).toBe(false);
        });

        test('meaningKr + tag 동시 일치 → isTagMatch=false', () => {
            const pool = [makeItem({ term: '기타', meaningKr: '과일', definition: '기타', tags: ['과일'] })];
            const result = filterAndRankResults(pool, '과일', null, false);
            expect(result[0].isTagMatch).toBe(false);
        });
    });

    describe('isDefinitionMatch', () => {
        test('definition만 일치 → isDefinitionMatch=true', () => {
            const pool = [makeItem({ term: '기타', meaningKr: '기타', definition: 'a red fruit', tags: [] })];
            const result = filterAndRankResults(pool, 'fruit', null, false);
            expect(result[0].isDefinitionMatch).toBe(true);
        });

        test('term + definition 동시 일치 → isDefinitionMatch=false', () => {
            const pool = [makeItem({ term: 'fruit', meaningKr: '기타', definition: 'a red fruit', tags: [] })];
            const result = filterAndRankResults(pool, 'fruit', null, false);
            expect(result[0].isDefinitionMatch).toBe(false);
        });

        test('tag + definition 동시 일치 → isDefinitionMatch=false', () => {
            const pool = [makeItem({ term: '기타', meaningKr: '기타', definition: 'a red fruit', tags: ['fruit'] })];
            const result = filterAndRankResults(pool, 'fruit', null, false);
            expect(result[0].isDefinitionMatch).toBe(false);
        });

        test('term/meaning/tag 모두 불일치 + definition 일치 → isDefinitionMatch=true', () => {
            const pool = [makeItem({ term: 'xyz', meaningKr: 'xyz', definition: 'contains the word fruit', tags: ['xyz'] })];
            const result = filterAndRankResults(pool, 'fruit', null, false);
            expect(result[0].isDefinitionMatch).toBe(true);
        });
    });
});

// ─── getTopTags ───────────────────────────────────────────────────────────────

describe('getTopTags', () => {
    test('빈 allData → 빈 배열', () => {
        expect(getTopTags([])).toEqual([]);
    });

    test('태그 없는 단어만 있으면 빈 배열', () => {
        const data = [makeItem({ tags: [] }), makeItem({ tags: [] })];
        expect(getTopTags(data)).toEqual([]);
    });

    test('빈도 높은 순으로 정렬', () => {
        const data = [
            makeItem({ tags: ['a', 'b'] }),
            makeItem({ tags: ['a', 'c'] }),
            makeItem({ tags: ['a'] }),
            makeItem({ tags: ['b'] }),
        ];
        // a: 3번, b: 2번, c: 1번
        const result = getTopTags(data);
        expect(result[0]).toBe('a');
        expect(result[1]).toBe('b');
        expect(result[2]).toBe('c');
    });

    test('limit=5이면 최대 5개만 반환', () => {
        const data = [makeItem({ tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })];
        expect(getTopTags(data, 5)).toHaveLength(5);
    });

    test('limit 파라미터로 개수 조정 가능', () => {
        const data = [makeItem({ tags: ['a', 'b', 'c'] })];
        expect(getTopTags(data, 2)).toHaveLength(2);
        expect(getTopTags(data, 10)).toHaveLength(3); // 태그가 3개뿐이면 3개만
    });

    test('단어 수보다 태그 종류가 적으면 있는 것만 반환', () => {
        const data = [makeItem({ tags: ['a'] }), makeItem({ tags: ['a'] })];
        expect(getTopTags(data, 5)).toHaveLength(1);
    });
});

// ─── 엣지 케이스 ──────────────────────────────────────────────────────────────

describe('엣지 케이스', () => {
    test('빈 풀 → 빈 배열 (크래시 없음)', () => {
        expect(filterAndRankResults([], 'apple', null, false)).toEqual([]);
    });

    test('쿼리에 정규식 특수문자 포함 시 크래시 없음 (includes 사용)', () => {
        const pool = [makeItem({ term: 'a.b test' })];
        expect(() => filterAndRankResults(pool, 'a.b', null, false)).not.toThrow();
        expect(() => filterAndRankResults(pool, 'a*b', null, false)).not.toThrow();
        expect(() => filterAndRankResults(pool, 'a+b', null, false)).not.toThrow();
    });

    test('매우 긴 쿼리 (500자) → 정상 동작', () => {
        const pool = [makeItem({ term: 'apple' })];
        const longQuery = 'a'.repeat(500);
        expect(() => filterAndRankResults(pool, longQuery, null, false)).not.toThrow();
    });

    test('term/meaningKr/definition이 빈 문자열인 단어 → 크래시 없음', () => {
        const pool = [makeItem({ term: '', meaningKr: '', definition: '' })];
        expect(() => filterAndRankResults(pool, 'apple', null, false)).not.toThrow();
    });

    test('한글+영어 혼합 쿼리 → 어느 한 필드에 포함되면 매칭', () => {
        // "apple 사과"는 term이나 meaning에 해당 문자열이 포함된 경우
        const pool = [makeItem({ term: 'apple 사과', meaningKr: '기타' })];
        const result = filterAndRankResults(pool, 'apple 사과', null, false);
        expect(result).toHaveLength(1);
    });
});
