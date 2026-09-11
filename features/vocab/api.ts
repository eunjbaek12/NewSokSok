import type { VocaList } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { generateId } from './db';
import { deriveDisplayLanguages } from '@/constants/languages';
import { CurationShareSchema, WordSaveSchema, type CuratedThemeWithWords } from '@shared/contracts';
import { sanitizeShareTags } from './share-preview';

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

// 공유·조회가 공유하는 단어 조인 select. 컬럼을 추가하면 아래 매핑과
// shareCuration의 wordRows도 함께 갱신할 것.
const CURATED_WORDS_SELECT =
  '*, words:curated_words(id, term, definition, meaning_kr, example_en, example_kr, pronunciation, pos, tags)';

/**
 * 공유 단어장 목록. **실패하면 던진다** — 빈 배열로 삼키지 않는다.
 *
 * 예전에는 실패를 `[]`로 돌려줘서 화면이 «오프라인»과 «아무도 안 올림»을 구분할 수 없었고,
 * 둘 다 「검색 결과가 없습니다」가 떴다. 공식 탭은 실패를 따로 그리는데 공유 탭만 못 그렸다.
 */
export async function fetchCloudCurations(): Promise<CuratedThemeWithWords[]> {
  const { data, error } = await supabase
    .from('curated_themes')
    .select(CURATED_WORDS_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;

  // UI는 camelCase 컨벤션이라 owner 판정(canDeleteCuration)·작성자 표시
  // (creatorName)·언어쌍(sourceLanguage — 언어 필터·카드 표시·저장 시 단어
  // 언어 스탬프에 쓰임)이 동작하려면 snake_case 컬럼을 명시적으로 매핑해야 한다.
  return (data ?? []).map((theme: any) => ({
    ...theme,
    creatorId: theme.creator_id,
    creatorName: theme.creator_name,
    createdAt: theme.created_at,
    updatedAt: theme.updated_at,
    sourceLanguage: theme.source_language ?? undefined,
    targetLanguage: theme.target_language ?? undefined,
    words: (theme.words ?? []).map((w: any) => ({
      id: w.id,
      term: w.term,
      definition: w.definition ?? '',
      meaningKr: w.meaning_kr ?? '',
      exampleEn: w.example_en ?? '',
      exampleKr: w.example_kr ?? undefined,
      phonetic: w.pronunciation ?? undefined,
      pos: w.pos ?? undefined,
      tags: Array.isArray(w.tags) ? w.tags.map(String) : undefined,
    })),
  }));
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

// 태그 정리 규칙(sanitizeShareTags)은 share-preview.ts 에 있다 — 공유 창 미리보기가
// 같은 규칙을 읽어야 올라갈 모습과 실제가 갈리지 않는다.
function toCuratedWordRows(list: VocaList, themeId: string) {
  return list.words.map(w => ({
    id: generateId(),
    theme_id: themeId,
    term: w.term,
    definition: w.definition ?? '',
    meaning_kr: w.meaningKr ?? '',
    example_en: w.exampleEn ?? '',
    example_kr: w.exampleKr ?? null,
    pronunciation: w.phonetic ?? null,
    pos: w.pos ?? null,
    tags: sanitizeShareTags(w.tags),
  }));
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

  // 언어쌍은 리스트 메타가 아니라 단어 최빈 언어로 산출 — 메타가 비어 있는
  // 옛 개인 단어장도 정확하게 공유된다(수신 측 createCuratedList가 이 값을
  // 단어 언어 스탬프·언어 필터·카드 표시에 사용).
  const { source: sourceLanguage, target: targetLanguage } = deriveDisplayLanguages(list.words, list);
  const themeMeta = {
    source_language: sourceLanguage,
    target_language: targetLanguage,
    icon: list.icon ?? null,
  };
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
      .update({ title: list.title, creator_name: creatorName, description: description ?? null, ...themeMeta })
      .eq('id', updateId);
    if (error) throw error;

    await supabase.from('curated_words').delete().eq('theme_id', updateId);
    const wordRows = toCuratedWordRows(list, updateId);
    if (wordRows.length > 0) await supabase.from('curated_words').insert(wordRows);

    const { data } = await supabase
      .from('curated_themes')
      .select(CURATED_WORDS_SELECT)
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
    ...themeMeta,
  });
  if (themeErr) throw themeErr;

  const wordRows = toCuratedWordRows(list, themeId);
  if (wordRows.length > 0) {
    const { error: wordsErr } = await supabase.from('curated_words').insert(wordRows);
    if (wordsErr) throw wordsErr;
  }

  const { data } = await supabase
    .from('curated_themes')
    .select(CURATED_WORDS_SELECT)
    .eq('id', themeId)
    .single();
  return data!;
}
