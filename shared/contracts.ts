import { z } from 'zod';

// ============================================================================
// Shared primitives
// ============================================================================

export const EpochMsSchema = z.number().int().nonnegative();
export const NullableEpochMsSchema = EpochMsSchema.nullable();

// ============================================================================
// Auth
// ============================================================================

export const AuthModeSchema = z.enum(['none', 'guest', 'google', 'apple']);
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

/**
 * 복습 알림(gentle SRS §8.3). 설정은 딱 두 줄 — 토글 하나와 시간 하나.
 * 간격·상한 같은 기계는 노출하지 않는다(P3).
 *
 * `enabled` 기본값이 false인 이유: 켜는 행위가 곧 OS 권한 요청의 방아쇠다(§8.4).
 * true로 시작하면 권한이 없는 동안 "켜져 있는데 안 오는" 모순 상태가 된다.
 *
 * 시간에 밤 제한을 두지 않는다(§8.2): 조용한 시간대는 iOS 집중 모드 / Android
 * 방해 금지가 이미 담당한다. 앱이 중복 구현하면 시간 설정과 모순만 낳는다.
 */
export const ReviewNotificationSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  hour: z.number().int().min(0).max(23).default(20),
  minute: z.number().int().min(0).max(59).default(0),
  /**
   * soft ask 시트를 이미 띄웠는가. 한 번만 묻고 다시 조르지 않는다(§8.4) —
   * "나중에"도 존중이며, 사용자는 설정에서 언제든 켤 수 있다.
   */
  softAsked: z.boolean().default(false),
});
export type ReviewNotificationSettings = z.infer<typeof ReviewNotificationSettingsSchema>;

export const AutoPlaySettingsSchema = z.object({
  filter: z.enum(['all', 'learning', 'memorized']).default('all'),
  isStarred: z.boolean().default(false),
  showTerm: z.boolean().default(true),
  showMeaning: z.boolean().default(true),
  showPos: z.boolean().default(true),
  showExample: z.boolean().default(true),
  showExampleKr: z.boolean().default(true),
  autoPlaySound: z.boolean().default(true),
  autoPlayExample: z.boolean().default(true),
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
  posFilter: z.enum(['all', 'noun', 'verb', 'adjective', 'adverb', 'phrase', 'other']).default('all'),
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
  // Gentle SRS 복습 상태(docs/gentle-srs-design.md §4). null = 학습 이력 없음.
  lastReviewedAt: z.number().nullable().optional(),
  reviewSuccessCount: z.number().optional(),
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

// Difficulty tag injected into every AI-generated word. Stored as a stable
// Korean sentinel (legacy); localized to the UI language at display time only
// (see INTERNAL_TAG_I18N + lib/tag-display.ts). Do NOT localize at storage —
// these double as detection keys and must stay constant across UI languages.
export const DIFFICULTY_TAGS: Record<'beginner' | 'intermediate' | 'advanced', string> = {
  beginner: '초급',
  intermediate: '중급',
  advanced: '고급',
};

// Internal/system tags are stored as fixed Korean strings but should render in
// the user's UI language. Maps stored tag value → i18n key; unknown tags
// (user-typed, topic, category) pass through unchanged at display time.
export const INTERNAL_TAG_I18N: Record<string, string> = {
  [AI_GENERATED_TAG]: 'status.aiGenerated',
  [DIFFICULTY_TAGS.beginner]: 'curation.beginner',
  [DIFFICULTY_TAGS.intermediate]: 'curation.intermediate',
  [DIFFICULTY_TAGS.advanced]: 'curation.advanced',
};

// 동음이의어 뜻 후보 1개. AI 단어 분석(analyzeWord)이 서로 무관한 뜻이 2개 이상일 때
// senses 배열로 반환한다(최빈 뜻 먼저). 각 항목은 단일 뜻 기준(내부에 ①② 번호 없음).
// mnemonic은 add-word 폼이 쓰지 않아 출력 토큰 절약을 위해 제외.
export const WordSenseSchema = z.object({
  meaningKr: z.string().max(900),
  definition: z.string().max(1500).optional(),
  exampleEn: z.string().max(900).optional(),
  exampleKr: z.string().max(900).optional(),
  pos: z.string().max(60).optional(),
  phonetic: z.string().max(240).optional(),
});
export type WordSense = z.infer<typeof WordSenseSchema>;

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
  // 단어가 실제 사전에 존재하는지에 대한 모델의 판단. 자동입력에서만 사용.
  // 옛 캐시·옛 응답은 undefined로 통과(=실재로 간주).
  isReal: z.boolean().optional(),
  // 동음이의어 뜻 후보(2개 이상일 때만 의미). 상위 필드는 병기(①②) 하위호환용으로
  // 유지되고, 신버전 클라이언트만 이 배열로 인라인 뜻 제안 UI를 띄운다.
  senses: z.array(WordSenseSchema).max(4).optional(),
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
  // Gentle SRS(§7). 018 이전 빌드가 올린 행은 last_reviewed_at이 NULL —
  // 클라이언트가 NULL을 "due 아님"으로 취급하므로 안전하다.
  lastReviewedAt: EpochMsSchema.nullable().default(null),
  reviewSuccessCount: z.number().int().default(0),
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
