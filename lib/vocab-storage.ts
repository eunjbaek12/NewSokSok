import * as Crypto from 'expo-crypto';
import { VocaList, Word, AIWordResult } from './types';
import { getDb } from './db';

export function generateId(): string {
  return Crypto.randomUUID();
}

/**
 * Lists & Words
 */
export async function getLists(): Promise<VocaList[]> {
  const db = await getDb();

  // 1. Fetch all lists
  const listsRows = await db.getAllAsync<any>(
    'SELECT * FROM lists ORDER BY position DESC, createdAt DESC'
  );

  // 2. Fetch all words
  const wordsRows = await db.getAllAsync<any>(
    'SELECT * FROM words'
  );

  // 3. Assemble
  const lists: VocaList[] = listsRows.map(row => {
    const listWords = wordsRows
      .filter(w => w.listId === row.id)
      .map(w => ({
        id: w.id,
        term: w.term,
        definition: w.definition,
        phonetic: w.phonetic,
        pos: w.pos,
        exampleEn: w.exampleEn,
        exampleKr: w.exampleKr,
        meaningKr: w.meaningKr,
        isMemorized: Boolean(w.isMemorized),
        isStarred: Boolean(w.isStarred),
        tags: w.tags ? JSON.parse(w.tags) : [],
        createdAt: w.createdAt ?? 0,
        updatedAt: w.updatedAt ?? 0,
        wrongCount: w.wrongCount ?? 0,
        assignedDay: w.assignedDay ?? null,
        sourceLang: w.sourceLang ?? 'en',
        targetLang: w.targetLang ?? 'ko',
      }));

    return {
      id: row.id,
      title: row.title,
      isVisible: Boolean(row.isVisible),
      createdAt: row.createdAt,
      lastStudiedAt: row.lastStudiedAt,
      position: row.position,
      isCurated: Boolean(row.isCurated),
      icon: row.icon || undefined,
      words: listWords,
      planTotalDays: row.planTotalDays ?? 0,
      planCurrentDay: row.planCurrentDay ?? 1,
      planWordsPerDay: row.planWordsPerDay ?? 10,
      planStartedAt: row.planStartedAt ?? undefined,
      planUpdatedAt: row.planUpdatedAt ?? undefined,
    };
  });

  return lists;
}

