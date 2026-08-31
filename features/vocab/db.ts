import * as Crypto from 'expo-crypto';
import { VocaList, Word } from '@/lib/types';
import { getDb, runInTransaction } from '@/lib/db';
import { recordMemorizedWords } from '@/features/stats';
import { cleanPhonetic } from '@/lib/phonetic';
import { normalizeInflection } from '@/lib/inflection';

export function generateId(): string {
  return Crypto.randomUUID();
}

// ---- Row → domain assemblers ------------------------------------------------
//
// These extract SQLite row objects into app-level Word / VocaList shapes with
// defensive defaults. Defaults matter because mid-migration rows may carry
// undefined values for columns added in later migrations (e.g. v013 added
// `lists.updatedAt`, `lists.deletedAt`, `words.deletedAt`). Without defaults the
// domain layer would leak `undefined` into UI / sync payloads.

function safeJsonParseTags(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function rowToWord(row: any): Word {
  return {
    id: row.id,
    term: row.term ?? '',
    definition: row.definition ?? '',
    // 성조 막대(ㅓㅓ처럼 보임)·일본어 한글 전사 잔존 데이터는 읽기 시점에 정리 — DB를
    // 고치는 대신 여기서 지워야 동기화 pull이 클라우드 옛값을 되살려도 표시가 안 깨진다.
    phonetic: row.phonetic
      ? cleanPhonetic(row.phonetic, row.sourceLang ?? 'en', row.term ?? '') || undefined
      : undefined,
    pos: row.pos ?? undefined,
    exampleEn: row.exampleEn ?? '',
    exampleKr: row.exampleKr ?? undefined,
    meaningKr: row.meaningKr ?? '',
    isMemorized: Boolean(row.isMemorized),
    isStarred: Boolean(row.isStarred),
    tags: safeJsonParseTags(row.tags),
    createdAt: row.createdAt ?? 0,
    updatedAt: row.updatedAt ?? 0,
    wrongCount: row.wrongCount ?? 0,
    assignedDay: row.assignedDay ?? null,
    sourceLang: row.sourceLang ?? 'en',
    targetLang: row.targetLang ?? 'ko',
    lastReviewedAt: row.lastReviewedAt ?? null,
    reviewSuccessCount: row.reviewSuccessCount ?? 0,
    baseForm: row.baseForm ?? undefined,
    // 모르는 코드는 버린다 — 자유 텍스트가 들어오면 화면이 i18n 키를 그대로 노출한다.
    inflection: normalizeInflection(row.inflection),
  };
}

function rowToVocaList(row: any, words: Word[] = []): VocaList {
  return {
    id: row.id,
    title: row.title,
    words,
    isVisible: Boolean(row.isVisible),
    createdAt: row.createdAt ?? 0,
    lastStudiedAt: row.lastStudiedAt ?? undefined,
    position: row.position ?? 0,
    isCurated: Boolean(row.isCurated),
    icon: row.icon || undefined,
    planTotalDays: row.planTotalDays ?? 0,
    planCurrentDay: row.planCurrentDay ?? 1,
    planWordsPerDay: row.planWordsPerDay ?? 10,
    planStartedAt: row.planStartedAt ?? undefined,
    planUpdatedAt: row.planUpdatedAt ?? undefined,
    planFilter: (row.planFilter as 'all' | 'unmemorized' | 'memorized') ?? 'all',
    lastResultMemorized: row.lastResultMemorized ?? 0,
    lastResultTotal: row.lastResultTotal ?? 0,
    lastResultPercent: row.lastResultPercent ?? 0,
    sourceLanguage: row.sourceLanguage ?? undefined,
    targetLanguage: row.targetLanguage ?? undefined,
  };
}

/**
 * Lists & Words
 */
export async function getLists(): Promise<VocaList[]> {
  const db = await getDb();

  // 1. Fetch all non-deleted lists
  const listsRows = await db.getAllAsync<any>(
    'SELECT * FROM lists WHERE deletedAt IS NULL ORDER BY position DESC, createdAt DESC'
  );

  // 2. Fetch all non-deleted words
  const wordsRows = await db.getAllAsync<any>(
    'SELECT * FROM words WHERE deletedAt IS NULL'
  );

  // 3. Group words by listId (O(n) vs the previous O(lists × words))
  const wordsByListId = new Map<string, Word[]>();
  for (const w of wordsRows) {
    const word = rowToWord(w);
    const bucket = wordsByListId.get(w.listId);
    if (bucket) bucket.push(word);
    else wordsByListId.set(w.listId, [word]);
  }

  // 4. Assemble
  return listsRows.map(row => rowToVocaList(row, wordsByListId.get(row.id) ?? []));
}

/**
 * 첫 실행 때 넣을 샘플 단어장. 문구는 **호출부가 만들어 넘긴다**.
 *
 * 이 모듈이 i18n을 직접 읽지 않는 이유: 데이터 계층이 UI 언어를 알 이유가 없고,
 * 실제로 `@/i18n`을 import했더니 expo-localization까지 딸려 와 db 유닛 테스트 두 개가
 * 로드조차 못 하게 됐다. 언어는 화면 쪽 관심사로 남긴다(→ features/vocab/seed.ts).
 */
export interface SeedData {
  listTitle: string;
  words: {
    term: string;
    definition: string;
    phonetic: string;
    pos: string;
    exampleEn: string;
    exampleKr: string;
    meaningKr: string;
    tags: string[];
  }[];
}

export async function initSeedDataIfEmpty(seed: SeedData): Promise<void> {
  const db = await getDb();

  // COUNT(*) returns an object like { count: 0 } or { "COUNT(*)": 0 } depending on exact sqlite query parser
  // It's safer to just get the first row value directly
  const rows = await db.getAllAsync<any>('SELECT COUNT(*) as count FROM lists WHERE deletedAt IS NULL');

  let countValue = 0;
  if (rows && rows.length > 0) {
    const firstRow = rows[0];
    countValue = firstRow.count ?? Object.values(firstRow)[0] ?? 0;
  }

  if (countValue === 0) {
    const defaultListId = generateId();
    await db.runAsync(
      // lastStudiedAt=0 — 아직 학습한 적 없다는 뜻. ListCard 의 getRelativeTime 이
      // 0/undefined 를 "학습 기록 없음"으로 표시한다(스키마가 NOT NULL 이라 0 을 쓴다).
      `INSERT INTO lists (id, title, isVisible, createdAt, lastStudiedAt) VALUES (?, ?, ?, ?, ?)`,
      [defaultListId, seed.listTitle, 1, Date.now(), 0]
    );

    for (const w of seed.words) {
      await db.runAsync(
        `INSERT INTO words (id, listId, term, definition, phonetic, pos, exampleEn, exampleKr, meaningKr, isMemorized, isStarred, tags, baseForm, inflection)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId(), defaultListId,
          w.term, w.definition, w.phonetic, w.pos, w.exampleEn, w.exampleKr, w.meaningKr,
          0, 0, JSON.stringify(w.tags),
          (w as any).baseForm ?? null, normalizeInflection((w as any).inflection) ?? null,
        ]
      );
    }
  }
}

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM words');
  await db.runAsync('DELETE FROM lists');
  // 학습 통계(스트릭·달력·날짜별 로그)도 계정 데이터 — 계정 전환/로그아웃/
  // 클라우드 리셋 시 함께 비워야 다음 계정으로 이전 계정 기록이 새지 않는다.
  // 클라우드 동기화 대상이라 로그인 계정의 기록은 다음 pull이 복원한다.
  await db.runAsync('DELETE FROM study_days');
  await db.runAsync('DELETE FROM memorized_log');
}

export async function createList(title: string): Promise<VocaList> {
  const db = await getDb();
  const id = generateId();
  const now = Date.now();

  await db.runAsync(
    // ⚠️ lastStudiedAt 만 0 이다 — position 은 정렬 기준이라 now 를 그대로 쓴다
    //    (둘을 같이 옮기면 새 단어장이 목록 맨 아래로 간다).
    `INSERT INTO lists (id, title, isVisible, createdAt, lastStudiedAt, position, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, title, 1, now, 0, now, now]
  );

  return {
    id,
    title,
    words: [],
    isVisible: true,
    createdAt: now,
    lastStudiedAt: 0,
    position: now,
    updatedAt: now,
  } as VocaList;
}

export async function createCuratedList(
  title: string,
  icon: string,
  words: Omit<Word, 'id' | 'isMemorized'>[],
  options?: { sourceLanguage?: string; targetLanguage?: string },
): Promise<VocaList> {
  const db = await getDb();
  const id = generateId();
  const now = Date.now();
  const srcLang = options?.sourceLanguage ?? 'en';
  const tgtLang = options?.targetLanguage ?? 'ko';

  await runInTransaction(async () => {
    await db.runAsync(
      // lastStudiedAt=0 — 담기만 한 덱은 "학습 기록 없음"이다(position 은 정렬용이라 now).
      `INSERT INTO lists (id, title, isVisible, createdAt, lastStudiedAt, isCurated, icon, position, updatedAt, sourceLanguage, targetLanguage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, 1, now, 0, 1, icon, now, now, srcLang, tgtLang]
    );

    for (const w of words) {
      await db.runAsync(
        `INSERT INTO words (id, listId, term, definition, phonetic, pos, exampleEn, exampleKr, meaningKr, isMemorized, isStarred, tags, createdAt, sourceLang, targetLang, baseForm, inflection) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId(),
          id,
          w.term ?? '',
          w.definition ?? '',
          w.phonetic ?? null,
          w.pos ?? null,
          w.exampleEn ?? '',
          w.exampleKr || null,
          w.meaningKr ?? '',
          0,
          0,
          JSON.stringify(w.tags ?? []),
          now,
          // 단어별 언어가 없으면(큐레이션 덱·AI 생성) 리스트 언어를 스탬프.
          // 'en'/'ko' 하드코딩 폴백은 비영어 덱 단어 전체를 en→ko로 오염시켰다.
          (w as any).sourceLang ?? srcLang,
          (w as any).targetLang ?? tgtLang,
          (w as any).baseForm ?? null,
          normalizeInflection((w as any).inflection) ?? null,
        ]
      );
    }
  });

  const lists = await getLists();
  return lists.find(l => l.id === id)!;
}

export async function updateList(id: string, updates: Partial<Omit<VocaList, 'id' | 'words'>>): Promise<VocaList | null> {
  const db = await getDb();

  const setClauses: string[] = [];
  const values: any[] = [];

  if (updates.title !== undefined) {
    setClauses.push('title = ?');
    values.push(updates.title);
  }
  if (updates.isVisible !== undefined) {
    setClauses.push('isVisible = ?');
    values.push(updates.isVisible ? 1 : 0);
  }
  if (updates.lastStudiedAt !== undefined) {
    setClauses.push('lastStudiedAt = ?');
    values.push(updates.lastStudiedAt);
  }
  if (updates.planTotalDays !== undefined) {
    setClauses.push('planTotalDays = ?');
    values.push(updates.planTotalDays);
  }
  if (updates.planCurrentDay !== undefined) {
    setClauses.push('planCurrentDay = ?');
    values.push(updates.planCurrentDay);
  }
  if (updates.planWordsPerDay !== undefined) {
    setClauses.push('planWordsPerDay = ?');
    values.push(updates.planWordsPerDay);
  }
  if (updates.planStartedAt !== undefined) {
    setClauses.push('planStartedAt = ?');
    values.push(updates.planStartedAt);
  }
  if (updates.planUpdatedAt !== undefined) {
    setClauses.push('planUpdatedAt = ?');
    values.push(updates.planUpdatedAt);
  }

  if (setClauses.length > 0) {
    setClauses.push('updatedAt = ?');
    values.push(Date.now());
    values.push(id);
    await db.runAsync(
      `UPDATE lists SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );
  }

  const lists = await getLists();
  return lists.find(l => l.id === id) || null;
}

/**
 * Soft-delete a list: mark its row AND all child words with deletedAt = now().
 * The sync engine (features/sync) picks these up via the dirty set and pushes
 * `deletedAt` to the server. Legacy name kept; `softDeleteList` is an alias.
 */
export async function deleteList(id: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await runInTransaction(async () => {
    await db.runAsync('UPDATE lists SET deletedAt = ?, updatedAt = ? WHERE id = ?', [now, now, id]);
    await db.runAsync('UPDATE words SET deletedAt = ?, updatedAt = ? WHERE listId = ? AND deletedAt IS NULL', [now, now, id]);
  });
}

export async function toggleVisibility(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE lists SET isVisible = CASE WHEN isVisible = 1 THEN 0 ELSE 1 END WHERE id = ?',
    [id]
  );
}

export async function addWord(
  listId: string,
  wordData: Omit<Word, 'id' | 'isMemorized'>
): Promise<Word> {
  const db = await getDb();
  const now = Date.now();
  const newWord: Word = {
    id: generateId(),
    ...wordData,
    tags: wordData.tags || [],
    isMemorized: false,
    isStarred: false,
    createdAt: now,
  };

  try {
    await runInTransaction(async () => {
      await db.runAsync(
        `INSERT INTO words (id, listId, term, definition, phonetic, pos, exampleEn, exampleKr, meaningKr, isMemorized, isStarred, tags, createdAt, sourceLang, targetLang, baseForm, inflection) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newWord.id,
          listId,
          newWord.term ?? '',
          newWord.definition ?? '',
          newWord.phonetic ?? null,
          newWord.pos ?? null,
          newWord.exampleEn ?? '',
          newWord.exampleKr || null,
          newWord.meaningKr ?? '',
          0,
          0,
          JSON.stringify(newWord.tags ?? []),
          now,
          newWord.sourceLang ?? 'en',
          newWord.targetLang ?? 'ko',
          newWord.baseForm ?? null,
          normalizeInflection(newWord.inflection) ?? null,
        ]
      );
    });
  } catch (e: any) {
    const msg = String(e?.message ?? '');
    // 같은 단어장 내 동일 term — idx_words_listid_term_unique 위반.
    // 원본 SQLite 에러 대신 UI가 친절히 안내할 수 있게 코드로 변환.
    if (msg.includes('UNIQUE constraint failed')) {
      throw new Error('DUPLICATE_WORD');
    }
    // listId가 lists에 없음 — words.listId FK 위반. UI(예: add-word)의 선택 상태가
    // 삭제/교체된 유령 리스트를 가리킬 때 발생. 원문 노출 대신 코드로 변환해
    // 호출부가 단어장 재선택을 유도하도록 한다.
    if (msg.includes('FOREIGN KEY constraint failed')) {
      throw new Error('LIST_NOT_FOUND');
    }
    throw e;
  }

  return newWord;
}

