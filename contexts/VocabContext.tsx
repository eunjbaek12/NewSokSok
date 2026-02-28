import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef, ReactNode } from 'react';
import { VocaList, Word, StudyResult, AIWordResult } from '@/lib/types';
import * as Storage from '@/lib/vocab-storage';
import { useAuth } from '@/contexts/AuthContext';

const API_BASE =
  typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : 'http://localhost:5000';

interface VocabContextValue {
  lists: VocaList[];
  loading: boolean;
  refreshData: () => Promise<void>;
  createList: (title: string) => Promise<VocaList>;
  createCuratedList: (title: string, icon: string, words: Omit<Word, 'id' | 'isMemorized'>[]) => Promise<VocaList>;
  updateList: (id: string, updates: Partial<Omit<VocaList, 'id' | 'words'>>) => Promise<void>;
  deleteList: (id: string) => Promise<void>;
  toggleVisibility: (id: string) => Promise<void>;
  renameList: (id: string, newTitle: string) => Promise<void>;
  mergeLists: (sourceId: string, targetId: string, deleteSource: boolean) => Promise<void>;
  addWord: (listId: string, wordData: Omit<Word, 'id' | 'isMemorized'>) => Promise<Word>;
  addBatchWords: (listId: string, aiWords: AIWordResult[]) => Promise<Word[]>;
  updateWord: (listId: string, wordId: string, updates: Partial<Omit<Word, 'id'>>) => Promise<void>;
  deleteWord: (listId: string, wordId: string) => Promise<void>;
  deleteWords: (listId: string, wordIds: string[]) => Promise<void>;
  toggleMemorized: (listId: string, wordId: string, forceStatus?: boolean) => Promise<void>;
  getWordsForList: (listId: string) => Word[];
  getListProgress: (listId: string) => { total: number; memorized: number; percent: number };
  reorderLists: (orderedIds: string[]) => Promise<void>;
  updateStudyTime: (listId: string) => Promise<void>;
  studyResults: StudyResult[];
  setStudyResults: (results: StudyResult[]) => void;
  clearStudyResults: () => void;
}

const VocabContext = createContext<VocabContextValue | null>(null);

