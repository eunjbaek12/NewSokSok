import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { VocaList, Word, AIWordResult } from './types';

const LISTS_KEY = '@soksok_lists_v2';
const OLD_LISTS_KEY = '@soksok_lists';
const OLD_WORDS_KEY = '@soksok_words';

export function generateId(): string {
  return Crypto.randomUUID();
}

async function migrateOldData(): Promise<VocaList[] | null> {
  const oldListsJson = await AsyncStorage.getItem(OLD_LISTS_KEY);
  if (!oldListsJson) return null;

  try {
    const oldLists = JSON.parse(oldListsJson);
    if (!Array.isArray(oldLists) || oldLists.length === 0) return null;

    const first = oldLists[0];
    if ('words' in first && Array.isArray(first.words) && first.words.length > 0 && 'term' in first.words[0]) {
      return null;
    }

    const oldWordsJson = await AsyncStorage.getItem(OLD_WORDS_KEY);
    const oldWords = oldWordsJson ? JSON.parse(oldWordsJson) : [];

    const migrated: VocaList[] = oldLists.map((ol: any) => {
      const listWords = oldWords
        .filter((ow: any) => ow.listId === ol.id)
        .map((ow: any) => ({
          id: ow.id || generateId(),
          term: ow.word || ow.term || '',
          definition: ow.definition || '',
          exampleEn: ow.example || ow.exampleEn || '',
          meaningKr: ow.meaning || ow.meaningKr || '',
          isMemorized: ow.memorized || ow.isMemorized || false,
        }));

      return {
        id: ol.id,
        title: ol.name || ol.title || 'Untitled',
        words: listWords,
        isVisible: ol.hidden !== undefined ? !ol.hidden : (ol.isVisible !== undefined ? ol.isVisible : true),
        createdAt: ol.createdAt || Date.now(),
        lastStudiedAt: ol.lastStudiedAt || ol.updatedAt || Date.now(),
      };
    });

    await AsyncStorage.removeItem(OLD_LISTS_KEY);
    await AsyncStorage.removeItem(OLD_WORDS_KEY);

    return migrated;
  } catch {
    return null;
  }
}

export async function getLists(): Promise<VocaList[]> {
  const json = await AsyncStorage.getItem(LISTS_KEY);
  if (json) {
    return JSON.parse(json);
  }

  const migrated = await migrateOldData();
  if (migrated && migrated.length > 0) {
    await saveLists(migrated);
    return migrated;
  }

  const initial: VocaList[] = [
    {
      id: generateId(),
      title: 'Welcome Words',
      isVisible: true,
      createdAt: Date.now(),
      lastStudiedAt: Date.now(),
      words: [
        {
          id: generateId(),
          term: 'Serendipity',
          definition: 'The occurrence of events by chance in a happy way',
          exampleEn: 'We found the cafe by serendipity.',
          meaningKr: '뜻밖의 행운',
          isMemorized: false,
        },
        {
          id: generateId(),
          term: 'Resilience',
          definition: 'The capacity to recover quickly from difficulties',
          exampleEn: 'He showed great resilience after the failure.',
          meaningKr: '회복력',
          isMemorized: true,
        },
      ],
    },
  ];
  await saveLists(initial);
  return initial;
}

export async function saveLists(lists: VocaList[]): Promise<void> {
  await AsyncStorage.setItem(LISTS_KEY, JSON.stringify(lists));
}

export async function createList(title: string): Promise<VocaList> {
  const lists = await getLists();
  const newList: VocaList = {
    id: generateId(),
    title,
    words: [],
    isVisible: true,
    createdAt: Date.now(),
    lastStudiedAt: Date.now(),
  };
  lists.unshift(newList);
  await saveLists(lists);
  return newList;
}

export async function createCuratedList(title: string, icon: string, words: Omit<Word, 'id' | 'isMemorized'>[]): Promise<VocaList> {
  const lists = await getLists();

  const copiedWords: Word[] = words.map(w => ({
    id: generateId(),
    ...w,
    isMemorized: false,
  }));

  const newList: VocaList = {
    id: generateId(),
    title,
    words: copiedWords,
    isVisible: true,
    createdAt: Date.now(),
    lastStudiedAt: Date.now(),
    isCurated: true,
    icon,
  };
  lists.unshift(newList);
  await saveLists(lists);
  return newList;
}

export async function updateList(id: string, updates: Partial<Omit<VocaList, 'id' | 'words'>>): Promise<VocaList | null> {
  const lists = await getLists();
  const index = lists.findIndex(l => l.id === id);
  if (index === -1) return null;
  lists[index] = { ...lists[index], ...updates };
  await saveLists(lists);
  return lists[index];
}

export async function deleteList(id: string): Promise<void> {
  const lists = await getLists();
  await saveLists(lists.filter(l => l.id !== id));
}