export async function addBatchWords(
  listId: string,
  wordsData: Array<Partial<Omit<Word, 'id' | 'createdAt' | 'updatedAt' | 'listId'>> & { term: string, meaningKr: string }>
): Promise<Word[]> {
  const db = await getDb();

  const now = Date.now();
  const listWords = await db.getAllAsync<any>('SELECT * FROM words WHERE listId = ? AND deletedAt IS NULL ORDER BY position ASC, createdAt DESC;', [listId]);

  // 기존 단어 term set (정규화)
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const existingTerms = new Set(listWords.map((w: any) => normalize(w.term)));

  // 기존 단어와의 중복 제거 + 배치 내 자체 중복 제거
  const seen = new Set<string>();
  const deduped = wordsData.filter(w => {
    const key = normalize(w.term);
    if (existingTerms.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (deduped.length === 0) return [];

  let currentPosition = now;
  if (listWords.length > 0) {
    currentPosition = listWords[0].position - 1000;
  }

  const newWords: Word[] = deduped.map((w, index) => ({
    id: generateId(),
    listId,
    term: w.term,
    meaningKr: w.meaningKr,
    definition: w.definition || '',
    phonetic: w.phonetic || '',
    pos: w.pos || '',
    exampleEn: w.exampleEn || '',
    exampleKr: w.exampleKr || '',
    tags: w.tags || [],
    isMemorized: w.isMemorized || false,
    isStarred: w.isStarred || false,
  }));

  const bulkData = deduped.map((w, index) => ({
    ...newWords[index],
    position: currentPosition - (index * 1000),
    createdAt: now + index,
    updatedAt: now + index,
  }));

  await runInTransaction(async () => {
    for (const data of bulkData) {
      await db.runAsync(
        `INSERT INTO words (id, listId, term, definition, phonetic, pos, meaningKr, exampleEn, exampleKr, tags, isMemorized, isStarred, position, createdAt, updatedAt, sourceLang, targetLang, baseForm, inflection) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.id,
          listId,
          data.term ?? '',
          data.definition ?? '',
          data.phonetic ?? null,
          data.pos ?? null,
          data.meaningKr ?? '',
          data.exampleEn ?? '',
          data.exampleKr || null,
          JSON.stringify(data.tags ?? []),
          data.isMemorized ? 1 : 0,
          data.isStarred ? 1 : 0,
          (data as any).position,
          (data as any).createdAt,
          (data as any).updatedAt,
          data.sourceLang ?? 'en',
          data.targetLang ?? 'ko',
          data.baseForm ?? null,
          normalizeInflection(data.inflection) ?? null,
        ]
      );
    }
  });

  return newWords;
}

export async function updateWord(
  listId: string,
  wordId: string,
  updates: Partial<Omit<Word, 'id'>>
): Promise<Word | null> {
  const db = await getDb();

  const setClauses: string[] = [];
  const values: any[] = [];

  if (updates.term !== undefined) { setClauses.push('term = ?'); values.push(updates.term); }
  if (updates.definition !== undefined) { setClauses.push('definition = ?'); values.push(updates.definition); }
  if (updates.phonetic !== undefined) { setClauses.push('phonetic = ?'); values.push(updates.phonetic); }
  if (updates.pos !== undefined) { setClauses.push('pos = ?'); values.push(updates.pos); }
  if (updates.exampleEn !== undefined) { setClauses.push('exampleEn = ?'); values.push(updates.exampleEn); }
  if (updates.exampleKr !== undefined) { setClauses.push('exampleKr = ?'); values.push(updates.exampleKr); }
  if (updates.meaningKr !== undefined) { setClauses.push('meaningKr = ?'); values.push(updates.meaningKr); }
  if (updates.isMemorized !== undefined) { setClauses.push('isMemorized = ?'); values.push(updates.isMemorized ? 1 : 0); }
  if (updates.isStarred !== undefined) { setClauses.push('isStarred = ?'); values.push(updates.isStarred ? 1 : 0); }
  if (updates.tags !== undefined) { setClauses.push('tags = ?'); values.push(JSON.stringify(updates.tags)); }
  if (updates.sourceLang !== undefined) { setClauses.push('sourceLang = ?'); values.push(updates.sourceLang); }
  if (updates.targetLang !== undefined) { setClauses.push('targetLang = ?'); values.push(updates.targetLang); }
  if (updates.baseForm !== undefined) { setClauses.push('baseForm = ?'); values.push(updates.baseForm || null); }
  if (updates.inflection !== undefined) { setClauses.push('inflection = ?'); values.push(normalizeInflection(updates.inflection) ?? null); }

  if (setClauses.length > 0) {
    values.push(wordId);
    await runInTransaction(async () => {
      await db.runAsync(
        `UPDATE words SET ${setClauses.join(', ')} WHERE id = ?`,
        ...values
      );
      // ⚠️ 여기서 lastStudiedAt 을 건드리지 않는다 — 단어 편집은 학습이 아니다.
      //    갱신 지점은 updateStudyTime 하나뿐이다(그 함수의 주석 참조).
    });
  }

  // Refetch to return
  const lists = await getLists();
  const targetList = lists.find(l => l.id === listId);
  return targetList?.words.find(w => w.id === wordId) || null;
}

export async function deleteWord(listId: string, wordId: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync('UPDATE words SET deletedAt = ?, updatedAt = ? WHERE id = ?', now, now, wordId);
}

export async function deleteWords(listId: string, wordIds: string[]): Promise<void> {
  const db = await getDb();
  if (wordIds.length === 0) return;
  const placeholders = wordIds.map(() => '?').join(',');
  const now = Date.now();
  await db.runAsync(`UPDATE words SET deletedAt = ?, updatedAt = ? WHERE id IN (${placeholders})`, now, now, ...wordIds);
}

export async function toggleMemorized(
  listId: string,
  wordId: string,
  forceStatus?: boolean
): Promise<void> {
  if (!wordId || !listId) {
    console.error('toggleMemorized: Missing id', { wordId, listId });
    return;
  }
  const db = await getDb();

  // 이 토글로 미암기→암기가 되는지 판정(통계·복습 기록용). forceStatus=false면 항상 아님.
  let becameMemorized = false;
  if (forceStatus !== false) {
    const r = await db.getFirstAsync<{ m: number }>('SELECT isMemorized as m FROM words WHERE id = ?', wordId);
    becameMemorized = (r?.m ?? 0) === 0; // 직전이 미암기 → 토글/강제 후 암기
  }

  await runInTransaction(async () => {
    if (forceStatus !== undefined) {
      await db.runAsync('UPDATE words SET isMemorized = ? WHERE id = ?', forceStatus ? 1 : 0, wordId);
    } else {
      await db.runAsync('UPDATE words SET isMemorized = CASE WHEN isMemorized = 1 THEN 0 ELSE 1 END WHERE id = ?', wordId);
    }
    // 손으로 켠 암기도 학습으로 외운 것과 같은 출발선에 세운다(gentle SRS §4.3).
    // 이 두 줄이 없으면 lastReviewedAt이 NULL로 남고, 엔진은 NULL을 "학습 이력 없음"으로
    // 읽어 due에서 제외하므로(engine.isWordDue) 그 단어는 **영영 복습에 안 걸린다.**
    // 세션 커밋의 startIds와 같은 규칙 — 카운트는 += 1이 아니라 = 1이어야 한다
    // (껐다 켠 단어의 잔여 카운트 위에 얹히면 3일이 아니라 90일에서 재시작한다).
    if (becameMemorized) {
      await db.runAsync(
        'UPDATE words SET lastReviewedAt = ?, reviewSuccessCount = 1 WHERE id = ?',
        Date.now(),
        wordId,
      );
    }
    // ⚠️ lastStudiedAt 은 건드리지 않는다 — 목록·단어 상세의 암기 체크는 학습이 아니다.
    //    학습 세션의 암기 전환은 commitSessionResults 가 updateStudyTime 으로 따로 남긴다.
  });

  if (becameMemorized) await recordMemorizedWords([wordId]).catch(() => {});
}

export async function toggleStarred(
  listId: string,
  wordId: string,
  forceStatus?: boolean
): Promise<void> {
  if (!wordId || !listId) {
    console.error('toggleStarred: Missing id', { wordId, listId });
    return;
  }
  const db = await getDb();
  await runInTransaction(async () => {
    if (forceStatus !== undefined) {
      await db.runAsync('UPDATE words SET isStarred = ? WHERE id = ?', forceStatus ? 1 : 0, wordId);
    } else {
      await db.runAsync('UPDATE words SET isStarred = CASE WHEN isStarred = 1 THEN 0 ELSE 1 END WHERE id = ?', wordId);
    }
    // ⚠️ 별표는 학습이 아니다 — lastStudiedAt 을 건드리지 않는다.
  });
}

export async function mergeLists(
  sourceId: string,
  targetId: string,
  deleteSource: boolean
): Promise<void> {
  const db = await getDb();
  const lists = await getLists();

  const sourceList = lists.find(l => l.id === sourceId);
  const targetList = lists.find(l => l.id === targetId);
  if (!sourceList || !targetList) return;

  const existingTerms = new Set(targetList.words.map(w => w.term.toLowerCase()));
  const wordsToAdd = sourceList.words
    .filter(w => !existingTerms.has(w.term.toLowerCase()));

  const mergeNow = Date.now();
  await runInTransaction(async () => {
    for (const w of wordsToAdd) {
      await db.runAsync(
        `INSERT INTO words (id, listId, term, definition, phonetic, pos, exampleEn, exampleKr, meaningKr, isMemorized, isStarred, tags, createdAt, sourceLang, targetLang, baseForm, inflection) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId(),
          targetId,
          w.term ?? '',
          w.definition ?? '',
          w.phonetic ?? null,
          w.pos ?? null,
          w.exampleEn ?? '',
          w.exampleKr || null,
          w.meaningKr ?? '',
          0,
          0,
          JSON.stringify(w.tags || []),
          mergeNow,
          w.sourceLang ?? 'en',
          w.targetLang ?? 'ko',
          w.baseForm ?? null,
          normalizeInflection(w.inflection) ?? null,
        ]
      );
    }

    // ⚠️ 병합은 학습이 아니다 — lastStudiedAt 을 건드리지 않는다.

    if (deleteSource) {
      // Soft-delete source list + cascade to its words. Sync engine picks up via dirty set.
      await db.runAsync('UPDATE lists SET deletedAt = ?, updatedAt = ? WHERE id = ?', mergeNow, mergeNow, sourceId);
      await db.runAsync('UPDATE words SET deletedAt = ?, updatedAt = ? WHERE listId = ? AND deletedAt IS NULL', mergeNow, mergeNow, sourceId);
    }
  });
}

export async function reorderLists(orderedIds: string[]): Promise<void> {
  const db = await getDb();
  // With SQLite, order is typically managed by a sortOrder column or timestamp.
  // The original async storage logic implicitly trusted array order and re-saved the JSON.
  // To simulate custom ordering, we would need a 'sortOrder' integral column on 'lists'.
  // We'll update lastStudiedAt to artificially sort them in UI as a fallback for now,
  // or add a proper ordering schema next iteration.
  // For now: update lastStudiedAt spaced by ms to cheat the sort if needed,
  // but it's better to alter table later.

  const now = Date.now();
  await runInTransaction(async () => {
    // Reverse iterating to give highest position to first item in orderedIds
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      const newPos = now + ((orderedIds.length - i) * 1000);
      await db.runAsync('UPDATE lists SET position = ? WHERE id = ?', newPos, id);
    }
  });
}

/**
 * 🔴 `saveLastResult` 는 2026-08-29 에 삭제했다 — **되살리지 말 것.**
 *
 * 완주할 때마다 단어장 전체 암기율을 `lists.lastResult{Memorized,Total,Percent}` 에
 * 저장했는데, **화면에서 읽는 곳이 0곳**이었다. ListCard 는 이 스냅샷을 일부러 안 쓴다
 * — 완주 시점에 고정돼 이후의 단어 추가·삭제·암기 토글을 반영하지 못하고, 상세 화면의
 * 라이브 카운트와 어긋나기 때문이다(`components/ListCard.tsx` 주석). 그래서 남은 것은
 * **쓰기뿐**이었고, 완주마다 아무도 안 보는 값 때문에 단어장이 dirty 로 찍혀 클라우드
 * push 가 일어났다.
 *
 * 컬럼과 동기화 배선(`features/sync/mapping.ts`·`engine.ts`)은 **그대로 둔다** — 서버에
 * 이미 있고, 구버전 앱이 여전히 값을 올린다. 읽어서 화면에 쓸 일이 생기면 스냅샷이
 * 아니라 그때 라이브로 계산할 것.
 */

/**
 * `lists.lastStudiedAt` 을 갱신하는 **유일한** 지점.
 *
 * 🔴 2026-08-29 이전에는 갱신 지점이 8곳이었고 그중 **학습 경로는 하나도 없었다** —
 *    updateWord·toggleMemorized·toggleStarred·mergeLists·setWordsMemorized·
 *    copyWords·moveWords. 그래서 덱을 담기만 하거나 별표 하나만 눌러도 단어장 목록이
 *    "마지막 학습: 방금 전"이라고 표시했다. 이 함수는 이름이 맞는 유일한 함수였는데
 *    아무 데서도 부르지 않아 죽어 있었다.
 *
 * 🔑 이제 부르는 곳은 `commitSessionResults`(features/study/use-session-commit.ts)
 *    하나다 — 학습 결과가 DB 에 닿는 유일한 지점이라, 완주·헤더 뒤로가기·하드웨어
 *    뒤로가기 세 경로가 자동으로 같은 규칙을 받는다.
 *
 * ⚠️ 다른 곳에서 부르지 말 것. 단어를 만지는 동작(편집·별표·복사·이동·병합·목록의
 *    암기 체크)은 학습이 아니다. 낭독은 기존 결정대로 통계에서 빠지며, 이 함수를
 *    거치지 않는 경로라 자동으로 지켜진다.
 *
 * 🔑 정렬은 이 컬럼과 무관하다(`ORDER BY position DESC`) — 마이그레이션 006 에서
 *    position 으로 옮겨갔다. 이 값은 화면 표시(ListCard) 전용이다.
 */
export async function updateStudyTime(listId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE lists SET lastStudiedAt = ? WHERE id = ?', Date.now(), listId);
}

export async function setWordsMemorized(
  listId: string,
  wordIds: string[],
  isMemorized: boolean
): Promise<void> {
  if (!listId || wordIds.length === 0) return;

  const db = await getDb();
  const status = isMemorized ? 1 : 0;
  const placeholders = wordIds.map(() => '?').join(',');

  // 미암기→암기 전환되는 단어 id를 트랜잭션 전에 수집(통계·날짜별 로그 기록용).
  let newlyMemorizedIds: string[] = [];
  if (isMemorized) {
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM words WHERE id IN (${placeholders}) AND isMemorized = 0`,
      ...wordIds
    );
    newlyMemorizedIds = rows.map(r => r.id);
  }

  await runInTransaction(async () => {
    await db.runAsync(
      `UPDATE words SET isMemorized = ? WHERE id IN (${placeholders})`,
      status,
      ...wordIds
    );
    // ⚠️ 여기서 갱신하면 안 된다 — 이 함수는 학습 세션(commitSessionResults)과
    //    목록의 일괄 암기 체크 양쪽에서 불린다. 학습 쪽 갱신은 호출자인
    //    commitSessionResults 가 updateStudyTime 으로 따로 남긴다.
  });

  // 트랜잭션 커밋 후 기록(중첩 트랜잭션 방지).
  if (newlyMemorizedIds.length > 0) await recordMemorizedWords(newlyMemorizedIds).catch(() => {});
}

export async function copyWords(targetListId: string, wordIds: string[]): Promise<void> {
  const db = await getDb();
  if (wordIds.length === 0) return;

  const placeholders = wordIds.map(() => '?').join(',');
  const sourceWords = await db.getAllAsync<any>(
    `SELECT * FROM words WHERE id IN (${placeholders}) AND deletedAt IS NULL`,
    ...wordIds
  );

  const copyNow = Date.now();
  await runInTransaction(async () => {
    for (const w of sourceWords) {
      await db.runAsync(
        `INSERT INTO words (id, listId, term, definition, phonetic, pos, meaningKr, exampleEn, exampleKr, isMemorized, isStarred, tags, position, createdAt, sourceLang, targetLang, baseForm, inflection)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId(),
          targetListId,
          w.term,
          w.definition,
          w.phonetic,
          w.pos,
          w.meaningKr,
          w.exampleEn,
          w.exampleKr,
          0, // copied words start as not memorized
          0, // and not starred
          w.tags,
          copyNow, // default position
          copyNow, // createdAt = copy time
          w.sourceLang ?? 'en',
          w.targetLang ?? 'ko',
          w.baseForm ?? null,
          normalizeInflection(w.inflection) ?? null,
        ]
      );
    }
    // ⚠️ 복사는 학습이 아니다 — lastStudiedAt 을 건드리지 않는다.
  });
}

