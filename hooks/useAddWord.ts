import { useState, useCallback, useRef, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { addWord, updateWord } from '@/features/vocab';
import { enrichWord, type EnrichFallback } from '@/lib/translation-api';
import { useQuotaStore } from '@/features/quota';
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
    // 검색 중인 표제어 — 진행 안내("'apple' 뜻을 찾고 있어요")에 쓴다. 검색이 끝나면 빈 문자열.
    const [pendingFillTerm, setPendingFillTerm] = useState('');
    const [isPendingSave, setIsPendingSave] = useState(false);
    const [aiQuotaHitAt, setAiQuotaHitAt] = useState(0);
    const [autoFillFailedAt, setAutoFillFailedAt] = useState(0);
    // AI가 실패해 무료 사전으로 대체됐을 때의 사유. 폼은 채워지지만 뜻 칸만 비므로,
    // 이 값이 없으면 화면은 "왜 뜻만 안 채워졌는지"를 말해 줄 수 없다.
    const [enrichFallback, setEnrichFallback] = useState<EnrichFallback | null>(null);
    const [enrichmentLevel, setEnrichmentLevel] = useState<'basic' | 'full' | null>(null);
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

    // 검색 결과가 도착했을 때의 "현재 표제어". 응답은 렌더 커밋보다 한참 뒤(수 초)에 오므로
    // effect 동기화로 충분하다. runAutoFill의 낡은 결과 판정에 쓴다.
    const termRef = useRef(term);
    // 진행 중인 검색의 표제어와 그 취소 핸들.
    const fillTermRef = useRef('');
    const abortRef = useRef<AbortController | null>(null);
    // 광고 보상 후 재개용. runAutoFill은 자기 자신을 참조할 수 없어 ref를 거치고,
    // myRetryRef는 언마운트 때 "내가 등록한 것"인지 가리는 데 쓴다.
    const runAutoFillRef = useRef<(searchTerm: string) => void>(() => {});
    const myRetryRef = useRef<(() => void) | null>(null);

    // 표제어가 바뀌면 진행 중인 검색을 즉시 끊는다. 결과는 어차피 버려질 것이라(아래 낡은
    // 결과 판정) 응답을 기다릴 이유가 없는데, 그동안 스피너가 돌고 검색·저장 버튼이 잠겨
    // 최대 12초(enrichWord 타임아웃) 화면이 묶인다.
    // ⚠️ 취소해도 AI 한도 차감은 되돌아오지 않는다 — 서버는 이미 처리를 시작했을 수 있다.
    useEffect(() => {
        termRef.current = term;
        if (isPendingFillRef.current && term.trim() !== fillTermRef.current) {
            abortRef.current?.abort();
        }
    }, [term]);

    // 화면을 떠날 때도 끊는다 — 남은 요청과 그 뒤의 상태 갱신은 갈 곳이 없다.
    // 광고 보상 후 재시도 등록도 함께 거둔다. 내가 넣은 것일 때만 비워야 뒤에 등록한
    // 다른 화면(사진 스캔 등)의 재시도를 지우지 않는다.
    useEffect(() => () => {
        abortRef.current?.abort();
        const quota = useQuotaStore.getState();
        if (myRetryRef.current && quota.retryAfterReward === myRetryRef.current) {
            quota.setRetryAfterReward(null);
        }
    }, []);

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
        fillTermRef.current = trimmed;
        setPendingFillTerm(trimmed);
        const controller = new AbortController();
        abortRef.current = controller;
        let quotaHit = false;
        // 콜백은 응답보다 먼저 올 수 있어 곧바로 상태에 넣지 않는다 — 취소되거나 낡은
        // 결과로 판정되면 안내도 함께 버려야 하므로, 아래 가드를 통과한 뒤 반영한다.
        let fallback: EnrichFallback | null = null;
        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            // 새 검색은 이전 제안을 무효화하고 숨김 상태도 초기화.
            setSenseState(null);
            setSenseDismissed(false);
            setEnrichFallback(null);
            setEnrichmentLevel(null);

            const result = await enrichWord(
                trimmed, sourceLang, targetLang, apiKey, controller.signal, 'autocomplete',
                () => { quotaHit = true; setAiQuotaHitAt(Date.now()); },
                { onFallback: (reason) => { fallback = reason; } },
            ).catch(() => null); // 취소(AbortError)도 여기서 null이 된다
            // 취소됐거나, 기다리는 동안 사용자가 표제어를 고쳤다면 이 결과는 낡은 것 —
            // 폼을 덮어쓰지도, 실패/못찾음 안내를 띄우지도 않는다. 표제어 판정은 취소가
            // 놓친 경합(응답이 이미 도착 중)의 backstop이다. (한도 초과 안내는 응답 전에
            // 콜백으로 이미 전달되므로 이 분기와 무관하게 뜬다.)
            if (controller.signal.aborted || termRef.current.trim() !== trimmed) return;
            setEnrichFallback(fallback);
            setEnrichmentLevel(result?.enrichmentLevel ?? (result ? 'full' : null));
            // 한도에 막혔다면 광고 보상 뒤 이어서 재개할 수 있게 자기 재시도를 걸어 둔다.
            // 표제어는 등록 시점이 아니라 실행 시점의 것을 읽는다 — 광고를 보는 동안
            // 사용자가 단어를 고쳤을 수 있고, 그때는 고친 쪽이 사용자의 의도다.
            if (fallback === 'quotaExceeded') {
                const retry = () => { void runAutoFillRef.current(termRef.current.trim()); };
                myRetryRef.current = retry;
                useQuotaStore.getState().setRetryAfterReward(retry);
            }
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
            // 뒤이어 시작된 검색의 핸들을 지우지 않도록 내 것일 때만 정리.
            if (abortRef.current === controller) abortRef.current = null;
            isPendingFillRef.current = false;
            fillTermRef.current = '';
            setIsPendingFill(false);
            setPendingFillTerm('');
        }
    }, [sourceLang, targetLang, apiKey]);

    useEffect(() => { runAutoFillRef.current = runAutoFill; }, [runAutoFill]);

    const handleAutoFill = () => runAutoFill(term);
    const handleAutoFillWithTerm = (overrideTerm: string) => runAutoFill(overrideTerm);
    const handleEnrichFull = () => {
        const quota = useQuotaStore.getState();
        const status = quota.status;
        if (status && status.used >= status.limit + status.bonus) {
            const retry = () => { void runAutoFillRef.current(termRef.current.trim()); };
            myRetryRef.current = retry;
            quota.setRetryAfterReward(retry);
            quota.notifyQuotaExceeded(status);
            return;
        }
        void runAutoFill(termRef.current.trim());
    };

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
        handleEnrichFull,
        handleSaveWord,
        isPendingFill,
        pendingFillTerm,
        isPendingSave,
        aiQuotaHitAt,
        autoFillFailedAt,
        autoFillNotFoundAt,
        enrichFallback,
        enrichmentLevel,
        // 동음이의어 토글 칩 — 숨김(수동 편집) 상태면 null.
        sensePicker: senseState && !senseDismissed
            ? { senses: senseState.senses, selected: senseState.selected }
            : null,
        toggleSense,
        dismissSensePicker,
    };
}
