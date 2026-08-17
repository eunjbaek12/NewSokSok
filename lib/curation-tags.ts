import type { VocaList, Word } from '@/lib/types';

// 큐레이션 카드에 붙는 태그 칩(상위 3개)을 고른다.
//
// 왜 공용 모듈인가: 덱을 서버로 옮기면서 이 값이 두 곳에서 필요해졌다 —
//   1. 앱: 커뮤니티 덱은 단어를 전부 들고 있으므로 그 자리에서 집계한다.
//   2. 시딩: 공식 덱은 목록 응답에 단어를 싣지 않으므로(27KB 유지) 미리 계산해
//      official_themes.top_tags 에 넣어 둔다.
// 규칙을 복제하면 같은 덱인데 공식 탭과 커뮤니티 탭의 칩이 달라지고, 그 차이는
// 서버 데이터를 다시 만들기 전까지 고쳐지지 않는다.

export interface TagSource {
  words: Pick<Word, 'tags'>[];
  category?: string;
}

export const TOP_TAG_COUNT = 3;

/**
 * 단어들의 tags 를 빈도로 집계해 상위 3개를 돌려준다.
 * category 가 집계에 없으면 전체 단어 수를 가중치로 넣어 후보에 포함한다 —
 * 태그가 없는 덱에서도 최소한 분류는 보이게 하려던 원래 동작이다.
 */
export function getTopTags(theme: TagSource): string[] {
  const counts: Record<string, number> = {};
  for (const w of theme.words) {
    if (!w.tags) continue;
    for (const tag of w.tags) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  if (theme.category && !counts[theme.category]) {
    counts[theme.category] = theme.words.length;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_TAG_COUNT)
    .map(e => e[0]);
}

/** 서버에서 받은 공식 덱 메타는 top_tags 를 이미 갖고 있다. 카드가 두 소스를 같은
 *  모양으로 읽도록 좁히는 어댑터. */
export function resolveTopTags(
  theme: Pick<VocaList, 'category'> & { words?: Pick<Word, 'tags'>[]; topTags?: string[] },
): string[] {
  if (theme.topTags) return theme.topTags.slice(0, TOP_TAG_COUNT);
  if (!theme.words) return [];
  return getTopTags({ words: theme.words, category: theme.category });
}