export async function moveWords(targetListId: string, wordIds: string[]): Promise<void> {
  const db = await getDb();
  if (wordIds.length === 0) return;

  const placeholders = wordIds.map(() => '?').join(',');
  await runInTransaction(async () => {
    await db.runAsync(
      `UPDATE words SET listId = ?, position = ? WHERE id IN (${placeholders})`,
      targetListId,
      Date.now(),
      ...wordIds
    );
    // ⚠️ 이동은 학습이 아니다 — lastStudiedAt 을 건드리지 않는다.
  });
}

export async function incrementWrongCount(wordIds: string[]): Promise<void> {
  if (wordIds.length === 0) return;
  const db = await getDb();
  const placeholders = wordIds.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE words SET wrongCount = wrongCount + 1 WHERE id IN (${placeholders})`,
    ...wordIds
  );
}

export async function resetWrongCount(wordIds: string[]): Promise<void> {
  if (wordIds.length === 0) return;
  const db = await getDb();
  const placeholders = wordIds.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE words SET wrongCount = 0 WHERE id IN (${placeholders})`,
    ...wordIds
  );
}

// ---- Gentle SRS 복습 상태 (docs/gentle-srs-design.md §4) ---------------------

/**
 * 한 세션의 복습 상태 변화. 네 집합은 각각 다른 규칙이라 따로 받는다.
 * 분류는 features/study/session-results.ts가 담당한다(순수 함수).
 */
