import React, { useState, useEffect } from 'react';
import { VocaList, Word } from '../types';
import { IconX, IconMic, IconVolume, IconCheck, IconRefresh } from './Icons';
import { useTTS } from '../hooks/useTTS';

interface StudySessionProps {
    list: VocaList;
    words: Word[]; // Words specifically passed for this session
    onClose: () => void;
    onFinishStudy: (listId: string) => void;
    initialTab: 'FLASHCARD' | 'QUIZ' | 'EXAMPLES' | 'SHADOWING';
    onToggleMemorized: (listId: string, wordId: string, status: boolean) => void;
}

const StudySession: React.FC<StudySessionProps> = ({ list, words, onClose, onFinishStudy, initialTab, onToggleMemorized }) => {
    const { speak, isSupported, isSpeaking } = useTTS();
    const [currentTab] = useState(initialTab);

    // Manage local session words (to handle retries)
    const [sessionWords, setSessionWords] = useState<Word[]>(words);
    const [currentIndex, setCurrentIndex] = useState(0);

    const [isFlipped, setIsFlipped] = useState(false);
    const [showSummary, setShowSummary] = useState(false);

    // Track session results locally: wordId -> isMemorized (true/false)
    const [sessionResults, setSessionResults] = useState<Record<string, boolean>>({});

    // Shadowing State
    const [isListening, setIsListening] = useState(false);
    const [spokenText, setSpokenText] = useState('');
    const [matchScore, setMatchScore] = useState<number | null>(null);

    // Quiz State
    const [quizOptions, setQuizOptions] = useState<string[]>([]);
    const [quizAnswer, setQuizAnswer] = useState<string | null>(null);

    const currentWord = sessionWords[currentIndex];

    // -- Helpers --
    const speakWord = (text: string, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation();
        }
        speak(text);
    };

    // -- Speech Recognition --
    const startListening = () => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert("Speech recognition is not supported in this browser.");
            return;
        }

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        setIsListening(true);
        setSpokenText('');
        setMatchScore(null);

        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setSpokenText(transcript);

            const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
            const target = normalize(currentWord.term);
            const spoken = normalize(transcript);

            if (spoken.includes(target) || target.includes(spoken)) {
                setMatchScore(100);
            } else {
                setMatchScore(40);
            }
            setIsListening(false);
        };

        recognition.onerror = (event: any) => {
            console.error(event.error);
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognition.start();
    };

    // -- Quiz Logic --
    useEffect(() => {
        if (!currentWord) return;
        if (currentTab === 'QUIZ' || currentTab === 'EXAMPLES') {
            generateQuiz();
        }
    }, [currentIndex, currentTab, sessionWords]);

    const generateQuiz = () => {
        setQuizAnswer(null);
        const isExampleMode = currentTab === 'EXAMPLES';
        const isGapFill = isExampleMode && currentWord.exampleEn;

        // Use global list for distractors to ensure we have enough options even if sessionWords is small
        const distractors = list.words
            .filter(w => w.id !== currentWord.id)
            .sort(() => 0.5 - Math.random())
            .slice(0, 3);

        const correctOption = isGapFill ? currentWord.term : currentWord.meaningKr;
        const distractorOptions = distractors.map(d => isGapFill ? d.term : d.meaningKr);

        const options = [correctOption, ...distractorOptions].sort(() => 0.5 - Math.random());
        setQuizOptions(options);
    };

    const handleQuizSelect = (selected: string) => {
        const isExampleMode = currentTab === 'EXAMPLES';
        const isGapFill = isExampleMode && currentWord.exampleEn;
        const correct = isGapFill ? currentWord.term : currentWord.meaningKr;

        if (selected === correct) {
            setQuizAnswer('CORRECT');
        } else {
            setQuizAnswer('WRONG');
        }
    };

    // -- Review / Got It Logic --
    const handleResult = (isMemorized: boolean) => {
        // 1. Update Global State
        onToggleMemorized(list.id, currentWord.id, isMemorized);

        // 2. Track Local Session Result
        setSessionResults(prev => ({
            ...prev,
            [currentWord.id]: isMemorized
        }));

        // 3. Move to next
        if (currentIndex < sessionWords.length - 1) {
            setCurrentIndex(prev => prev + 1);
            // Reset local UI states
            setIsFlipped(false);
            setSpokenText('');
            setMatchScore(null);
            setQuizAnswer(null);
        } else {
            // End of current batch
            onFinishStudy(list.id);
            setShowSummary(true);
        }
    };

    const handleRetry = () => {
        const failedWordIds = Object.keys(sessionResults).filter(id => !sessionResults[id]);

        // If user memorized everything, maybe they want to restart the whole set
        const nextBatch = failedWordIds.length > 0
            ? sessionWords.filter(w => failedWordIds.includes(w.id))
            : sessionWords;

        setSessionWords(nextBatch);
        setSessionResults({}); // Reset results for new round
        setCurrentIndex(0);
        setShowSummary(false);
        setIsFlipped(false);
        setQuizAnswer(null);
    };

    // -- Summary Stats --
    const memorizedCount = Object.values(sessionResults).filter(v => v).length;
    const reviewCount = Object.values(sessionResults).filter(v => !v).length;

    if (!currentWord && !showSummary) return null; // Safety

    return (
        <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-black flex flex-col animate-slide-up">
            {/* Header */}
            <div className="bg-white dark:bg-surface-dark border-b border-gray-100 dark:border-gray-800 p-4 flex items-center justify-between">
                <button onClick={onClose} className="p-2 -ml-2 text-gray-400 hover:text-gray-900 dark:hover:text-white">
                    <IconX className="w-6 h-6" />
                </button>

                <div className="flex-1 mx-6">
                    <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${((currentIndex) / sessionWords.length) * 100}%` }}
                        ></div>
                    </div>
                </div>

                <div className="text-xs font-bold text-gray-400 tabular-nums">
                    {currentIndex + 1} / {sessionWords.length}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden">

                {/* FLASHCARD MODE */}
                {currentTab === 'FLASHCARD' && currentWord && (
                    <div
                        onClick={() => setIsFlipped(!isFlipped)}
                        className="w-full max-w-sm aspect-[4/5] perspective-1000 cursor-pointer"
                    >
                        <div className={`relative w-full h-full transition-transform duration-500 transform-style-3d shadow-xl rounded-3xl ${isFlipped ? 'rotate-y-180' : ''}`}>
                            <div className="absolute w-full h-full backface-hidden bg-white dark:bg-surface-dark rounded-3xl flex flex-col items-center justify-center p-8 border border-gray-100 dark:border-gray-700">
                                <h2 className="text-5xl font-bold text-gray-900 dark:text-white text-center break-words leading-tight">{currentWord.term}</h2>
                                {isSupported && (
                                    <button
                                        onClick={(e) => speakWord(currentWord.term, e)}
                                        className="mt-6 p-3 rounded-full bg-gray-50 text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors"
                                    >
                                        <IconVolume className="w-8 h-8" />
                                    </button>
                                )}
                                <div className="absolute bottom-8 text-sm text-gray-300 font-medium animate-pulse">Tap to flip</div>
                            </div>

                            <div className="absolute w-full h-full backface-hidden rotate-y-180 bg-primary/10 dark:bg-primary/5 rounded-3xl flex flex-col items-center justify-center p-8 border-2 border-primary/20">
                                <h3 className="text-4xl font-bold text-primary text-center mb-8 break-words leading-tight">{currentWord.meaningKr}</h3>
                                {currentWord.exampleEn && (
                                    <div className="w-full bg-white/60 dark:bg-black/20 p-6 rounded-2xl backdrop-blur-sm relative">
                                        <p className="text-lg text-gray-700 dark:text-gray-200 italic text-center leading-relaxed pr-8">"{currentWord.exampleEn}"</p>
                                        {isSupported && (
                                            <button
                                                onClick={(e) => speakWord(currentWord.exampleEn!, e)}
                                                className="absolute top-1/2 -translate-y-1/2 right-4 p-2 text-gray-400 hover:text-primary transition-colors"
                                            >
                                                <IconVolume className="w-5 h-5" />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* SHADOWING MODE */}
                {currentTab === 'SHADOWING' && currentWord && (
                    <div className="w-full max-w-sm flex flex-col items-center justify-center space-y-10 animate-fade-in">
                        <div className="text-center space-y-4">
                            <h2 className="text-5xl font-bold text-gray-900 dark:text-white">{currentWord.term}</h2>
                            <p className="text-2xl text-gray-500 dark:text-gray-400">{currentWord.meaningKr}</p>
                        </div>
                        <div className="flex gap-6 items-center">
                            <button
                                onClick={() => speakWord(currentWord.term + ". " + (currentWord.exampleEn || ''))}
                                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isSpeaking
                                        ? 'bg-primary text-white scale-110 shadow-lg shadow-primary/30'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95'
                                    }`}
                            >
                                <IconVolume className={`w-8 h-8 ${isSpeaking ? 'animate-pulse' : ''}`} />
                            </button>
                            <button
                                onClick={startListening}
                                className={`w-20 h-20 rounded-full flex items-center justify-center text-white shadow-xl shadow-primary/30 active:scale-95 transition-all ${isListening ? 'bg-red-500 animate-pulse' : 'bg-primary'
                                    }`}
                            >
                                <IconMic className="w-10 h-10" />
                            </button>
                        </div>
                        <div className="w-full min-h-[120px] flex flex-col items-center justify-center text-center">
                            {!spokenText ? (
                                <p className="text-gray-400 text-lg leading-relaxed">
                                    Tap mic & read:<br />
                                    <span className="text-gray-800 dark:text-gray-200 font-medium italic">"{currentWord.exampleEn}"</span>
                                </p>
                            ) : (
                                <div className="animate-fade-in">
                                    <p className="text-xl font-bold mb-2">"{spokenText}"</p>
                                    {matchScore === 100 ? (
                                        <span className="text-green-500 font-bold text-lg">Perfect!</span>
                                    ) : (
                                        <span className="text-orange-500 font-bold text-lg">Try again</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* QUIZ & EXAMPLES MODE */}
                {(currentTab === 'QUIZ' || currentTab === 'EXAMPLES') && currentWord && (
                    <div className="w-full max-w-sm flex flex-col h-full justify-center animate-fade-in pb-12">
                        <div className="mb-10 min-h-[160px] flex items-center justify-center">
                            {currentTab === 'EXAMPLES' ? (
                                <div className="text-center relative">
                                    <p className="text-2xl font-medium text-gray-800 dark:text-gray-100 leading-relaxed max-w-[280px] mx-auto">
                                        "{currentWord.exampleEn.replace(new RegExp(currentWord.term, 'gi'), '_______')}"
                                    </p>
                                    {isSupported && (
                                        <button
                                            onClick={() => speakWord(currentWord.exampleEn.replace(new RegExp(currentWord.term, 'gi'), 'blank'))}
                                            className="absolute -right-8 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-primary transition-colors"
                                        >
                                            <IconVolume className="w-5 h-5" />
                                        </button>
                                    )}
                                    <p className="mt-4 text-gray-500">{currentWord.meaningKr}</p>
                                </div>
                            ) : (
                                <div className="text-center relative">
                                    <h2 className="text-5xl font-bold text-gray-900 dark:text-white pr-2">{currentWord.term}</h2>
                                    {isSupported && (
                                        <button
                                            onClick={() => speakWord(currentWord.term)}
                                            className="absolute -right-10 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-primary transition-colors"
                                        >
                                            <IconVolume className="w-6 h-6" />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            {quizOptions.map((opt, i) => (
                                <button
                                    key={i}
                                    disabled={quizAnswer !== null}
                                    onClick={() => handleQuizSelect(opt)}
                                    className={`w-full p-5 rounded-2xl text-left text-lg font-bold transition-all border-2 ${quizAnswer === null
                                            ? 'bg-white dark:bg-surface-dark border-gray-100 dark:border-gray-700 hover:border-primary/50'
                                            : opt === (currentTab === 'EXAMPLES' ? currentWord.term : currentWord.meaningKr)
                                                ? 'bg-green-100 border-green-500 text-green-800'
                                                : quizAnswer === 'WRONG' && i === quizOptions.indexOf(opt)
                                                    ? 'bg-red-100 border-red-500 text-red-800 opacity-60'
                                                    : 'opacity-40'
                                        }`}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            <div className="p-5 bg-white dark:bg-surface-dark border-t border-gray-100 dark:border-gray-800">
                <div className="flex gap-4 max-w-lg mx-auto">
                    <button
                        onClick={() => handleResult(false)}
                        className="flex-1 py-4 rounded-2xl bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400 font-extrabold text-lg border border-orange-100 dark:border-orange-800/50 hover:bg-orange-100 dark:hover:bg-orange-900/40 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <IconX className="w-6 h-6" /> Review
                    </button>
                    <button
                        onClick={() => handleResult(true)}
                        className="flex-1 py-4 rounded-2xl bg-primary text-white font-extrabold text-lg shadow-lg shadow-green-200 dark:shadow-none hover:bg-primary-dark active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <IconCheck className="w-6 h-6" /> Got it
                    </button>
                </div>
            </div>

            {/* Summary Popup Modal */}
            {showSummary && (
                <div className="absolute inset-0 z-[60] bg-white dark:bg-surface-dark flex flex-col items-center justify-center p-6 animate-fade-in">
                    <div className="w-full max-w-sm bg-gray-50 dark:bg-gray-800 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Session Complete!</h2>
                        <p className="text-gray-500 mb-8">Great job studying.</p>

                        <div className="flex justify-center gap-6 mb-10">
                            <div className="flex flex-col items-center">
                                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 text-2xl font-bold mb-2">
                                    {memorizedCount}
                                </div>
                                <span className="text-xs font-bold text-gray-400 uppercase">Memorized</span>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 text-2xl font-bold mb-2">
                                    {reviewCount}
                                </div>
                                <span className="text-xs font-bold text-gray-400 uppercase">Review</span>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={handleRetry}
                                className="w-full py-4 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-green-200 dark:shadow-none hover:bg-primary-dark active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <IconRefresh className="w-5 h-5" />
                                {reviewCount > 0 ? 'Retry Review Words' : 'Study Again'}
                            </button>
                            <button
                                onClick={onClose}
                                className="w-full py-4 bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300 font-bold rounded-2xl border-2 border-transparent hover:bg-gray-100 dark:hover:bg-gray-600 active:scale-95 transition-all"
                            >
                                Quit
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudySession;