import type { VocaList } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { generateId } from './db';
import type { CuratedThemeWithWords } from '@shared/contracts';

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

export async function fetchCloudCurations(): Promise<CuratedThemeWithWords[]> {
  try {
    const { data, error } = await supabase
      .from('curated_themes')
      .select('*, words:curated_words(id, term, definition, meaning_kr, example_en, example_kr, pronunciation)')
      .order('created_at', { ascending: false });
    if (error) throw error;

    return (data ?? []).map((theme: any) => ({
      ...theme,
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

  const now = Date.now();

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
      created_at: now,
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
    created_at: now,
    updated_at: now,
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
    created_at: now,
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