export function VocabProvider({ children }: { children: ReactNode }) {
  const { authMode, user } = useAuth();
  const [lists, setLists] = useState<VocaList[]>([]);
  const [loading, setLoading] = useState(true);
  const [studyResults, setStudyResults] = useState<StudyResult[]>([]);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncToCloud = useCallback(async () => {
    if (authMode !== 'google' || !user?.id) return;
    try {
      const currentLists = await Storage.getLists();
      await fetch(`${API_BASE}/api/sync/data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
        },
        body: JSON.stringify({ lists: currentLists }),
      });
    } catch (e) {
      console.warn('Cloud sync failed:', e);
    }
  }, [authMode, user?.id]);

  const debouncedSync = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncToCloud();
    }, 2000);
  }, [syncToCloud]);

  const loadCloudData = useCallback(async () => {
    if (authMode !== 'google' || !user?.id) return;
    try {
      const res = await fetch(`${API_BASE}/api/sync/data`, {
        headers: { 'x-user-id': user.id },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.lists && Array.isArray(data.lists) && data.lists.length > 0) {
        await Storage.saveLists(data.lists);
      } else {
        const localLists = await Storage.getLists();
        if (localLists.length > 0) {
          await fetch(`${API_BASE}/api/sync/data`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': user.id,
            },
            body: JSON.stringify({ lists: localLists }),
          });
        }
      }
    } catch (e) {
      console.warn('Cloud data load failed:', e);
    }
  }, [authMode, user?.id]);

  const refreshData = useCallback(async () => {
    const l = await Storage.getLists();
    setLists(l);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authMode === 'google' && user?.id) {
      loadCloudData().then(() => refreshData());
    } else {
      refreshData();
    }
  }, [authMode, user?.id]);

  const withSync = useCallback(<T,>(fn: () => Promise<T>) => {
    return async (): Promise<T> => {
      const result = await fn();
      await refreshData();
      debouncedSync();
      return result;
    };
  }, [refreshData, debouncedSync]);

  const createList = useCallback(async (title: string) => {
    const current = await Storage.getLists();
    const trimmed = title.trim().toLowerCase();
    if (current.some(l => l.title.trim().toLowerCase() === trimmed)) {
      throw new Error('DUPLICATE_LIST');
    }
    const newList = await Storage.createList(title);
    await refreshData();
    debouncedSync();
    return newList;
  }, [refreshData, debouncedSync]);

  const createCuratedList = useCallback(async (title: string, icon: string, words: Omit<Word, 'id' | 'isMemorized'>[]) => {
    const current = await Storage.getLists();
    const trimmed = title.trim().toLowerCase();
    if (current.some(l => l.title.trim().toLowerCase() === trimmed)) {
      throw new Error('DUPLICATE_LIST');
    }
    const newList = await Storage.createCuratedList(title, icon, words);
    await refreshData();
    debouncedSync();
    return newList;
  }, [refreshData, debouncedSync]);

  const updateList = useCallback(async (id: string, updates: Partial<Omit<VocaList, 'id' | 'words'>>) => {
    await Storage.updateList(id, updates);
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const deleteList = useCallback(async (id: string) => {
    await Storage.deleteList(id);
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const toggleVisibility = useCallback(async (id: string) => {
    await Storage.toggleVisibility(id);
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const renameList = useCallback(async (id: string, newTitle: string) => {
    const current = await Storage.getLists();
    const trimmed = newTitle.trim().toLowerCase();
    if (current.some(l => l.id !== id && l.title.trim().toLowerCase() === trimmed)) {
      throw new Error('DUPLICATE_LIST');
    }
    await Storage.updateList(id, { title: newTitle });
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const mergeListsFn = useCallback(async (sourceId: string, targetId: string, deleteSource: boolean) => {
    await Storage.mergeLists(sourceId, targetId, deleteSource);
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const addWord = useCallback(async (listId: string, wordData: Omit<Word, 'id' | 'isMemorized'>) => {
    const newWord = await Storage.addWord(listId, wordData);
    await refreshData();
    debouncedSync();
    return newWord;
  }, [refreshData, debouncedSync]);

  const addBatchWords = useCallback(async (listId: string, aiWords: AIWordResult[]) => {
    const words = await Storage.addBatchWords(listId, aiWords);
    await refreshData();
    debouncedSync();
    return words;
  }, [refreshData, debouncedSync]);

  const updateWord = useCallback(async (listId: string, wordId: string, updates: Partial<Omit<Word, 'id'>>) => {
    await Storage.updateWord(listId, wordId, updates);
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const deleteWord = useCallback(async (listId: string, wordId: string) => {
    await Storage.deleteWord(listId, wordId);
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const deleteWords = useCallback(async (listId: string, wordIds: string[]) => {
    await Storage.deleteWords(listId, wordIds);
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const toggleMemorized = useCallback(async (listId: string, wordId: string, forceStatus?: boolean) => {
    await Storage.toggleMemorized(listId, wordId, forceStatus);
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const getWordsForList = useCallback((listId: string) => {
    const list = lists.find(l => l.id === listId);
    return list ? list.words : [];
  }, [lists]);

  const getListProgress = useCallback((listId: string) => {
    const list = lists.find(l => l.id === listId);
    const words = list ? list.words : [];
    const total = words.length;
    const memorized = words.filter(w => w.isMemorized).length;
    return { total, memorized, percent: total > 0 ? Math.round((memorized / total) * 100) : 0 };
  }, [lists]);

  const reorderListsFn = useCallback(async (orderedIds: string[]) => {
    await Storage.reorderLists(orderedIds);
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const updateStudyTime = useCallback(async (listId: string) => {
    await Storage.updateStudyTime(listId);
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const clearStudyResults = useCallback(() => {
    setStudyResults([]);
  }, []);

  const value = useMemo(() => ({
    lists,
    loading,
    refreshData,
    createList,
    createCuratedList,
    updateList,
    deleteList,
    toggleVisibility,
    renameList,
    mergeLists: mergeListsFn,
    addWord,
    addBatchWords,
    updateWord,
    deleteWord,
    deleteWords,
    toggleMemorized,
    getWordsForList,
    getListProgress,
    reorderLists: reorderListsFn,
    updateStudyTime,
    studyResults,
    setStudyResults,
    clearStudyResults,
  }), [lists, loading, refreshData, createList, createCuratedList, updateList, deleteList, toggleVisibility, renameList, mergeListsFn, addWord, addBatchWords, updateWord, deleteWord, deleteWords, toggleMemorized, getWordsForList, getListProgress, reorderListsFn, updateStudyTime, studyResults, clearStudyResults]);

  return (
    <VocabContext value={value}>
      {children}
    </VocabContext>
  );
}

export function useVocab() {
  const ctx = useContext(VocabContext);
  if (!ctx) throw new Error('useVocab must be used within VocabProvider');
  return ctx;
}
