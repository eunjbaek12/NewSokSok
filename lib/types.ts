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
  creatorName?: string;
  downloadCount?: number;
  planTotalDays?: number;
  planCurrentDay?: number;
  planWordsPerDay?: number;
  planStartedAt?: number;
  planUpdatedAt?: number;
}

export interface StudyResult {
  word: Word;
  gotIt: boolean;
}

export type StudyMode = 'flashcards' | 'quiz' | 'examples' | 'shadowing';

export type ThemeMode = 'light' | 'dark';

export interface AutoFillResult {
  definition: string;
  meaningKr: string;
  exampleEn: string;
  exampleKr?: string;
  mnemonic?: string;
  pos?: string;
  phonetic?: string;
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
