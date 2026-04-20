import type {
  CloudList,
  CloudListPush,
  CloudWord,
  CloudWordPush,
  VocaList,
  Word,
} from '@shared/contracts';

/**
 * Convert a local SQLite VocaList into a push payload for POST /api/sync/push.
 * - `userId` is omitted; the server injects it from JWT.
 * - `updatedAt` is omitted; the server forces NOW() on upsert.
 * - Fields coerced to non-null defaults where cloud_lists columns are NOT NULL.
 */
export function vocaListToCloudPush(l: VocaList, opts: { deletedAt?: number | null } = {}): CloudListPush {
  return {
    id: l.id,
    title: l.title,
    isVisible: l.isVisible ?? true,
    isCurated: l.isCurated ?? false,
    icon: l.icon ?? null,
    position: l.position ?? 0,
    planTotalDays: l.planTotalDays ?? 0,
    planCurrentDay: l.planCurrentDay ?? 1,
    planWordsPerDay: l.planWordsPerDay ?? 10,
    planStartedAt: l.planStartedAt ?? null,
    planUpdatedAt: l.planUpdatedAt ?? null,
    planFilter: l.planFilter ?? 'all',
    sourceLanguage: l.sourceLanguage ?? 'en',
    targetLanguage: l.targetLanguage ?? 'ko',
    lastResultMemorized: l.lastResultMemorized ?? 0,
    lastResultTotal: l.lastResultTotal ?? 0,
    lastResultPercent: l.lastResultPercent ?? 0,
    lastStudiedAt: l.lastStudiedAt ?? null,
    isUserShared: l.isUserShared ?? false,
    creatorId: l.creatorId ?? null,
    creatorName: l.creatorName ?? null,
    downloadCount: l.downloadCount ?? 0,
    createdAt: l.createdAt,
    deletedAt: opts.deletedAt ?? null,
  };
}

/**
 * Convert a local SQLite Word + its listId into a push payload.
 * Coerces NOT NULL cloud_words columns (definition/exampleEn/meaningKr) from
 * missing → empty string, tags → JSON string (matches SQLite TEXT column).
 */
export function wordToCloudPush(
  w: Word,
  listId: string,
  opts: { deletedAt?: number | null; position?: number } = {},
): CloudWordPush {
  return {
    id: w.id,
    listId,
    term: w.term,
    definition: w.definition ?? '',
    phonetic: w.phonetic ?? null,
    pos: w.pos ?? null,
    exampleEn: w.exampleEn ?? '',
    exampleKr: w.exampleKr ?? null,
    meaningKr: w.meaningKr ?? '',
    isMemorized: w.isMemorized ?? false,
    isStarred: w.isStarred ?? false,
    tags: w.tags && w.tags.length > 0 ? JSON.stringify(w.tags) : null,
    position: opts.position ?? 0,
    wrongCount: w.wrongCount ?? 0,
    assignedDay: w.assignedDay ?? null,
    sourceLang: w.sourceLang ?? 'en',
    targetLang: w.targetLang ?? 'ko',
    createdAt: w.createdAt,
    deletedAt: opts.deletedAt ?? null,
  };
}

/**
 * Convert a cloud_lists row (from GET /api/sync/pull) to a local VocaList shell
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
