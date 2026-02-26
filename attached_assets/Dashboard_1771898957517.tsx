import React, { useState, useRef, useEffect } from 'react';
import { VocaList, Word, ViewState } from '../types';
import { IconSettings, IconSparkles, IconMoreVertical, IconEyeOff, IconEdit, IconTrash, IconSend } from './Icons';

interface DashboardProps {
  lists: VocaList[];
  userDisplayName: string;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  onManageLists: () => void;
  onToggleMemorized: (listId: string, wordId: string) => void;
  onChangeView: (view: ViewState, listId?: string) => void;
  onOpenThemeGenerator: (theme?: string) => void;
  onDeleteList: (listId: string) => void;
  onRenameList: (listId: string, newTitle: string) => void;
  onToggleVisibility: (listId: string) => void;
  onMergeLists: (sourceListId: string, targetListId: string, deleteSource: boolean) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  lists, 
  userDisplayName, 
  isDarkMode, 
  toggleDarkMode, 
  onManageLists,
  onToggleMemorized,
  onChangeView,
  onOpenThemeGenerator,
  onDeleteList,
  onRenameList,
  onToggleVisibility,
  onMergeLists
}) => {
  const visibleLists = lists.filter(l => l.isVisible);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  
  // Rename State
  const [renameListId, setRenameListId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');

  // Merge State
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [deleteSourceAfterMerge, setDeleteSourceAfterMerge] = useState(false);

  const calculateProgress = (words: Word[]) => {
    if (words.length === 0) return 0;
    const memorized = words.filter(w => w.isMemorized).length;
    return Math.round((memorized / words.length) * 100);
  };

  const getReviewStatus = (lastStudiedAt?: number) => {
    if (!lastStudiedAt) return { label: 'New', color: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' };

    const now = Date.now();
    const diffHours = (now - lastStudiedAt) / (1000 * 60 * 60);

    // Ebbinghaus Forgetting Curve intervals
    if (diffHours >= 24 * 7) return { label: 'Weekly Review', color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 animate-pulse' };
    if (diffHours >= 24 * 3) return { label: '3-Day Review', color: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800' };
    if (diffHours >= 24) return { label: 'Daily Review', color: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800' };
    
    return { label: 'Learned', color: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700' };
  };

  const getRelativeTime = (timestamp?: number) => {
    if (!timestamp) return "Never";
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60 * 1000) return "Just now";
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    if (days === 1) return "Yesterday";
    return `${days} days ago`;
  };

  const handleMenuClick = (e: React.MouseEvent, listId: string) => {
      e.stopPropagation();
      setActiveMenuId(activeMenuId === listId ? null : listId);
  };

  const handleDeleteClick = (e: React.MouseEvent, list: VocaList) => {
      e.stopPropagation();
      setActiveMenuId(null);
      if (window.confirm(`Are you sure you want to delete "${list.title}"?\nThis action cannot be undone.`)) {
          onDeleteList(list.id);
      }
  };

  const handleRenameClick = (e: React.MouseEvent, list: VocaList) => {
      e.stopPropagation();
      setActiveMenuId(null);
      setRenameListId(list.id);
      setRenameTitle(list.title);
  };

  const handleHideClick = (e: React.MouseEvent, listId: string) => {
      e.stopPropagation();
      setActiveMenuId(null);
      onToggleVisibility(listId);
  };

  const handleMergeClick = (e: React.MouseEvent, list: VocaList) => {
      e.stopPropagation();
      setActiveMenuId(null);
      
      // Setup merge state
      const otherLists = lists.filter(l => l.id !== list.id);
      if (otherLists.length === 0) {
          alert("No other wordbooks available to send words to.");
          return;
      }
      
      setMergeSourceId(list.id);
      setMergeTargetId(otherLists[0].id); // Default to first available
      setDeleteSourceAfterMerge(false);
  };

  const submitRename = () => {
      if (renameListId && renameTitle.trim()) {
          onRenameList(renameListId, renameTitle.trim());
          setRenameListId(null);
          setRenameTitle('');
      }
  };

  const submitMerge = () => {
      if (mergeSourceId && mergeTargetId) {
          onMergeLists(mergeSourceId, mergeTargetId, deleteSourceAfterMerge);
          setMergeSourceId(null);
          setMergeTargetId('');
      }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    if (activeMenuId) document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeMenuId]);

  const RECOMMENDED_THEMES_SHORTCUTS = [
    { title: "Travel English", icon: "✈️" },
    { title: "IT Interview", icon: "💻" },
    { title: "Business Email", icon: "📧" },
    { title: "Medical Terms", icon: "🏥" }
  ];

  return (
    <div className="pb-24 pt-6 px-5 h-full overflow-y-auto no-scrollbar bg-background dark:bg-background-dark relative">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Hello, <span className="text-primary">{userDisplayName}</span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Smart Review System Active</p>
        </div>
        <button 
          onClick={toggleDarkMode}
          className="p-2 rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300 active:scale-95 transition-transform"
        >
          {isDarkMode ? '🌙' : '☀️'}
        </button>
      </div>

      {/* Lists Section */}
      <div className="flex justify-between items-end mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            My Wordbooks
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{visibleLists.length}</span>
        </h2>
        <button onClick={onManageLists} className="p-2 text-gray-400 hover:text-primary transition-colors active:scale-95">
            <IconSettings className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        {visibleLists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 bg-white dark:bg-surface-dark rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <IconSparkles className="w-10 h-10 text-gray-300 mb-2" />
            <p className="text-gray-500 font-medium">No wordbooks yet.</p>
            <button 
                onClick={() => onChangeView(ViewState.AI_THEME)}
                className="mt-3 text-primary text-sm font-bold hover:underline"
            >
                Create with AI &rarr;
            </button>
          </div>
        ) : (
          visibleLists.map(list => {
            const progress = calculateProgress(list.words);
            const total = list.words.length;
            const memorized = list.words.filter(w => w.isMemorized).length;
            const status = getReviewStatus(list.lastStudiedAt);
            const relativeTime = getRelativeTime(list.lastStudiedAt);

            return (
              <div key={list.id} className="relative bg-white dark:bg-surface-dark rounded-2xl shadow-sm shadow-gray-200/50 dark:shadow-none border border-gray-100 dark:border-gray-800 overflow-visible transition-all duration-300 hover:border-primary/50">
                
                {/* Context Menu Button */}
                <div className="absolute top-2 right-2 z-10">
                    <button 
                        onClick={(e) => handleMenuClick(e, list.id)}
                        className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-full transition-colors"
                    >
                        <IconMoreVertical className="w-5 h-5" />
                    </button>
                    {activeMenuId === list.id && (
                        <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-20 overflow-hidden animate-fade-in">
                            <button 
                                onClick={(e) => handleMergeClick(e, list)}
                                className="w-full text-left px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                            >
                                <IconSend className="w-4 h-4" /> Send to Wordbook
                            </button>
                            <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
                            <button 
                                onClick={(e) => handleHideClick(e, list.id)}
                                className="w-full text-left px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                            >
                                <IconEyeOff className="w-4 h-4" /> Hide
                            </button>
                            <button 
                                onClick={(e) => handleRenameClick(e, list)}
                                className="w-full text-left px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                            >
                                <IconEdit className="w-4 h-4" /> Rename
                            </button>
                            <button 
                                onClick={(e) => handleDeleteClick(e, list)}
                                className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                            >
                                <IconTrash className="w-4 h-4" /> Delete
                            </button>
                        </div>
                    )}
                </div>

                <div 
                  className="p-5 cursor-pointer active:bg-gray-50 dark:active:bg-gray-800/50"
                  onClick={() => onChangeView(ViewState.LIST_DETAILS, list.id)}
                >
                  <div className="flex justify-between items-start mb-2 pr-8">
                    <div>
                        <h3 className="font-bold text-lg text-gray-900 dark:text-white truncate leading-tight max-w-[180px]">{list.title}</h3>
                        <p className="text-[10px] text-gray-400 font-medium mt-1">
                            Last studied: {relativeTime}
                        </p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${status.color} whitespace-nowrap`}>
                        {status.label}
                    </span>
                  </div>
                  
                  {/* Progress Bar with Stats */}
                  <div className="mt-4">
                     <div className="flex justify-between items-end mb-1.5">
                         <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                            {memorized} <span className="text-gray-300 mx-0.5">/</span> {total} Words
                         </span>
                         <span className="text-sm font-bold text-primary">{progress}%</span>
                     </div>
                     <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5">
                        <div 
                          className="bg-primary h-2.5 rounded-full transition-all duration-700 ease-out shadow-[0_2px_4px_rgba(139,195,74,0.3)]" 
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Recommended Themes Grid */}
      <div className="mt-8">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Recommended Themes</h2>
        <div className="grid grid-cols-2 gap-3">
           {RECOMMENDED_THEMES_SHORTCUTS.map((theme, i) => (
             <button 
                key={i} 
                onClick={() => onOpenThemeGenerator(theme.title)}
                className="bg-white dark:bg-surface-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-800 text-left hover:border-primary/50 transition-colors active:scale-95 shadow-sm"
             >
                <div className="text-2xl mb-2">{theme.icon}</div>
                <span className="text-sm font-bold text-gray-700 dark:text-gray-200 block">{theme.title}</span>
                <span className="text-[10px] text-gray-400">Tap to generate</span>
             </button>
           ))}
        </div>
      </div>

      {/* Rename Modal */}
      {renameListId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
              <div className="bg-white dark:bg-surface-dark w-full max-w-sm rounded-3xl p-6 shadow-2xl">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Rename Wordbook</h3>
                  <input 
                      type="text" 
                      value={renameTitle}
                      onChange={(e) => setRenameTitle(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-primary rounded-xl p-3 text-gray-900 dark:text-white focus:outline-none mb-6"
                      autoFocus
                  />
                  <div className="flex gap-3">
                      <button 
                          onClick={() => setRenameListId(null)}
                          className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl"
                      >
                          Cancel
                      </button>
                      <button 
                          onClick={submitRename}
                          className="flex-1 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-dark"
                      >
                          Save
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Merge/Send Words Modal */}
      {mergeSourceId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
              <div className="bg-white dark:bg-surface-dark w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-slide-up">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Send to Wordbook</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                      Copy contents from <span className="font-bold">"{lists.find(l => l.id === mergeSourceId)?.title}"</span> to:
                  </p>

                  <div className="mb-6">
                      <select
                        value={mergeTargetId}
                        onChange={(e) => setMergeTargetId(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-gray-800 border-r-[12px] border-transparent rounded-xl p-3 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                          {lists.filter(l => l.id !== mergeSourceId).map(list => (
                              <option key={list.id} value={list.id}>{list.title}</option>
                          ))}
                      </select>
                  </div>

                  <div className="mb-6 space-y-3">
                      <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                          <input 
                            type="radio" 
                            name="mergeAction"
                            checked={!deleteSourceAfterMerge}
                            onChange={() => setDeleteSourceAfterMerge(false)}
                            className="w-5 h-5 accent-primary"
                          />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                              Keep original wordbook
                          </span>
                      </label>
                      
                      <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
                          <input 
                            type="radio" 
                            name="mergeAction"
                            checked={deleteSourceAfterMerge}
                            onChange={() => setDeleteSourceAfterMerge(true)}
                            className="w-5 h-5 accent-red-500"
                          />
                          <span className="text-sm font-medium text-red-600 dark:text-red-400">
                              Delete original wordbook
                          </span>
                      </label>
                  </div>

                  <div className="flex gap-3">
                      <button 
                          onClick={() => setMergeSourceId(null)}
                          className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl"
                      >
                          Cancel
                      </button>
                      <button 
                          onClick={submitMerge}
                          className={`flex-1 py-3 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 ${
                              deleteSourceAfterMerge 
                                ? 'bg-red-500 shadow-red-200 hover:bg-red-600 dark:shadow-none' 
                                : 'bg-primary shadow-green-200 hover:bg-primary-dark dark:shadow-none'
                          }`}
                      >
                          {deleteSourceAfterMerge ? 'Move' : 'Copy'}
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Dashboard;