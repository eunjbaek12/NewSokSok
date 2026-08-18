import type { VocaList, Word } from '@/lib/types';
import { getTopTags } from '@/lib/curation-tags';
import type { OfficialThemeMeta } from './catalog';

// 큐레이션 목록 카드가 읽는 최소 모양.
//
// 왜 필요한가: 공식 탭과 커뮤니티 탭은 한 화면에서 같은 카드로 그려지는데, 덱을
// 서버로 옮기면서 **공식 덱만 목록 단계에서 단어를 안 들고 오게** 됐다(27KB 유지).
// 한쪽만 바꾸면 카드 렌더가 두 갈래로 갈라지므로, 두 소스를 이 타입으로 좁혀서
// 넘긴다 — 커뮤니티 덱도 여기 맞춰 미리 집계한다.
//
// words 는 커뮤니티에만 있다. 공식 덱의 단어는 카드를 눌렀을 때 fetchOfficialDeck
// 으로 따로 받는다.
export interface CurationCard {
  id: string;
  title: string;
  icon?: string;
  description?: string;
  category?: string;
  level?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  /** 목록 카드의 "N단어" 표시. 공식은 서버가 세어 둔 값, 커뮤니티는 words.length. */
  wordCount: number;
  /** 카드 하단 태그 칩. 공식은 서버가 집계해 둔 값, 커뮤니티는 그 자리에서 집계. */
  topTags: string[];
  isAiGenerated?: boolean;
  /** 커뮤니티 전용 — 작성자 표시와 삭제 권한 판정에 쓰인다. */
  creatorId?: string | null;
  creatorName?: string;
  /** 커뮤니티·AI 덱은 단어를 그 자리에서 들고 있다. 공식만 undefined — 상세로 들어갈 때 받는다. */
  words?: Word[];
  /** 덱이 어디서 왔는지. 상세 화면이 단어를 받아올 곳을 정할 때 쓴다. */
  source: 'official' | 'community' | 'ai';
}

export function officialToCard(meta: OfficialThemeMeta): CurationCard {
  return {
    id: meta.id,
    title: meta.title,
    icon: meta.icon,
    description: meta.description,
    category: meta.category,
    level: meta.level,
    sourceLanguage: meta.sourceLanguage,
    targetLanguage: meta.targetLanguage,
    wordCount: meta.wordCount,
    topTags: meta.topTags,
    source: 'official',
  };
}

export function communityToCard(theme: VocaList): CurationCard {
  const words = theme.words ?? [];
  return {
    id: theme.id,
    title: theme.title,
    icon: theme.icon,
    description: theme.description,
    category: theme.category,
    level: theme.level,
    sourceLanguage: theme.sourceLanguage,
    targetLanguage: theme.targetLanguage,
    wordCount: words.length,
    topTags: getTopTags({ words, category: theme.category }),
    isAiGenerated: theme.isAiGenerated,
    creatorId: theme.creatorId,
    creatorName: theme.creatorName,
    words,
    source: 'community',
  };
}
