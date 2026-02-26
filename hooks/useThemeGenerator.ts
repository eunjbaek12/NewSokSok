import { useState, useTransition, useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import { useVocab } from '@/contexts/VocabContext';
import { generateThemeWords } from '@/lib/translation-api';
import { AIWordResult } from '@/lib/types';
import { Alert } from 'react-native';

const NEW_LIST_ID = '__new__';

export function useThemeGenerator(initialTheme: string = '') {
    const { lists, createList, addBatchWords } = useVocab();

    const [theme, setTheme] = useState(initialTheme);
    const [results, setResults] = useState<AIWordResult[]>([]);
    const [difficulty, setDifficulty] = useState('Intermediate');
    const [wordCount, setWordCount] = useState(20);
    const [targetListId, setTargetListId] = useState(NEW_LIST_ID);

    const [isPendingGen, startGen] = useTransition();
    const [isPendingSave, startSave] = useTransition();

    const selectedList = useMemo(() => {
        if (targetListId === NEW_LIST_ID) return null;
        return lists.find(l => l.id === targetListId) || null;
    }, [targetListId, lists]);

    const existingWordsForDedup = useMemo(() => {
        if (!selectedList) return [];
        return selectedList.words.map(w => w.term);
    }, [selectedList]);

    const handleGenerate = () => {
        const trimmed = theme.trim();
        if (!trimmed) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        startGen(async () => {
            setResults([]);
            try {
                const words = await generateThemeWords(trimmed, difficulty, wordCount, existingWordsForDedup);
                if (words.length === 0) {
                    Alert.alert('No Results', 'No words found for this theme. Try a different topic.');
                }
                setResults(words);
            } catch {
                Alert.alert('Error', 'Failed to generate words. Please try again.');
            }
        });
    };

    const handleSaveTheme = (onSuccess: () => void) => {
        if (results.length === 0) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        startSave(async () => {
            try {
                if (targetListId === NEW_LIST_ID) {
                    const trimmed = theme.trim();
                    const newList = await createList(trimmed.charAt(0).toUpperCase() + trimmed.slice(1));
                    await addBatchWords(newList.id, results);
                } else {
                    await addBatchWords(targetListId, results);
                }
                onSuccess();
            } catch (e: any) {
                if (e?.message === 'DUPLICATE_LIST') {
                    Alert.alert('중복된 이름', `같은 이름의 단어장이 이미 있습니다. 기존 단어장을 선택하거나 다른 테마를 입력해 주세요.`);
                } else {
                    Alert.alert('Error', 'Failed to save the list. Please try again.');
                }
            }
        });
    };

    return {
        theme, setTheme,
        difficulty, setDifficulty,
        wordCount, setWordCount,
        targetListId, setTargetListId,
        results, setResults,
        selectedList,
        handleGenerate,
        handleSaveTheme,
        isPendingGen,
        isPendingSave,
        NEW_LIST_ID,
    };
}
