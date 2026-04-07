import { useState, useTransition } from 'react';
import * as Haptics from 'expo-haptics';
import { useVocab } from '@/contexts/VocabContext';
import { autoFillWord } from '@/lib/translation-api';
import { searchNaverDict } from '@/lib/naver-dict-api';

export function useAddWord(listId?: string, wordId?: string, existingWord?: any, initialState?: any, sourceLang: string = 'en', targetLang: string = 'ko', apiKey?: string) {
    const { addWord, updateWord } = useVocab();

    const [term, setTerm] = useState(initialState?.term ?? existingWord?.term ?? '');
    const [definition, setDefinition] = useState(initialState?.definition ?? existingWord?.definition ?? '');
    const [exampleEn, setExampleEn] = useState(initialState?.exampleEn ?? existingWord?.exampleEn ?? '');
    const [exampleKr, setExampleKr] = useState(initialState?.exampleKr ?? existingWord?.exampleKr ?? '');
    const [meaningKr, setMeaningKr] = useState(initialState?.meaningKr ?? existingWord?.meaningKr ?? '');
    const [phonetic, setPhonetic] = useState(initialState?.phonetic ?? existingWord?.phonetic ?? '');
    const [pos, setPos] = useState(initialState?.pos ?? existingWord?.pos ?? '');
    const [tags, setTags] = useState<string[]>(initialState?.tags ?? existingWord?.tags ?? []);
    const [isStarred, setIsStarred] = useState<boolean>(initialState?.isStarred ?? existingWord?.isStarred ?? false);

    const [errors, setErrors] = useState<{ term?: boolean; meaningKr?: boolean }>({});

    const [isPendingFill, startAutoFill] = useTransition();
    const [isPendingSave, startSave] = useTransition();

    const runAutoFill = (searchTerm: string) => {
        if (!searchTerm.trim() || isPendingFill) return;

        startAutoFill(async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            try {
                // Try Naver Dictionary first (supported language pairs only)
                const naverResult = await searchNaverDict(searchTerm.trim(), sourceLang, targetLang);
                if (naverResult) {
                    if (naverResult.meaningKr) setMeaningKr(naverResult.meaningKr);
                    if (naverResult.definition) setDefinition(naverResult.definition);
                    if (naverResult.phonetic) setPhonetic(naverResult.phonetic);
                    if (naverResult.pos) setPos(naverResult.pos);
                    if (naverResult.exampleEn) setExampleEn(naverResult.exampleEn);
                    if (naverResult.exampleKr) setExampleKr(naverResult.exampleKr);
                    return;
                }

                // Fallback to AI Analysis
                const result = await autoFillWord(searchTerm.trim(), sourceLang, targetLang, apiKey);
                if (result.definition) setDefinition(result.definition);
                if (result.meaningKr) setMeaningKr(result.meaningKr);
                if (result.phonetic) setPhonetic(result.phonetic);
                if (result.pos) setPos(result.pos);
                if (result.exampleEn) setExampleEn(result.exampleEn);
                if (result.exampleKr) setExampleKr(result.exampleKr);
            } catch {
                // Ignore errors
            }
        });
    };

    const handleAutoFill = () => runAutoFill(term);
    const handleAutoFillWithTerm = (overrideTerm: string) => runAutoFill(overrideTerm);

    const handleSaveWord = (selectedListId: string, onSuccess: (savedTerm: string) => void, onError: () => void) => {
        const newErrors: { term?: boolean; meaningKr?: boolean } = {};
        if (!term.trim()) newErrors.term = true;
        if (!meaningKr.trim()) newErrors.meaningKr = true;
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return;
        }
        setErrors({});
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        startSave(async () => {
            try {
                if (wordId && listId) {
                    await updateWord(listId, wordId, {
                        term: term.trim(),
                        definition: definition.trim(),
                        phonetic: phonetic.trim(),
                        pos: pos.trim(),
                        meaningKr: meaningKr.trim(),
                        exampleEn: exampleEn.trim(),
                        exampleKr: exampleKr.trim(),
                        isStarred,
                        tags,
                        sourceLang,
                        targetLang,
                    });
                    onSuccess(term.trim());
                } else {
                    if (!selectedListId) {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                        onError();
                        return;
                    }
                    const savedTerm = term.trim();
                    await addWord(selectedListId, {
                        term: savedTerm,
                        definition: definition.trim(),
                        phonetic: phonetic.trim(),
                        pos: pos.trim(),
                        exampleEn: exampleEn.trim(),
                        exampleKr: exampleKr.trim(),
                        meaningKr: meaningKr.trim(),
                        isStarred,
                        tags,
                        sourceLang,
                        targetLang,
                    });

                    // Reset states
                    setTerm('');
                    setDefinition('');
                    setPhonetic('');
                    setPos('');
                    setMeaningKr('');
                    setExampleEn('');
                    setExampleKr('');
                    setTags([]);
                    setIsStarred(false);
                    setErrors({});
                    onSuccess(savedTerm);
                }
            } catch (error) {
                console.error("Failed to save word:", error);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                onError();
            }
        });
    };

    return {
        term, setTerm,
        definition, setDefinition,
        meaningKr, setMeaningKr,
        phonetic, setPhonetic,
        pos, setPos,
        exampleEn, setExampleEn,
        exampleKr, setExampleKr,
        isStarred, setIsStarred,
        tags, setTags,
        errors, setErrors,
        handleAutoFill,
        handleAutoFillWithTerm,
        startAutoFill,
        handleSaveWord,
        isPendingFill,
        isPendingSave,
    };
}
