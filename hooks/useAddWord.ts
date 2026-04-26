import { useState, useCallback, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { addWord, updateWord } from '@/features/vocab';
import { autoFillWord } from '@/lib/translation-api';
import { searchNaverDict } from '@/lib/naver-dict-api';

export function useAddWord(listId?: string, wordId?: string, existingWord?: any, initialState?: any, sourceLang: string = 'en', targetLang: string = 'ko', apiKey?: string) {

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

    const [isPendingFill, setIsPendingFill] = useState(false);
    const isPendingFillRef = useRef(false);
    const [isPendingSave, setIsPendingSave] = useState(false);

    const runAutoFill = useCallback(async (searchTerm: string) => {
        if (!searchTerm.trim() || isPendingFillRef.current) return;
        isPendingFillRef.current = true;
        setIsPendingFill(true);
        const trimmed = searchTerm.trim();
        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

            const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
                const timeout = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), ms)
                );
                return Promise.race([promise, timeout]);
            };

            // Naver 우선 시도: 결과 있으면 거기서 끝 (사용자 Gemini 토큰 절약)
            const naverResult = await withTimeout(
                searchNaverDict(trimmed, sourceLang, targetLang),
                3000
            ).catch(() => null);

            if (naverResult) {
                if (naverResult.meaningKr) setMeaningKr(naverResult.meaningKr);
                if (naverResult.definition) setDefinition(naverResult.definition);
                if (naverResult.phonetic) setPhonetic(naverResult.phonetic);
                if (naverResult.pos) setPos(naverResult.pos);
                if (naverResult.exampleEn) setExampleEn(naverResult.exampleEn);
                if (naverResult.exampleKr) setExampleKr(naverResult.exampleKr);
                return;
            }

            // Naver 실패 시에만 AI fallback (apiKey 있으면 Gemini, 없으면 무료 사전)
            const result = await withTimeout(
                autoFillWord(trimmed, sourceLang, targetLang, apiKey),
                5000
            ).catch(() => null);

            if (result) {
                if (result.definition) setDefinition(result.definition);
                if (result.meaningKr) setMeaningKr(result.meaningKr);
                if (result.phonetic) setPhonetic(result.phonetic);
                if (result.pos) setPos(result.pos);
                if (result.exampleEn) setExampleEn(result.exampleEn);
                if (result.exampleKr) setExampleKr(result.exampleKr);
            }
        } catch {
            // Ignore errors (including timeouts)
        } finally {
            isPendingFillRef.current = false;
            setIsPendingFill(false);
        }
    }, [sourceLang, targetLang, apiKey]);

    const handleAutoFill = () => runAutoFill(term);
    const handleAutoFillWithTerm = (overrideTerm: string) => runAutoFill(overrideTerm);

    const handleSaveWord = async (selectedListId: string, onSuccess: (savedTerm: string) => void, onError: () => void) => {
        const newErrors: { term?: boolean; meaningKr?: boolean } = {};
        if (!term.trim()) newErrors.term = true;
        if (!meaningKr.trim()) newErrors.meaningKr = true;
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return;
        }
        setErrors({});
        setIsPendingSave(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

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
        } finally {
            setIsPendingSave(false);
        }
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
        handleSaveWord,
        isPendingFill,
        isPendingSave,
    };
}