export async function initSeedDataIfEmpty(): Promise<void> {
  const db = await getDb();

  // COUNT(*) returns an object like { count: 0 } or { "COUNT(*)": 0 } depending on exact sqlite query parser
  // It's safer to just get the first row value directly
  const rows = await db.getAllAsync<any>('SELECT COUNT(*) as count FROM lists');

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

export async function createList(title: string): Promise<VocaList> {
  const db = await getDb();
  const id = generateId();
  const now = Date.now();

  await db.runAsync(
    `INSERT INTO lists (id, title, isVisible, createdAt, lastStudiedAt, position) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, title, 1, now, now, now]
  );

  return {
    id,
    title,
    words: [],
    isVisible: true,
    createdAt: now,
    lastStudiedAt: now,
    position: now,
  };
}

export async function createCuratedList(title: string, icon: string, words: Omit<Word, 'id' | 'isMemorized'>[]): Promise<VocaList> {
  const db = await getDb();
  const id = generateId();
  const now = Date.now();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO lists (id, title, isVisible, createdAt, lastStudiedAt, isCurated, icon, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, 1, now, now, 1, icon, now]
    );

    for (const w of words) {
      await db.runAsync(
        `INSERT INTO words (id, listId, term, definition, exampleEn, exampleKr, meaningKr, isMemorized, isStarred, tags, createdAt, sourceLang, targetLang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId(),
          id,
          w.term ?? '',
          w.definition ?? '',
          w.exampleEn ?? '',
          w.exampleKr || null,
          w.meaningKr ?? '',
          0,
          0,
          JSON.stringify([]),
          now,
          (w as any).sourceLang ?? 'en',
          (w as any).targetLang ?? 'ko',
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
    values.push(id);
    await db.runAsync(
      `UPDATE lists SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );
  }

  const lists = await getLists();
  return lists.find(l => l.id === id) || null;
}

export async function deleteList(id: string): Promise<void> {
  const db = await getDb();
  // FOREIGN KEY ON DELETE CASCADE will handle the words
  await db.runAsync('DELETE FROM lists WHERE id = ?', [id]);
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

  await db.withTransactionAsync(async () => {
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
    // touch list lastStudiedAt? We keep it but it won't affect order now as we order by position
    await db.runAsync(
      `UPDATE lists SET lastStudiedAt = ? WHERE id = ?`,
      Date.now(),
      listId
    );
  });

  return newWord;
}

export async function addBatchWords(
  listId: string,
  wordsData: Array<Partial<Omit<Word, 'id' | 'createdAt' | 'updatedAt' | 'listId'>> & { term: string, meaningKr: string }>
): Promise<Word[]> {
  const db = await getDb();

  // Use sequential ordering for insertion position so they appear in correct order
  const now = Date.now();
  const listWords = await db.getAllAsync<any>('SELECT * FROM words WHERE listId = ? ORDER BY position ASC, createdAt DESC;', [listId]);

  let currentPosition = now;
  if (listWords.length > 0) {
    currentPosition = listWords[0].position - 1000;
  }

  const newWords: Word[] = wordsData.map((w, index) => ({
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

  const bulkData = wordsData.map((w, index) => ({
    ...newWords[index],
    position: currentPosition - (index * 1000),
    createdAt: now + index,
    updatedAt: now + index,
  }));

  await db.withTransactionAsync(async () => {
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
    // We update lastStudiedAt for history, but position remains unchanged so order is preserved
    await db.runAsync(
      `UPDATE lists SET lastStudiedAt = ? WHERE id = ?`,
      Date.now(),
      listId
    );
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
    await db.withTransactionAsync(async () => {
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
  await db.runAsync('DELETE FROM words WHERE id = ?', wordId);
}

export async function deleteWords(listId: string, wordIds: string[]): Promise<void> {
  const db = await getDb();
  if (wordIds.length === 0) return;
  const placeholders = wordIds.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM words WHERE id IN (${placeholders})`, ...wordIds);
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
  await db.withTransactionAsync(async () => {
    if (forceStatus !== undefined) {
      await db.runAsync('UPDATE words SET isMemorized = ? WHERE id = ?', forceStatus ? 1 : 0, wordId);
    } else {
      await db.runAsync('UPDATE words SET isMemorized = CASE WHEN isMemorized = 1 THEN 0 ELSE 1 END WHERE id = ?', wordId);
    }
    await db.runAsync(`UPDATE lists SET lastStudiedAt = ? WHERE id = ?`, Date.now(), listId);
  });
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
  await db.withTransactionAsync(async () => {
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
  await db.withTransactionAsync(async () => {
    for (const w of wordsToAdd) {
      await db.runAsync(
        `INSERT INTO words (id, listId, term, definition, exampleEn, exampleKr, meaningKr, isMemorized, isStarred, tags, createdAt, sourceLang, targetLang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId(),
          targetId,
          w.term ?? '',
          w.definition ?? '',
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
      await db.runAsync('DELETE FROM lists WHERE id = ?', sourceId);
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
  await db.withTransactionAsync(async () => {
    // Reverse iterating to give highest position to first item in orderedIds
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      const newPos = now + ((orderedIds.length - i) * 1000);
      await db.runAsync('UPDATE lists SET position = ? WHERE id = ?', newPos, id);
    }
  });
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

  await db.withTransactionAsync(async () => {
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
}

export async function copyWords(targetListId: string, wordIds: string[]): Promise<void> {
  const db = await getDb();
  if (wordIds.length === 0) return;

  const placeholders = wordIds.map(() => '?').join(',');
  const sourceWords = await db.getAllAsync<any>(
    `SELECT * FROM words WHERE id IN (${placeholders})`,
    ...wordIds
  );

  const copyNow = Date.now();
  await db.withTransactionAsync(async () => {
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
  await db.withTransactionAsync(async () => {
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

export async function savePlan(
  listId: string,
  wordsPerDay: number,
  assignedDays: Array<{ wordId: string; day: number }>,
  totalDays: number
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE lists SET planTotalDays = ?, planCurrentDay = 1, planWordsPerDay = ?, planStartedAt = ?, planUpdatedAt = ? WHERE id = ?`,
      [totalDays, wordsPerDay, now, now, listId]
    );
    for (const { wordId, day } of assignedDays) {
      await db.runAsync('UPDATE words SET assignedDay = ? WHERE id = ?', [day, wordId]);
    }
  });
}

export async function clearPlan(listId: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
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
    'UPDATE lists SET planCurrentDay = ?, planUpdatedAt = ? WHERE id = ?',
    [currentDay, Date.now(), listId]
  );
}
