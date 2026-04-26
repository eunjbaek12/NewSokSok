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
  googleId: z.string(),
  email: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  isAdmin: z.boolean(),
});
export type GoogleUser = z.infer<typeof GoogleUserSchema>;

export const AuthStateSchema = z.object({
  mode: AuthModeSchema,
  user: GoogleUserSchema.nullable(),
  token: z.string().nullable(),
});
export type AuthState = z.infer<typeof AuthStateSchema>;

export const GoogleAuthRequestSchema = z.object({
  accessToken: z.string().min(1),
});

export const GoogleAuthResponseSchema = z.object({
  user: GoogleUserSchema,
  token: z.string(),
});

export const JwtPayloadSchema = z.object({
  userId: z.string(),
  exp: z.number().optional(),
  iat: z.number().optional(),
});

// ============================================================================
// Settings (AsyncStorage keys)
// ============================================================================

export const LanguageCodeSchema = z.enum(['en', 'ko', 'ja', 'zh']);
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
});
export type InputSettings = z.infer<typeof InputSettingsSchema>;

export const StudySettingsSchema = z.object({
  studyBatchSize: z.union([z.number().int().positive(), z.literal('all')]).default('all'),
  sentenceBatchSize: z.union([z.number().int().positive(), z.literal('all')]).default('all'),
  shuffle: z.boolean().default(false),
  autoPlaySound: z.boolean().default(true),
});
export type StudySettings = z.infer<typeof StudySettingsSchema>;

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
  geminiApiKey: z.string().default(''),
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

export const ThemeModeSchema = z.enum(['light', 'dark']);
export type ThemeMode = z.infer<typeof ThemeModeSchema>;

export const UILocaleCodeSchema = z.enum(['ko', 'en']);
export type UILocaleCode = z.infer<typeof UILocaleCodeSchema>;

// ============================================================================
// Word / VocaList (local SQLite-mirrored)
// ============================================================================

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

