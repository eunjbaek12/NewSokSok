import { z } from 'zod';

// ============================================================================
// Shared primitives
// ============================================================================

export const EpochMsSchema = z.number().int().nonnegative();
export const NullableEpochMsSchema = EpochMsSchema.nullable();

// ============================================================================
// Auth
// ============================================================================

export const AuthModeSchema = z.enum(['none', 'guest', 'google']);
export type AuthMode = z.infer<typeof AuthModeSchema>;

export const GoogleUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  isAdmin: z.boolean(),
  // Custom display name backed up to Supabase user_metadata. Optional so
  // auth states persisted before this field existed still parse (otherwise
  // onDrift would log existing users out on upgrade).
  nickname: z.string().nullable().optional(),
});
export type GoogleUser = z.infer<typeof GoogleUserSchema>;

export const AuthStateSchema = z.object({
  mode: AuthModeSchema,
  user: GoogleUserSchema.nullable(),
});
export type AuthState = z.infer<typeof AuthStateSchema>;

// ============================================================================
// Settings (AsyncStorage keys)
// ============================================================================

export const LanguageCodeSchema = z.enum(['en', 'ko', 'ja', 'zh', 'vi', 'es']);
export type LanguageCode = z.infer<typeof LanguageCodeSchema>;

const FIELD_ORDER_KEYS = ['term', 'meaningKr', 'pos', 'phonetic', 'definition', 'example', 'tags'] as const;

export const InputSettingsSchema = z.object({
  showDefinition: z.boolean().default(false),
  showPos: z.boolean().default(false),
  showExample: z.boolean().default(true),
  showTags: z.boolean().default(true),
  showPhonetic: z.boolean().default(true),
  addWordMode: z.enum(['popup', 'full']).default('popup'),
  fieldOrder: z.array(z.string()).default([...FIELD_ORDER_KEYS]).transform(arr => {
    const result = [...arr];
    for (const k of FIELD_ORDER_KEYS) {
      if (!result.includes(k)) result.push(k);
    }
    return result;
  }),
  sourceLang: LanguageCodeSchema.default('en'),
  targetLang: LanguageCodeSchema.default('ko'),
  enableAutocomplete: z.boolean().default(true),
  lastUsedListId: z.string().default(''),
});
export type InputSettings = z.infer<typeof InputSettingsSchema>;

export const StudySettingsSchema = z.object({
  studyBatchSize: z.union([z.number().int().positive(), z.literal('all')]).default('all'),
  sentenceBatchSize: z.union([z.number().int().positive(), z.literal('all')]).default('all'),
  shuffle: z.boolean().default(false),
  autoPlaySound: z.boolean().default(true),
});
export type StudySettings = z.infer<typeof StudySettingsSchema>;

export const AiDifficultySchema = z.enum(['beginner', 'intermediate', 'advanced']);
export type AiDifficulty = z.infer<typeof AiDifficultySchema>;

export const AiWordCountSchema = z.union([z.literal(10), z.literal(20), z.literal(30), z.literal(50)]);
export type AiWordCount = z.infer<typeof AiWordCountSchema>;

export const AiCurationSettingsSchema = z.object({
  sourceLang: LanguageCodeSchema.default('en'),
  targetLang: LanguageCodeSchema.default('ko'),
  difficulty: AiDifficultySchema.default('intermediate'),
  wordCount: AiWordCountSchema.default(20),
});
export type AiCurationSettings = z.infer<typeof AiCurationSettingsSchema>;

export const AutoPlaySettingsSchema = z.object({
  filter: z.enum(['all', 'learning', 'memorized']).default('all'),
  isStarred: z.boolean().default(false),
  showTerm: z.boolean().default(true),
  showMeaning: z.boolean().default(true),
  showPos: z.boolean().default(true),
  showExample: z.boolean().default(true),
  showExampleKr: z.boolean().default(true),
  autoPlaySound: z.boolean().default(true),
  delay: z.enum(['1s', '2s', '3s']).default('2s'),
  shuffle: z.boolean().default(false),
});
export type AutoPlaySettings = z.infer<typeof AutoPlaySettingsSchema>;

