import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef, ReactNode } from 'react';
import { Alert } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VocaList, Word, StudyResult, AIWordResult, PlanStatus } from '@/lib/types';
import * as Storage from '@/lib/vocab-storage';
import * as PlanEngine from '@/lib/plan-engine';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';

const DEVICE_ID_KEY = '@soksok_device_id';
const LAST_GOOGLE_ID_KEY = '@soksok_last_google_id';

async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = Storage.generateId();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

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
  deleteCloudCuration: (curationId: string) => Promise<void>;
  createList: (title: string) => Promise<VocaList>;
  createCuratedList: (title: string, icon: string, words: Omit<Word, 'id' | 'isMemorized'>[]) => Promise<VocaList>;
  updateList: (id: string, updates: Partial<Omit<VocaList, 'id' | 'words'>>) => Promise<void>;
  deleteList: (id: string) => Promise<void>;
  toggleVisibility: (id: string) => Promise<void>;
  renameList: (id: string, newTitle: string) => Promise<void>;
  mergeLists: (sourceId: string, targetId: string, deleteSource: boolean) => Promise<void>;
  shareList: (listId: string, options?: { force?: boolean; updateId?: string; description?: string }) => Promise<void>;
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
  resetWrongCount: (wordIds: string[]) => Promise<void>;
  getWordsForList: (listId: string) => Word[];
  getListProgress: (listId: string) => { total: number; memorized: number; percent: number };
  saveLastResult: (listId: string) => Promise<void>;
  reorderLists: (orderedIds: string[]) => Promise<void>;
  updateStudyTime: (listId: string) => Promise<void>;
  studyResults: StudyResult[];
  setStudyResults: (results: StudyResult[]) => void;
  clearStudyResults: () => void;
  setupPlan: (listId: string, wordsPerDay: number, filter?: 'all' | 'unmemorized' | 'memorized') => Promise<void>;
  rechunkPlan: (listId: string, wordsPerDay: number) => Promise<void>;
  clearPlan: (listId: string) => Promise<void>;
  updatePlanProgress: (listId: string, currentDay: number) => Promise<void>;
  resetPlanForReStudy: (listId: string) => Promise<void>;
  getPlanStatus: (listId: string) => PlanStatus;
}

const VocabContext = createContext<VocabContextValue | null>(null);

