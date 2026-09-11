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
//
// 2,000 인 이유: 실측 최대 단어장이 1,730이라 **지금 있는 단어장 전부가 한 번에** 나가고,
// 「나눠 보내기」 화면이 아예 없다(docs/share-to-friend-spec.md §2-9). 나눠 보내면 주소가
// 둘이 되어 받는 쪽이 두 번 담고 단어장이 쪼개진다 — 빠뜨림을 막으려던 선택이 받는 쪽에서
// 빠뜨림을 만든다.
export const MAX_WORDS_PER_CURATION = 2000;
export const MAX_CURATIONS_PER_USER = 50;

/** 친구에게 보낸 주소가 사는 기간(§2-3). 담으면 주소는 쓸모없어지니 「전송」으로 다룬다. */
export const SHARE_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 단어를 나눠 넣는 단위. 2,000행을 한 번에 보내면 요청 하나가 900KB 를 넘고, 중간에 끊기면
 * 무엇이 들어갔는지 알 수 없다. 실패하면 테마를 지워(cascade) 반쪽 덱을 남기지 않는다.
 */
const WORD_INSERT_CHUNK = 200;

export class CurationCapacityError extends Error {
  constructor(public readonly kind: 'WORDS_PER_CURATION' | 'CURATIONS_PER_USER', public readonly limit: number) {
    super(kind);
    this.name = 'CurationCapacityError';
  }
}

// 공유·조회가 공유하는 단어 조인 select. 컬럼을 추가하면 아래 매핑과
// shareCuration의 wordRows도 함께 갱신할 것.
const CURATED_WORDS_SELECT =
  '*, words:curated_words(id, term, definition, meaning_kr, example_en, example_kr, pronunciation, pos, tags, position)';

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
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    // 단어 순서는 position 이 정한다. 이 열이 생기기 전에 올라간 덱은 전부 null 이라
    // 뒤로 밀되(nullsFirst:false) 서로의 순서는 예전과 같다.
    .order('position', { referencedTable: 'words', ascending: true, nullsFirst: false });
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
    words: (theme.words ?? []).map(mapCuratedWord),
  }));
}