export const StartupTabSchema = z.enum(['index', 'vocab-lists', 'curation']);
export type StartupTab = z.infer<typeof StartupTabSchema>;

export const ProfileSettingsSchema = z.object({
  nickname: z.string().default(''),
  startupTab: StartupTabSchema.default('index'),
});
export type ProfileSettings = z.infer<typeof ProfileSettingsSchema>;

export const CustomStudySettingsSchema = z.object({
  useAllLists: z.boolean().default(true),
  selectedListIds: z.array(z.string()).default([]),
  selectedDaysByList: z.record(z.string(), z.union([z.array(z.number().int()), z.literal('all')])).default({}),
  wordFilter: z.enum(['all', 'learning', 'memorized', 'wrongCount', 'recent', 'starred']).default('all'),
  studyMode: z.enum(['flashcard', 'quiz']).default('flashcard'),
});
export type CustomStudySettings = z.infer<typeof CustomStudySettingsSchema>;

export const DashboardFilterSchema = z.enum(['all', 'studying', 'completed', 'finished']);
export type DashboardFilter = z.infer<typeof DashboardFilterSchema>;

export const ThemeModeSchema = z.enum(['classic', 'dark', 'y2k', 'lab']);
export type ThemeMode = z.infer<typeof ThemeModeSchema>;

export const UILocaleCodeSchema = z.enum(['ko', 'en']);
export type UILocaleCode = z.infer<typeof UILocaleCodeSchema>;

// ============================================================================
// Word / VocaList (local SQLite-mirrored)
// ============================================================================

// NOTE: 필드명 `meaningKr` / `exampleEn` / `exampleKr`은 레거시(한국어 전용 시절 잔재)이며 언어와 무관.
// 실제 의미: meaningKr = targetLang 뜻, exampleEn = sourceLang 예문, exampleKr = targetLang 예문 번역.
// SQLite 컬럼·Supabase 컬럼·sync 매핑·AI 응답 스키마가 전부 이 이름에 묶여 있어 단독 리네이밍 보류.
// 새 AI 프롬프트/필드 추가 시 같은 함정 주의 — `lib/ai/gemini-client.ts:analyzeWord` 패턴 참고.
export const WordSchema = z.object({
  id: z.string(),
  term: z.string(),
  definition: z.string().default(''),
  phonetic: z.string().optional(),
  pos: z.string().optional(),
  exampleEn: z.string().default(''),
  exampleKr: z.string().optional(),
  meaningKr: z.string().default(''),
  isMemorized: z.boolean().default(false),
  isStarred: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
  wrongCount: z.number().optional(),
  sourceListId: z.string().optional(),
  assignedDay: z.number().nullable().optional(),
  sourceLang: z.string().optional(),
  targetLang: z.string().optional(),
});
export type Word = z.infer<typeof WordSchema>;

export const PlanFilterSchema = z.enum(['all', 'unmemorized', 'memorized']);

export const VocaListSchema = z.object({
  id: z.string(),
  title: z.string(),
  words: z.array(WordSchema).default([]),
  isVisible: z.boolean().default(true),
  createdAt: z.number(),
  lastStudiedAt: z.number().optional(),
  position: z.number().optional(),
  isCurated: z.boolean().optional(),
  icon: z.string().optional(),
  isUserShared: z.boolean().optional(),
  creatorId: z.string().nullable().optional(),
  creatorName: z.string().optional(),
  downloadCount: z.number().optional(),
  planTotalDays: z.number().optional(),
  planCurrentDay: z.number().optional(),
  planWordsPerDay: z.number().optional(),
  planStartedAt: z.number().optional(),
  planUpdatedAt: z.number().optional(),
  planFilter: PlanFilterSchema.optional(),
  category: z.string().optional(),
  level: z.string().optional(),
  description: z.string().optional(),
  sourceLanguage: z.string().optional(),
  targetLanguage: z.string().optional(),
  lastResultMemorized: z.number().optional(),
  lastResultTotal: z.number().optional(),
  lastResultPercent: z.number().optional(),
});
export type VocaList = z.infer<typeof VocaListSchema>;

