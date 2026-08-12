import type { WordSense } from '@shared/contracts';

export type PlanStatus = 'none' | 'in-progress' | 'completed' | 'overdue' | 'inactive';

export interface Word {
  id: string;
  term: string;
  definition: string;
  phonetic?: string;
  pos?: string;
  exampleEn: string;
  exampleKr?: string;
  meaningKr: string;
  isMemorized: boolean;
  isStarred: boolean;
  tags: string[];
  createdAt?: number;
  updatedAt?: number;
  wrongCount?: number;
  sourceListId?: string;
  assignedDay?: number | null;
  sourceLang?: string;
  targetLang?: string;
  /** 마지막으로 이 단어를 학습한 시각(epoch ms). null = 학습 이력 없음. 복습 due 판정의 기준. */
  lastReviewedAt?: number | null;
  /** "외웠어요" 누적 횟수. 복습 간격 사다리(3/10/30/90일)의 위치. */
  reviewSuccessCount?: number;
}

export interface VocaList {
  id: string;
  title: string;
  words: Word[];
  isVisible: boolean;
  createdAt: number;
  lastStudiedAt?: number;
  position?: number;
  isCurated?: boolean;
  icon?: string;
  isUserShared?: boolean;
  creatorId?: string | null;
  creatorName?: string;
  downloadCount?: number;
  planTotalDays?: number;
  planCurrentDay?: number;
  planWordsPerDay?: number;
  planStartedAt?: number;
  planUpdatedAt?: number;
  planFilter?: 'all' | 'unmemorized' | 'memorized';
  category?: string;
  level?: string;
  description?: string;
  isAiGenerated?: boolean;
  sourceLanguage?: string;
  targetLanguage?: string;
  lastResultMemorized?: number;
  lastResultTotal?: number;
  lastResultPercent?: number;
}

export interface StudyResult {
  word: Word;
  gotIt: boolean;
}

export type StudyMode = 'flashcards' | 'quiz' | 'examples';

export type ThemeMode = 'classic' | 'dark' | 'y2k' | 'lab';

export interface AutoFillResult {
  enrichmentLevel?: 'basic' | 'full';
  definition: string;
  meaningKr: string;
  exampleEn: string;
  exampleKr?: string;
  mnemonic?: string;
  pos?: string;
  phonetic?: string;
  // 모델이 "이 단어는 사전에 존재하지 않는다"고 판단한 경우 false.
  // true/undefined는 실재로 간주. UI 분기(찾지 못함 vs 자동완성 실패)용.
  isReal?: boolean;
  // 동음이의어 뜻 후보(2개 이상일 때만 존재). 상위 필드는 병기(①②) 결과 그대로이고,
  // add-word가 이 배열로 인라인 뜻 제안 칩을 띄운다. lib/senses.ts 참조.
  senses?: WordSense[];
}

export interface AIWordResult {
  term: string;
  definition: string;
  exampleEn: string;
  exampleKr?: string;
  meaningKr: string;
  mnemonic?: string;
  tags?: string[];
}
