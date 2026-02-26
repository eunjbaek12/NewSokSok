import React, { useState, useEffect } from 'react';
import BottomNav from './components/BottomNav';
import Dashboard from './components/Dashboard';
import WordManager from './components/WordManager';
import ThemeGenerator from './components/ThemeGenerator';
import ListManager from './components/ListManager';
import ListDetailView from './components/ListDetailView';
import StudySession from './components/StudySession';
import { ViewState, VocaList, Word, AIWordResult } from './types';

// Use a simple ID generator
const generateId = () => Math.random().toString(36).substr(2, 9);

const App: React.FC = () => {
  // State
  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [lists, setLists] = useState<VocaList[]>([]);
  const [showListManager, setShowListManager] = useState(false);
  
  // Theme Generator State
  const [initialTheme, setInitialTheme] = useState<string>('');

  // New State for Study Mode Tab & Words
  const [studyTab, setStudyTab] = useState<'FLASHCARD' | 'QUIZ' | 'EXAMPLES' | 'SHADOWING'>('FLASHCARD');
  const [studyWords, setStudyWords] = useState<Word[]>([]);

  // Load data from LocalStorage
  useEffect(() => {
    const savedLists = localStorage.getItem('soksok_lists');
    if (savedLists) {
      setLists(JSON.parse(savedLists));
    } else {
      // Initial onboarding data
      setLists([
        {
          id: '1',
          title: 'Welcome Words',
          isVisible: true,
          createdAt: Date.now(),
          lastStudiedAt: Date.now(),
          words: [
            { id: 'w1', term: 'Serendipity', definition: 'The occurrence of events by chance in a happy way', exampleEn: 'We found the cafe by serendipity.', meaningKr: '뜻밖의 행운', isMemorized: false },
            { id: 'w2', term: 'Resilience', definition: 'The capacity to recover quickly from difficulties', exampleEn: 'He showed great resilience after the failure.', meaningKr: '회복력', isMemorized: true },
          ]
        }
      ]);
    }

    // Check system dark mode preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setIsDarkMode(true);
    }
  }, []);

  // Save to LocalStorage whenever lists change
  useEffect(() => {
    localStorage.setItem('soksok_lists', JSON.stringify(lists));
  }, [lists]);

  // Apply Dark Mode class to body
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // -- Handlers --

  const handleCreateList = (title: string) => {
    const newList: VocaList = {
      id: generateId(),
      title,
      words: [],
      isVisible: true,
      createdAt: Date.now(),
      lastStudiedAt: Date.now(),
    };
    setLists(prev => [newList, ...prev]);
    return newList.id;
  };

  const handleSaveWord = (listId: string, wordData: Omit<Word, 'id' | 'isMemorized'>) => {
    const newWord: Word = {
      id: generateId(),
      ...wordData,
      isMemorized: false,
    };

    setLists(prev => prev.map(list => {
      if (list.id === listId) {
        return { 
          ...list, 
          lastStudiedAt: Date.now(),
          words: [newWord, ...list.words] 
        };
      }
      return list;
    }));
    setView(ViewState.DASHBOARD);
  };

  const handleAddBatchWords = (listId: string, aiWords: AIWordResult[]) => {
    const newWords: Word[] = aiWords.map(w => ({
      id: generateId(),
      ...w,
      isMemorized: false
    }));

    setLists(prev => prev.map(list => {
      if (list.id === listId) {
        return {
          ...list,
          words: [...list.words, ...newWords]
        };
      }
      return list;
    }));
  };

  const handleDeleteWords = (listId: string, wordIds: string[]) => {
    setLists(prev => prev.map(list => {
      if (list.id === listId) {
        return {
          ...list,
          words: list.words.filter(w => !wordIds.includes(w.id))
        };
      }
      return list;
    }));
  };

  const handleUpdateWord = (listId: string, updatedWord: Word) => {
    setLists(prev => prev.map(list => {
      if (list.id === listId) {
        return {
          ...list,
          words: list.words.map(w => w.id === updatedWord.id ? updatedWord : w)
        };
      }
      return list;
    }));
  };

  const handleSaveAIThemeList = (title: string, aiWords: AIWordResult[]) => {
    const newWords: Word[] = aiWords.map(w => ({
      id: generateId(),
      ...w,
      isMemorized: false
    }));

    const newList: VocaList = {
      id: generateId(),
      title,
      words: newWords,
      isVisible: true,
      createdAt: Date.now(),
      lastStudiedAt: Date.now(),
    };

    setLists(prev => [newList, ...prev]);
    setView(ViewState.DASHBOARD);
    setInitialTheme(''); // Reset theme
  };

  const handleToggleMemorized = (listId: string, wordId: string, forceStatus?: boolean) => {
    setLists(prev => prev.map(list => {
      if (list.id === listId) {
        return {
          ...list,
          lastStudiedAt: Date.now(), // Update timestamp on interaction
          words: list.words.map(w => 
            w.id === wordId 
              ? { ...w, isMemorized: forceStatus !== undefined ? forceStatus : !w.isMemorized } 
              : w
          )
        };
      }
      return list;
    }));
  };

  const handleUpdateLists = (newLists: VocaList[]) => {
    setLists(newLists);
  };

  const handleDeleteList = (listId: string) => {
    setLists(prev => prev.filter(l => l.id !== listId));
  };

  const handleRenameList = (listId: string, newTitle: string) => {
    setLists(prev => prev.map(l => l.id === listId ? { ...l, title: newTitle } : l));
  };

  const handleToggleVisibility = (listId: string) => {
    setLists(prev => prev.map(l => l.id === listId ? { ...l, isVisible: !l.isVisible } : l));
  };

  const handleChangeView = (newView: ViewState, listId?: string) => {
    if (listId) setActiveListId(listId);
    setView(newView);
    // Reset initial theme if navigating away from AI theme, unless specifically setting it (handled below)
    if (newView !== ViewState.AI_THEME) setInitialTheme('');
  };

  const handleOpenThemeGenerator = (theme?: string) => {
    if (theme) setInitialTheme(theme);
    setView(ViewState.AI_THEME);
  };

  const handleStartStudy = (listId: string, mode: 'FLASHCARD' | 'QUIZ' | 'EXAMPLES' | 'SHADOWING', words: Word[]) => {
      setActiveListId(listId);
      setStudyTab(mode);
      setStudyWords(words);
      setView(ViewState.STUDY_MODE);
  };

  const handleUpdateStudyTime = (listId: string) => {
      setLists(prev => prev.map(list => {
          if (list.id === listId) {
              return { ...list, lastStudiedAt: Date.now() };
          }
          return list;
      }));
  };

  const handleMergeLists = (sourceListId: string, targetListId: string, deleteSource: boolean) => {
      setLists(prev => {
          const sourceList = prev.find(l => l.id === sourceListId);
          const targetList = prev.find(l => l.id === targetListId);

          if (!sourceList || !targetList) return prev;

          // Avoid duplicates by term (case-insensitive)
          const existingTerms = new Set(targetList.words.map(w => w.term.toLowerCase()));
          const wordsToAdd = sourceList.words
              .filter(w => !existingTerms.has(w.term.toLowerCase()))
              .map(w => ({ ...w, id: generateId() })); // Generate new IDs for safety

          const updatedTarget = {
              ...targetList,
              words: [...targetList.words, ...wordsToAdd],
              lastStudiedAt: Date.now()
          };

          let newLists = prev.map(l => l.id === targetListId ? updatedTarget : l);

          if (deleteSource) {
              newLists = newLists.filter(l => l.id !== sourceListId);
          }

          return newLists;
      });
  };

  // -- Render --

  const activeList = lists.find(l => l.id === activeListId);

  return (
    <div className="mx-auto max-w-lg h-screen bg-gray-50 dark:bg-black overflow-hidden relative shadow-2xl flex flex-col">
      
      {/* View Content */}
      <main className="flex-1 overflow-hidden relative">
        {view === ViewState.DASHBOARD && (
          <Dashboard 
            lists={lists} 
            userDisplayName="Learner" 
            isDarkMode={isDarkMode}
            toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
            onManageLists={() => setShowListManager(true)}
            onToggleMemorized={handleToggleMemorized}
            onChangeView={handleChangeView}
            onOpenThemeGenerator={handleOpenThemeGenerator}
            onDeleteList={handleDeleteList}
            onRenameList={handleRenameList}
            onToggleVisibility={handleToggleVisibility}
            onMergeLists={handleMergeLists}
          />
        )}
        
        {view === ViewState.LIST_DETAILS && activeList && (
            <ListDetailView 
                list={activeList}
                onBack={() => setView(ViewState.DASHBOARD)}
                onToggleMemorized={handleToggleMemorized}
                onUpdateWord={handleUpdateWord}
                onAddBatchWords={handleAddBatchWords}
                onDeleteWords={handleDeleteWords}
                onStartStudy={handleStartStudy}
            />
        )}

        {view === ViewState.STUDY_MODE && activeList && (
            <StudySession 
                list={activeList}
                words={studyWords}
                initialTab={studyTab}
                onClose={() => setView(ViewState.LIST_DETAILS)}
                onFinishStudy={(id) => handleUpdateStudyTime(id)}
                onToggleMemorized={handleToggleMemorized}
            />
        )}
        
        {view === ViewState.ADD_WORD && (
          <WordManager 
            lists={lists}
            onCreateList={handleCreateList}
            onSaveWord={handleSaveWord}
            onCancel={() => setView(ViewState.DASHBOARD)}
          />
        )}

        {view === ViewState.AI_THEME && (
          <ThemeGenerator 
            initialTheme={initialTheme}
            onSaveGeneratedList={handleSaveAIThemeList}
            onCancel={() => {
                setInitialTheme('');
                setView(ViewState.DASHBOARD);
            }}
          />
        )}
      </main>

      {/* List Manager Modal */}
      {showListManager && (
        <ListManager 
          lists={lists}
          onUpdateLists={handleUpdateLists}
          onClose={() => setShowListManager(false)}
          onCreateList={handleCreateList}
        />
      )}

      {/* Navigation - Hide on detail & study view */}
      {view !== ViewState.LIST_DETAILS && view !== ViewState.STUDY_MODE && (
        <BottomNav currentView={view} onChangeView={handleChangeView} />
      )}
      
    </div>
  );
};

export default App;