export const StudyResultSchema = z.object({
  word: WordSchema,
  gotIt: z.boolean(),
});
export type StudyResult = z.infer<typeof StudyResultSchema>;

// ============================================================================
// AI (Gemini) responses — unified across server/gemini.ts and lib/types.ts
// ============================================================================

// Tag injected into every AI-generated word. Used by ListCard to detect
// AI-origin lists and render the AI-generated badge.
export const AI_GENERATED_TAG = 'AI생성';

// Receive-side ("lenient") limits — applied to AI responses and cloud pulls to
// reject obviously runaway payloads while still tolerating values that a save
// (strict) schema would reject. Save-time validation happens in WordSaveSchema.
// Convention: lenient = strict × 3.
export const AIWordResultSchema = z.object({
  term: z.string().max(150),
  definition: z.string().max(1500),
  exampleEn: z.string().max(900),
  exampleKr: z.string().max(900).optional(),
  meaningKr: z.string().max(900),
  mnemonic: z.string().max(900).optional(),
  pos: z.string().max(60).optional(),
  phonetic: z.string().max(240).optional(),
  tags: z.array(z.string().max(60)).optional(),
});
export type AIWordResult = z.infer<typeof AIWordResultSchema>;

export const AIAutoFillResultSchema = z.object({
  definition: z.string().max(1500),
  meaningKr: z.string().max(900),
  exampleEn: z.string().max(900),
  exampleKr: z.string().max(900).optional(),
  mnemonic: z.string().max(900).optional(),
  pos: z.string().max(60).optional(),
  phonetic: z.string().max(240).optional(),
});

export const ThemeListItemSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  category: z.string().optional(),
  level: z.string().optional(),
});

export const ThemeListSchema = z.object({
  themes: z.array(ThemeListItemSchema),
});
export type ThemeList = z.infer<typeof ThemeListSchema>;

export const GenerateMoreResultSchema = z.object({
  words: z.array(AIWordResultSchema),
});
export type GenerateMoreResult = z.infer<typeof GenerateMoreResultSchema>;

// Image OCR returns a bare array of surface-form words.
// 의미·예문 등은 추출 후 사전(Naver)·Gemini 단어분석으로 별도 보강한다.
export const GeminiImageWordSchema = z.object({
  word: z.string(),
}).passthrough();

export const GeminiImageResultSchema = z.array(GeminiImageWordSchema);
export type GeminiImageResult = z.infer<typeof GeminiImageResultSchema>;

// ============================================================================
// Save-time ("strict") validation schemas
// ----------------------------------------------------------------------------
// These are invoked at write boundaries (addWord, shareCuration, profile save).
// They are NOT used for read parsing — read schemas remain lenient to preserve
// backward compatibility with rows written before these limits were introduced.
// ============================================================================

// Bans C0/C1 control characters (NUL, LF, CR, TAB, …) which can be used for
// display spoofing or break renderers. Visible whitespace stays allowed.
const NO_CONTROL = /^[^\x00-\x1F\x7F-\x9F]*$/;

export const WordSaveSchema = z.object({
  term: z.string().min(1).max(50).regex(NO_CONTROL),
  definition: z.string().max(500).regex(NO_CONTROL).optional().default(''),
  meaningKr: z.string().max(300).regex(NO_CONTROL).optional().default(''),
  exampleEn: z.string().max(300).regex(NO_CONTROL).optional().default(''),
  exampleKr: z.string().max(300).regex(NO_CONTROL).optional(),
  phonetic: z.string().max(80).regex(NO_CONTROL).optional(),
  pos: z.string().max(60).regex(NO_CONTROL).optional(),
});
export type WordSaveInput = z.infer<typeof WordSaveSchema>;

