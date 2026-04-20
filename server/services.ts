import {
  curated_themes,
  curated_words,
  cloud_lists,
  cloud_words,
  cloud_users,
} from "@shared/schema";
import { db, pool } from "./db";
import { eq, and, ilike, gt, sql, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { type CloudListPush, type CloudWordPush } from "@shared/contracts";

// ---------------------------------------------------------------------------
// Curations service — migrated from server/storage.ts (step 2).
// ---------------------------------------------------------------------------

export async function getCurations(): Promise<any[]> {
  const themes = await db.select().from(curated_themes);
  const words = await db.select().from(curated_words);
  return themes.map(theme => ({
    ...theme,
    words: words.filter(w => w.themeId === theme.id),
  }));
}

export async function createCuration(themeData: any, wordsData: any[]): Promise<any> {
  const themeId = themeData.id || randomUUID();

  try {
    const [theme] = await db.insert(curated_themes).values({
      id: themeId,
      title: themeData.title,
      description: themeData.description || null,
      icon: themeData.icon || '✨',
      category: themeData.category || null,
      level: themeData.level || null,
      isUserShared: themeData.isUserShared ?? false,
      creatorName: themeData.creatorName || null,
      creatorId: themeData.creatorId || null,
      downloadCount: themeData.downloadCount ?? 0,
      sourceLanguage: themeData.sourceLanguage || 'en',
      targetLanguage: themeData.targetLanguage || 'ko',
    }).returning();

    if (wordsData && wordsData.length > 0) {
      const wordsToInsert = wordsData.map(w => ({
        id: randomUUID(),
        themeId: theme.id,
        term: w.term,
        definition: w.definition || '',
        meaningKr: w.meaningKr || '',
        exampleEn: w.exampleEn || '',
      }));
      await db.insert(curated_words).values(wordsToInsert);
    }

    return { ...theme, words: wordsData };
  } catch (e: any) {
    console.error("Database insert failed in createCuration:", e);
    throw new Error(`DB Insert Failed: ${e.message || String(e)}`);
  }
}

export async function findDuplicateCuration(creatorId: string, title: string): Promise<any | null> {
  const [existing] = await db.select().from(curated_themes).where(
    and(
      eq(curated_themes.creatorId, creatorId),
      ilike(curated_themes.title, title),
    ),
  );
  return existing || null;
}

export async function updateCuration(id: string, creatorId: string, themeData: any, wordsData: any[]): Promise<any> {
  const [existing] = await db.select().from(curated_themes).where(eq(curated_themes.id, id));
  if (!existing) throw new Error('Curation not found');
  if (existing.creatorId !== creatorId) throw new Error('Unauthorized');

  const [theme] = await db.update(curated_themes).set({
    title: themeData.title,
    description: themeData.description || null,
    icon: themeData.icon || '✨',
    category: themeData.category || null,
    level: themeData.level || null,
    sourceLanguage: themeData.sourceLanguage || 'en',
    targetLanguage: themeData.targetLanguage || 'ko',
    updatedAt: new Date(),
  }).where(eq(curated_themes.id, id)).returning();

  await db.delete(curated_words).where(eq(curated_words.themeId, id));

  if (wordsData && wordsData.length > 0) {
    const wordsToInsert = wordsData.map(w => ({
      id: randomUUID(),
      themeId: id,
      term: w.term,
      definition: w.definition || '',
      meaningKr: w.meaningKr || '',
      exampleEn: w.exampleEn || '',
    }));
    await db.insert(curated_words).values(wordsToInsert);
  }

  return { ...theme, words: wordsData };
}

export async function deleteCuration(id: string, requesterId: string, isAdmin: boolean): Promise<void> {
  const [existing] = await db.select().from(curated_themes).where(eq(curated_themes.id, id));
  if (!existing) throw new Error('Curation not found');
  if (!isAdmin && existing.creatorId !== requesterId) throw new Error('Unauthorized');

  await db.delete(curated_themes).where(eq(curated_themes.id, id));
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export async function isUserAdmin(userId: string): Promise<boolean> {
  try {
    const result = await pool.query(
      'SELECT is_admin FROM cloud_users WHERE id = $1',
      [userId],
    );
    return result.rows[0]?.is_admin ?? false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Sync service (step 6a) — normalized cloud_lists / cloud_words.
// ---------------------------------------------------------------------------

const nowEpochMs = () => Date.now();

/**
 * Pull rows updated after `since` for the given user. Returns soft-deleted rows
 * too (deletedAt != null) so the client can apply hard-delete locally.
 */
export async function pullSince(userId: string, since: number) {
  const lists = await db
    .select()
    .from(cloud_lists)
    .where(and(eq(cloud_lists.userId, userId), gt(cloud_lists.updatedAt, since)));
  const words = await db
    .select()
    .from(cloud_words)
    .where(and(eq(cloud_words.userId, userId), gt(cloud_words.updatedAt, since)));
  return { lists, words, serverTime: nowEpochMs() };
}

/**
 * Push a batch of list/word upserts for the given user.
 *  - `userId` is injected server-side (client-supplied userId ignored).
 *  - `updated_at` is forced to NOW() on each row.
 *  - Validates every `word.listId` belongs to `userId`.
 */
export async function pushUpsert(
  userId: string,
  lists: CloudListPush[],
  words: CloudWordPush[],
): Promise<{ serverTime: number }> {
  // Validate word.listId ownership before we touch the DB.
  if (words.length > 0) {
    const listIds = Array.from(new Set(words.map(w => w.listId)));
    const owned = await db
      .select({ id: cloud_lists.id })
      .from(cloud_lists)
      .where(and(eq(cloud_lists.userId, userId), inArray(cloud_lists.id, listIds)));
    const ownedIds = new Set(owned.map(r => r.id));

    // Allow a word to be pushed alongside its own parent list in the same
    // request — accept listIds that appear in the `lists` batch too.
    const pendingListIds = new Set(lists.map(l => l.id));
    const unauthorized = listIds.filter(id => !ownedIds.has(id) && !pendingListIds.has(id));
    if (unauthorized.length > 0) {
      const err = new Error(`unauthorized listId(s): ${unauthorized.join(', ')}`);
      (err as any).code = 'UNAUTHORIZED_LIST';
      throw err;
    }
  }

  const serverTime = nowEpochMs();

  await db.transaction(async (tx) => {
    if (lists.length > 0) {
      for (const l of lists) {
        await tx.execute(sql`
          INSERT INTO cloud_lists (
            id, user_id, title, is_visible, is_curated, icon, position,
            plan_total_days, plan_current_day, plan_words_per_day, plan_started_at,
            plan_updated_at, plan_filter, source_language, target_language,
            last_result_memorized, last_result_total, last_result_percent,
            last_studied_at, is_user_shared, creator_id, creator_name,
            download_count, created_at, updated_at, deleted_at
          ) VALUES (
            ${l.id}, ${userId}, ${l.title}, ${l.isVisible}, ${l.isCurated}, ${l.icon},
            ${l.position}, ${l.planTotalDays}, ${l.planCurrentDay}, ${l.planWordsPerDay},
            ${l.planStartedAt}, ${l.planUpdatedAt}, ${l.planFilter}, ${l.sourceLanguage},
            ${l.targetLanguage}, ${l.lastResultMemorized}, ${l.lastResultTotal},
            ${l.lastResultPercent}, ${l.lastStudiedAt}, ${l.isUserShared}, ${l.creatorId},
            ${l.creatorName}, ${l.downloadCount}, ${l.createdAt ?? serverTime},
            ${serverTime}, ${l.deletedAt ?? null}
          )
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            is_visible = EXCLUDED.is_visible,
            is_curated = EXCLUDED.is_curated,
            icon = EXCLUDED.icon,
            position = EXCLUDED.position,
            plan_total_days = EXCLUDED.plan_total_days,
            plan_current_day = EXCLUDED.plan_current_day,
            plan_words_per_day = EXCLUDED.plan_words_per_day,
            plan_started_at = EXCLUDED.plan_started_at,
            plan_updated_at = EXCLUDED.plan_updated_at,
            plan_filter = EXCLUDED.plan_filter,
            source_language = EXCLUDED.source_language,
            target_language = EXCLUDED.target_language,
            last_result_memorized = EXCLUDED.last_result_memorized,
            last_result_total = EXCLUDED.last_result_total,
            last_result_percent = EXCLUDED.last_result_percent,
            last_studied_at = EXCLUDED.last_studied_at,
            is_user_shared = EXCLUDED.is_user_shared,
            creator_id = EXCLUDED.creator_id,
            creator_name = EXCLUDED.creator_name,
            download_count = EXCLUDED.download_count,
            updated_at = ${serverTime},
            deleted_at = EXCLUDED.deleted_at,
            user_id = EXCLUDED.user_id
        `);
      }
    }

    if (words.length > 0) {
      for (const w of words) {
        await tx.execute(sql`
          INSERT INTO cloud_words (
            id, list_id, user_id, term, definition, phonetic, pos, example_en,
            example_kr, meaning_kr, is_memorized, is_starred, tags, position,
            wrong_count, assigned_day, source_lang, target_lang,
            created_at, updated_at, deleted_at
          ) VALUES (
            ${w.id}, ${w.listId}, ${userId}, ${w.term}, ${w.definition}, ${w.phonetic},
            ${w.pos}, ${w.exampleEn}, ${w.exampleKr}, ${w.meaningKr}, ${w.isMemorized},
            ${w.isStarred}, ${w.tags}, ${w.position}, ${w.wrongCount}, ${w.assignedDay},
            ${w.sourceLang}, ${w.targetLang}, ${w.createdAt ?? serverTime},
            ${serverTime}, ${w.deletedAt ?? null}
          )
          ON CONFLICT (id) DO UPDATE SET
            list_id = EXCLUDED.list_id,
            term = EXCLUDED.term,
            definition = EXCLUDED.definition,
            phonetic = EXCLUDED.phonetic,
            pos = EXCLUDED.pos,
            example_en = EXCLUDED.example_en,
            example_kr = EXCLUDED.example_kr,
            meaning_kr = EXCLUDED.meaning_kr,
            is_memorized = EXCLUDED.is_memorized,
            is_starred = EXCLUDED.is_starred,
            tags = EXCLUDED.tags,
            position = EXCLUDED.position,
            wrong_count = EXCLUDED.wrong_count,
            assigned_day = EXCLUDED.assigned_day,
            source_lang = EXCLUDED.source_lang,
            target_lang = EXCLUDED.target_lang,
            updated_at = ${serverTime},
            deleted_at = EXCLUDED.deleted_at,
            user_id = EXCLUDED.user_id
        `);
      }
    }
  });

  return { serverTime };
}

