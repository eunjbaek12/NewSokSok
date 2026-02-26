import React from 'react';
import { ViewState } from '../types';
import { IconHome, IconSearch, IconPlus, IconSparkles, IconUser } from './Icons';

interface BottomNavProps {
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ currentView, onChangeView }) => {
  const navItemClass = (isActive: boolean) => 
    `flex flex-col items-center justify-center w-full h-full text-[10px] font-medium transition-colors gap-1 ${
      isActive ? 'text-primary' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
    }`;

  return (
    <div className="fixed bottom-0 left-0 z-50 w-full h-16 bg-white dark:bg-surface-dark border-t border-gray-100 dark:border-gray-800 shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
      <div className="grid h-full max-w-lg grid-cols-5 mx-auto relative">
        
        {/* Home */}
        <button 
            type="button" 
            className={navItemClass(currentView === ViewState.DASHBOARD)}
            onClick={() => onChangeView(ViewState.DASHBOARD)}
        >
            <IconHome className="w-6 h-6" />
            <span>Home</span>
        </button>

        {/* Search */}
        <button 
            type="button" 
            className={navItemClass(false)}
            // Placeholder for search functionality
        >
            <IconSearch className="w-6 h-6" />
            <span>Search</span>
        </button>

        {/* Center Add Button (Protruding) */}
        <div className="relative flex items-center justify-center">
            <button 
                type="button" 
                className="absolute -top-6 w-14 h-14 rounded-2xl bg-primary text-white shadow-xl shadow-green-200 dark:shadow-none flex items-center justify-center transition-transform active:scale-95 hover:bg-primary-dark ring-4 ring-white dark:ring-surface-dark"
                onClick={() => onChangeView(ViewState.ADD_WORD)}
            >
                <IconPlus className="w-8 h-8" />
                <span className="sr-only">Add Word</span>
            </button>
        </div>

        {/* AI Theme */}
        <button 
            type="button" 
            className={navItemClass(currentView === ViewState.AI_THEME)}
            onClick={() => onChangeView(ViewState.AI_THEME)}
        >
            <IconSparkles className={`w-6 h-6 ${currentView === ViewState.AI_THEME ? 'text-primary animate-pulse' : 'text-primary/70'}`} />
            <span className={currentView === ViewState.AI_THEME ? 'text-primary' : 'text-primary/70'}>AI Theme</span>
        </button>

        {/* Me */}
        <button 
            type="button" 
            className={navItemClass(false)}
        >
            <IconUser className="w-6 h-6" />
            <span>Me</span>
        </button>

      </div>
    </div>
  );
};

export default BottomNav;