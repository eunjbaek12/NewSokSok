import React, { useState, useRef, useEffect } from 'react';
import { VocaList } from '../types';
import { IconDragHandle, IconMoreVertical, IconEye, IconEyeOff, IconEdit, IconTrash } from './Icons';

interface ListManagerProps {
  lists: VocaList[];
  onUpdateLists: (newLists: VocaList[]) => void;
  onClose: () => void;
  onCreateList: (name: string) => void;
}

const ListManager: React.FC<ListManagerProps> = ({ lists, onUpdateLists, onClose, onCreateList }) => {
  const [localLists, setLocalLists] = useState<VocaList[]>([...lists]);
  const [newListName, setNewListName] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  
  // Rename State
  const [renameListId, setRenameListId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    if (activeMenuId) document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeMenuId]);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, position: number) => {
    dragItem.current = position;
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, position: number) => {
    dragOverItem.current = position;
  };

  const handleDragEnd = () => {
    if (dragItem.current !== null && dragOverItem.current !== null) {
        const copyListItems = [...localLists];
        const dragItemContent = copyListItems[dragItem.current];
        copyListItems.splice(dragItem.current, 1);
        copyListItems.splice(dragOverItem.current, 0, dragItemContent);
        dragItem.current = null;
        dragOverItem.current = null;
        setLocalLists(copyListItems);
    }
  };

  const toggleVisibility = (index: number) => {
    const updated = [...localLists];
    updated[index].isVisible = !updated[index].isVisible;
    setLocalLists(updated);
  };

  const handleAddList = () => {
    if(!newListName.trim()) return;
    const newList: VocaList = {
        id: Date.now().toString(),
        title: newListName,
        words: [],
        isVisible: true,
        createdAt: Date.now()
    };
    setLocalLists([newList, ...localLists]);
    onCreateList(newListName); 
    setNewListName('');
  };

  const handleMenuClick = (e: React.MouseEvent, listId: string) => {
      e.stopPropagation();
      setActiveMenuId(activeMenuId === listId ? null : listId);
  };

  const handleRenameClick = (e: React.MouseEvent, list: VocaList) => {
      e.stopPropagation();
      setActiveMenuId(null);
      setRenameListId(list.id);
      setRenameTitle(list.title);
  };

  const handleDeleteClick = (e: React.MouseEvent, list: VocaList) => {
      e.stopPropagation();
      setActiveMenuId(null);
      if (window.confirm(`Delete "${list.title}"?`)) {
          setLocalLists(prev => prev.filter(l => l.id !== list.id));
      }
  };

  const submitRename = () => {
      if (renameListId && renameTitle.trim()) {
          setLocalLists(prev => prev.map(l => l.id === renameListId ? { ...l, title: renameTitle.trim() } : l));
          setRenameListId(null);
          setRenameTitle('');
      }
  };

  const handleSave = () => {
    onUpdateLists(localLists);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-lg h-[85vh] bg-white dark:bg-surface-dark rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col animate-slide-up relative">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-white dark:bg-surface-dark rounded-t-3xl sticky top-0 z-10">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Manage Wordbooks</h2>
            <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-500 hover:text-gray-900 dark:text-gray-400">
                ✕
            </button>
        </div>

        {/* Add New Section */}
        <div className="p-5 bg-background dark:bg-black/20">
            <div className="flex gap-2">
                <input 
                    type="text" 
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddList()}
                    placeholder="Enter new list title..."
                    className="flex-1 rounded-2xl border-none bg-white dark:bg-gray-800 shadow-sm p-4 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary outline-none"
                />
                <button 
                    onClick={handleAddList}
                    className="px-5 bg-gray-900 dark:bg-gray-700 text-white font-bold rounded-2xl hover:bg-gray-800 active:scale-95 transition-all shadow-lg dark:shadow-none"
                >
                    Add
                </button>
            </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 no-scrollbar pb-24">
            {localLists.map((list, index) => (
                <div 
                    key={list.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnter={(e) => handleDragEnter(e, index)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                    className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm cursor-move active:opacity-70 active:scale-[0.98] transition-all hover:border-primary/30 relative"
                >
                    <IconDragHandle className="w-5 h-5 text-gray-300" />
                    <div className="flex-1">
                        <h4 className="font-bold text-gray-900 dark:text-white text-lg">{list.title}</h4>
                        <p className="text-xs text-gray-400 font-medium">{list.words.length} words • {list.isVisible ? 'Visible' : 'Hidden'}</p>
                    </div>
                    
                    {/* Menu Button */}
                    <div className="relative">
                        <button 
                            onClick={(e) => handleMenuClick(e, list.id)}
                            className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-full transition-colors"
                        >
                            <IconMoreVertical className="w-5 h-5" />
                        </button>
                        
                        {activeMenuId === list.id && (
                            <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-20 overflow-hidden animate-fade-in">
                                <button 
                                    onClick={() => toggleVisibility(index)}
                                    className="w-full text-left px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                                >
                                    {list.isVisible ? <><IconEyeOff className="w-4 h-4" /> Hide</> : <><IconEye className="w-4 h-4" /> Show</>}
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
                </div>
            ))}
            {localLists.length === 0 && (
                <div className="text-center py-10">
                    <p className="text-gray-400">No lists found. Add one above!</p>
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 dark:border-gray-800">
            <button 
                onClick={handleSave} 
                className="w-full py-4 bg-primary text-white text-lg font-bold rounded-2xl hover:bg-primary-dark shadow-xl shadow-green-200 dark:shadow-none transition-transform active:scale-[0.98]"
            >
                Save Changes
            </button>
        </div>

        {/* Rename Modal (Nested) */}
        {renameListId && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4 rounded-t-3xl sm:rounded-3xl">
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
      </div>
    </div>
  );
};

export default ListManager;