export interface ReviewOutcomes {
  /** 답한 전부 → lastReviewedAt = now. "볼 때마다 자동 갱신"(§4.1) */
  seenIds: string[];
  /** 처음 외운 단어 → 사다리 첫 칸. 증가가 아니라 **대입**이다(아래 주석) */
  startIds: string[];
  /** due였던 단어를 맞힘 → 사다리 한 칸 전진 */
  advanceIds: string[];
  /** "다시 볼게요" → 사다리 리셋 */
  resetIds: string[];
}

// SQLite 파라미터 한도(999) 회피를 위해 300개씩 끊는다 — 큰 단어장을 통째로
// 학습하면 세션 하나가 그 한도를 넘길 수 있다(recordMemorizedWords와 같은 규칙).
const REVIEW_CHUNK = 300;

/**
 * 한 세션의 복습 상태를 한 번에 기록한다.
 *
 * 네 갈래를 개별 mutation으로 쪼개지 않고 묶은 이유: mutation 하나가 끝날 때마다
 * lists 캐시를 무효화(= 전체 재조회)하므로, 쪼개면 세션 커밋 한 번에 재조회가 네 번 더
 * 붙는다. 트랜잭션으로 묶으면 중간 상태가 UI에 새지도 않는다.
 *
 * ⚠️ 호출자의 트랜잭션 안에서 부르지 말 것(중첩 트랜잭션 크래시) — commitSessionResults가
 * setWordsMemorized 등과 **순차로** 부르는 것을 전제한다.
 */
