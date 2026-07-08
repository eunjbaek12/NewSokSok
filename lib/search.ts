import { Word } from './types';

export type AllDataItem = {
    word: Word;
    listName: string;
    listId: string;
};

export type SearchResult = AllDataItem & {
    isTagMatch: boolean;
    isDefinitionMatch: boolean;
    score: number;
};

/** 암기 상태 필터. learning = 미암기, memorized = 암기. 단어장 상세(app/list/[id].tsx)와 동일 어휘. */
export type StatusFilter = 'all' | 'learning' | 'memorized';

/**
 * 관련도 점수 계산. 낮을수록 상위 노출.
 *
 * 0 term 완전 일치
 * 1 term 앞부분 일치
 * 2 term 부분 포함
 * 3 뜻 앞부분 일치
 * 4 뜻 부분 포함
 * 5 태그 완전 일치
 * 6 태그 부분 포함
 * 7 영어 정의 포함
 */
export function getRelevanceScore(word: Word, trimmed: string): number {
    const term = word.term.toLowerCase();
    const meaning = word.meaningKr.toLowerCase();
    if (term === trimmed) return 0;
    if (term.startsWith(trimmed)) return 1;
    if (term.includes(trimmed)) return 2;
    if (meaning.startsWith(trimmed)) return 3;
    if (meaning.includes(trimmed)) return 4;
    if (word.tags?.some(tag => tag.toLowerCase() === trimmed)) return 5;
    if (word.tags?.some(tag => tag.toLowerCase().includes(trimmed))) return 6;
    return 7;
}

/**
 * 검색 풀을 필터링하고 관련도 순으로 정렬한 결과를 반환.
 * - query가 빈 문자열이면: 활성 필터(별표·단어장·상태·태그)가 하나라도 있으면 해당 조건의 단어 전체를,
 *   아무 필터도 없으면 빈 배열을 반환(브라우징).
 * - opts는 하위호환을 위해 선택 인자. status/tag는 별표·단어장과 같은 풀 필터(AND).
 */
export function filterAndRankResults(
    pool: AllDataItem[],
    query: string,
    selectedListId: string | null,
    starredOnly: boolean,
    opts?: { status?: StatusFilter; tag?: string | null },
): SearchResult[] {
    const status = opts?.status ?? 'all';
    const tag = opts?.tag ?? null;
    const trimmed = query.trim().toLowerCase();

    let filtered = pool;
    if (selectedListId) {
        filtered = filtered.filter(item => item.listId === selectedListId);
    }
    if (starredOnly) {
        filtered = filtered.filter(item => item.word.isStarred);
    }
    if (status === 'learning') {
        filtered = filtered.filter(item => !item.word.isMemorized);
    } else if (status === 'memorized') {
        filtered = filtered.filter(item => item.word.isMemorized);
    }
    if (tag) {
        filtered = filtered.filter(item => item.word.tags?.includes(tag));
    }

    if (!trimmed) {
        const browse = starredOnly || !!selectedListId || status !== 'all' || !!tag;
        return browse
            ? filtered.map(item => ({ ...item, isTagMatch: false, isDefinitionMatch: false, score: 0 }))
            : [];
    }

    const results: SearchResult[] = [];
    for (const item of filtered) {
        const w = item.word;
        const termMatch = w.term.toLowerCase().includes(trimmed);
        const meaningKrMatch = w.meaningKr.toLowerCase().includes(trimmed);
        const definitionMatch = w.definition.toLowerCase().includes(trimmed);
        const tagMatch = w.tags?.some(tag => tag.toLowerCase().includes(trimmed)) ?? false;

        if (termMatch || meaningKrMatch || definitionMatch || tagMatch) {
            results.push({
                ...item,
                isTagMatch: tagMatch && !termMatch && !meaningKrMatch,
                isDefinitionMatch: definitionMatch && !termMatch && !meaningKrMatch && !tagMatch,
                score: getRelevanceScore(w, trimmed),
            });
        }
    }

    results.sort((a, b) => a.score - b.score);
    return results;
}

/**
 * 전체 데이터에서 사용 빈도 상위 N개의 태그를 반환.
 */
export function getTopTags(allData: AllDataItem[], limit = 5): string[] {
    const tagCount: Record<string, number> = {};
    allData.forEach(({ word }) => {
        word.tags?.forEach(tag => {
            tagCount[tag] = (tagCount[tag] || 0) + 1;
        });
    });
    return Object.entries(tagCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(entry => entry[0]);
}
