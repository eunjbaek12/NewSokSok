// 골라서 학습 · 내 단어 검색 — 조건에서 단어 집합을 만드는 순수 로직.
//
// 화면 하나를 두 진입점이 공유한다(검색으로 들어오면 찾기 자세, 홈 카드로
// 들어오면 조건부터 고르는 자세). 무엇이 걸러지는지는 두 자세가 완전히 같아야
// 하므로 계산은 전부 여기 모으고, 화면은 그리기만 한다.

import type { VocaList, Word } from '@/lib/types';
import type { PickFilters } from '@shared/contracts';
import {
  filterAndRankResults,
  type AllDataItem,
  type SearchResult,
  type StatusFilter,
} from '@/lib/search';
import { matchesPosFilter, POS_ALL } from '@/lib/pos';

export type { PickFilters };

/**
 * 프리셋 칩 둘만 상한이 있다. "찾은 수와 학습하는 수는 같다"는 원칙의 유일한
 * 예외라, 칩 라벨에 이 숫자를 그대로 박아 드러낸다.
 */
export const PRESET_LIMIT = 50;

/**
 * 상태 줄의 단일 선택군. 앞의 셋은 조건에 맞는 것을 다 가져오는 필터지만
 * 뒤의 둘은 정렬한 뒤 앞에서 PRESET_LIMIT개를 끊는 프리셋이다.
 */
export type WordFilter = PickFilters['wordFilter'];

/** 상태 줄에서 구분선 뒤에 오는, 상한이 붙은 칩 둘. */
export const PRESET_FILTERS: WordFilter[] = ['wrongCount', 'recent'];

export const DEFAULT_PICK_FILTERS: PickFilters = {
  wordFilter: 'all',
  starredOnly: false,
  posFilter: POS_ALL,
  tag: null,
  useAllLists: true,
  selectedListIds: [],
  selectedDaysByList: {},
};

/** 범위(단어장·Day)만 적용해 검색 풀을 만든다. 숨긴 단어장은 호출부에서 이미 빠져 있다. */
export function collectScopeItems(visibleLists: VocaList[], filters: PickFilters): AllDataItem[] {
  const sourceLists = filters.useAllLists
    ? visibleLists
    : visibleLists.filter(l => filters.selectedListIds.includes(l.id));

  const items: AllDataItem[] = [];
  for (const list of sourceLists) {
    const days = filters.selectedDaysByList[list.id];
    const useDays = Array.isArray(days) && days.length > 0;
    for (const word of list.words) {
      if (useDays && (word.assignedDay == null || !days.includes(word.assignedDay))) continue;
      items.push({ word, listName: list.title, listId: list.id });
    }
  }
  return items;
}

/** 프리셋을 뺀 암기 상태. 프리셋은 상태로 거르지 않고 정렬·절단으로만 작용한다. */
function statusOf(wordFilter: WordFilter): StatusFilter {
  return wordFilter === 'wrongCount' || wordFilter === 'recent' ? 'all' : wordFilter;
}

/**
 * 프리셋 정렬 + 상한. 정렬 키가 같을 때의 순서는 입력 순서를 따른다(안정 정렬).
 */
function applyPreset(results: SearchResult[], wordFilter: WordFilter): SearchResult[] {
  if (wordFilter === 'wrongCount') {
    return results
      .filter(r => (r.word.wrongCount ?? 0) > 0)
      .sort((a, b) => (b.word.wrongCount ?? 0) - (a.word.wrongCount ?? 0))
      .slice(0, PRESET_LIMIT);
  }
  if (wordFilter === 'recent') {
    return [...results]
      .sort((a, b) => (b.word.createdAt ?? 0) - (a.word.createdAt ?? 0))
      .slice(0, PRESET_LIMIT);
  }
  return results;
}

/**
 * 풀 → 최종 결과. 텍스트 질의의 관련도 정렬은 lib/search가 그대로 담당하고,
 * 이 함수는 그 앞뒤로 품사·프리셋을 붙인다.
 *
 * `browse`는 질의가 비었을 때 전체를 보여줄지 여부다. 조건으로 고르는 자세로
 * 열렸으면(진입 B) 항상 켠다 — 아무것도 안 걸린 상태에서 전체 목록이 보여야
 * "여기서 몇 개를 학습하게 되는지"가 첫 화면에서 읽힌다.
 */
export function selectPickResults(
  pool: AllDataItem[],
  query: string,
  filters: PickFilters,
  browse = false,
): SearchResult[] {
  const posActive = filters.posFilter !== POS_ALL;
  const presetActive = filters.wordFilter === 'wrongCount' || filters.wordFilter === 'recent';

  const ranked = filterAndRankResults(pool, query, null, filters.starredOnly, {
    status: statusOf(filters.wordFilter),
    tag: filters.tag,
    browse: browse || posActive || presetActive,
  });

  const byPos = posActive
    ? ranked.filter(r => matchesPosFilter(r.word.pos, filters.posFilter))
    : ranked;

  return applyPreset(byPos, filters.wordFilter);
}

