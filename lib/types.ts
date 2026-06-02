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
