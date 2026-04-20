export type {
  AuthMode,
  AuthState,
  GoogleUser,
  InputSettings,
  StudySettings,
  AutoPlaySettings,
  ProfileSettings,
  CustomStudySettings,
  StartupTab,
  DashboardFilter,
  ThemeMode,
  UILocaleCode,
  LanguageCode,
  Word,
  VocaList,
  StudyResult,
  AIWordResult,
  ThemeList,
  GenerateMoreResult,
  GeminiImageResult,
  CloudList,
  CloudWord,
  CloudListPush,
  CloudWordPush,
  SyncPullQuery,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
} from './contracts';

export type PlanStatus = 'none' | 'in-progress' | 'completed' | 'overdue' | 'inactive';

export type StudyMode = 'flashcards' | 'quiz' | 'examples';

export interface AutoFillResult {
  definition: string;
  meaningKr: string;
  exampleEn: string;
  exampleKr?: string;
  mnemonic?: string;
  pos?: string;
  phonetic?: string;
}