/**
 * 기본값이 아닌 값의 개수. 칩이 네 줄이면 무엇이 켜져 있는지 훑지 않게 되므로
 * 결과 줄이 이 숫자를 대신 말해준다.
 */
export function countActiveFilters(filters: PickFilters): number {
  let n = 0;
  if (filters.wordFilter !== 'all') n++;
  if (filters.starredOnly) n++;
  if (filters.posFilter !== POS_ALL) n++;
  if (filters.tag) n++;
  if (!filters.useAllLists) n++;
  return n;
}

export function hasActiveFilters(filters: PickFilters): boolean {
  return countActiveFilters(filters) > 0;
}

/** 연속된 Day는 3–5로, 띄엄띄엄이면 개수로 요약하기 위한 판정. */
function isConsecutive(days: number[]): boolean {
  for (let i = 1; i < days.length; i++) {
    if (days[i] !== days[i - 1] + 1) return false;
  }
  return true;
}

export type ScopeSummary =
  | { kind: 'all' }
  | { kind: 'none' }
  /** 단어장 하나 — Day 전체 */
  | { kind: 'single'; name: string }
  /** 단어장 하나 — Day 연속 구간 */
  | { kind: 'singleDayRange'; name: string; from: number; to: number }
  /** 단어장 하나 — Day가 이어지지 않을 때 */
  | { kind: 'singleDayCount'; name: string; count: number }
  /** 여러 개 — Day는 전부 */
  | { kind: 'multi'; name: string; rest: number }
  /** 여러 개 — 일부 단어장에 Day가 걸림 */
  | { kind: 'multiPartialDays'; name: string; rest: number };

/**
 * 범위 칩이 무엇을 말해야 하는지 결정한다. 칩이 접힌 상태로 화면에 남아
 * "목록이 왜 137개인지" 설명하는 유일한 자리이므로 Day까지 말한다.
 *
 * 문구 조립은 하지 않는다 — 화면이 i18n으로 옮긴다.
 */
export function summarizeScope(visibleLists: VocaList[], filters: PickFilters): ScopeSummary {
  if (filters.useAllLists) return { kind: 'all' };

  const chosen = visibleLists.filter(l => filters.selectedListIds.includes(l.id));
  if (chosen.length === 0) return { kind: 'none' };

  const daysOf = (listId: string): number[] | null => {
    const d = filters.selectedDaysByList[listId];
    return Array.isArray(d) && d.length > 0 ? [...d].sort((a, b) => a - b) : null;
  };

  if (chosen.length === 1) {
    const list = chosen[0];
    const days = daysOf(list.id);
    if (!days) return { kind: 'single', name: list.title };
    if (days.length === 1) return { kind: 'singleDayRange', name: list.title, from: days[0], to: days[0] };
    if (isConsecutive(days)) {
      return { kind: 'singleDayRange', name: list.title, from: days[0], to: days[days.length - 1] };
    }
    return { kind: 'singleDayCount', name: list.title, count: days.length };
  }

  const anyDays = chosen.some(l => daysOf(l.id) !== null);
  const rest = chosen.length - 1;
  return anyDays
    ? { kind: 'multiPartialDays', name: chosen[0].title, rest }
    : { kind: 'multi', name: chosen[0].title, rest };
}

/**
 * 조건 한 벌의 동등 비교용 키. 같은 조합을 다시 쓰면 지난번 조건에 새로 쌓지
 * 않고 맨 위로 올리기 위한 것이라, 결과가 같아지는 표현 차이는 흡수한다 —
 * 전체 단어장이면 선택 목록을 보지 않고, 목록·Day 순서도 정렬해 지운다.
 */
export function pickFiltersKey(filters: PickFilters): string {
  const scope = filters.useAllLists
    ? 'all'
    : [...filters.selectedListIds]
        .sort()
        .map(id => {
          const days = filters.selectedDaysByList[id];
          const d = Array.isArray(days) ? [...days].sort((a, b) => a - b).join('.') : 'all';
          return `${id}:${d}`;
        })
        .join(',');
  return [filters.wordFilter, filters.starredOnly ? 'S' : '-', filters.posFilter, filters.tag ?? '-', scope].join('|');
}

/** 저장된 조건이 아직 가리킬 곳이 있는지. 단어장이 지워졌으면 그 줄은 버린다. */
export function scopeStillExists(visibleLists: VocaList[], filters: PickFilters): boolean {
  if (filters.useAllLists) return true;
  return filters.selectedListIds.some(id => visibleLists.some(l => l.id === id));
}

/** 학습으로 넘길 단어. 결과는 자르지 않는다 — 세션을 끊는 일은 배치 설정이 한다. */
export function resultsToWords(results: SearchResult[]): Word[] {
  return results.map(r => r.word);
}

/** 학습 순서 섞기. 목록의 정렬(관련도·오답 순)은 고르는 동안의 것이지 외우는 순서가 아니다. */
export function shuffleWords<T>(words: T[]): T[] {
  const a = [...words];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
