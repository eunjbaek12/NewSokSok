import { useState, useCallback, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { addWord, updateWord } from '@/features/vocab';
import { enrichWord } from '@/lib/translation-api';

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
    const [aiQuotaHitAt, setAiQuotaHitAt] = useState(0);
    const [autoFillFailedAt, setAutoFillFailedAt] = useState(0);

    const runAutoFill = useCallback(async (searchTerm: string) => {
        if (!searchTerm.trim() || isPendingFillRef.current) return;
        isPendingFillRef.current = true;
        setIsPendingFill(true);
        const trimmed = searchTerm.trim();
        let quotaHit = false;
        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

            const result = await enrichWord(
                trimmed, sourceLang, targetLang, apiKey, undefined, 'autocomplete',
                () => { quotaHit = true; setAiQuotaHitAt(Date.now()); },
            ).catch(() => null);
            const hasAny = !!result && !!(
                result.definition || result.meaningKr || result.exampleEn || result.phonetic || result.pos
            );
            if (hasAny && result) {
                if (result.definition) setDefinition(result.definition);
                if (result.meaningKr) setMeaningKr(result.meaningKr);
                if (result.phonetic) setPhonetic(result.phonetic);
                if (result.pos) setPos(result.pos);
                if (result.exampleEn) setExampleEn(result.exampleEn);
                if (result.exampleKr) setExampleKr(result.exampleKr);
            } else if (!quotaHit) {
                setAutoFillFailedAt(Date.now());
            }
        } catch {
            if (!quotaHit) setAutoFillFailedAt(Date.now());
        } finally {
            isPendingFillRef.current = false;
            setIsPendingFill(false);
        }
    }, [sourceLang, targetLang, apiKey]);

    const handleAutoFill = () => runAutoFill(term);
    const handleAutoFillWithTerm = (overrideTerm: string) => runAutoFill(overrideTerm);

    const handleSaveWord = async (selectedListId: string, onSuccess: (savedTerm: string) => void, onError: (reason?: 'no-list' | 'duplicate' | 'error') => void) => {
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
                    onError('no-list');
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
        } catch (error: any) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            if (error?.message === 'DUPLICATE_WORD') {
                onError('duplicate');
            } else if (error?.message === 'LIST_NOT_FOUND') {
                // 선택된 단어장이 더 이상 존재하지 않음(삭제/교체됨) — 예상 가능한 상황.
                // 에러 로그 없이 단어장 재선택을 유도한다.
                onError('no-list');
            } else {
                console.error("Failed to save word:", error);
                onError('error');
            }
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
        aiQuotaHitAt,
        autoFillFailedAt,
    };
}
