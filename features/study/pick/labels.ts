// 조건을 사람이 읽는 한 줄로 옮긴다.
//
// 범위 칩은 접힌 채로 화면에 남아 "목록이 왜 137개인지" 설명하는 유일한
// 자리이고, 지난번 조건 줄은 눌렀을 때 무엇이 걸릴지 미리 말해주는 자리다.
// 둘 다 문구가 곧 기능이라 조립을 한 곳에 모은다.

import type { VocaList } from '@/lib/types';
import { displayTag } from '@/lib/tag-display';
import { POS_ALL } from '@/lib/pos';
import { PRESET_LIMIT, summarizeScope, type PickFilters, type ScopeSummary } from './filter';

type T = (key: string, opts?: any) => string;

/** 범위 칩 문구. 단어장 이름만 말하고 Day를 빠뜨리면 범위가 걸린 줄 모른 채 학습을 시작하게 된다. */
export function scopeLabel(summary: ScopeSummary, t: T): string {
  switch (summary.kind) {
    case 'all':
      return t('search.scopeAllLists');
    case 'none':
      return t('search.scopeNone');
    case 'single':
      return summary.name;
    case 'singleDayRange':
      return summary.from === summary.to
        ? t('search.scopeDayOne', { name: summary.name, day: summary.from })
        : t('search.scopeDayRange', { name: summary.name, from: summary.from, to: summary.to });
    case 'singleDayCount':
      return t('search.scopeDayCount', { name: summary.name, count: summary.count });
    case 'multi':
      return t('search.scopeMulti', { name: summary.name, rest: summary.rest });
    case 'multiPartialDays':
      return t('search.scopeMultiPartialDays', { name: summary.name, rest: summary.rest });
  }
}

/** 상태 줄에서 고른 값 하나의 이름. 프리셋은 상한을 라벨에 그대로 달고 다닌다. */
export function wordFilterLabel(wordFilter: PickFilters['wordFilter'], t: T): string {
  switch (wordFilter) {
    case 'all':
      return t('search.filterAll');
    case 'learning':
      return t('search.filterLearning');
    case 'memorized':
      return t('search.filterMemorized');
    case 'wrongCount':
      return `${t('search.presetWrong')} ${PRESET_LIMIT}`;
    case 'recent':
      return `${t('search.presetRecent')} ${PRESET_LIMIT}`;
  }
}

/**
 * 지난번 조건 한 줄. 범위는 전체 단어장이어도 적는다 — 무엇이 걸리는지가
 * 아니라 무엇으로 학습했는지를 되짚는 줄이라, 범위가 빠지면 조합이 반쪽이 된다.
 */
export function conditionLabel(filters: PickFilters, visibleLists: VocaList[], t: T): string {
  const parts: string[] = [];
  if (filters.wordFilter !== 'all') parts.push(wordFilterLabel(filters.wordFilter, t));
  if (filters.starredOnly) parts.push(t('search.starredChip'));
  if (filters.posFilter !== POS_ALL) parts.push(t(`pos.${filters.posFilter}`));
  if (filters.tag) parts.push(`#${displayTag(filters.tag, t)}`);
  parts.push(scopeLabel(summarizeScope(visibleLists, filters), t));
  return parts.join(' · ');
}