export async function toggleVisibility(id: string): Promise<void> {
  const lists = await getLists();
  const index = lists.findIndex(l => l.id === id);
  if (index === -1) return;
  lists[index] = { ...lists[index], isVisible: !lists[index].isVisible };
  await saveLists(lists);
}

export async function addWord(
  listId: string,
  wordData: Omit<Word, 'id' | 'isMemorized'>
): Promise<Word> {
  const lists = await getLists();
  const index = lists.findIndex(l => l.id === listId);
  if (index === -1) throw new Error('List not found');

  const newWord: Word = {
    id: generateId(),
    ...wordData,
    isMemorized: false,
  };
  lists[index].words.unshift(newWord);
  lists[index].lastStudiedAt = Date.now();
  await saveLists(lists);
  return newWord;
}

export async function addBatchWords(
  listId: string,
  aiWords: AIWordResult[]
): Promise<Word[]> {
  const lists = await getLists();
  const index = lists.findIndex(l => l.id === listId);
  if (index === -1) throw new Error('List not found');

  const newWords: Word[] = aiWords.map(w => ({
    id: generateId(),
    ...w,
    isMemorized: false,
  }));
  lists[index].words.push(...newWords);
  lists[index].lastStudiedAt = Date.now();
  await saveLists(lists);
  return newWords;
}

export async function updateWord(
  listId: string,
  wordId: string,
  updates: Partial<Omit<Word, 'id'>>
): Promise<Word | null> {
  const lists = await getLists();
  const listIndex = lists.findIndex(l => l.id === listId);
  if (listIndex === -1) return null;

  const wordIndex = lists[listIndex].words.findIndex(w => w.id === wordId);
  if (wordIndex === -1) return null;

  lists[listIndex].words[wordIndex] = {
    ...lists[listIndex].words[wordIndex],
    ...updates,
  };
  await saveLists(lists);
  return lists[listIndex].words[wordIndex];
}

export async function deleteWord(listId: string, wordId: string): Promise<void> {
  const lists = await getLists();
  const index = lists.findIndex(l => l.id === listId);
  if (index === -1) return;

  lists[index].words = lists[index].words.filter(w => w.id !== wordId);
  await saveLists(lists);
}

export async function deleteWords(listId: string, wordIds: string[]): Promise<void> {
  const lists = await getLists();
  const index = lists.findIndex(l => l.id === listId);
  if (index === -1) return;

  lists[index].words = lists[index].words.filter(w => !wordIds.includes(w.id));
  await saveLists(lists);
}

export async function toggleMemorized(
  listId: string,
  wordId: string,
  forceStatus?: boolean
): Promise<void> {
  const lists = await getLists();
  const listIndex = lists.findIndex(l => l.id === listId);
  if (listIndex === -1) return;

  const wordIndex = lists[listIndex].words.findIndex(w => w.id === wordId);
  if (wordIndex === -1) return;

  const current = lists[listIndex].words[wordIndex].isMemorized;
  lists[listIndex].words[wordIndex].isMemorized =
    forceStatus !== undefined ? forceStatus : !current;
  lists[listIndex].lastStudiedAt = Date.now();
  await saveLists(lists);
}

export async function mergeLists(
  sourceId: string,
  targetId: string,
  deleteSource: boolean
): Promise<void> {
  const lists = await getLists();
  const sourceList = lists.find(l => l.id === sourceId);
  const targetList = lists.find(l => l.id === targetId);
  if (!sourceList || !targetList) return;

  const existingTerms = new Set(targetList.words.map(w => w.term.toLowerCase()));
  const wordsToAdd = sourceList.words
    .filter(w => !existingTerms.has(w.term.toLowerCase()))
    .map(w => ({ ...w, id: generateId() }));

  const targetIndex = lists.findIndex(l => l.id === targetId);
  lists[targetIndex].words.push(...wordsToAdd);
  lists[targetIndex].lastStudiedAt = Date.now();

  let result = lists;
  if (deleteSource) {
    result = lists.filter(l => l.id !== sourceId);
  }
  await saveLists(result);
}

export async function reorderLists(orderedIds: string[]): Promise<void> {
  const lists = await getLists();
  const map = new Map(lists.map(l => [l.id, l]));
  const reordered: VocaList[] = [];
  for (const id of orderedIds) {
    const list = map.get(id);
    if (list) {
      reordered.push(list);
      map.delete(id);
    }
  }
  for (const remaining of map.values()) {
    reordered.push(remaining);
  }
  await saveLists(reordered);
}

export async function updateStudyTime(listId: string): Promise<void> {
  const lists = await getLists();
  const index = lists.findIndex(l => l.id === listId);
  if (index === -1) return;
  lists[index].lastStudiedAt = Date.now();
  await saveLists(lists);
}