export const CurationShareSchema = z.object({
  title: z.string().min(1).max(80).regex(NO_CONTROL),
  description: z.string().max(300).regex(NO_CONTROL).optional(),
  creatorName: z.string().min(1).max(20).regex(NO_CONTROL),
});
export type CurationShareInput = z.infer<typeof CurationShareSchema>;

export const NicknameSchema = z.string().max(20).regex(NO_CONTROL);

// ============================================================================
// Cloud sync row schemas (matches Supabase cloud_lists / cloud_words columns)
// ============================================================================

export const CloudListSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  isVisible: z.boolean(),
  isCurated: z.boolean(),
  icon: z.string().nullable(),
  position: z.number().int(),
  planTotalDays: z.number().int(),
  planCurrentDay: z.number().int(),
  planWordsPerDay: z.number().int(),
  planStartedAt: EpochMsSchema.nullable(),
  planUpdatedAt: EpochMsSchema.nullable(),
  planFilter: z.string(),
  sourceLanguage: z.string(),
  targetLanguage: z.string(),
  lastResultMemorized: z.number().int(),
  lastResultTotal: z.number().int(),
  lastResultPercent: z.number().int(),
  lastStudiedAt: EpochMsSchema.nullable(),
  isUserShared: z.boolean(),
  creatorId: z.string().nullable(),
  creatorName: z.string().nullable(),
  downloadCount: z.number().int(),
  createdAt: EpochMsSchema,
  updatedAt: EpochMsSchema,
  deletedAt: EpochMsSchema.nullable(),
});
export type CloudList = z.infer<typeof CloudListSchema>;

export const CloudWordSchema = z.object({
  id: z.string(),
  listId: z.string(),
  userId: z.string(),
  term: z.string(),
  definition: z.string(),
  phonetic: z.string().nullable(),
  pos: z.string().nullable(),
  exampleEn: z.string(),
  exampleKr: z.string().nullable(),
  meaningKr: z.string(),
  isMemorized: z.boolean(),
  isStarred: z.boolean(),
  tags: z.string().nullable(),
  position: z.number().int(),
  wrongCount: z.number().int(),
  assignedDay: z.number().int().nullable(),
  sourceLang: z.string(),
  targetLang: z.string(),
  createdAt: EpochMsSchema,
  updatedAt: EpochMsSchema,
  deletedAt: EpochMsSchema.nullable(),
});
export type CloudWord = z.infer<typeof CloudWordSchema>;

// ============================================================================
// Curations (frontend-initiated)
// ============================================================================

// Supabase returns `curated_themes` row + joined `words` array. Kept permissive
// (`.passthrough()`) because the UI treats these as VocaList-shaped; only the
// fields we actually branch on are strict.
export const CuratedThemeWithWordsSchema = z.object({
  id: z.string(),
  title: z.string(),
  words: z.array(z.unknown()),
}).passthrough();
export type CuratedThemeWithWords = z.infer<typeof CuratedThemeWithWordsSchema>;

// ============================================================================
// External API responses (passthrough — only validate core fields we read)
// ============================================================================

export const TranslationApiResponseSchema = z.object({
  translatedText: z.string().optional(),
  message: z.object({
    result: z.object({
      translatedText: z.string(),
    }).passthrough(),
  }).passthrough().optional(),
}).passthrough();

export const NaverDictSearchItemSchema = z.object({
  entryId: z.string().optional(),
  handleEntry: z.string().optional(),
  meansCollector: z.array(z.any()).optional(),
}).passthrough();

export const NaverDictResponseSchema = z.object({
  searchResultMap: z.object({
    searchResultListMap: z.object({
      WORD: z.object({
        items: z.array(NaverDictSearchItemSchema).optional(),
      }).passthrough().optional(),
    }).passthrough(),
  }).passthrough(),
}).passthrough();

export const DatamuseWordSchema = z.object({
  word: z.string(),
  score: z.number().optional(),
}).passthrough();

export const DatamuseResponseSchema = z.array(DatamuseWordSchema);
