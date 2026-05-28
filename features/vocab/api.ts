import type { VocaList } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { generateId } from './db';
import { CurationShareSchema, WordSaveSchema, type CuratedThemeWithWords } from '@shared/contracts';

export type { CuratedThemeWithWords };

export class DuplicateCurationError extends Error {
  constructor(
    public readonly existingId: string,
    public readonly existingTitle: string,
    message?: string,
  ) {
    super(message ?? 'DUPLICATE_CURATION');
    this.name = 'DuplicateCurationError';
  }
}

// Capacity limits enforced both here (UX-friendly) and via Postgres triggers
// (defense-in-depth). Keep these in sync with the trigger thresholds.
export const MAX_WORDS_PER_CURATION = 500;
export const MAX_CURATIONS_PER_USER = 50;

export class CurationCapacityError extends Error {
  constructor(public readonly kind: 'WORDS_PER_CURATION' | 'CURATIONS_PER_USER', public readonly limit: number) {
    super(kind);
    this.name = 'CurationCapacityError';
  }
}

export async function fetchCloudCurations(): Promise<CuratedThemeWithWords[]> {
  try {
    const { data, error } = await supabase
      .from('curated_themes')
      .select('*, words:curated_words(id, term, definition, meaning_kr, example_en, example_kr, pronunciation)')
      .order('created_at', { ascending: false });
    if (error) throw error;

    // UI는 camelCase 컨벤션이라 owner 판정(canDeleteCuration)·작성자 표시
    // (creatorName)이 동작하려면 snake_case 컬럼을 명시적으로 매핑해야 한다.
    return (data ?? []).map((theme: any) => ({
      ...theme,
      creatorId: theme.creator_id,
      creatorName: theme.creator_name,
      createdAt: theme.created_at,
      updatedAt: theme.updated_at,
      words: (theme.words ?? []).map((w: any) => ({
        id: w.id,
        term: w.term,
        definition: w.definition ?? '',
        meaningKr: w.meaning_kr ?? '',
        exampleEn: w.example_en ?? '',
        exampleKr: w.example_kr ?? undefined,
        phonetic: w.pronunciation ?? undefined,
      })),
    }));
  } catch (e) {
    console.warn('Failed to fetch curations from cloud:', e);
    return [];
  }
}

export async function deleteCloudCuration(curationId: string): Promise<void> {
  const { error } = await supabase
    .from('curated_themes')
    .delete()
    .eq('id', curationId);
  if (error) throw error;
}

export type CurationReportReason =
  | 'inappropriate' | 'copyright' | 'spam' | 'misinformation' | 'other';

export class AlreadyReportedError extends Error {
  constructor() {
    super('ALREADY_REPORTED');
    this.name = 'AlreadyReportedError';
  }
}

/**
 * Submit a moderation report on a community-shared curation.
 *
 * Required by Google Play's UGC policy: apps that surface user-generated
 * content must let users flag objectionable items in-app. The DB-side unique
 * (theme_id, reporter_id) constraint enforces one report per user/theme;
 * Postgres returns SQLSTATE 23505 which we surface as AlreadyReportedError
 * so the UI can show a "이미 신고하셨어요" message instead of a generic error.
 *
 * Operator review happens in Supabase Dashboard against `curation_reports`
 * (admin RLS policy allows full access for `app_admins` members) until a
 * dedicated admin UI ships.
 */
export async function reportCuration(
  themeId: string,
  reason: CurationReportReason,
  detail?: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('NOT_AUTHENTICATED');

  const { error } = await supabase.from('curation_reports').insert({
    theme_id: themeId,
    reporter_id: user.id,
    reason,
    detail: detail?.trim() ? detail.trim().slice(0, 500) : null,
  });
  if (error) {
    if (error.code === '23505') throw new AlreadyReportedError();
    throw error;
  }
}

export interface ShareCurationOptions {
  creatorName: string;
  description?: string;
  updateId?: string;
  force?: boolean;
}

export async function shareCuration(
  list: VocaList,
  options: ShareCurationOptions,
): Promise<CuratedThemeWithWords> {
  const { creatorName, description, updateId, force } = options;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('NOT_AUTHENTICATED');

  // Strict validation at the write boundary. The receive-side schemas (AI
  // responses, cloud pulls) tolerate larger values; here we enforce the
  // DB CHECK limits before any Supabase write.
  CurationShareSchema.parse({ title: list.title, description, creatorName });
  for (const w of list.words) WordSaveSchema.parse(w);

  // Capacity guard. Triggers enforce the same limits at the DB layer.
  if (list.words.length > MAX_WORDS_PER_CURATION) {
    throw new CurationCapacityError('WORDS_PER_CURATION', MAX_WORDS_PER_CURATION);
  }
  if (!updateId) {
    const { count } = await supabase
      .from('curated_themes')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', user.id);
    if ((count ?? 0) >= MAX_CURATIONS_PER_USER) {
      throw new CurationCapacityError('CURATIONS_PER_USER', MAX_CURATIONS_PER_USER);
    }
  }

  if (updateId) {
    const { error } = await supabase
      .from('curated_themes')
      .update({ title: list.title, creator_name: creatorName, description: description ?? null })
      .eq('id', updateId);
    if (error) throw error;

    await supabase.from('curated_words').delete().eq('theme_id', updateId);
    const wordRows = list.words.map(w => ({
      id: generateId(),
      theme_id: updateId,
      term: w.term,
      definition: w.definition ?? '',
      meaning_kr: w.meaningKr ?? '',
      example_en: w.exampleEn ?? '',
      example_kr: w.exampleKr ?? null,
      pronunciation: w.phonetic ?? null,
    }));
    if (wordRows.length > 0) await supabase.from('curated_words').insert(wordRows);

    const { data } = await supabase
      .from('curated_themes')
      .select('*, words:curated_words(id, term, definition, meaning_kr, example_en, example_kr, pronunciation)')
      .eq('id', updateId)
      .single();
    return data!;
  }

  if (!force) {
    const { data: existing } = await supabase
      .from('curated_themes')
      .select('id, title')
      .eq('creator_id', user.id)
      .ilike('title', list.title)
      .maybeSingle();
    if (existing) throw new DuplicateCurationError(existing.id, existing.title);
  }

  const themeId = generateId();
  const { error: themeErr } = await supabase.from('curated_themes').insert({
    id: themeId,
    creator_name: creatorName,
    title: list.title,
    description: description ?? null,
  });
  if (themeErr) throw themeErr;

  const wordRows = list.words.map(w => ({
    id: generateId(),
    theme_id: themeId,
    term: w.term,
    definition: w.definition ?? '',
    meaning_kr: w.meaningKr ?? '',
    example_en: w.exampleEn ?? '',
    example_kr: w.exampleKr ?? null,
    pronunciation: w.phonetic ?? null,
  }));
  if (wordRows.length > 0) {
    const { error: wordsErr } = await supabase.from('curated_words').insert(wordRows);
    if (wordsErr) throw wordsErr;
  }

  const { data } = await supabase
    .from('curated_themes')
    .select('*, words:curated_words(id, term, definition, meaning_kr, example_en, example_kr, pronunciation)')
    .eq('id', themeId)
    .single();
  return data!;
}