export async function recordReviewOutcomes(
  outcomes: ReviewOutcomes,
  now: number = Date.now(),
): Promise<void> {
  const { seenIds, startIds, advanceIds, resetIds } = outcomes;
  if (seenIds.length === 0 && startIds.length === 0 && advanceIds.length === 0 && resetIds.length === 0) return;

  const db = await getDb();
  const applyChunked = async (ids: string[], sql: (placeholders: string) => string, lead: (string | number)[] = []) => {
    for (let i = 0; i < ids.length; i += REVIEW_CHUNK) {
      const chunk = ids.slice(i, i + REVIEW_CHUNK);
      await db.runAsync(sql(chunk.map(() => '?').join(',')), ...lead, ...chunk);
    }
  };

  await runInTransaction(async () => {
    // 본 시각은 정답·오답 무관하게 갱신 — 아래 카운트 변경들과 컬럼이 겹치지 않는다.
    await applyChunked(seenIds, ph => `UPDATE words SET lastReviewedAt = ? WHERE id IN (${ph})`, [now]);

    // 처음 외운 단어는 += 1이 아니라 = 1이어야 한다. 단어 목록에서 수동으로 암기를
    // 껐다 켜면(toggleMemorized) 카운트가 남아 있을 수 있는데, 증가로 처리하면 그
    // 잔여값 위에 얹혀 3일이 아니라 30일·90일에서 재시작해 버린다.
    await applyChunked(startIds, ph => `UPDATE words SET reviewSuccessCount = 1 WHERE id IN (${ph})`);

    await applyChunked(
      advanceIds,
      ph => `UPDATE words SET reviewSuccessCount = COALESCE(reviewSuccessCount, 0) + 1 WHERE id IN (${ph})`,
    );

    await applyChunked(resetIds, ph => `UPDATE words SET reviewSuccessCount = 0 WHERE id IN (${ph})`);
  });
}

