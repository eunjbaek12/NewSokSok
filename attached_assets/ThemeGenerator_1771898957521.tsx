import React, { useState, useEffect } from 'react';
import { generateThemeListWithGemini } from '../services/geminiService';
import { AIWordResult } from '../types';
import { IconSparkles, IconRefresh } from './Icons';

interface ThemeGeneratorProps {
  initialTheme: string;
  onSaveGeneratedList: (title: string, words: AIWordResult[]) => void;
  onCancel: () => void;
}

const THEME_BATCH_1 = [
  "Airport Survival", "Starbucks Orders", "Business Email", "Netflix Genres", "K-Pop Fandom"
];
const THEME_BATCH_2 = [
  "Yoga Poses", "Startup Lingo", "Cooking Verbs", "Medical Terms", "Hotel Check-in"
];

const ThemeGenerator: React.FC<ThemeGeneratorProps> = ({ initialTheme, onSaveGeneratedList, onCancel }) => {
  const [theme, setTheme] = useState(initialTheme);
  const [difficulty, setDifficulty] = useState('Intermediate');
  const [count, setCount] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const [chipBatch, setChipBatch] = useState(0);

  const currentChips = chipBatch === 0 ? THEME_BATCH_1 : THEME_BATCH_2;

  // Update local theme if initialTheme changes (e.g. reopen)
  useEffect(() => {
    setTheme(initialTheme);
  }, [initialTheme]);

  const handleGenerate = async () => {
    if (!theme.trim()) return;

    setIsLoading(true);
    try {
      const result = await generateThemeListWithGemini(theme, difficulty, count);
      onSaveGeneratedList(result.title, result.words);
    } catch (error) {
      alert("Failed to generate list. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChipClick = (chipText: string) => {
      setTheme(chipText);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-surface-dark animate-slide-up">
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
         <button onClick={onCancel} className="text-gray-400 hover:text-gray-900 dark:hover:text-white">Close</button>
         <h2 className="font-bold text-gray-900 dark:text-white">AI Theme Generator</h2>
         <div className="w-10"></div>{/* Spacer */}
      </div>

      <div className="p-6 flex-1 flex flex-col overflow-y-auto no-scrollbar">
        
        {/* Hero Section */}
        <div className="text-center mb-6 mt-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-primary/10 mb-4 shadow-sm">
                <IconSparkles className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">What do you want to learn?</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Enter a topic, and AI will create a <br/>custom vocabulary list just for you.
            </p>
        </div>

        {/* Options Container */}
        <div className="space-y-6 mb-8">
            {/* Difficulty Selector */}
            <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block text-center">Difficulty</label>
                <div className="flex justify-center gap-2">
                    {['Beginner', 'Intermediate', 'Advanced'].map((level) => (
                        <button
                            key={level}
                            onClick={() => setDifficulty(level)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                                difficulty === level 
                                ? 'bg-primary text-white border-primary shadow-md shadow-green-100 dark:shadow-none' 
                                : 'bg-white dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700'
                            }`}
                        >
                            {level}
                        </button>
                    ))}
                </div>
            </div>

            {/* Count Selector */}
            <div className="px-4">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block text-center">
                    Count: {count} words
                </label>
                <input 
                    type="range" 
                    min="20" 
                    max="100" 
                    step="10" 
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="w-full accent-primary h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>20</span>
                    <span>100</span>
                </div>
            </div>
        </div>

        {/* Input */}
        <div className="mb-10 relative">
            <input 
                type="text" 
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                placeholder="Ex: Dating in English..."
                className="w-full p-4 pr-4 text-lg bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary focus:bg-white dark:focus:bg-gray-900 rounded-2xl outline-none dark:text-white transition-all shadow-sm"
            />
            <button 
                onClick={handleGenerate}
                disabled={isLoading || !theme}
                className="w-full mt-4 py-4 bg-primary text-white font-bold rounded-2xl hover:bg-primary-dark disabled:opacity-50 transition-all shadow-lg shadow-green-200 dark:shadow-none active:scale-[0.98]"
            >
                {isLoading ? 'Generating...' : 'Generate List'}
            </button>
        </div>

        {/* Loading State */}
        {isLoading && (
            <div className="flex flex-col items-center justify-center py-8 animate-fade-in">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-primary font-medium animate-pulse">
                    Gemini is thinking...
                </p>
            </div>
        )}

        {/* Recommended Chips */}
        {!isLoading && (
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Popular Themes</h3>
                    <button 
                        onClick={() => setChipBatch(prev => prev === 0 ? 1 : 0)}
                        className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                    >
                        <IconRefresh className="w-3 h-3" /> Refresh
                    </button>
                </div>
                <div className="flex flex-wrap gap-3">
                    {currentChips.map((t) => (
                        <button
                            key={t}
                            onClick={() => handleChipClick(t)}
                            className="px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-full text-sm font-medium hover:border-primary hover:text-primary active:bg-green-50 dark:active:bg-gray-700 transition-all"
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default ThemeGenerator;