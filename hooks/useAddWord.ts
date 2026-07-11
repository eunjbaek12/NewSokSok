import { useState, useCallback, useRef, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { addWord, updateWord } from '@/features/vocab';
import { enrichWord } from '@/lib/translation-api';
import { composeSenseFill, defaultSenseSelection, fitsSaveLimits, type SenseFill } from '@/lib/senses';
import type { WordSense } from '@shared/contracts';
import type { AutoFillResult } from '@/lib/types';

// 동음이의어 토글 칩 상태. base = 병기(①②) 상위 결과(뜻별 빈 필드 보충용),
// term = 검색 당시 표제어(바뀌면 무효), selected = 켜져 있는 뜻 인덱스(항상 1개+).
interface SenseState {
    senses: WordSense[];
    base: AutoFillResult;
    term: string;
    selected: number[];
}

// 토글 결과. 'min' = 마지막 1개는 못 끔, 'overflow' = 저장 한도 초과로 못 켬.
export type SenseToggleResult = 'ok' | 'min' | 'overflow';

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
    // 모델이 "사전에 존재하지 않는 단어"로 판정한 경우만 set. 일반 실패(네트워크/timeout)와
    // 구분해 사용자에게 정확한 안내("찾지 못함" vs "잠시 후 재시도")를 보여주기 위함.
    const [autoFillNotFoundAt, setAutoFillNotFoundAt] = useState(0);

    const [senseState, setSenseState] = useState<SenseState | null>(null);
    // 사용자가 필드를 직접 고치기 시작하면 true — 제안 탭이 편집 내용을 덮어쓰는 사고 방지.
    const [senseDismissed, setSenseDismissed] = useState(false);

    // 표제어가 검색 당시와 달라지면 제안은 낡은 것 → 통째로 무효화.
    useEffect(() => {
        if (senseState && term.trim() !== senseState.term) {
            setSenseState(null);
        }
    }, [term, senseState]);

    const applyFill = useCallback((fill: SenseFill) => {
        setMeaningKr(fill.meaningKr);
        setDefinition(fill.definition);
        setExampleEn(fill.exampleEn);
        setExampleKr(fill.exampleKr);
        setPos(fill.pos);
        setPhonetic(fill.phonetic);
    }, []);

    // 뜻 칩 토글. 켜기/끄기 후의 선택 집합으로 폼 전체를 재조립한다.
    // 거부 사유를 반환해 UI가 안내(햅틱+힌트)를 분기할 수 있게 한다.
    const toggleSense = useCallback((index: number): SenseToggleResult => {
        if (!senseState) return 'ok';
        const isOn = senseState.selected.includes(index);
        if (isOn && senseState.selected.length === 1) return 'min'; // 빈 카드 방지
        const next = isOn
            ? senseState.selected.filter(i => i !== index)
            : [...senseState.selected, index];
        const fill = composeSenseFill(next, senseState.senses, senseState.base);
        if (!isOn && !fitsSaveLimits(fill)) return 'overflow'; // 켤 때만 한도 검사
        applyFill(fill);
        setSenseState({ ...senseState, selected: next });
        return 'ok';
    }, [senseState, applyFill]);

    const dismissSensePicker = useCallback(() => setSenseDismissed(true), []);

    const runAutoFill = useCallback(async (searchTerm: string) => {
        if (!searchTerm.trim() || isPendingFillRef.current) return;
        isPendingFillRef.current = true;
        setIsPendingFill(true);
        const trimmed = searchTerm.trim();
        let quotaHit = false;
        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            // 새 검색은 이전 제안을 무효화하고 숨김 상태도 초기화.
            setSenseState(null);
            setSenseDismissed(false);

            const result = await enrichWord(
                trimmed, sourceLang, targetLang, apiKey, undefined, 'autocomplete',
                () => { quotaHit = true; setAiQuotaHitAt(Date.now()); },
            ).catch(() => null);
            const hasAny = !!result && !!(
                result.definition || result.meaningKr || result.exampleEn || result.phonetic || result.pos
            );
            if (result?.isReal === false) {
                // 모델이 명시적으로 "실재하지 않음" 판정 → 폼은 비워두고 안내만.
                setAutoFillNotFoundAt(Date.now());
            } else if (hasAny && result) {
                const senses = result.senses && result.senses.length >= 2 ? result.senses : null;
                if (senses) {
                    // 동음이의어: 사진/일괄 저장(전 뜻 병기)과 맞춰 기본 전체 선택으로 채우고
                    // 토글 칩을 띄운다. 한도 초과 시 뒤 순위 뜻부터 제외(최소 ①).
                    const selected = defaultSenseSelection(senses, result);
                    const fill = composeSenseFill(selected, senses, result);
                    if (fill.definition) setDefinition(fill.definition);
                    if (fill.meaningKr) setMeaningKr(fill.meaningKr);
                    if (fill.phonetic) setPhonetic(fill.phonetic);
                    if (fill.pos) setPos(fill.pos);
                    if (fill.exampleEn) setExampleEn(fill.exampleEn);
                    if (fill.exampleKr) setExampleKr(fill.exampleKr);
                    setSenseState({ senses, base: result, term: trimmed, selected });
                } else {
                    if (result.definition) setDefinition(result.definition);
                    if (result.meaningKr) setMeaningKr(result.meaningKr);
                    if (result.phonetic) setPhonetic(result.phonetic);
                    if (result.pos) setPos(result.pos);
                    if (result.exampleEn) setExampleEn(result.exampleEn);
                    if (result.exampleKr) setExampleKr(result.exampleKr);
                }
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
                setSenseState(null);
                setSenseDismissed(false);
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

    // 언어쌍 변경 시 낡은 검색 결과 초기화 — 표제어·태그·즐겨찾기는 보존.
    // (언어가 바뀌면 정의·뜻·예문·발음은 이전 언어쌍의 산물이라 레이블과 모순된다.)
    const resetForLanguageChange = useCallback(() => {
        setDefinition('');
        setMeaningKr('');
        setExampleEn('');
        setExampleKr('');
        setPhonetic('');
        setPos('');
        setErrors({});
        setSenseState(null);
        setSenseDismissed(false);
        setAutoFillFailedAt(0);
        setAutoFillNotFoundAt(0);
    }, []);

    // 초기화로 날아갈 내용이 있는지 — 호출자(add-word)가 확인 Alert 표시 여부를 결정.
    const hasFillContent = !!(
        definition.trim() || meaningKr.trim() || exampleEn.trim()
        || exampleKr.trim() || phonetic.trim() || pos.trim()
    );

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
        resetForLanguageChange,
        hasFillContent,
        handleAutoFill,
        handleAutoFillWithTerm,
        handleSaveWord,
        isPendingFill,
        isPendingSave,
        aiQuotaHitAt,
        autoFillFailedAt,
        autoFillNotFoundAt,
        // 동음이의어 토글 칩 — 숨김(수동 편집) 상태면 null.
        sensePicker: senseState && !senseDismissed
            ? { senses: senseState.senses, selected: senseState.selected }
            : null,
        toggleSense,
        dismissSensePicker,
    };
}