export async function savePlan(
  listId: string,
  wordsPerDay: number,
  assignedDays: Array<{ wordId: string; day: number }>,
  totalDays: number,
  filter: 'all' | 'unmemorized' | 'memorized' = 'all'
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await runInTransaction(async () => {
    await db.runAsync(
      `UPDATE lists SET planTotalDays = ?, planCurrentDay = 1, planWordsPerDay = ?, planStartedAt = ?, planUpdatedAt = NULL, planFilter = ? WHERE id = ?`,
      [totalDays, wordsPerDay, now, filter, listId]
    );
    // Clear stale assignments first: when re-planning with a partial filter
    // (unmemorized/memorized), words excluded from `assignedDays` must lose
    // their previous day so they don't leak into the plan view. For filter='all'
    // every word is reassigned below, so this is a no-op there.
    await db.runAsync('UPDATE words SET assignedDay = NULL WHERE listId = ?', [listId]);
    for (const { wordId, day } of assignedDays) {
      await db.runAsync('UPDATE words SET assignedDay = ? WHERE id = ?', [day, wordId]);
    }
  });
}

export async function clearPlan(listId: string): Promise<void> {
  const db = await getDb();
  await runInTransaction(async () => {
    await db.runAsync(
      `UPDATE lists SET planTotalDays = 0, planCurrentDay = 1, planWordsPerDay = 10, planStartedAt = NULL, planUpdatedAt = NULL WHERE id = ?`,
      [listId]
    );
    await db.runAsync('UPDATE words SET assignedDay = NULL WHERE listId = ?', [listId]);
  });
}

