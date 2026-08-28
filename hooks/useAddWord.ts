import { useState, useCallback, useRef, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { addWord, updateWord } from '@/features/vocab';
import { enrichWord, type EnrichFallback } from '@/lib/translation-api';
import { useQuotaStore, getQuotaLeft } from '@/features/quota';
import { composeSenseFill, defaultSenseSelection, fitsSaveLimits, type SenseFill } from '@/lib/senses';
import type { WordSense } from '@shared/contracts';
import type { HeadwordDefect } from '@/utils/headword-guard';
import { staleAutoFillKeys, type AutoFillField, type AutoFillFields, type LastAutoFill } from '@/lib/autofill-form';
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
    // 표제어 게이트가 막은 경우의 사유. null 이면 "AI 가 모르는 단어"라는 뜻이다.
    // 🔑 'script_mix'(배우는 언어와 다른 문자)에 "사전에서 찾지 못했다"고 하면
    //    오해를 부른다 — `독일` 은 존재하는 단어이고 문제는 학습 언어 설정이다.
    const [autoFillDefect, setAutoFillDefect] = useState<HeadwordDefect | null>(null);

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

    /*
     * 자동완성이 채우는 칸들. 위 termRef와 같은 이유로 ref에 복사해 둔다 — runAutoFill의
     * 의존성에 6개 문자열을 넣으면 타이핑 한 글자마다 콜백이 새로 만들어진다.
     */
    /**
     * 굴절형 원형·형태(lib/inflection.ts). 자동완성이 채우고 저장이 읽는다.
     * 표제어가 바뀌면 낡으므로 그때 비운다 (`abandoned` 를 지우고 `apple` 을 넣었는데
     * 원형 `abandon` 이 남으면 안 된다).
     *
     * 🔑 ref 와 state 를 **둘 다** 든다. ref 는 저장이 읽고(handleSaveWord 의 의존성을
     *    건드리지 않는다), state 는 화면이 원형 줄을 그리는 데 쓴다 — ref 만으로는
     *    값이 바뀌어도 리렌더가 없어 화면에 영영 안 나온다.
     *
     * 🔴 쓰는 곳은 반드시 applyBaseForm 하나로 모은다. 두 저장소를 각자 대입하면
     *    한쪽만 갱신되는 순간이 생기고, 그 증상은 "가끔 원형이 안 나온다"로만 보인다
     *    (이 저장소에서 "수정 시 함께 갱신" 주석은 세 번 지켜지지 않았다).
     */
    const baseFormRef = useRef<{ baseForm?: string; inflection?: string }>({
        baseForm: existingWord?.baseForm,
        inflection: existingWord?.inflection,
    });
    const [baseForm, setBaseFormState] = useState<{ baseForm?: string; inflection?: string }>({
        baseForm: existingWord?.baseForm,
        inflection: existingWord?.inflection,
    });
    const applyBaseForm = useCallback((next: { baseForm?: string; inflection?: string }) => {
        baseFormRef.current = next;
        setBaseFormState(next);
    }, []);
    const fieldsRef = useRef({ definition, meaningKr, phonetic, pos, exampleEn, exampleKr });
    useEffect(() => {
        fieldsRef.current = { definition, meaningKr, phonetic, pos, exampleEn, exampleKr };
    }, [definition, meaningKr, phonetic, pos, exampleEn, exampleKr]);

    /*
     * 자동완성이 **마지막으로 써넣은 값**과 그때의 표제어.
     *
     * 왜 필요한가(2026-08-21 실기): 한도를 다 쓰면 서버는 뜻만 싣고 온다
     * (`enrichment_level: 'basic'`). 아래 반영 코드는 `if (result.X) setX(...)` 라 값이 없는
     * 칸은 손대지 않으므로, 다른 단어를 검색해도 **앞 단어의 발음기호·예문이 그대로 남았다.**
     * `nimble` 을 검색했는데 발음기호가 `kiːn`, 예문이 `keen` 의 ①②③ 인 카드가 만들어졌고,
     * 채워진 칸으로 보이니 사용자가 알아채기도 어렵다. 한 번 어긋나면 그 뒤 basic 검색이
     * 전부 같은 값을 물고 간다.
     *
     * 🔑 표제어가 바뀐 검색에서만, **우리가 쓴 값이 그대로 남아 있는 칸만** 비운다.
     *    사용자가 직접 고친 값과, 편집 중인 단어가 원래 갖고 있던 값(이 ref가 아직 null)은
     *    건드리지 않는다.
     */
    const lastFillRef = useRef<LastAutoFill | null>(null);
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

    // 자동완성이 방금 써넣은 값을 기록해 둔다(위 lastFillRef 주석 참조).
    const rememberFill = useCallback((filledTerm: string, fields: AutoFillFields) => {
        lastFillRef.current = { term: filledTerm, fields };
    }, []);

    /*
     * 표제어가 바뀐 검색이면, 앞 단어 때 자동완성이 써넣은 값이 그대로 남아 있는 칸을 비운다.
     * 새 결과를 반영하기 **직전에** 부른다 — 먼저 비워 두면 새 결과가 채우는 칸은 곧바로
     * 덮이고, 새 결과가 못 채우는 칸만 빈 채로 남는다(그게 맞는 상태다).
     */
    const clearStaleAutoFill = useCallback((nextTerm: string) => {
        const last = lastFillRef.current;
        const stale = staleAutoFillKeys(last, fieldsRef.current, nextTerm);
        // 표제어가 바뀌었으면 기록 자체가 낡은 것이다 — 지울 칸이 없더라도 함께 버린다.
        // (검색이 실패해 아래 rememberFill 까지 못 가는 경로가 있다.)
        if (last && last.term !== nextTerm) lastFillRef.current = null;
        if (stale.length === 0) return;
        const setters: Record<AutoFillField, (v: string) => void> = {
            definition: setDefinition,
            meaningKr: setMeaningKr,
            phonetic: setPhonetic,
            pos: setPos,
            exampleEn: setExampleEn,
            exampleKr: setExampleKr,
        };
        for (const key of stale) setters[key]('');
        // 원형은 표제어에 딸린 값이라 칸별 stale 판정과 무관하게 통째로 버린다.
        applyBaseForm({});
    }, [applyBaseForm]);

    const applyFill = useCallback((fill: SenseFill, filledTerm: string) => {
        setMeaningKr(fill.meaningKr);
        setDefinition(fill.definition);
        setExampleEn(fill.exampleEn);
        setExampleKr(fill.exampleKr);
        setPos(fill.pos);
        setPhonetic(fill.phonetic);
        rememberFill(filledTerm, {
            meaningKr: fill.meaningKr,
            definition: fill.definition,
            exampleEn: fill.exampleEn,
            exampleKr: fill.exampleKr,
            pos: fill.pos,
            phonetic: fill.phonetic,
        });
    }, [rememberFill]);

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
        applyFill(fill, senseState.term);
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
            // 다른 단어를 검색한 것이라면, 앞 단어 때 자동완성이 써넣은 값을 먼저 거둔다.
            // 아래 반영은 값이 있는 칸만 덮으므로(한도 초과 응답은 뜻뿐이다) 이걸 안 하면
            // 새 단어의 카드에 앞 단어의 발음기호·예문이 남는다.
            clearStaleAutoFill(trimmed);
            if (result?.isReal === false) {
                // 모델이 명시적으로 "실재하지 않음" 판정 → 폼은 비워두고 안내만.
                // headwordDefect 가 있으면 AI 를 부르지도 않고 게이트가 막은 것이다.
                setAutoFillDefect(result.headwordDefect ?? null);
                setAutoFillNotFoundAt(Date.now());
            } else if (hasAny && result) {
                // 원형은 뜻 선택(칩)과 무관하게 표제어 하나에 대한 값이다 — 분기 앞에서 한 번 담는다.
                applyBaseForm(result.baseForm
                    ? { baseForm: result.baseForm, inflection: result.inflection }
                    : {});
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
                    rememberFill(trimmed, {
                        definition: fill.definition,
                        meaningKr: fill.meaningKr,
                        phonetic: fill.phonetic,
                        pos: fill.pos,
                        exampleEn: fill.exampleEn,
                        exampleKr: fill.exampleKr,
                    });
                } else {
                    if (result.definition) setDefinition(result.definition);
                    if (result.meaningKr) setMeaningKr(result.meaningKr);
                    if (result.phonetic) setPhonetic(result.phonetic);
                    if (result.pos) setPos(result.pos);
                    if (result.exampleEn) setExampleEn(result.exampleEn);
                    if (result.exampleKr) setExampleKr(result.exampleKr);
                    rememberFill(trimmed, {
                        definition: result.definition ?? '',
                        meaningKr: result.meaningKr ?? '',
                        phonetic: result.phonetic ?? '',
                        pos: result.pos ?? '',
                        exampleEn: result.exampleEn ?? '',
                        exampleKr: result.exampleKr ?? '',
                    });
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
    }, [sourceLang, targetLang, apiKey, clearStaleAutoFill, rememberFill, applyBaseForm]);

    useEffect(() => { runAutoFillRef.current = runAutoFill; }, [runAutoFill]);

    const handleAutoFill = () => runAutoFill(term);
    const handleAutoFillWithTerm = (overrideTerm: string) => runAutoFill(overrideTerm);
    // "뜻만 채워졌어요" 안내에서 상세를 마저 채우려 할 때. 이 버튼이 보인다는 것 자체가
    // 서버의 한도 초과 판정이므로(enrich-word/index.ts:193 — basic 은 !quota.allowed 분기에서만
    // 나간다) 한도를 처음부터 다시 셀 이유가 없다. 여기서 확인할 것은 "그 사이에 한도가
    // 풀렸는가" 하나뿐이다.
    //
    // 🔴 그 판정은 반드시 getQuotaLeft 로 한다. 예전에는 `used >= limit + bonus` 를 손으로
    // 적어 뒀는데, Pro 는 일일 한도와 월 한도가 3,000 으로 같아서 이번 달 풀을 다 쓴 날에도
    // 그날 사용량은 0 이다 — 판정이 늘 "여유 있음"으로 떨어져 같은 basic 검색만 무한히
    // 반복하고 월 한도 안내에는 영영 닿지 못했다. getQuotaLeft 는 둘 중 빡빡한 쪽을 준다.
    const handleEnrichFull = () => {
        const quota = useQuotaStore.getState();
        const left = getQuotaLeft(quota.status);
        // left === null 은 "모른다"(status 미도착)라 막지 않는다 — 그냥 재검색해 서버에 묻는다.
        if (left !== null && left <= 0) {
            const retry = () => { void runAutoFillRef.current(termRef.current.trim()); };
            myRetryRef.current = retry;
            quota.setRetryAfterReward(retry);
            quota.notifyQuotaExceeded(quota.status);
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
                    ...baseFormRef.current,
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
                    ...baseFormRef.current,
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
                applyBaseForm({});
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
        setAutoFillDefect(null);
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
        // 굴절형 원형·형태. 화면이 표제어 아래 한 줄로 그린다(lib/inflection.ts).
        baseForm,
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
        autoFillDefect,
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
