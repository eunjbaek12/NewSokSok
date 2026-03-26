import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef, ReactNode } from 'react';
import Constants from 'expo-constants';
import { VocaList, Word, StudyResult, AIWordResult, PlanStatus } from '@/lib/types';
import * as Storage from '@/lib/vocab-storage';
import * as PlanEngine from '@/lib/plan-engine';
import { useAuth } from '@/contexts/AuthContext';

const debuggerHost = Constants.expoConfig?.hostUri;
const hostIp = debuggerHost ? debuggerHost.split(':')[0] : 'localhost';

const API_BASE =
  typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : `http://${hostIp}:5000`;

interface VocabContextValue {
  lists: VocaList[];
  loading: boolean;
  refreshData: () => Promise<void>;
  fetchCloudCurations: () => Promise<any[]>;
  createList: (title: string) => Promise<VocaList>;
  createCuratedList: (title: string, icon: string, words: Omit<Word, 'id' | 'isMemorized'>[]) => Promise<VocaList>;
  updateList: (id: string, updates: Partial<Omit<VocaList, 'id' | 'words'>>) => Promise<void>;
  deleteList: (id: string) => Promise<void>;
  toggleVisibility: (id: string) => Promise<void>;
  renameList: (id: string, newTitle: string) => Promise<void>;
  mergeLists: (sourceId: string, targetId: string, deleteSource: boolean) => Promise<void>;
  shareList: (listId: string, options?: { force?: boolean; updateId?: string }) => Promise<void>;
  addWord: (listId: string, wordData: Omit<Word, 'id' | 'isMemorized'>) => Promise<Word>;
  addBatchWords: (listId: string, wordsData: Array<Partial<Omit<Word, 'id' | 'createdAt' | 'updatedAt' | 'listId'>> & { term: string, meaningKr: string }>) => Promise<Word[]>;
  updateWord: (listId: string, wordId: string, updates: Partial<Omit<Word, 'id'>>) => Promise<void>;
  deleteWords: (listId: string, wordIds: string[]) => Promise<void>;
  copyWords: (targetListId: string, wordIds: string[]) => Promise<void>;
  moveWords: (targetListId: string, wordIds: string[]) => Promise<void>;
  toggleMemorized: (listId: string, wordId: string, forceStatus?: boolean) => Promise<void>;
  toggleStarred: (listId: string, wordId: string, forceStatus?: boolean) => Promise<void>;
  setWordsMemorized: (listId: string, wordIds: string[], isMemorized: boolean) => Promise<void>;
  incrementWrongCount: (wordIds: string[]) => Promise<void>;
  getWordsForList: (listId: string) => Word[];
  getListProgress: (listId: string) => { total: number; memorized: number; percent: number };
  reorderLists: (orderedIds: string[]) => Promise<void>;
  updateStudyTime: (listId: string) => Promise<void>;
  studyResults: StudyResult[];
  setStudyResults: (results: StudyResult[]) => void;
  clearStudyResults: () => void;
  setupPlan: (listId: string, wordsPerDay: number) => Promise<void>;
  rechunkPlan: (listId: string, wordsPerDay: number) => Promise<void>;
  clearPlan: (listId: string) => Promise<void>;
  updatePlanProgress: (listId: string, currentDay: number) => Promise<void>;
  getPlanStatus: (listId: string) => PlanStatus;
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
        // Sync logic for Phase 2: For now, we'll just ignore or carefully merge
        // A full remote list replacement requires a specialized SQLite query.
        console.log('Received lists from cloud, sync implementation pending in Phase 2.');
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

