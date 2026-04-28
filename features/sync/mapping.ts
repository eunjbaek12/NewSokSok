import type {
  CloudList,
  CloudWord,
  VocaList,
  Word,
} from '@shared/contracts';

// ---- Supabase SDK (snake_case) row mappers ----

/** Convert VocaList → snake_case row for supabase upsert (user_id injected by DB default). */
export function vocaListToCloudRow(l: VocaList, opts: { deletedAt?: number | null } = {}) {
  return {
    id: l.id,
    title: l.title,
    is_visible: l.isVisible ?? true,
    is_curated: l.isCurated ?? false,
    icon: l.icon ?? null,
    position: l.position ?? 0,
    plan_total_days: l.planTotalDays ?? 0,
    plan_current_day: l.planCurrentDay ?? 1,
    plan_words_per_day: l.planWordsPerDay ?? 10,
    plan_started_at: l.planStartedAt ?? null,
    plan_updated_at: l.planUpdatedAt ?? null,
    plan_filter: l.planFilter ?? 'all',
    source_language: l.sourceLanguage ?? 'en',
    target_language: l.targetLanguage ?? 'ko',
    last_result_memorized: l.lastResultMemorized ?? 0,
    last_result_total: l.lastResultTotal ?? 0,
    last_result_percent: l.lastResultPercent ?? 0,
    last_studied_at: l.lastStudiedAt ?? null,
    is_user_shared: l.isUserShared ?? false,
    creator_id: l.creatorId ?? null,
    creator_name: l.creatorName ?? null,
    download_count: l.downloadCount ?? 0,
    created_at: l.createdAt,
    is_deleted: opts.deletedAt != null,
  };
}

/** Convert Word → snake_case row for supabase upsert. */
export function wordToCloudRow(
  w: Word,
  listId: string,
  opts: { deletedAt?: number | null; position?: number } = {},
) {
  return {
    id: w.id,
    list_id: listId,
    term: w.term,
    definition: w.definition ?? '',
    phonetic: w.phonetic ?? null,
    pos: w.pos ?? null,
    example_en: w.exampleEn ?? '',
    example_kr: w.exampleKr ?? null,
    meaning_kr: w.meaningKr ?? '',
    is_memorized: w.isMemorized ?? false,
    is_starred: w.isStarred ?? false,
    tags: w.tags && w.tags.length > 0 ? JSON.stringify(w.tags) : null,
    position: opts.position ?? 0,
    wrong_count: w.wrongCount ?? 0,
    assigned_day: w.assignedDay ?? null,
    source_lang: w.sourceLang ?? 'en',
    target_lang: w.targetLang ?? 'ko',
    created_at: w.createdAt,
    is_deleted: opts.deletedAt != null,
  };
}

/** Convert a snake_case cloud_lists DB row → VocaList domain shape. */
export function dbRowToVocaList(row: Record<string, any>, words: Word[] = []): VocaList {
  return {
    id: row.id,
    title: row.title,
    words,
    isVisible: row.is_visible,
    createdAt: row.created_at,
    lastStudiedAt: row.last_studied_at ?? undefined,
    position: row.position,
    isCurated: row.is_curated,
    icon: row.icon ?? undefined,
    isUserShared: row.is_user_shared,
    creatorId: row.creator_id ?? undefined,
    creatorName: row.creator_name ?? undefined,
    downloadCount: row.download_count,
    planTotalDays: row.plan_total_days,
    planCurrentDay: row.plan_current_day,
    planWordsPerDay: row.plan_words_per_day,
    planStartedAt: row.plan_started_at ?? undefined,
    planUpdatedAt: row.plan_updated_at ?? undefined,
    planFilter: row.plan_filter ?? 'all',
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    lastResultMemorized: row.last_result_memorized,
    lastResultTotal: row.last_result_total,
    lastResultPercent: row.last_result_percent,
  };
}

/** Convert a snake_case cloud_words DB row → Word domain shape. */
export function dbRowToWord(row: Record<string, any>): Word {
  let tags: string[] = [];
  if (row.tags) {
    try {
      const parsed = JSON.parse(row.tags);
      if (Array.isArray(parsed)) tags = parsed.map(String);
    } catch { tags = []; }
  }
  return {
    id: row.id,
    term: row.term,
    definition: row.definition ?? '',
    phonetic: row.phonetic ?? undefined,
    pos: row.pos ?? undefined,
    exampleEn: row.example_en ?? '',
    exampleKr: row.example_kr ?? undefined,
    meaningKr: row.meaning_kr ?? '',
    isMemorized: row.is_memorized,
    isStarred: row.is_starred,
    tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    wrongCount: row.wrong_count ?? 0,
    assignedDay: row.assigned_day ?? null,
    sourceLang: row.source_lang ?? 'en',
    targetLang: row.target_lang ?? 'ko',
  };
}

/**
 * Convert a cloud_lists row (from Supabase pull) to a local VocaList shell
 * (without words). The caller stitches child words in via `cloud_words`.
 */
export function cloudListToVocaList(c: CloudList, words: Word[] = []): VocaList {
  return {
    id: c.id,
    title: c.title,
    words,
    isVisible: c.isVisible,
    createdAt: c.createdAt,
    lastStudiedAt: c.lastStudiedAt ?? undefined,
    position: c.position,
    isCurated: c.isCurated,
    icon: c.icon ?? undefined,
    isUserShared: c.isUserShared,
    creatorId: c.creatorId ?? undefined,
    creatorName: c.creatorName ?? undefined,
    downloadCount: c.downloadCount,
    planTotalDays: c.planTotalDays,
    planCurrentDay: c.planCurrentDay,
    planWordsPerDay: c.planWordsPerDay,
    planStartedAt: c.planStartedAt ?? undefined,
    planUpdatedAt: c.planUpdatedAt ?? undefined,
    planFilter: (c.planFilter as 'all' | 'unmemorized' | 'memorized') ?? 'all',
    sourceLanguage: c.sourceLanguage,
    targetLanguage: c.targetLanguage,
    lastResultMemorized: c.lastResultMemorized,
    lastResultTotal: c.lastResultTotal,
    lastResultPercent: c.lastResultPercent,
  };
}

/** Convert a cloud_words row into a local Word shape. */
export function cloudWordToWord(c: CloudWord): Word {
  let tags: string[] = [];
  if (c.tags) {
    try {
      const parsed = JSON.parse(c.tags);
      if (Array.isArray(parsed)) tags = parsed.map(String);
    } catch {
      tags = [];
    }
  }
  return {
    id: c.id,
    term: c.term,
    definition: c.definition,
    phonetic: c.phonetic ?? undefined,
    pos: c.pos ?? undefined,
    exampleEn: c.exampleEn,
    exampleKr: c.exampleKr ?? undefined,
    meaningKr: c.meaningKr,
    isMemorized: c.isMemorized,
    isStarred: c.isStarred,
    tags,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    wrongCount: c.wrongCount,
    assignedDay: c.assignedDay ?? null,
    sourceLang: c.sourceLang,
    targetLang: c.targetLang,
  };
}