export async function updatePlanProgress(listId: string, currentDay: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE lists SET planCurrentDay = MAX(planCurrentDay, ?), planUpdatedAt = ? WHERE id = ?',
    [currentDay, Date.now(), listId]
  );
}

export async function resetPlanCurrentDayToTotal(listId: string): Promise<void> {
  const db = await getDb();
  const list = await db.getFirstAsync<{ planTotalDays: number | null }>(
    'SELECT planTotalDays FROM lists WHERE id = ? AND deletedAt IS NULL', [listId]
  );
  const planTotalDays = list?.planTotalDays ?? 1;
  await db.runAsync(
    'UPDATE lists SET planCurrentDay = ?, planUpdatedAt = ? WHERE id = ?',
    [planTotalDays, Date.now(), listId]
  );
}

/**
 * Re-anchors a stale/expired plan's window to now without touching progress.
 * `planCurrentDay` and word assignments are preserved so the user resumes where
 * they left off; only the deadline clock restarts. `planUpdatedAt` is cleared so
 * the inactive threshold resets and today's study state is recomputed cleanly
 * (shows "학습하기" until studied, then "추가학습"). Without this, computePlanStatus
 * keeps returning 'overdue' forever because planEndDate stays in the past.
 */
export async function restartPlanWindow(listId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE lists SET planStartedAt = ?, planUpdatedAt = NULL WHERE id = ?',
    [Date.now(), listId]
  );
}