export const AIWordResultSchema = z.object({
  term: z.string(),
  definition: z.string(),
  exampleEn: z.string(),
  exampleKr: z.string().optional(),
  meaningKr: z.string(),
  mnemonic: z.string().optional(),
  pos: z.string().optional(),
  phonetic: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
export type AIWordResult = z.infer<typeof AIWordResultSchema>;

export const AIThemeGenerateResponseSchema = z.object({
  title: z.string(),
  words: z.array(AIWordResultSchema),
});
export type AIThemeGenerateResponse = z.infer<typeof AIThemeGenerateResponseSchema>;

export const AIWordResultArraySchema = z.array(AIWordResultSchema);

export const AIAutoFillResultSchema = z.object({
  definition: z.string(),
  meaningKr: z.string(),
  exampleEn: z.string(),
  exampleKr: z.string().optional(),
  mnemonic: z.string().optional(),
  pos: z.string().optional(),
  phonetic: z.string().optional(),
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

// Image OCR returns a bare array: [{ word, meaning, exampleSentence }]
export const GeminiImageWordSchema = z.object({
  word: z.string(),
  meaning: z.string().optional().default(''),
  exampleSentence: z.string().optional().default(''),
}).passthrough();

export const GeminiImageResultSchema = z.array(GeminiImageWordSchema);
export type GeminiImageResult = z.infer<typeof GeminiImageResultSchema>;

export const AIAnalyzeRequestSchema = z.object({
  word: z.string().min(1),
  sourceLang: z.string().optional(),
  targetLang: z.string().optional(),
  apiKey: z.string().optional(),
});

export const AIGenerateThemeRequestSchema = z.object({
  theme: z.string().min(1),
  difficulty: z.string().default('Intermediate'),
  count: z.coerce.number().int().min(5).max(100).default(20),
  existingWords: z.array(z.string()).default([]),
});

export const AIGenerateMoreRequestSchema = z.object({
  theme: z.string().min(1),
  difficulty: z.string().default('Intermediate'),
  count: z.coerce.number().int().min(1).max(50).default(10),
  existingWords: z.array(z.string()).default([]),
});

// Curation request — outer shape is strict. `theme` keeps inner passthrough()
// because the server reads optional fields (creatorId, icon, category, …) that
// the UI ships alongside title; a dedicated theme schema would be scope creep.
export const CurationMutateBodySchema = z.object({
  theme: z.object({ title: z.string() }).passthrough(),
  words: z.array(z.any()).default([]),
});

// ============================================================================
// Sync (POST /api/sync/push, GET /api/sync/pull)
// ============================================================================
//
// cloud_lists / cloud_words Zod schemas are defined MANUALLY here for step 1,
// matching the pgTable shape that step 1b will create. Once step 1b lands we
// can replace these with drizzle-zod `createSelectSchema(cloud_lists)` etc.
// and verify that bigint columns with `mode: 'number'` emit `z.number()`.
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

// Push payload — client must not set userId/updatedAt; server injects/overrides.
export const CloudListPushSchema = CloudListSchema.omit({ userId: true, updatedAt: true }).extend({
  // keep createdAt optional on push (server uses default on insert)
  createdAt: EpochMsSchema.optional(),
});
export type CloudListPush = z.infer<typeof CloudListPushSchema>;

export const CloudWordPushSchema = CloudWordSchema.omit({ userId: true, updatedAt: true }).extend({
  createdAt: EpochMsSchema.optional(),
});
export type CloudWordPush = z.infer<typeof CloudWordPushSchema>;

export const SyncPullQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
});
export type SyncPullQuery = z.infer<typeof SyncPullQuerySchema>;

export const SyncPullResponseSchema = z.object({
  lists: z.array(CloudListSchema),
  words: z.array(CloudWordSchema),
  serverTime: EpochMsSchema,
  hasMore: z.boolean(),
  nextSince: EpochMsSchema.optional(),
});
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;

export const SyncPushRequestSchema = z.object({
  lists: z.array(CloudListPushSchema).default([]),
  words: z.array(CloudWordPushSchema).default([]),
});
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;

export const SyncPushResponseSchema = z.object({
  serverTime: EpochMsSchema,
});
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;

// ============================================================================
// Curations (frontend-initiated)
// ============================================================================

export const CreateCurationRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  category: z.string().optional(),
  level: z.string().optional(),
  sourceLanguage: z.string().optional(),
  targetLanguage: z.string().optional(),
  creatorName: z.string().optional(),
  words: z.array(z.object({
    term: z.string(),
    definition: z.string().optional().default(''),
    meaningKr: z.string().optional().default(''),
    exampleEn: z.string().optional().default(''),
  })),
});

export const UpdateCurationRequestSchema = CreateCurationRequestSchema.partial().extend({
  id: z.string(),
});

// Response shapes for GET /api/curations and POST/PUT /api/curations/*.
// Server returns `curated_themes` row + joined `words` array. Kept permissive
// (`.passthrough()`) because timestamp columns ship as ISO strings from pg and
// the UI treats these as VocaList-shaped; only the fields we actually branch
// on are strict.
export const CuratedThemeWithWordsSchema = z.object({
  id: z.string(),
  title: z.string(),
  words: z.array(z.unknown()),
}).passthrough();
export type CuratedThemeWithWords = z.infer<typeof CuratedThemeWithWordsSchema>;

export const CurationListResponseSchema = z.array(CuratedThemeWithWordsSchema);

export const CurationMutationResponseSchema = CuratedThemeWithWordsSchema;

export const CurationDeleteResponseSchema = z.object({
  success: z.boolean(),
}).passthrough();

// 409 body when a creator already owns a curation with the same title.
// Surfaced via ApiError.body so the client can forward existingId/existingTitle
// to the merge/overwrite UI. Defined here so both server and client parse it.
export const CurationDuplicateBodySchema = z.object({
  error: z.literal('DUPLICATE_CURATION'),
  existingId: z.string(),
  existingTitle: z.string(),
  message: z.string().optional(),
}).passthrough();

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
