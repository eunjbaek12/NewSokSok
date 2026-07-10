import * as Crypto from 'expo-crypto';
import { VocaList, Word } from '@/lib/types';
import { getDb, runInTransaction } from '@/lib/db';
import { recordMemorizedWords } from '@/features/stats';
import { stripToneBars } from '@/lib/phonetic';

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
    // 성조 막대(ㅓㅓ처럼 보임) 잔존 데이터는 읽기 시점에 정리 — DB를 고치는 대신
    // 여기서 지워야 동기화 pull이 클라우드 옛값을 되살려도 표시가 안 깨진다.
    phonetic: row.phonetic ? stripToneBars(row.phonetic) || undefined : undefined,
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

export async function initSeedDataIfEmpty(): Promise<void> {
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
      `INSERT INTO lists (id, title, isVisible, createdAt, lastStudiedAt) VALUES (?, ?, ?, ?, ?)`,
      [defaultListId, '샘플 단어장 (Sample)', 1, Date.now(), Date.now()]
    );

    await db.runAsync(
      `INSERT INTO words (id, listId, term, definition, phonetic, pos, exampleEn, exampleKr, meaningKr, isMemorized, isStarred, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [generateId(), defaultListId, 'Serendipity', 'The occurrence of events by chance in a happy way', 'ˌserənˈdipədē', 'noun', 'We found the cafe by serendipity.', '우리는 우연히 그 카페를 찾았다.', '뜻밖의 행운', 0, 0, JSON.stringify(['행운', '우연'])]
    );

    await db.runAsync(
      `INSERT INTO words (id, listId, term, definition, phonetic, pos, exampleEn, exampleKr, meaningKr, isMemorized, isStarred, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [generateId(), defaultListId, 'Resilience', 'The capacity to recover quickly from difficulties', 'riˈzilyəns', 'noun', 'He showed great resilience after the failure.', '그는 실패 후 놀라운 회복력을 보여주었다.', '회복력', 0, 0, JSON.stringify(['멘탈', '회복'])]
    );

    await db.runAsync(
      `INSERT INTO words (id, listId, term, definition, phonetic, pos, exampleEn, exampleKr, meaningKr, isMemorized, isStarred, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [generateId(), defaultListId, 'Consistency', 'Conformity in the application of something', 'kənˈsistənsē', 'noun', 'Consistency is key to success.', '일관성은 성공의 열쇠이다.', '일관성', 0, 0, JSON.stringify(['습관'])]
    );
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

export async function mergeCloudData(cloudLists: VocaList[]): Promise<void> {
  const db = await getDb();
  await runInTransaction(async () => {
    for (const list of cloudLists) {
      await db.runAsync(
        `INSERT OR REPLACE INTO lists (id, title, isVisible, createdAt, lastStudiedAt, position, isCurated, icon,
           planTotalDays, planCurrentDay, planWordsPerDay, planStartedAt, planUpdatedAt, planFilter,
           lastResultMemorized, lastResultTotal, lastResultPercent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          list.id, list.title, list.isVisible ? 1 : 0, list.createdAt,
          list.lastStudiedAt ?? null, list.position ?? 0, list.isCurated ? 1 : 0, list.icon ?? null,
          list.planTotalDays ?? 0, list.planCurrentDay ?? 1, list.planWordsPerDay ?? 10,
          list.planStartedAt ?? null, list.planUpdatedAt ?? null, list.planFilter ?? 'all',
          list.lastResultMemorized ?? 0, list.lastResultTotal ?? 0, list.lastResultPercent ?? 0,
        ]
      );
      for (const word of list.words) {
        await db.runAsync(
          `INSERT OR REPLACE INTO words (id, listId, term, definition, phonetic, pos, exampleEn, exampleKr,
             meaningKr, isMemorized, isStarred, tags, createdAt, updatedAt, wrongCount, assignedDay,
             sourceLang, targetLang)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            word.id, list.id, word.term, word.definition ?? null, word.phonetic ?? null,
            word.pos ?? null, word.exampleEn ?? null, word.exampleKr ?? null, word.meaningKr,
            word.isMemorized ? 1 : 0, word.isStarred ? 1 : 0, JSON.stringify(word.tags ?? []),
            word.createdAt ?? 0, word.updatedAt ?? 0, word.wrongCount ?? 0,
            word.assignedDay ?? null, word.sourceLang ?? 'en', word.targetLang ?? 'ko',
          ]
        );
      }
    }
  });
}

export async function replaceLocalWithCloudData(lists: VocaList[]): Promise<void> {
  const db = await getDb();
  await runInTransaction(async () => {
    await db.runAsync('DELETE FROM words');
    await db.runAsync('DELETE FROM lists');
    for (const list of lists) {
      await db.runAsync(
        `INSERT INTO lists (id, title, isVisible, createdAt, lastStudiedAt, position, isCurated, icon,
           planTotalDays, planCurrentDay, planWordsPerDay, planStartedAt, planUpdatedAt, planFilter,
           lastResultMemorized, lastResultTotal, lastResultPercent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          list.id, list.title, list.isVisible ? 1 : 0, list.createdAt,
          list.lastStudiedAt ?? null, list.position ?? 0, list.isCurated ? 1 : 0, list.icon ?? null,
          list.planTotalDays ?? 0, list.planCurrentDay ?? 1, list.planWordsPerDay ?? 10,
          list.planStartedAt ?? null, list.planUpdatedAt ?? null, list.planFilter ?? 'all',
          list.lastResultMemorized ?? 0, list.lastResultTotal ?? 0, list.lastResultPercent ?? 0,
        ]
      );
      for (const word of list.words) {
        await db.runAsync(
          `INSERT INTO words (id, listId, term, definition, phonetic, pos, exampleEn, exampleKr,
             meaningKr, isMemorized, isStarred, tags, createdAt, updatedAt, wrongCount, assignedDay,
             sourceLang, targetLang)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            word.id, list.id, word.term, word.definition ?? null, word.phonetic ?? null,
            word.pos ?? null, word.exampleEn ?? null, word.exampleKr ?? null, word.meaningKr,
            word.isMemorized ? 1 : 0, word.isStarred ? 1 : 0, JSON.stringify(word.tags ?? []),
            word.createdAt ?? 0, word.updatedAt ?? 0, word.wrongCount ?? 0,
            word.assignedDay ?? null, word.sourceLang ?? 'en', word.targetLang ?? 'ko',
          ]
        );
      }
    }
  });
}

export async function createList(title: string): Promise<VocaList> {
  const db = await getDb();
  const id = generateId();
  const now = Date.now();

  await db.runAsync(
    `INSERT INTO lists (id, title, isVisible, createdAt, lastStudiedAt, position, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, title, 1, now, now, now, now]
  );

  return {
    id,
    title,
    words: [],
    isVisible: true,
    createdAt: now,
    lastStudiedAt: now,
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
      `INSERT INTO lists (id, title, isVisible, createdAt, lastStudiedAt, isCurated, icon, position, updatedAt, sourceLanguage, targetLanguage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, 1, now, now, 1, icon, now, now, srcLang, tgtLang]
    );

    for (const w of words) {
      await db.runAsync(
        `INSERT INTO words (id, listId, term, definition, phonetic, pos, exampleEn, exampleKr, meaningKr, isMemorized, isStarred, tags, createdAt, sourceLang, targetLang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        `INSERT INTO words (id, listId, term, definition, phonetic, pos, exampleEn, exampleKr, meaningKr, isMemorized, isStarred, tags, createdAt, sourceLang, targetLang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        `INSERT INTO words (id, listId, term, definition, phonetic, pos, meaningKr, exampleEn, exampleKr, tags, isMemorized, isStarred, position, createdAt, updatedAt, sourceLang, targetLang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

  if (setClauses.length > 0) {
    values.push(wordId);
    await runInTransaction(async () => {
      await db.runAsync(
        `UPDATE words SET ${setClauses.join(', ')} WHERE id = ?`,
        ...values
      );
      // touch list lastStudiedAt? optional but consistent with AsyncStore logic although maybe slow for every word edit
      // update list record for sync/last activity tracking
      await db.runAsync(
        `UPDATE lists SET lastStudiedAt = ? WHERE id = ?`,
        Date.now(),
        listId
      );
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

  // 이 토글로 미암기→암기가 되는지 판정(통계 기록용). forceStatus=false면 항상 아님.
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
    await db.runAsync(`UPDATE lists SET lastStudiedAt = ? WHERE id = ?`, Date.now(), listId);
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
    await db.runAsync(`UPDATE lists SET lastStudiedAt = ? WHERE id = ?`, Date.now(), listId);
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
        `INSERT INTO words (id, listId, term, definition, phonetic, pos, exampleEn, exampleKr, meaningKr, isMemorized, isStarred, tags, createdAt, sourceLang, targetLang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        ]
      );
    }

    await db.runAsync(`UPDATE lists SET lastStudiedAt = ? WHERE id = ?`, mergeNow, targetId);

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

export async function saveLastResult(listId: string): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ memorized: number; total: number }>(
    `SELECT COUNT(*) as total, SUM(CASE WHEN isMemorized = 1 THEN 1 ELSE 0 END) as memorized FROM words WHERE listId = ? AND deletedAt IS NULL`,
    [listId]
  );
  const memorized = row?.memorized ?? 0;
  const total = row?.total ?? 0;
  const percent = total > 0 ? Math.round((memorized / total) * 100) : 0;
  await db.runAsync(
    `UPDATE lists SET lastResultMemorized = ?, lastResultTotal = ?, lastResultPercent = ? WHERE id = ?`,
    [memorized, total, percent, listId]
  );
}

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
    await db.runAsync(
      `UPDATE lists SET lastStudiedAt = ? WHERE id = ?`,
      Date.now(),
      listId
    );
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
        `INSERT INTO words (id, listId, term, definition, phonetic, pos, meaningKr, exampleEn, exampleKr, isMemorized, isStarred, tags, position, createdAt, sourceLang, targetLang)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        ]
      );
    }
    await db.runAsync('UPDATE lists SET lastStudiedAt = ? WHERE id = ?', copyNow, targetListId);
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
    await db.runAsync('UPDATE lists SET lastStudiedAt = ? WHERE id = ?', Date.now(), targetListId);
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
