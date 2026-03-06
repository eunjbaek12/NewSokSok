export interface Word {
  id: string;
  term: string;
  definition: string;
  exampleEn: string;
  exampleKr?: string;
  meaningKr: string;
  isMemorized: boolean;
  isStarred: boolean;
  tags: string[];
}

export interface VocaList {
  id: string;
  title: string;
  words: Word[];
  isVisible: boolean;
  createdAt: number;
  lastStudiedAt?: number;
  isCurated?: boolean;
  icon?: string;
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
}

export interface AIWordResult {
  term: string;
  definition: string;
  exampleEn: string;
  exampleKr?: string;
  meaningKr: string;
  tags?: string[];
}
