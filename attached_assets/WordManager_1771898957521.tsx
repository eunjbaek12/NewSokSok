import React, { useState, useEffect, useRef } from 'react';
import { VocaList, Word } from '../types';
import { analyzeWordWithGemini } from '../services/geminiService';
import { IconSearch, IconCamera, IconFileText, IconBook, IconChevronDown } from './Icons';

interface WordManagerProps {
  lists: VocaList[];
  onCreateList: (name: string) => void;
  onSaveWord: (listId: string, word: Omit<Word, 'id' | 'isMemorized'>) => void;
  onCancel: () => void;
}

const WordManager: React.FC<WordManagerProps> = ({ lists, onCreateList, onSaveWord, onCancel }) => {
  const [term, setTerm] = useState('');
  const [selectedListId, setSelectedListId] = useState(lists.length > 0 ? lists[0].id : '');
  
  // List Creation Logic inside Select
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');

  // Analysis Data
  const [definition, setDefinition] = useState('');
  const [exampleEn, setExampleEn] = useState('');
  const [meaningKr, setMeaningKr] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'dict'>('edit');
  
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleAnalyze = async () => {
    if (!term.trim()) return;
    setIsLoading(true);
    const result = await analyzeWordWithGemini(term);
    setDefinition(result.definition);
    setExampleEn(result.exampleEn);
    setMeaningKr(result.meaningKr);
    setIsLoading(false);
  };

  const handleCreateListSubmit = () => {
    if (newListName.trim()) {
      onCreateList(newListName);
      // In a real app we'd get the ID back, here we rely on parent sync. 
      // We assume the new list is at the top or we handle it via effect. 
      // For this demo, let's just reset UI and assume user picks it (or we can select it if we had the ID).
      // Since onCreateList in App.tsx adds to top, we can technically assume index 0 next render,
      // but let's just exit creation mode.
      setIsCreatingList(false);
      setNewListName('');
      alert(`Created list: ${newListName}. Please select it.`);
    }
  };

  const handleSave = () => {
    if (!selectedListId && !isCreatingList) {
        alert("Please select a list.");
        return;
    }
    if (isCreatingList) {
        alert("Please finish creating the list first (Press Enter).");
        return;
    }
    if (!term || !meaningKr) {
        alert("Word and Meaning are required.");
        return;
    }
    onSaveWord(selectedListId, { term, definition, exampleEn, meaningKr });
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-surface-dark animate-slide-up">
      
      {/* Top Bar */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-800 text-sm font-medium p-2">Cancel</button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add Word</h2>
        <button onClick={handleSave} className="text-primary hover:text-primary-dark text-sm font-bold p-2">Save</button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 pb-24 no-scrollbar">
        
        {/* List Selector */}
        <div className="mb-6">
            {!isCreatingList ? (
                <div className="relative">
                    <select
                        value={selectedListId}
                        onChange={(e) => {
                            if (e.target.value === 'CREATE_NEW') {
                                setIsCreatingList(true);
                            } else {
                                setSelectedListId(e.target.value);
                            }
                        }}
                        className="appearance-none w-full bg-gray-50 dark:bg-gray-800 border-none rounded-xl p-4 pr-10 text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-primary"
                    >
                        {lists.length === 0 && <option value="" disabled>No lists available</option>}
                        {lists.map(list => (
                            <option key={list.id} value={list.id}>{list.title}</option>
                        ))}
                        <option value="CREATE_NEW" className="text-primary font-bold">+ Create New List</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                        <IconChevronDown className="w-5 h-5" />
                    </div>
                </div>
            ) : (
                <div className="flex gap-2 animate-fade-in">
                    <input 
                        type="text" 
                        autoFocus
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateListSubmit()}
                        placeholder="New list name..."
                        className="flex-1 bg-white dark:bg-gray-800 border-2 border-primary rounded-xl p-3 text-gray-900 dark:text-white focus:outline-none"
                    />
                    <button 
                        onClick={handleCreateListSubmit} 
                        className="bg-primary text-white px-4 rounded-xl font-bold text-sm"
                    >
                        OK
                    </button>
                    <button 
                        onClick={() => setIsCreatingList(false)}
                        className="text-gray-400 px-2"
                    >
                        ✕
                    </button>
                </div>
            )}
        </div>

        {/* Word Input Area */}
        <div className="mb-6">
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                    placeholder="Type a word..."
                    className="w-full text-3xl font-bold bg-transparent border-b-2 border-gray-200 dark:border-gray-700 py-2 focus:border-primary focus:outline-none dark:text-white placeholder-gray-300 dark:placeholder-gray-700"
                />
                {isLoading && (
                    <div className="absolute right-0 top-2">
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                )}
            </div>
            
            {/* Quick Actions */}
            <div className="flex gap-2 mt-4">
                <button 
                    onClick={handleAnalyze} 
                    className="flex-1 bg-gray-900 dark:bg-gray-700 text-white rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                    <IconSearch className="w-4 h-4" /> AI Analyze
                </button>
                <button className="w-12 h-12 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-xl text-gray-500 active:scale-95 transition-transform">
                    <IconCamera className="w-5 h-5" />
                </button>
                <button className="w-12 h-12 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-xl text-gray-500 active:scale-95 transition-transform">
                    <IconFileText className="w-5 h-5" />
                </button>
            </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
            <button 
                onClick={() => setActiveTab('edit')}
                className={`flex-1 pb-3 text-sm font-medium transition-colors relative ${activeTab === 'edit' ? 'text-primary' : 'text-gray-400'}`}
            >
                Edit Info
                {activeTab === 'edit' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-full"></div>}
            </button>
            <button 
                onClick={() => setActiveTab('dict')}
                className={`flex-1 pb-3 text-sm font-medium transition-colors relative ${activeTab === 'dict' ? 'text-primary' : 'text-gray-400'}`}
            >
                Dictionary
                {activeTab === 'dict' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-full"></div>}
            </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'edit' ? (
            <div className="space-y-4 animate-fade-in">
                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Korean Meaning</label>
                    <input
                        type="text"
                        value={meaningKr}
                        onChange={(e) => setMeaningKr(e.target.value)}
                        placeholder="Meaning will appear here..."
                        className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-transparent focus:border-primary focus:ring-0 dark:text-white transition-all"
                    />
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Definition (En)</label>
                    <textarea
                        rows={3}
                        value={definition}
                        onChange={(e) => setDefinition(e.target.value)}
                        placeholder="Definition will appear here..."
                        className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-transparent focus:border-primary focus:ring-0 dark:text-white transition-all"
                    />
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Example Sentence</label>
                    <textarea
                        rows={2}
                        value={exampleEn}
                        onChange={(e) => setExampleEn(e.target.value)}
                        placeholder="Example sentence..."
                        className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-transparent focus:border-primary focus:ring-0 dark:text-white italic transition-all"
                    />
                </div>
            </div>
        ) : (
            <div className="animate-fade-in h-64 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6 text-center">
                <IconBook className="w-12 h-12 text-gray-300 mb-4" />
                <p className="text-gray-600 dark:text-gray-300 font-medium mb-2">External Dictionaries</p>
                <p className="text-xs text-gray-400 mb-6">Access full definitions on the web</p>
                
                <div className="flex gap-3 w-full">
                    <a 
                        href={`https://en.dict.naver.com/#/search?query=${term}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex-1 py-3 bg-[#03C75A] text-white rounded-xl text-sm font-bold shadow-lg shadow-green-100 dark:shadow-none hover:opacity-90 transition-opacity"
                    >
                        Naver Dict
                    </a>
                    <a 
                        href={`https://www.google.com/search?q=define+${term}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex-1 py-3 bg-[#4285F4] text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-100 dark:shadow-none hover:opacity-90 transition-opacity"
                    >
                        Google
                    </a>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default WordManager;