  const fetchCloudCurations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/curations`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn('Failed to fetch curations from cloud:', e);
      return [];
    }
  }, []);

  useEffect(() => {
    // 1. First ensure the SQLite DB is seeded if it's completely empty
    Storage.initSeedDataIfEmpty().then(() => {
      // 3. Then proceed with normal cloud sync or local refresh
      if (authMode === 'google' && user?.id) {
        loadCloudData().then(() => refreshData());
      } else {
        refreshData();
      }
    });
  }, [authMode, user?.id, loadCloudData, refreshData]);

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

  const shareList = useCallback(async (listId: string, options?: { force?: boolean; updateId?: string }) => {
    const list = lists.find(l => l.id === listId);
    if (!list) throw new Error('List not found');

    const theme = {
      title: list.title,
      icon: list.icon || '✨',
      isUserShared: true,
      creatorName: user?.displayName || 'Anonymous',
      creatorId: user?.id || null,
      sourceLanguage: list.sourceLanguage || 'en',
      targetLanguage: list.targetLanguage || 'ko',
    };

    const words = list.words.map(w => ({
      term: w.term,
      definition: w.definition,
      meaningKr: w.meaningKr,
      exampleEn: w.exampleEn,
    }));

    if (options?.updateId) {
      const res = await fetch(`${API_BASE}/api/curations/${options.updateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme, words }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      return;
    }

    const forceParam = options?.force ? '?force=true' : '';
    const res = await fetch(`${API_BASE}/api/curations${forceParam}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme, words }),
    });

    if (res.status === 409) {
      const data = await res.json();
      const err = new Error('DUPLICATE_SHARE') as any;
      err.existingId = data.existingId;
      err.existingTitle = data.existingTitle;
      throw err;
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      console.error('FULL_SERVER_ERROR_DATA:', errorData);
      const detailedError = errorData.details || errorData.error || `HTTP ${res.status}`;
      throw new Error(detailedError);
    }
  }, [lists, user]);

  const addWord = useCallback(async (listId: string, wordData: Omit<Word, 'id' | 'isMemorized'>) => {
    const newWord = await Storage.addWord(listId, wordData);
    await refreshData();
    debouncedSync();
    return newWord;
  }, [refreshData, debouncedSync]);

  const addBatchWords = useCallback(async (listId: string, wordsData: Array<Partial<Omit<Word, 'id' | 'createdAt' | 'updatedAt' | 'listId'>> & { term: string, meaningKr: string }>) => {
    const words = await Storage.addBatchWords(listId, wordsData);
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

  const copyWords = useCallback(async (targetListId: string, wordIds: string[]) => {
    await Storage.copyWords(targetListId, wordIds);
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const moveWords = useCallback(async (targetListId: string, wordIds: string[]) => {
    await Storage.moveWords(targetListId, wordIds);
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const toggleMemorized = useCallback(async (listId: string, wordId: string, forceStatus?: boolean) => {
    await Storage.toggleMemorized(listId, wordId, forceStatus);
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const toggleStarred = useCallback(async (listId: string, wordId: string, forceStatus?: boolean) => {
    await Storage.toggleStarred(listId, wordId, forceStatus);
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const setWordsMemorized = useCallback(async (listId: string, wordIds: string[], isMemorized: boolean) => {
    await Storage.setWordsMemorized(listId, wordIds, isMemorized);
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const incrementWrongCount = useCallback(async (wordIds: string[]) => {
    await Storage.incrementWrongCount(wordIds);
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const getWordsForList = useCallback((listId: string) => {
    if (listId === '__custom__') {
      return lists.filter(l => l.isVisible).flatMap(l => l.words);
    }
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

  const setupPlan = useCallback(async (listId: string, wordsPerDay: number) => {
    const allLists = await Storage.getLists();
    const list = allLists.find(l => l.id === listId);
    if (!list) return;
    const { assignments, totalDays } = PlanEngine.generatePlan(list.words, wordsPerDay);
    await Storage.savePlan(listId, wordsPerDay, assignments, totalDays);
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const rechunkPlan = useCallback(async (listId: string, wordsPerDay: number) => {
    const allLists = await Storage.getLists();
    const list = allLists.find(l => l.id === listId);
    if (!list) return;
    const { assignments, totalDays } = PlanEngine.rechunkPlan(list.words, wordsPerDay);
    await Storage.savePlan(listId, wordsPerDay, assignments, totalDays);
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const clearPlan = useCallback(async (listId: string) => {
    await Storage.clearPlan(listId);
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const updatePlanProgress = useCallback(async (listId: string, currentDay: number) => {
    await Storage.updatePlanProgress(listId, currentDay);
    await refreshData();
    debouncedSync();
  }, [refreshData, debouncedSync]);

  const getPlanStatus = useCallback((listId: string): PlanStatus => {
    const list = lists.find(l => l.id === listId);
    if (!list) return 'none';
    return PlanEngine.computePlanStatus(list, list.words, Date.now());
  }, [lists]);

  const value = useMemo(() => ({
    lists,
    loading,
    refreshData,
    fetchCloudCurations,
    createList,
    createCuratedList,
    updateList,
    deleteList,
    toggleVisibility,
    renameList,
    mergeLists: mergeListsFn,
    shareList,
    addWord,
    addBatchWords,
    updateWord,
    deleteWords,
    copyWords,
    moveWords,
    toggleMemorized,
    toggleStarred,
    setWordsMemorized,
    incrementWrongCount,
    getWordsForList,
    getListProgress,
    reorderLists: reorderListsFn,
    updateStudyTime,
    studyResults,
    setStudyResults,
    clearStudyResults,
    setupPlan,
    rechunkPlan,
    clearPlan,
    updatePlanProgress,
    getPlanStatus,
  }), [lists, loading, refreshData, fetchCloudCurations, createList, createCuratedList, updateList, deleteList, toggleVisibility, renameList, mergeListsFn, shareList, addWord, addBatchWords, updateWord, deleteWord, deleteWords, toggleMemorized, toggleStarred, setWordsMemorized, incrementWrongCount, getWordsForList, getListProgress, reorderListsFn, updateStudyTime, studyResults, clearStudyResults, setupPlan, rechunkPlan, clearPlan, updatePlanProgress, getPlanStatus]);

  return (
    <VocabContext.Provider value={value}>
      {children}
    </VocabContext.Provider>
  );
}

export function useVocab() {
  const ctx = useContext(VocabContext);
  if (!ctx) throw new Error('useVocab must be used within VocabProvider');
  return ctx;
}
