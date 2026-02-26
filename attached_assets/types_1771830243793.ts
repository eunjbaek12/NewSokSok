export interface Word {
  id: string;
  term: string;
  definition: string;
  exampleEn: string;
  meaningKr: string;
  isMemorized: boolean;
}

export interface VocaList {
  id: string;
  title: string;
  words: Word[];
  isVisible: boolean; // For hide/show functionality
  createdAt: number;
  lastStudiedAt?: number;
}

export interface User {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  LIST_DETAILS = 'LIST_DETAILS',
  STUDY_MODE = 'STUDY_MODE', // New Study Mode
  ADD_WORD = 'ADD_WORD',
  AI_THEME = 'AI_THEME',
  LIST_MANAGER = 'LIST_MANAGER',
  LOGIN = 'LOGIN',
}

export interface AIWordResult {
  term: string;
  definition: string;
  exampleEn: string;
  meaningKr: string;
}