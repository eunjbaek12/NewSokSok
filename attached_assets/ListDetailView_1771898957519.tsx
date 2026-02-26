import React, { useState, useEffect, useRef } from 'react';
import { VocaList, Word, AIWordResult } from '../types';
import { generateMoreWordsWithGemini } from '../services/geminiService';
import { IconArrowLeft, IconX, IconCheck, IconSave, IconFileText, IconBook, IconBrain, IconGraduationCap, IconMic, IconPuzzle, IconSparkles, IconTrash, IconVolume } from './Icons';
import { useTTS } from '../hooks/useTTS';

interface ListDetailViewProps {
    list: VocaList;
    onBack: () => void;
    onToggleMemorized: (listId: string, wordId: string) => void;
    onUpdateWord: (listId: string, word: Word) => void;
    onAddBatchWords: (listId: string, words: AIWordResult[]) => void;
    onDeleteWords: (listId: string, wordIds: string[]) => void;
    onStartStudy: (listId: string, mode: 'FLASHCARD' | 'QUIZ' | 'EXAMPLES' | 'SHADOWING', words: Word[]) => void;
}

const ListDetailView: React.FC<ListDetailViewProps> = ({
    list,
    onBack,
    onToggleMemorized,
    onUpdateWord,
    onAddBatchWords,
    onDeleteWords,
    onStartStudy
}) => {
    const { speak, isSupported } = useTTS();
    const [filter, setFilter] = useState<'all' | 'learning' | 'memorized'>('all');
    const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Word | null>(null);

    // Edit Mode (Long Press) State
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<string>>(new Set());

    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // To prevent onClick firing after a long press triggers edit mode
    const isLongPressTriggered = useRef(false);

    // AI Append Modal State
    const [showAIAppend, setShowAIAppend] = useState(false);
    const [appendDifficulty, setAppendDifficulty] = useState('Intermediate');
    const [appendCount, setAppendCount] = useState(20);
    const [isAppending, setIsAppending] = useState(false);

    const selectedWord = list.words.find(w => w.id === selectedWordId);

    useEffect(() => {
        if (selectedWord) {
            setEditForm({ ...selectedWord });
        }
    }, [selectedWordId, list]);

    const handleOpenPopup = (word: Word) => {
        setSelectedWordId(word.id);
        setEditForm({ ...word });
    };

    const handleClosePopup = () => {
        setSelectedWordId(null);
        setEditForm(null);
    };

    const handleSave = () => {
        if (editForm && list.id) {
            onUpdateWord(list.id, editForm);
        }
    };

    // --- Long Press Logic ---
    const handleTouchStart = (wordId: string) => {
        isLongPressTriggered.current = false;
        longPressTimer.current = setTimeout(() => {
            isLongPressTriggered.current = true;
            setIsEditMode(true);
            setSelectedDeleteIds(prev => {
                const newSet = new Set(prev);
                newSet.add(wordId);
                return newSet;
            });
            // Vibrate if supported
            if (navigator.vibrate) navigator.vibrate(50);
        }, 600);
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleItemClick = (word: Word) => {
        // If this click was actually a long press, ignore the click action
        if (isLongPressTriggered.current) {
            isLongPressTriggered.current = false;
            return;
        }

        if (isEditMode) {
            toggleDeleteSelection(word.id);
        } else {
            handleOpenPopup(word);
        }
    };

    const toggleDeleteSelection = (wordId: string) => {
        const newSet = new Set(selectedDeleteIds);
        if (newSet.has(wordId)) {
            newSet.delete(wordId);
        } else {
            newSet.add(wordId);
        }
        setSelectedDeleteIds(newSet);
        if (newSet.size === 0) setIsEditMode(false);
    };

    const executeDelete = () => {
        if (selectedDeleteIds.size === 0) return;
        if (window.confirm(`Delete ${selectedDeleteIds.size} words?`)) {
            onDeleteWords(list.id, Array.from(selectedDeleteIds));
            setIsEditMode(false);
            setSelectedDeleteIds(new Set());
        }
    };

    // --- AI Append Logic ---
    const executeAIAppend = async () => {
        setIsAppending(true);
        try {
            const existingTerms = list.words.map(w => w.term);
            const newWords = await generateMoreWordsWithGemini(
                list.title,
                appendDifficulty,
                appendCount,
                existingTerms
            );
            onAddBatchWords(list.id, newWords);
            setShowAIAppend(false);
        } catch (e) {
            alert("Failed to generate words.");
        } finally {
            setIsAppending(false);
        }
    };


    const filteredWords = list.words.filter(word => {
        if (filter === 'learning') return !word.isMemorized;
        if (filter === 'memorized') return word.isMemorized;
        return true;
    });

    const progress = list.words.length > 0
        ? Math.round((list.words.filter(w => w.isMemorized).length / list.words.length) * 100)
        : 0;

    const StudyButton = ({
        icon: Icon,
        label,
        mode,
        disabled,
        onClick
    }: {
        icon: React.FC<{ className?: string }>,
        label: string,
        mode?: 'FLASHCARD' | 'QUIZ' | 'EXAMPLES' | 'SHADOWING',
        disabled?: boolean,
        onClick?: () => void
    }) => (
        <button
            onClick={onClick ? onClick : () => mode && onStartStudy(list.id, mode, filteredWords)}
            disabled={disabled}
            className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all active:scale-95 ${disabled ? 'opacity-30' : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
        >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-1 ${disabled ? 'bg-gray-100 dark:bg-gray-800' : 'bg-primary/10 text-primary dark:bg-primary/20'
                }`}>
                <Icon className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300">{label}</span>
        </button>
    );

    return (
        <div className="flex flex-col h-full bg-white dark:bg-surface-dark animate-slide-up relative">

            {/* Sticky Header */}
            <div className="sticky top-0 z-20 bg-white/90 dark:bg-surface-dark/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
                <div className="p-4 flex items-center gap-4">
                    <button
                        onClick={isEditMode ? () => setIsEditMode(false) : onBack}
                        className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        {isEditMode ? <IconX className="w-6 h-6 text-gray-900 dark:text-white" /> : <IconArrowLeft className="w-6 h-6 text-gray-900 dark:text-white" />}
                    </button>

                    {isEditMode ? (
                        <div className="flex-1 flex justify-between items-center">
                            <span className="text-lg font-bold">{selectedDeleteIds.size} Selected</span>
                            <button
                                onClick={executeDelete}
                                disabled={selectedDeleteIds.size === 0}
                                className="text-red-500 font-bold text-sm px-3 py-1 bg-red-50 dark:bg-red-900/20 rounded-lg"
                            >
                                Delete
                            </button>
                        </div>
                    ) : (
                        <div className="flex-1 min-w-0">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{list.title}</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }}></div>
                                </div>
                                <span className="text-[10px] font-bold text-primary">{progress}%</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Filter Tabs */}
                {!isEditMode && (
                    <div className="flex px-4 pb-0 space-x-6">
                        {(['all', 'learning', 'memorized'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`pb-3 text-sm font-medium capitalize transition-colors relative ${filter === f ? 'text-primary' : 'text-gray-400 dark:text-gray-500'
                                    }`}
                            >
                                {f} ({
                                    f === 'all' ? list.words.length :
                                        f === 'learning' ? list.words.filter(w => !w.isMemorized).length :
                                            list.words.filter(w => w.isMemorized).length
                                })
                                {filter === f && (
                                    <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></div>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Word List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar pb-32">
                {filteredWords.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                        <p>No words found in this category.</p>
                    </div>
                ) : (
                    filteredWords.map((word) => (
                        <div
                            key={word.id}
                            onClick={() => handleItemClick(word)}
                            onTouchStart={() => handleTouchStart(word.id)}
                            onTouchEnd={handleTouchEnd}
                            onMouseDown={() => handleTouchStart(word.id)} // For desktop long press sim
                            onMouseUp={handleTouchEnd}
                            onMouseLeave={handleTouchEnd}
                            className={`group flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer select-none ${isEditMode && selectedDeleteIds.has(word.id)
                                    ? 'bg-primary/10 border-primary dark:bg-primary/20'
                                    : word.isMemorized
                                        ? 'bg-gray-50 border-transparent dark:bg-gray-900/50'
                                        : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 shadow-sm hover:border-primary/30'
                                }`}
                        >
                            <div className="flex-1 min-w-0 pr-4 pointer-events-none">
                                <div className="flex items-center gap-2">
                                    <h3 className={`text-lg font-bold truncate ${word.isMemorized ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-white'
                                        }`}>
                                        {word.term}
                                    </h3>
                                    {isSupported && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                speak(word.term);
                                            }}
                                            className="p-1 text-gray-400 hover:text-primary transition-colors pointer-events-auto"
                                        >
                                            <IconVolume className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                <p className={`text-sm truncate mt-0.5 ${word.isMemorized ? 'text-gray-300' : 'text-gray-500 dark:text-gray-400'
                                    }`}>
                                    {word.meaningKr}
                                </p>
                                {word.exampleEn && (
                                    <div className="flex items-center gap-2 mt-1">
                                        <p className={`text-xs italic truncate ${word.isMemorized ? 'text-gray-300' : 'text-gray-500 dark:text-gray-400'
                                            }`}>
                                            "{word.exampleEn}"
                                        </p>
                                        {isSupported && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    speak(word.exampleEn!);
                                                }}
                                                className="p-1 text-gray-300 hover:text-primary transition-colors pointer-events-auto"
                                            >
                                                <IconVolume className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Action Area */}
                            {isEditMode ? (
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedDeleteIds.has(word.id) ? 'bg-primary border-primary' : 'border-gray-300 dark:border-gray-600'
                                    }`}>
                                    {selectedDeleteIds.has(word.id) && <IconCheck className="w-4 h-4 text-white" />}
                                </div>
                            ) : (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleMemorized(list.id, word.id);
                                    }}
                                    className={`w-10 h-10 flex items-center justify-center rounded-full transition-all active:scale-90 ${word.isMemorized
                                            ? 'bg-primary text-white shadow-md shadow-green-200 dark:shadow-none'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                        }`}
                                >
                                    <IconCheck className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Detail Popup Modal */}
            {selectedWordId && editForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={handleClosePopup}>
                    <div
                        className="w-full max-w-sm bg-white dark:bg-surface-dark rounded-3xl p-6 shadow-2xl animate-slide-up relative flex flex-col max-h-[80vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={handleClosePopup}
                            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white z-10"
                        >
                            <IconX className="w-6 h-6" />
                        </button>

                        <div className="mb-6 mt-2 overflow-y-auto no-scrollbar flex-1">
                            {/* Editable Fields */}
                            <div className="space-y-6">
                                {/* Term & Meaning */}
                                <div>
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Word (English)</label>
                                    <input
                                        type="text"
                                        value={editForm.term || ''}
                                        onChange={(e) => setEditForm({ ...editForm, term: e.target.value })}
                                        className="w-full text-3xl font-bold text-gray-900 dark:text-white bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-primary outline-none py-1"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Meaning (Korean)</label>
                                    <input
                                        type="text"
                                        value={editForm.meaningKr || ''}
                                        onChange={(e) => setEditForm({ ...editForm, meaningKr: e.target.value })}
                                        className="w-full text-xl text-primary font-medium bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-primary outline-none py-1"
                                    />
                                </div>

                                {/* Definition */}
                                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl relative">
                                    <div className="flex items-center gap-2 mb-2">
                                        <IconBook className="w-4 h-4 text-gray-400" />
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Definition</span>
                                    </div>
                                    <textarea
                                        rows={3}
                                        value={editForm.definition || ''}
                                        onChange={(e) => setEditForm({ ...editForm, definition: e.target.value })}
                                        className="w-full bg-transparent text-gray-700 dark:text-gray-200 leading-relaxed text-sm outline-none resize-none placeholder-gray-400"
                                        placeholder="Enter definition..."
                                    />
                                </div>

                                {/* Example - Enhanced Visibility */}
                                <div className="bg-primary/5 dark:bg-primary/10 p-4 rounded-2xl border-l-4 border-primary/50 relative">
                                    <div className="flex items-center gap-2 mb-2">
                                        <IconFileText className="w-4 h-4 text-primary" />
                                        <span className="text-[10px] font-bold text-primary/80 uppercase tracking-wider">Example Sentence</span>
                                    </div>
                                    <textarea
                                        rows={2}
                                        value={editForm.exampleEn || ''}
                                        onChange={(e) => setEditForm({ ...editForm, exampleEn: e.target.value })}
                                        className="w-full bg-transparent text-gray-700 dark:text-gray-200 italic leading-relaxed text-sm outline-none resize-none placeholder-primary/30"
                                        placeholder="Enter example sentence..."
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Footer Buttons */}
                        <div className="mt-4 flex gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                            <button
                                onClick={handleClosePopup}
                                className="flex-1 py-3.5 rounded-2xl font-bold text-sm bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            >
                                Close
                            </button>
                            <button
                                onClick={handleSave}
                                className="flex-1 py-3.5 rounded-2xl font-bold text-sm bg-primary text-white shadow-xl shadow-green-200 dark:shadow-none hover:bg-primary-dark transition-all flex items-center justify-center gap-2"
                            >
                                <IconSave className="w-5 h-5" />
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Append Modal */}
            {showAIAppend && (
                <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="w-full max-w-sm bg-white dark:bg-surface-dark rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-slide-up">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <IconSparkles className="w-5 h-5 text-primary" />
                            Add More Words
                        </h3>

                        <div className="space-y-6 mb-8">
                            {/* Difficulty */}
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Difficulty</label>
                                <div className="flex gap-2">
                                    {['Beginner', 'Intermediate', 'Advanced'].map((level) => (
                                        <button
                                            key={level}
                                            onClick={() => setAppendDifficulty(level)}
                                            className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${appendDifficulty === level
                                                    ? 'bg-primary text-white border-primary'
                                                    : 'bg-gray-50 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700'
                                                }`}
                                        >
                                            {level}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Count */}
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                                    Count: {appendCount} words
                                </label>
                                <input
                                    type="range"
                                    min="20"
                                    max="100"
                                    step="10"
                                    value={appendCount}
                                    onChange={(e) => setAppendCount(Number(e.target.value))}
                                    className="w-full accent-primary h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="flex justify-between text-xs text-gray-400 mt-1">
                                    <span>20</span>
                                    <span>100</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowAIAppend(false)}
                                className="flex-1 py-3.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300 font-bold rounded-2xl"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={executeAIAppend}
                                disabled={isAppending}
                                className="flex-1 py-3.5 bg-primary text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-green-200 dark:shadow-none"
                            >
                                {isAppending ? (
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    'Generate'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom Toolbar for Study Modes */}
            <div className="fixed bottom-0 left-0 z-10 w-full bg-white dark:bg-surface-dark border-t border-gray-100 dark:border-gray-800 safe-area-bottom shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
                <div className="grid grid-cols-5 gap-1 p-2 max-w-lg mx-auto">
                    <StudyButton icon={IconBrain} label="Flashcard" mode="FLASHCARD" disabled={filteredWords.length === 0} />
                    <StudyButton icon={IconGraduationCap} label="Quiz" mode="QUIZ" disabled={filteredWords.length < 4} />
                    <StudyButton icon={IconPuzzle} label="Examples" mode="EXAMPLES" disabled={filteredWords.length < 4} />
                    <StudyButton icon={IconMic} label="Shadowing" mode="SHADOWING" disabled={filteredWords.length === 0} />

                    {/* AI Add Button */}
                    <StudyButton
                        icon={IconSparkles}
                        label="AI Add"
                        onClick={() => setShowAIAppend(true)}
                    />
                </div>
            </div>

        </div>
    );
};

export default ListDetailView;