export function VocabProvider({ children }: { children: ReactNode }) {
  const { authMode, user, token, handleTokenExpired } = useAuth();
  const { profileSettings } = useSettings();
  const [lists, setLists] = useState<VocaList[]>([]);
  const [loading, setLoading] = useState(true);
  const [studyResults, setStudyResults] = useState<StudyResult[]>([]);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncToCloud = useCallback(async () => {
    if (authMode !== 'google' || !token) return;
    try {
      const currentLists = await Storage.getLists();
      const res = await fetch(`${API_BASE}/api/sync/data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ lists: currentLists }),
      });
      if (res.status === 401) {
        await handleTokenExpired();
      }
    } catch (e) {
      console.warn('Cloud sync failed:', e);
    }
  }, [authMode, token, handleTokenExpired]);

  const debouncedSync = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncToCloud();
    }, 2000);
  }, [syncToCloud]);

  const loadCloudData = useCallback(async () => {
    if (authMode !== 'google' || !token) return;
    try {
      const res = await fetch(`${API_BASE}/api/sync/data`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.status === 401) {
        await handleTokenExpired();
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      const cloudLists: VocaList[] = data.lists && Array.isArray(data.lists) ? data.lists : [];

      if (cloudLists.length > 0) {
        const localLists = await Storage.getLists();
        const localWordCount = localLists.reduce((sum, l) => sum + l.words.length, 0);
        const cloudWordCount = cloudLists.reduce((sum, l) => sum + (l.words?.length ?? 0), 0);

        if (localWordCount > 0) {
          // 양쪽 모두 데이터 있음 → 사용자에게 선택 요청
          const choice = await new Promise<'merge' | 'cloud'>((resolve) => {
            Alert.alert(
              '데이터 선택',
              `클라우드에 ${cloudWordCount}개, 이 기기에 ${localWordCount}개 단어가 있습니다. 어떻게 할까요?`,
              [
                { text: '합치기', onPress: () => resolve('merge') },
                {
                  text: '클라우드 유지',
                  style: 'destructive',
                  onPress: () => resolve('cloud'),
                },
              ],
              { cancelable: false }
            );
          });

          if (choice === 'merge') {
            await Storage.mergeCloudData(cloudLists);
          } else {
            await Storage.replaceLocalWithCloudData(cloudLists);
          }
        } else {
          // 로컬 비어있음 → 클라우드로 바로 교체
          await Storage.replaceLocalWithCloudData(cloudLists);
        }
      } else {
        // 클라우드 비어있음 → 로컬 → 클라우드 업로드
        const localLists = await Storage.getLists();
        if (localLists.length > 0) {
          await fetch(`${API_BASE}/api/sync/data`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ lists: localLists }),
          });
        }
      }
    } catch (e) {
      console.warn('Cloud data load failed:', e);
    }
  }, [authMode, token, handleTokenExpired]);

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

  const deleteCloudCuration = useCallback(async (curationId: string) => {
    const headers: Record<string, string> =
      authMode === 'google' && token
        ? { 'Authorization': `Bearer ${token}` }
        : { 'x-user-id': await getDeviceId() };

    const res = await fetch(`${API_BASE}/api/curations/${curationId}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
  }, [authMode, token]);

  useEffect(() => {
    const initData = async () => {
      if (authMode === 'google' && user?.googleId) {
        await AsyncStorage.setItem(LAST_GOOGLE_ID_KEY, user.googleId);
        // loadCloudData가 클라우드 데이터 유무에 따라 처리:
        // - 클라우드에 데이터 있음 → replaceLocalWithCloudData (로컬 교체)
        // - 클라우드 비어있음 → 현재 로컬 데이터를 클라우드에 업로드
        await loadCloudData();
        await refreshData();
      } else {
        // 게스트/비로그인 상태에서는 LAST_GOOGLE_ID 초기화
        // (다음 구글 로그인이 항상 신선한 연결로 처리되도록)
        await AsyncStorage.removeItem(LAST_GOOGLE_ID_KEY);
        await Storage.initSeedDataIfEmpty();
        await refreshData();
      }
    };

    initData();
  }, [authMode, token, user?.googleId, loadCloudData, refreshData]);

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

  const shareList = useCallback(async (listId: string, options?: { force?: boolean; updateId?: string; description?: string }) => {
    const list = lists.find(l => l.id === listId);
    if (!list) throw new Error('List not found');

    const theme = {
      title: list.title,
      icon: list.icon || '✨',
      description: options?.description || undefined,
      isUserShared: true,
      creatorName: profileSettings.nickname.trim() || user?.displayName || 'Anonymous',
      creatorId: user?.id || await getDeviceId(),
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
  }, [lists, user, profileSettings]);

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

  const resetWrongCount = useCallback(async (wordIds: string[]) => {
    await Storage.resetWrongCount(wordIds);
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

  const saveLastResult = useCallback(async (listId: string) => {
    await Storage.saveLastResult(listId);
    await refreshData();
  }, [refreshData]);

  const setupPlan = useCallback(async (listId: string, wordsPerDay: number, filter: 'all' | 'unmemorized' | 'memorized' = 'all') => {
    const allLists = await Storage.getLists();
    const list = allLists.find(l => l.id === listId);
    if (!list) return;
    let wordsToUse = list.words;
    if (filter === 'unmemorized') wordsToUse = list.words.filter(w => !w.isMemorized);
    else if (filter === 'memorized') wordsToUse = list.words.filter(w => w.isMemorized);
    const { assignments, totalDays } = PlanEngine.generatePlan(wordsToUse, wordsPerDay);
    await Storage.savePlan(listId, wordsPerDay, assignments, totalDays, filter);
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

  const resetPlanForReStudy = useCallback(async (listId: string) => {
    await Storage.resetPlanCurrentDayToTotal(listId);
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
    deleteCloudCuration,
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
    resetWrongCount,
    getWordsForList,
    getListProgress,
    reorderLists: reorderListsFn,
    updateStudyTime,
    studyResults,
    setStudyResults,
    clearStudyResults,
    saveLastResult,
    setupPlan,
    rechunkPlan,
    clearPlan,
    updatePlanProgress,
    resetPlanForReStudy,
    getPlanStatus,
  }), [lists, loading, refreshData, fetchCloudCurations, deleteCloudCuration, createList, createCuratedList, updateList, deleteList, toggleVisibility, renameList, mergeListsFn, shareList, addWord, addBatchWords, updateWord, deleteWord, deleteWords, toggleMemorized, toggleStarred, setWordsMemorized, incrementWrongCount, resetWrongCount, getWordsForList, getListProgress, reorderListsFn, updateStudyTime, studyResults, clearStudyResults, saveLastResult, setupPlan, rechunkPlan, clearPlan, updatePlanProgress, resetPlanForReStudy, getPlanStatus]);

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
