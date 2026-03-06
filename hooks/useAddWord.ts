import { useState, useTransition } from 'react';
import * as Haptics from 'expo-haptics';
import { useVocab } from '@/contexts/VocabContext';
import { autoFillWord } from '@/lib/translation-api';

export function useAddWord(listId?: string, wordId?: string, existingWord?: any) {
    const { addWord, updateWord } = useVocab();

    const [term, setTerm] = useState(existingWord?.term || '');
    const [definition, setDefinition] = useState(existingWord?.definition || '');
    const [exampleEn, setExampleEn] = useState(existingWord?.exampleEn || '');
    const [exampleKr, setExampleKr] = useState(existingWord?.exampleKr || '');
    const [meaningKr, setMeaningKr] = useState(existingWord?.meaningKr || '');
    const [tags, setTags] = useState<string[]>(existingWord?.tags || []);
    const [isStarred, setIsStarred] = useState<boolean>(existingWord?.isStarred || false);

    const [errors, setErrors] = useState<{ term?: boolean; meaningKr?: boolean }>({});

    const [isPendingFill, startAutoFill] = useTransition();
    const [isPendingSave, startSave] = useTransition();

    const handleAutoFill = () => {
        if (!term.trim() || isPendingFill) return;

        startAutoFill(async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            try {
                const result = await autoFillWord(term.trim());
                if (result.definition) setDefinition(result.definition);
                if (result.meaningKr) setMeaningKr(result.meaningKr);
                if (result.exampleEn) setExampleEn(result.exampleEn);
                if (result.exampleKr) setExampleKr(result.exampleKr);
            } catch {
                // Ignore errors
            }
        });
    };

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
                        meaningKr: meaningKr.trim(),
                        exampleEn: exampleEn.trim(),
                        exampleKr: exampleKr.trim(),
                        isStarred,
                        tags,
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
                        exampleEn: exampleEn.trim(),
                        exampleKr: exampleKr.trim(),
                        meaningKr: meaningKr.trim(),
                        isStarred,
                        tags,
                    });

                    // Reset states
                    setTerm('');
                    setDefinition('');
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
        exampleEn, setExampleEn,
        exampleKr, setExampleKr,
        isStarred, setIsStarred,
        tags, setTags,
        errors, setErrors,
        handleAutoFill,
        handleSaveWord,
        isPendingFill,
        isPendingSave,
    };
}