/** snake_case 단어 행 → 앱이 쓰는 모양. 공유 탭 조회와 주소 조회가 같은 것을 쓴다. */
function mapCuratedWord(w: any) {
  return {
    id: w.id,
    term: w.term,
    definition: w.definition ?? '',
    meaningKr: w.meaning_kr ?? '',
    exampleEn: w.example_en ?? '',
    exampleKr: w.example_kr ?? undefined,
    phonetic: w.pronunciation ?? undefined,
    pos: w.pos ?? undefined,
    tags: Array.isArray(w.tags) ? w.tags.map(String) : undefined,
  };
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

/**
 * 50개 한도에 드는 공유 수. **만료된 친구 공유는 빼고** 센다 — 서버 용량 트리거와 같은
 * 규칙이다. 안 그러면 몇 달 보낸 뒤 살아 있는 공유가 하나도 없는데 「더 공유할 수 없어요」에
 * 막힌다. 올리기와 보내기가 같은 한도를 나눠 쓰므로 둘 다 이 함수로 센다.
 */
async function countLiveCurations(userId: string, now: number): Promise<number> {
  const { count } = await supabase
    .from('curated_themes')
    .select('id', { count: 'exact', head: true })
    .eq('creator_id', userId)
    .or(`expires_at.is.null,expires_at.gt.${now}`);
  return count ?? 0;
}

// 태그 정리 규칙(sanitizeShareTags)은 share-preview.ts 에 있다 — 공유 창 미리보기가
// 같은 규칙을 읽어야 올라갈 모습과 실제가 갈리지 않는다.
function toCuratedWordRows(list: VocaList, themeId: string) {
  return list.words.map((w, index) => ({
    id: generateId(),
    theme_id: themeId,
    // 순서를 명시해 둔다. 서버는 한 배치 insert 라 created_at 이 전 행 동일해서
    // (실측: 100단어 덱의 distinct created_at = 1) 여기 없으면 순서 정보가 아예 없다.
    position: index,
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
  if (!updateId && await countLiveCurations(user.id, Date.now()) >= MAX_CURATIONS_PER_USER) {
    throw new CurationCapacityError('CURATIONS_PER_USER', MAX_CURATIONS_PER_USER);
  }

  if (updateId) {
    // 갱신은 **게시물에만** 건다. 친구에게 보낸 사본은 보낸 내용 그대로 굳어야 한다(§2-4) —
    // 여기서 걸리지 않으면 받는 사람이 열기 전에 단어가 바뀐다.
    const { data: updated, error } = await supabase
      .from('curated_themes')
      .update({ title: list.title, creator_name: creatorName, description: description ?? null, ...themeMeta })
      .eq('id', updateId)
      .eq('visibility', 'public')
      .select('id');
    if (error) throw error;
    if (!updated?.length) throw new Error('CURATION_NOT_FOUND');

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

  // 「이미 올렸어요, 갱신할까요?」 — 게시는 만료가 없어 같은 덱이 목록에 두 번 서지 않게 묻는다.
  // **게시물끼리만** 비교한다(docs/share-to-friend-spec.md §6.1). 친구 공유까지 보면 같은 제목을
  // 보낸 적이 있다는 이유로 묻고, [갱신]이 그 사본을 덮는다. `maybeSingle` 도 쓰지 않는다 — 여러
  // 행이면 오류를 내는데, 그 오류를 삼키면 검사가 조용히 통과된다.
  if (!force) {
    const { data: existing, error: dupErr } = await supabase
      .from('curated_themes')
      .select('id, title')
      .eq('creator_id', user.id)
      .eq('visibility', 'public')
      .ilike('title', list.title)
      .limit(1);
    if (dupErr) throw dupErr;
    if (existing?.[0]) throw new DuplicateCurationError(existing[0].id, existing[0].title);
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

// ============================================================================
// 친구에게 보내기 — 주소로 건네는 1:1 공유 (docs/share-to-friend-spec.md)
//
// 「공유 단어장에 올리기」(shareCuration)와는 **결과도 수명도 다르다.** 이쪽은 목록에
// 실리지 않고(visibility='link') 30일 뒤 스스로 끝나며, 보낸 내용은 그대로 굳는다 —
// 갱신도, 「다시 보내기」로 이어지는 상태도 없다. 누를 때마다 새 주소가 나간다.
// ============================================================================

export interface SentShare {
  themeId: string;
  /** epoch ms. 공유 메시지와 랜딩이 「{날짜}까지」로 읽는다. */
  expiresAt: number;
  /** 실제로 올라간 단어 수. 2,000을 넘겨 잘렸으면 list.words.length 보다 작다. */
  wordCount: number;
}

/**
 * 단어장 사본을 서버에 올리고 주소의 재료(id·만료)를 돌려준다.
 *
 * 제목 중복을 검사하지 않는다 — 만료 모델에서는 **다시 보내는 게 정상 흐름**이라,
 * 「이미 공유되어 있습니다, 갱신할까요?」는 방해가 될 뿐이다(§6.1).
 */
export async function sendListToFriend(
  list: VocaList,
  options: { senderName: string },
): Promise<SentShare> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('NOT_AUTHENTICATED');

  const senderName = options.senderName.trim();
  CurationShareSchema.parse({ title: list.title, creatorName: senderName });

  // 2,000을 넘으면 앞에서 자른다. 부르는 쪽이 먼저 「앞 2,000단어만 보내기」를 확인받는다.
  const words = list.words.slice(0, MAX_WORDS_PER_CURATION);
  for (const w of words) WordSaveSchema.parse(w);

  const now = Date.now();
  if (await countLiveCurations(user.id, now) >= MAX_CURATIONS_PER_USER) {
    throw new CurationCapacityError('CURATIONS_PER_USER', MAX_CURATIONS_PER_USER);
  }

  const { source: sourceLanguage, target: targetLanguage } = deriveDisplayLanguages(words, list);
  const themeId = generateId();
  const expiresAt = now + SHARE_LINK_TTL_MS;

  const { error: themeErr } = await supabase.from('curated_themes').insert({
    id: themeId,
    creator_name: senderName,
    title: list.title,
    description: null,
    source_language: sourceLanguage,
    target_language: targetLanguage,
    icon: list.icon ?? null,
    visibility: 'link',
    expires_at: expiresAt,
    // 어느 단어장에서 나갔는지 — 측정용으로만 남긴다. 단어장 삭제와 잇지 않기로 했다
    // (docs/share-to-friend-spec.md §2-7: 거두는 길은 두지 않는다).
    source_list_id: list.id,
  });
  if (themeErr) throw themeErr;

  const wordRows = toCuratedWordRows({ ...list, words }, themeId);
  try {
    for (let i = 0; i < wordRows.length; i += WORD_INSERT_CHUNK) {
      const chunk = wordRows.slice(i, i + WORD_INSERT_CHUNK);
      const { error } = await supabase.from('curated_words').insert(chunk);
      if (error) throw error;
    }
  } catch (e) {
    // 반쪽 덱을 남기지 않는다 — 받는 사람이 빠진 줄 모르고 담는 편이 실패보다 나쁘다.
    await supabase.from('curated_themes').delete().eq('id', themeId);
    throw e;
  }

  return { themeId, expiresAt, wordCount: words.length };
}

export interface SharedDeck {
  id: string;
  title: string;
  description?: string;
  creatorName: string;
  icon?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  createdAt: number;
  expiresAt: number | null;
  visibility: 'public' | 'link';
  /** 서버가 가진 전체 단어 수. 미리보기면 words.length 보다 크다. */
  wordCount: number;
  preview: boolean;
  words: ReturnType<typeof mapCuratedWord>[];
}

/**
 * 주소로 덱을 연다. 목록 조회로는 보이지 않으므로 **id 를 아는 사람만** 열 수 있다.
 *
 * 만료·삭제·오타를 구분하지 않고 전부 `null` 이다. 서버가 셋을 구분하지 못하고,
 * 구분해서 말하면 틀린 이유를 단정하게 된다(§7 「열 수 없음」).
 */
export async function getSharedDeck(
  id: string,
  options?: { preview?: boolean },
): Promise<SharedDeck | null> {
  const { data, error } = await supabase.rpc('get_shared_deck', {
    p_id: id,
    p_preview: options?.preview ?? false,
  });
  if (error) throw error;
  if (!data) return null;

  const row = data as any;
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    creatorName: row.creator_name,
    icon: row.icon ?? undefined,
    sourceLanguage: row.source_language ?? undefined,
    targetLanguage: row.target_language ?? undefined,
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? null,
    visibility: row.visibility,
    wordCount: row.word_count ?? 0,
    preview: Boolean(row.preview),
    words: (row.words ?? []).map(mapCuratedWord),
  };
}

/**
 * 담긴 횟수를 센다. 화면에는 띄우지 않는다 — 한 사람에게 보내면 0 아니면 1이라 볼 것이
 * 없고, 보이면 「왜 안 담았지」가 생긴다(§2-6). 우리가 판정할 근거로만 쓴다.
 *
 * 실패해도 삼킨다: 담기는 이미 로컬에서 끝났고, 카운트 때문에 성공을 실패로 보여 줄 수 없다.
 */
export async function bumpShareSave(id: string): Promise<void> {
  try {
    await supabase.rpc('bump_share_save', { p_id: id });
  } catch {
    // 무시 — 부가 집계다.
  }
}
