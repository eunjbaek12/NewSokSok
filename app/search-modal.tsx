/**
 * 내 단어 검색 · 골라서 학습 — 화면 하나를 두 진입점이 공유한다.
 *
 * `mode=pick`으로 들어오면(홈 카드) 입력창 자리에 제목이 오고 텍스트 검색이
 * 없다. 조건으로 고르러 온 자리이기 때문이다. 그 외에는(단어장 탭 검색)
 * 입력창이 자동 포커스되는 찾기 자세로 연다. 칩·목록·학습 바는 완전히 같다.
 *
 * 스크롤되는 건 목록뿐이다 — 칩 영역·결과 줄·학습 바는 고정이다. 패널 전체를
 * ScrollView로 감싸면 FlatList 가상화 경고와 제스처 충돌이 난다.
 */
import React, { useState, useMemo, useDeferredValue, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    Pressable,
    FlatList,
    KeyboardAvoidingView,
    Keyboard,
    Platform,
    ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/features/theme';
import { useLists, toggleStarred, toggleMemorized } from '@/features/vocab';
import { useSettings } from '@/features/settings';
import { getTopTags, type SearchResult } from '@/lib/search';
import { displayTag } from '@/lib/tag-display';
import { POS_ALL, POS_OTHER, presentPosCategories, type PosFilter } from '@/lib/pos';
import { getRelativeTime } from '@/components/ListCard';
import ListDayPicker from '@/components/ListDayPicker';
import SpeakerButton from '@/components/ui/SpeakerButton';
import { ModalPicker, type PickerOption } from '@/components/ui/ModalPicker';
import { getTtsLang, getSpeakableText, getStudySourceLang } from '@/constants/languages';
import { Radius } from '@/constants/tokens';
import { setStudySelection } from '@/features/study';
import {
    collectScopeItems,
    selectPickResults,
    countActiveFilters,
    summarizeScope,
    scopeStillExists,
    scopeLabel,
    conditionLabel,
    wordFilterLabel,
    resultsToWords,
    shuffleWords,
    usePickStore,
    PRESET_LIMIT,
    type WordFilter,
} from '@/features/study/pick';

/** 상태 줄 칩 순서 — 쓰는 빈도순. 별표는 독립 토글이라 이 목록에 없다. */
const STATUS_KEYS: WordFilter[] = ['all', 'learning', 'memorized'];
const PRESET_KEYS: WordFilter[] = ['wrongCount', 'recent'];

/**
 * 학습 시작 버튼. 오토플레이는 없다 — 그 라우트만 sel을 받지 않는다(DESIGN.md §3).
 * 아이콘은 단어장 상세의 학습 버튼 행과 같은 것을 쓴다.
 */
const STUDY_MODES = [
    { key: 'flashcard', icon: 'card-outline', label: 'studySelect.flashcardsTitle' },
    { key: 'quiz', icon: 'help-circle-outline', label: 'studySelect.quizTitle' },
    { key: 'examples', icon: 'chatbubbles-outline', label: 'studySelect.examplesTitle' },
] as const satisfies readonly {
    key: 'flashcard' | 'quiz' | 'examples';
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
}[];

export default function SearchModalScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    // 콘텐츠 계열 헤더의 상단 여백 공식(DESIGN.md §1.1). 웹은 고정 헤더 높이만큼 더 민다.
    const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);
    const lists = useLists();
    const { mode } = useLocalSearchParams<{ mode?: string }>();
    const isPick = mode === 'pick';

    const { studySettings } = useSettings();
    const filters = usePickStore(s => s.filters);
    const setFilters = usePickStore(s => s.setFilters);
    const applyFilters = usePickStore(s => s.applyFilters);
    const resetFilters = usePickStore(s => s.resetFilters);
    const recents = usePickStore(s => s.recents);
    const hydrateRecents = usePickStore(s => s.hydrateRecents);
    const rememberCondition = usePickStore(s => s.rememberCondition);

    const [query, setQuery] = useState('');
    const [showListPicker, setShowListPicker] = useState(false);
    const [showPosPicker, setShowPosPicker] = useState(false);

    // 키입력은 즉시 반응, 무거운 필터 연산은 낮은 우선순위로 처리
    const deferredQuery = useDeferredValue(query);

    useEffect(() => { hydrateRecents(); }, [hydrateRecents]);

    const visibleLists = useMemo(() => lists.filter(l => l.isVisible), [lists]);

    // 범위(단어장·Day)까지만 적용한 풀. 품사 칩·태그 칩의 후보도 여기서 뽑는다 —
    // 전체가 아니라 지금 범위에 실제로 있는 것만 보여야 고를 수 있는 칩이 된다.
    //
    // 범위 세 필드에만 의존한다. filters 전체를 넣으면 상태·품사·태그 칩을 누를
    // 때마다 단어를 다시 수집하고, 그 뒤의 topTags·posOptions까지 함께 다시 돈다.
    const scope = useMemo(
        () => ({
            useAllLists: filters.useAllLists,
            selectedListIds: filters.selectedListIds,
            selectedDaysByList: filters.selectedDaysByList,
        }),
        [filters.useAllLists, filters.selectedListIds, filters.selectedDaysByList],
    );
    const scopeItems = useMemo(() => collectScopeItems(visibleLists, scope), [visibleLists, scope]);

    const topTags = useMemo(() => getTopTags(scopeItems), [scopeItems]);
    const posOptions = useMemo(() => presentPosCategories(scopeItems.map(d => d.word)), [scopeItems]);
    const showPosFilter = posOptions.keys.length + (posOptions.hasOther ? 1 : 0) >= 2;

    const activeFilterCount = countActiveFilters(filters);

    // 칩이 켜져 보이는 조건은 countActiveFilters가 세는 조건과 같아야 한다. 범위는
    // "전체 단어장"이 기본값이라 필터로 세지 않는다(filter.ts의 !useAllLists). 이 칩만
    // 늘 켠 색으로 그리면, 아무것도 고르지 않은 첫 화면이 "칩으로 조건을 골라보세요"라고
    // 말하면서 동시에 이미 하나 골라진 것처럼 보인다.
    const scopeActive = !filters.useAllLists;
    const posActive = filters.posFilter !== POS_ALL;

    // 접힌 품사 칩의 문구. 기본값일 때 "품사 전체"라고 적어 상태 줄의 "전체"와 구분한다 —
    // 라벨 거터를 없앤 뒤로 두 "전체"를 갈라줄 게 칩 문구뿐이다.
    const posChipLabel = posActive
        ? t(`pos.${filters.posFilter}`)
        : `${t('search.rowPos')} ${t(`pos.${POS_ALL}`)}`;

    const posPickerOptions = useMemo<PickerOption[]>(
        () => ([POS_ALL, ...posOptions.keys, ...(posOptions.hasOther ? [POS_OTHER] : [])] as PosFilter[])
            .map(key => ({ id: key, title: t(`pos.${key}`) })),
        [posOptions, t],
    );

    // 질의나 필터가 있을 때만 목록을 띄운다 — 두 자세가 같다. 고르러 온 자세도
    // 첫 화면은 "무엇으로 좁힐까"를 묻는 자리이고, 그 빈 자리가 지난번 조건의
    // 자리다. 필터를 하나라도 걸면 그때부터 단어가 나온다.
    const browse = activeFilterCount > 0;
    const showResults = browse || !!query.trim();

    const results = useMemo(
        () => (showResults ? selectPickResults(scopeItems, deferredQuery, filters, browse) : []),
        [showResults, scopeItems, deferredQuery, filters, browse],
    );

    // 범위가 바뀌어 선택했던 품사가 사라지면 자동으로 '전체'로 되돌린다.
    useEffect(() => {
        if (filters.posFilter === POS_ALL) return;
        const available = filters.posFilter === POS_OTHER
            ? posOptions.hasOther
            : (posOptions.keys as string[]).includes(filters.posFilter);
        if (!available) setFilters({ posFilter: POS_ALL });
    }, [posOptions, filters.posFilter, setFilters]);

    // 단어 구성이 바뀌어 선택했던 태그가 사라지면 자동 해제.
    useEffect(() => {
        if (filters.tag && !topTags.includes(filters.tag)) setFilters({ tag: null });
    }, [topTags, filters.tag, setFilters]);

    // 삭제된 단어장 ID 자동 정리 — 남겨두면 "고른 단어장이 있는데 0개"가 된다.
    useEffect(() => {
        if (filters.useAllLists || filters.selectedListIds.length === 0) return;
        const validIds = filters.selectedListIds.filter(id => visibleLists.some(l => l.id === id));
        if (validIds.length !== filters.selectedListIds.length) {
            setFilters(validIds.length === 0
                ? { useAllLists: true, selectedListIds: [], selectedDaysByList: {} }
                : { selectedListIds: validIds });
        }
    }, [visibleLists, filters.useAllLists, filters.selectedListIds, setFilters]);

    // 가리키던 단어장이 지워진 줄은 버린다 — 눌렀더니 0개가 나오는 일이 없어야 한다.
    const visibleRecents = useMemo(
        () => recents.filter(r => scopeStillExists(visibleLists, r.filters)),
        [recents, visibleLists],
    );
    // 이미 조건을 만들고 있는 사람에게 지난 조건은 방해다.
    const showRecents = activeFilterCount === 0 && !query.trim() && visibleRecents.length > 0;

    const scopeText = useMemo(
        () => scopeLabel(summarizeScope(visibleLists, filters), t),
        [visibleLists, filters, t],
    );

    const batchSize = studySettings.studyBatchSize;
    const countText = useMemo(() => {
        const n = results.length.toLocaleString();
        const base = activeFilterCount > 0
            ? t('search.countWithFilters', { n, filters: activeFilterCount })
            : t('search.countOnly', { n });
        return typeof batchSize === 'number' && results.length > batchSize
            ? `${base} · ${t('search.batchHint', { count: batchSize })}`
            : base;
    }, [results.length, activeFilterCount, batchSize, t]);

    const tap = useCallback(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), []);

    /**
     * 모드는 버튼이 들고 있다 — 누르는 순간이 곧 출발이다(DESIGN.md §3).
     *
     * 예전엔 세그먼트로 모드를 고른 뒤 시작 버튼을 눌렀고, 그 선택이 디스크에
     * 남았다(`customStudySettings.studyMode`). 그런데 같은 버튼이 어떤 날은 카드로,
     * 어떤 날은 퀴즈로 열리면 그 버튼을 신뢰할 수 없다 — 홈이 원탭을 카드로 고정하며
     * 이미 내린 판단이다(app/(tabs)/index.tsx:195). 탭 수도 늘지 않는다: 기억된
     * 모드로 시작하면 예전에도 1탭, 바꾸려면 2탭이었고 지금은 늘 1탭이다.
     */
    const handleStart = useCallback((mode: 'flashcard' | 'quiz' | 'examples') => {
        if (results.length === 0) return;
        Keyboard.dismiss();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        // 저장 시점은 학습을 시작할 때 하나뿐이다. 칩을 누를 때마다 저장하면
        // 만들다 만 중간 상태가 지난번 조건에 쌓인다.
        rememberCondition(filters, results.length);
        const sel = setStudySelection(shuffleWords(resultsToWords(results)).map(w => w.id));
        const params = { id: '__custom__', sel };
        // replace로 가는 이유: 학습 화면은 결과로 넘어갈 때 스스로 replace한다.
        // 이 화면을 스택에 남기면 결과에서 뒤로 눌렀을 때 방금 외운 단어가 빠진
        // 목록으로 돌아오고, 홈까지 두 번 눌러야 한다.
        if (mode === 'quiz') router.replace({ pathname: '/quiz/[id]', params });
        else if (mode === 'examples') router.replace({ pathname: '/examples/[id]', params });
        else router.replace({ pathname: '/flashcards/[id]', params });
    }, [results, filters, rememberCondition, router]);

    /**
     * 단어 한 줄 — 단어장 상세의 단어 행과 같은 뼈대다(DESIGN.md §4.1). 별표·스피커·암기가
     * 다 있어야 조건으로 걸러낸 결과가 맞는지 그 자리에서 확인·정리할 수 있다. 예전엔
     * 앱 어디에도 없는 제3의 카드였고 별표는 눌리지 않는 표시였다.
     */
    const renderResult = useCallback(({ item }: { item: SearchResult }) => {
        const w = item.word;
        // 단어장 상세와 같은 규칙: 별표 > 미암기 > 암기 순으로 왼쪽 테두리 색이 정해진다.
        const edgeColor = w.isStarred ? colors.starGold : (w.isMemorized ? colors.border : colors.primary);
        const list = visibleLists.find(l => l.id === item.listId);
        const srcLang = getStudySourceLang(w, list);

        return (
            <Pressable
                onPress={() => {
                    router.push({ pathname: '/add-word', params: { listId: item.listId, wordId: w.id, mode: 'read' } });
                }}
                style={({ pressed }) => [
                    styles.wordRow,
                    {
                        backgroundColor: w.isMemorized ? colors.surfaceSecondary : colors.surface,
                        borderLeftColor: edgeColor,
                    },
                    pressed && { opacity: 0.8 },
                ]}
            >
                {/* 별표 — 표시가 아니라 토글이다. 조건으로 골라낸 자리에서 바로 정리할 수 있어야 한다. */}
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${w.term} ${t(w.isStarred ? 'list.starOff' : 'list.starOn')}`}
                    onPress={() => { Haptics.selectionAsync(); toggleStarred(item.listId, w.id); }}
                    hitSlop={12}
                    style={styles.rowIconBtn}
                >
                    <Ionicons
                        name={w.isStarred ? 'star' : 'star-outline'}
                        size={20}
                        color={w.isStarred ? colors.starGold : colors.textTertiary}
                    />
                </Pressable>

                <View style={styles.rowBody}>
                    <View style={styles.rowTermLine}>
                        <Text
                            style={[
                                styles.rowTerm,
                                { color: w.isMemorized ? colors.textTertiary : colors.text },
                                w.isMemorized && styles.rowTermMemorized,
                            ]}
                            numberOfLines={1}
                        >
                            {w.term}
                        </Text>
                    </View>
                    <View style={styles.rowMeaningLine}>
                        <Text style={[styles.rowMeaning, { color: colors.textSecondary }]} numberOfLines={1}>
                            {w.meaningKr}
                        </Text>
                        {/* 여러 단어장을 섞는 화면이라 출처 배지는 남긴다 — 단어장 상세엔 없는 부분이다. */}
                        <View style={[styles.listBadge, { backgroundColor: colors.primaryLight }]}>
                            <Ionicons name="folder-outline" size={11} color={colors.primary} />
                            <Text style={[styles.listBadgeText, { color: colors.primary }]} numberOfLines={1}>
                                {item.listName}
                            </Text>
                        </View>
                    </View>
                </View>

                <View style={styles.rowActions}>
                    <SpeakerButton
                        text={getSpeakableText(w.term, w.phonetic, srcLang)}
                        language={getTtsLang(srcLang)}
                        size={20}
                        color={colors.textSecondary}
                        hitSlop={12}
                        stopPropagation
                    />
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${w.term} ${t(w.isMemorized ? 'list.markUnmemorized' : 'list.markMemorized')}`}
                        onPress={() => { Haptics.selectionAsync(); toggleMemorized(item.listId, w.id); }}
                        hitSlop={12}
                        style={styles.rowIconBtn}
                    >
                        <Ionicons
                            name={w.isMemorized ? 'checkmark-circle' : 'checkmark-circle-outline'}
                            size={22}
                            color={w.isMemorized ? colors.success : colors.textTertiary}
                        />
                    </Pressable>
                </View>
            </Pressable>
        );
    }, [colors, router, visibleLists]);

    /** 검색으로 걸린 근거(태그·정의)를 행 아래에 덧붙이는 조각. 조건으로만 고른 결과엔 붙지 않는다. */
    const renderMatchEvidence = useCallback((item: SearchResult) => {
        const trimmed = deferredQuery.trim().toLowerCase();
        const matchingTags = item.isTagMatch
            ? item.word.tags?.filter(tag => tag.toLowerCase().includes(trimmed)) ?? []
            : [];
        const otherTags = item.isTagMatch
            ? item.word.tags?.filter(tag => !tag.toLowerCase().includes(trimmed)) ?? []
            : item.word.tags ?? [];
        if (matchingTags.length === 0 && !item.isDefinitionMatch) return null;

        return (
            <View style={styles.evidence}>
                {/* 매칭된 태그 강조 표시.
                    테두리는 두 테마 모두 primary에서 끌어오고 알파만 다르다 — 어두운 배경에서
                    테두리가 읽히려면 조금 더 진해야 해서 다크가 25%, 라이트가 20%다. 라이트
                    쪽엔 옛 파란 primary가 rgba로 박혀 있었는데, 지금 primary는 청록이라
                    청록빛 알약에 파란 테두리를 두르고 있었다. rgba 문자열은 HEX 린트가
                    못 잡아서(선택자가 #로 시작하는 것만 본다) 웜 크림 전환 때 살아남았다. */}
                {matchingTags.length > 0 && (
                    <View style={styles.tagsRow}>
                        {matchingTags.map((tag, idx) => (
                            <View key={idx} style={[styles.matchedTag, { backgroundColor: colors.primaryLight, borderColor: colors.primary + (isDark ? '40' : '33') }]}>
                                <Ionicons name="pricetag" size={11} color={colors.primary} />
                                <Text style={[styles.matchedTagText, { color: colors.primary }]}>#{displayTag(tag, t)}</Text>
                            </View>
                        ))}
                        {otherTags.map((tag, idx) => (
                            <View key={`o${idx}`} style={[styles.smallTag, { backgroundColor: colors.background }]}>
                                <Text style={[styles.smallTagText, { color: colors.textTertiary }]}>#{displayTag(tag, t)}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* 영어 정의에서 매칭된 경우: 배지 대신 텍스트 직접 표시 */}
                {item.isDefinitionMatch && (
                    <Text style={[styles.definitionSnippet, { color: colors.textTertiary, borderLeftColor: colors.borderLight }]} numberOfLines={2}>
                        {item.word.definition}
                    </Text>
                )}
            </View>
        );
    }, [deferredQuery, colors, isDark, t]);

    const renderItem = useCallback(({ item }: { item: SearchResult }) => (
        <View>
            {renderResult({ item })}
            {renderMatchEvidence(item)}
        </View>
    ), [renderResult, renderMatchEvidence]);

    /** 지난번 조건 한 줄. 빈 화면에서는 세 줄, 목록 위에서는 맨 위 하나만 쓴다. */
    const renderRecent = (recent: typeof visibleRecents[number], inline: boolean) => {
        const condition = conditionLabel(recent.filters, visibleLists, t);
        return (
            <Pressable
                key={recent.savedAt}
                onPress={() => {
                    tap();
                    applyFilters(recent.filters);
                    setQuery('');
                }}
                style={({ pressed }) => [
                    styles.recentRow,
                    { backgroundColor: colors.surface, borderColor: colors.borderLight },
                    pressed && { opacity: 0.75 },
                ]}
            >
                <Ionicons name="arrow-undo-outline" size={14} color={colors.primary} />
                <View style={styles.recentBody}>
                    <Text style={[styles.recentCondition, { color: colors.text }]} numberOfLines={1}>
                        {inline ? t('search.recentInline', { condition }) : condition}
                    </Text>
                    <Text style={[styles.recentMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                        {t('search.recentMeta', { when: getRelativeTime(recent.savedAt, t), count: recent.count })}
                    </Text>
                </View>
            </Pressable>
        );
    };

    const chipStyle = (active: boolean) => [
        styles.filterChip,
        active
            ? { backgroundColor: colors.primary, borderColor: colors.primary }
            : { backgroundColor: colors.surface, borderColor: colors.border },
    ];
    const chipTextColor = (active: boolean) => (active ? colors.onPrimary : colors.textSecondary);

    /**
     * 오른쪽 스크롤 힌트 — "칩이 더 있는데 잘렸다"는 신호다. 가로 스크롤인 세 줄
     * (상태·품사·태그)에 모두 붙인다. 넘치지 않는 줄에서는 배경 위에 같은 배경을
     * 덮는 셈이라 보이지 않으므로, 넘칠 때만 켜려고 폭을 재지 않아도 된다.
     *
     * 예전엔 태그 줄에만 있었고 끝 색이 팔레트 밖 값으로 박혀 있었다. 배경이 웜 크림인
     * 지금은 그 차가운 흰색이 파르스름한 자국으로 보였고, 스킨이 넷이라 isDark 둘로는
     * y2k·lab을 맞출 수도 없었다. colors.background에서 끌어오면 네 스킨이 한 번에 맞는다.
     * 시작 색을 'transparent'가 아니라 같은 색의 알파 0으로 두는 것은, transparent가
     * rgba(0,0,0,0)이라 밝은 배경에서 중간이 탁하게 지나가기 때문이다.
     */
    const scrollFade = (
        <LinearGradient
            colors={[colors.background + '00', colors.background]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.filterFadeRight}
            pointerEvents="none"
        />
    );

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            {/* 헤더 */}
            <View style={[styles.header, { paddingTop: topPadding + 8, borderBottomColor: colors.borderLight }]}>

                {isPick ? (
                    /*
                     * 콘텐츠 계열 헤더(DESIGN.md §1.1) — 앱에서 가장 많은 계열이고, 이 화면의
                     * 제목은 이미 18 Bold라 좌우 배치만 맞추면 합류한다. 좌측이 비고 오른쪽에
                     * 닫기가 있던 예전 배치는 앱의 어떤 계열과도 맞지 않았다. 오른쪽 close는
                     * 좌측이 뒤로가기로 점유된 2단계 화면에서만 쓰는 문법이다.
                     *
                     * 뒤로 갈 부모가 없어 아이콘만 close다(계열 기본은 chevron-back).
                     * 우측 40 스페이서가 제목을 시각적 가운데로 민다.
                     */
                    <View style={styles.titleRow}>
                        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => router.back()} hitSlop={12} style={styles.headerBtn}>
                            <Ionicons name="close" size={26} color={colors.text} />
                        </Pressable>
                        <Text style={[styles.screenTitle, { color: colors.text }]} numberOfLines={1}>
                            {t('search.pickTitle')}
                        </Text>
                        <View style={styles.headerBtn} />
                    </View>
                ) : (
                    <View style={styles.headerTopRow}>
                        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Ionicons name="search" size={18} color={colors.textTertiary} />
                            <TextInput
                                style={[styles.searchInput, { color: colors.text }]}
                                placeholder={t('search.placeholder')}
                                placeholderTextColor={colors.textTertiary}
                                value={query}
                                onChangeText={setQuery}
                                onSubmitEditing={() => Keyboard.dismiss()}
                                autoFocus
                                autoCapitalize="none"
                                returnKeyType="search"
                            />
                            {query.length > 0 && (
                                <Pressable accessibilityRole="button" accessibilityLabel={t('common.clearInput')} onPress={() => setQuery('')} hitSlop={10}>
                                    <Ionicons name="close-circle" size={17} color={colors.textTertiary} />
                                </Pressable>
                            )}
                        </View>
                        {/* 같은 헤더 자리의 같은 동작이라 위 닫기 버튼과 같은 hitSlop을 쓴다. */}
                        <Pressable onPress={() => router.back()} hitSlop={12}>
                            <Text style={[styles.cancelText, { color: colors.primary }]}>{t('common.cancel')}</Text>
                        </Pressable>
                    </View>
                )}

                {/*
                 * 조건은 두 줄이다(DESIGN.md §2.2). 라벨 거터는 두지 않는다 — 칩이 이미 자기
                 * 범주를 말하고, 거터 폭은 가장 긴 번역에 맞춰야 해서 한국어에선 절반이 빈다.
                 * 대신 성격으로 묶는다: 1줄은 단어 자체의 조건, 2줄은 단어를 묶는 조건.
                 */}

                {/* 1줄: 암기 상태(단일 선택) + 별표(독립 토글) + 상한이 붙은 프리셋 둘 */}
                <View style={styles.filterRow}>
                    <View style={styles.filterScrollerWrap}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.filterContent}
                            keyboardShouldPersistTaps="handled"
                        >
                            {STATUS_KEYS.map(key => {
                                const isActive = filters.wordFilter === key;
                                return (
                                    <Pressable
                                        key={key}
                                        onPress={() => { tap(); setFilters({ wordFilter: key }); }}
                                        style={chipStyle(isActive)}
                                    >
                                        <Text style={[styles.filterChipText, { color: chipTextColor(isActive) }]}>
                                            {wordFilterLabel(key, t)}
                                        </Text>
                                    </Pressable>
                                );
                            })}

                            <View style={[styles.filterDivider, { backgroundColor: colors.borderLight }]} />

                            <Pressable
                                onPress={() => { tap(); setFilters({ starredOnly: !filters.starredOnly }); }}
                                style={[
                                    styles.filterChip,
                                    filters.starredOnly
                                        ? { backgroundColor: colors.warningLight, borderColor: colors.warning }
                                        : { backgroundColor: colors.surface, borderColor: colors.border },
                                ]}
                            >
                                <Ionicons
                                    name={filters.starredOnly ? 'star' : 'star-outline'}
                                    size={13}
                                    color={filters.starredOnly ? colors.warning : colors.textSecondary}
                                />
                                <Text style={[styles.filterChipText, { color: filters.starredOnly ? colors.warning : colors.textSecondary }]}>
                                    {t('search.starredChip')}
                                </Text>
                            </Pressable>

                            <View style={[styles.filterDivider, { backgroundColor: colors.borderLight }]} />

                            {/* 프리셋 둘만 상한이 있다. 숨기지 않고 라벨에 숫자를 박아 드러낸다. */}
                            {PRESET_KEYS.map(key => {
                                const isActive = filters.wordFilter === key;
                                return (
                                    <Pressable
                                        key={key}
                                        onPress={() => { tap(); setFilters({ wordFilter: isActive ? 'all' : key }); }}
                                        style={chipStyle(isActive)}
                                    >
                                        <Text style={[styles.filterChipText, { color: chipTextColor(isActive) }]}>
                                            {key === 'wrongCount' ? t('search.presetWrong') : t('search.presetRecent')}
                                        </Text>
                                        <Text style={[styles.filterChipCap, { color: chipTextColor(isActive) }]}>
                                            {PRESET_LIMIT}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>

                        {scrollFade}
                    </View>
                </View>

                {/*
                 * 2줄: 단어를 묶는 조건 — 범위 · 품사 · 태그.
                 *
                 * 범위와 품사는 둘 다 값 + ▾ 칩이다. 품사는 후보가 여섯까지 가면서 가장 덜
                 * 만지는 조건이라 펼쳐두면 자리만 먹었다. 접어서 범위와 같은 문법으로 두면
                 * "▾ 달린 칩 = 목록에서 고르는 것"이라는 규칙이 생긴다 — 예전엔 범위만 홀로
                 * ▾를 달고 있어 그게 규칙인지 예외인지 알 수 없었다.
                 */}
                <View style={styles.filterRow}>
                    <View style={styles.filterScrollerWrap}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.filterContent}
                            keyboardShouldPersistTaps="handled"
                        >
                            <Pressable
                                onPress={() => { tap(); setShowListPicker(true); }}
                                style={[chipStyle(scopeActive), styles.pickerChip]}
                            >
                                <Text style={[styles.filterChipText, styles.pickerChipText, { color: chipTextColor(scopeActive) }]} numberOfLines={1}>
                                    {scopeText}
                                </Text>
                                <Ionicons name="chevron-down" size={12} color={chipTextColor(scopeActive)} />
                            </Pressable>

                            {showPosFilter && (
                                <>
                                    <View style={[styles.filterDivider, { backgroundColor: colors.borderLight }]} />
                                    <Pressable
                                        onPress={() => { tap(); setShowPosPicker(true); }}
                                        style={[chipStyle(posActive), styles.pickerChip]}
                                    >
                                        <Text style={[styles.filterChipText, styles.pickerChipText, { color: chipTextColor(posActive) }]} numberOfLines={1}>
                                            {posChipLabel}
                                        </Text>
                                        <Ionicons name="chevron-down" size={12} color={chipTextColor(posActive)} />
                                    </Pressable>
                                </>
                            )}

                            {topTags.length > 0 && (
                                <>
                                    <View style={[styles.filterDivider, { backgroundColor: colors.borderLight }]} />
                                    {topTags.map(tag => {
                                        const isActive = filters.tag === tag;
                                        return (
                                            <Pressable
                                                key={tag}
                                                onPress={() => { tap(); setFilters({ tag: isActive ? null : tag }); }}
                                                style={chipStyle(isActive)}
                                            >
                                                <Ionicons name="pricetag" size={12} color={chipTextColor(isActive)} />
                                                <Text style={[styles.filterChipText, { color: chipTextColor(isActive) }]}>
                                                    {displayTag(tag, t)}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </>
                            )}
                        </ScrollView>

                        {scrollFade}
                    </View>
                </View>
            </View>

            {/* 결과 줄 — 칩 영역에 붙어 고정된다. 목록 안에 두면 스크롤한 순간
                초기화 버튼이 사라진다(정작 목록이 길어 필요한 상황에서). */}
            {showResults && (
                <View style={[styles.resultCountBar, { borderBottomColor: colors.borderLight }]}>
                    <Text style={[styles.resultCountText, { color: colors.textTertiary }]} numberOfLines={1}>
                        {countText}
                    </Text>
                    {activeFilterCount > 0 && (
                        <Pressable
                            onPress={() => { tap(); resetFilters(); }}
                            hitSlop={8}
                            style={[styles.resetBtn, { borderColor: colors.primary }]}
                        >
                            <Ionicons name="refresh" size={11} color={colors.primary} />
                            <Text style={[styles.resetText, { color: colors.primary }]}>{t('search.reset')}</Text>
                        </Pressable>
                    )}
                </View>
            )}

            {/* 본문 */}
            {!showResults ? (
                <ScrollView
                    style={styles.emptyScroll}
                    contentContainerStyle={styles.emptyContent}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* 고르러 온 자세엔 입력창이 없다 — 돋보기 대신 깔때기를 두고
                        "입력해 보세요"가 아니라 "칩으로 골라보세요"라고 말한다. */}
                    <Ionicons name={isPick ? 'funnel-outline' : 'search-outline'} size={44} color={colors.border} />
                    <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
                        {t(isPick ? 'search.pickEmptyTitle' : 'search.emptyTitle')}
                    </Text>
                    <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
                        {t(isPick ? 'search.pickEmptySubtitle' : 'search.emptySubtitle')}
                    </Text>

                    {showRecents && (
                        <View style={styles.recentSection}>
                            <Text style={[styles.recentHeader, { color: colors.textTertiary }]}>{t('search.recentHeader')}</Text>
                            {visibleRecents.map(r => renderRecent(r, false))}
                        </View>
                    )}
                </ScrollView>
            ) : (
                <FlatList
                    data={results}
                    keyExtractor={item => item.word.id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.resultsContent}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    ListHeaderComponent={
                        // 목록이 주인공인 화면에서 세 줄은 과하다 — 맨 위 하나만.
                        showRecents ? <View style={styles.inlineRecent}>{renderRecent(visibleRecents[0], true)}</View> : null
                    }
                    ListEmptyComponent={
                        <View style={styles.noResultBox}>
                            <Ionicons name="search-outline" size={40} color={colors.border} />
                            <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>{t('search.noResults')}</Text>
                        </View>
                    }
                />
            )}

            {/*
             * 학습 시작 — 아이콘 + 제목 버튼 행(DESIGN.md §3). 누르는 순간이 곧 출발이라
             * 모드를 기억하는 지속 설정이 없다. 개수는 바로 위 결과 줄에 이미 있으므로
             * 버튼에 다시 쓰지 않는다.
             *
             * 오토플레이가 빠진 이유는 취향이 아니다 — 그 라우트만 아직 sel(골라낸 목록)을
             * 받지 않는다(features/study/autoplay/screen.tsx:35).
             */}
            <View style={[
                styles.studyBar,
                // 시스템바(제스처 바·홈 인디케이터) 위에 항상 여백이 남게 inset에
                // 더한다. Math.max(inset, 10)은 inset을 그대로 쓰고 끝이라 버튼이
                // 시스템바에 붙었다. 다른 하단 바(import-csv·일괄추가)는 16 기준.
                { backgroundColor: colors.surface, borderTopColor: colors.borderLight, paddingBottom: Math.max(insets.bottom, 6) + 12 },
            ]}>
                {STUDY_MODES.map(m => {
                    const disabled = results.length === 0;
                    return (
                        <Pressable
                            key={m.key}
                            onPress={() => handleStart(m.key)}
                            disabled={disabled}
                            style={({ pressed }) => [
                                styles.modeBtn,
                                { backgroundColor: colors.surface, borderColor: colors.borderLight },
                                disabled && styles.modeBtnDisabled,
                                pressed && !disabled && { opacity: 0.7 },
                            ]}
                        >
                            <Ionicons name={m.icon} size={22} color={colors.textTertiary} />
                            <Text style={[styles.modeBtnLabel, { color: colors.textTertiary }]} numberOfLines={1}>
                                {t(m.label)}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            {/* 품사 고르기 — 범위 피커와 함께 형제로 둔다. 둘이 동시에 열리는 경로는 없다. */}
            <ModalPicker
                visible={showPosPicker}
                onClose={() => setShowPosPicker(false)}
                title={t('search.rowPos')}
                options={posPickerOptions}
                selectedValue={filters.posFilter}
                onSelect={(id) => {
                    setFilters({ posFilter: id as PosFilter });
                    setShowPosPicker(false);
                }}
            />

            <ListDayPicker
                visible={showListPicker}
                onClose={() => setShowListPicker(false)}
                lists={visibleLists}
                selectedListIds={filters.useAllLists ? visibleLists.map(l => l.id) : filters.selectedListIds}
                selectedDaysByList={filters.selectedDaysByList}
                onApply={(listIds, daysByList) => {
                    // 전부 선택 + 모든 Day 전체면 "전체 단어장"으로 되돌린다 —
                    // 나중에 만든 단어장도 자동으로 포함되게 하기 위해서.
                    const isAll = listIds.length === visibleLists.length &&
                        listIds.every(id => !daysByList[id] || daysByList[id] === 'all');
                    setFilters({
                        useAllLists: isAll,
                        selectedListIds: isAll ? [] : listIds,
                        selectedDaysByList: daysByList,
                    });
                }}
            />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },

    // 헤더
    header: {
        paddingHorizontal: 16,
        paddingBottom: 6,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 6,
    },
    // 콘텐츠 계열 헤더(DESIGN.md §1.1). 좌우 40 박스가 대칭이라 제목이 가운데에 선다.
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 2,
    },
    // 박스 40 + hitSlop 12 = 64. 아이콘 크기와 무관하게 최소 터치 타겟을 넘긴다(DESIGN.md §5).
    headerBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    screenTitle: {
        flex: 1,
        textAlign: 'center',
        fontSize: 18,
        fontFamily: 'Pretendard_700Bold',
        letterSpacing: -0.3,
    },
    searchBox: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 12,
        gap: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        fontFamily: 'Pretendard_400Regular',
        // 안드로이드 TextInput은 EditText 기본 내부 패딩(위아래 비대칭)을 갖고 있다.
        // 상자는 height 44 안에서 가운데 오지만 글자는 그 패딩만큼 밀려 올라가 보인다
        // (한글은 글자가 사각형을 채워 가려지고 영문에서 드러난다).
        // 큐레이션 검색창도 같은 이유로 padding 0을 명시한다.
        padding: 0,
    },
    cancelText: {
        fontSize: 15,
        fontFamily: 'Pretendard_600SemiBold',
    },

    // 필터 칩
    filterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    filterScrollerWrap: {
        flex: 1,
        // 헤더의 좌우 패딩을 상쇄해 칩이 화면 끝까지 흐르게 한다. 거터가 없어진 뒤로는
        // 왼쪽도 상쇄해야 칩 시작선이 제목·본문과 같은 16에 선다.
        marginHorizontal: -16,
        paddingLeft: 16,
        height: 42,
    },
    filterContent: {
        paddingRight: 16,
        paddingVertical: 5,
        gap: 6,
        alignItems: 'center',
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: Radius.pillSm,
        borderWidth: 1,
    },
    filterChipText: {
        fontSize: 13,
        fontFamily: 'Pretendard_500Medium',
    },
    filterChipCap: {
        fontSize: 10,
        fontFamily: 'Pretendard_700Bold',
        opacity: 0.7,
        marginLeft: -2,
    },
    filterDivider: {
        width: 1,
        height: 20,
        marginHorizontal: 2,
    },
    filterFadeRight: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 40,
    },
    // 값 + ▾ 칩(범위 · 품사). 이름이 길어도 줄 전체를 밀어내지 않게 상한을 둔다.
    pickerChip: {
        maxWidth: 200,
    },
    pickerChipText: {
        flexShrink: 1,
    },

    // 결과 줄
    resultCountBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    resultCountText: {
        flexShrink: 1,
        fontSize: 12,
        fontFamily: 'Pretendard_500Medium',
    },
    resetBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 9,
        paddingVertical: 3,
    },
    resetText: {
        fontSize: 11,
        fontFamily: 'Pretendard_700Bold',
    },

    // 결과 리스트
    resultsContent: {
        padding: 16,
        paddingBottom: 24,
        gap: 10,
    },
    // 단어 행 — 단어장 상세와 같은 뼈대(DESIGN.md §4.1).
    wordRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        paddingVertical: 9,
        paddingRight: 12,
        paddingLeft: 11,
        borderRadius: Radius.md,
        borderLeftWidth: 3,
    },
    rowIconBtn: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowBody: { flex: 1, minWidth: 0 },
    rowTermLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rowTerm: {
        fontSize: 15,
        fontFamily: 'Pretendard_700Bold',
        flexShrink: 1,
    },
    rowTermMemorized: { textDecorationLine: 'line-through' },
    rowMeaningLine: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 1,
    },
    rowMeaning: {
        flexShrink: 1,
        fontSize: 12.5,
        fontFamily: 'Pretendard_400Regular',
    },
    rowActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
    },
    // 검색 매칭 근거 — 행 아래에 덧붙는다. 조건으로만 고른 결과엔 붙지 않는다.
    evidence: {
        paddingLeft: 14,
        paddingRight: 12,
        paddingTop: 5,
    },
    listBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        gap: 3,
        maxWidth: 140,
        // 이름이 상한을 넘겨도 알약 밖으로 새지 않게. 안드로이드에서 둥근 배경이
        // 네모로 그려지는 것도 이 속성이 막는다(CLAUDE.md UI 체크리스트).
        overflow: 'hidden',
    },
    listBadgeText: {
        fontSize: 11,
        fontFamily: 'Pretendard_500Medium',
        // RN은 flexShrink 기본값이 0이라 이게 없으면 Text가 제 폭을 고집하고,
        // maxWidth에 걸린 알약 밖으로 글자가 튀어나온다(말줄임도 안 걸린다).
        flexShrink: 1,
    },
    resultMeaning: {
        fontSize: 15,
        fontFamily: 'Pretendard_500Medium',
    },

    // 태그
    // 태그 칩 두 종류(매칭 강조 · 일반)는 같은 뼈대를 쓴다 — View가 알약을 그리고
    // Text는 lineHeight를 명시한다. 예전엔 일반 태그만 배경 깔린 <Text>라
    // 안드로이드 includeFontPadding이 위아래를 부풀렸고, 아래 alignItems가
    // 없어서 한 줄 안의 칩들이 제일 큰 칩 높이로 늘어났다(Yoga 기본값 stretch).
    tagsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 5,
        marginTop: 2,
    },
    matchedTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 8,
        borderWidth: 1,
    },
    matchedTagText: {
        fontSize: 12,
        lineHeight: 16,
        fontFamily: 'Pretendard_600SemiBold',
    },
    // 테두리가 없는 만큼(matchedTag는 1px) 패딩으로 메워 두 칩 높이를 24로 맞춘다.
    smallTag: {
        justifyContent: 'center',
        paddingHorizontal: 7,
        paddingVertical: 4,
        borderRadius: 8,
        overflow: 'hidden',
    },
    smallTagText: {
        fontSize: 12,
        lineHeight: 16,
        fontFamily: 'Pretendard_400Regular',
    },

    // 영어 정의 스니펫
    definitionSnippet: {
        fontSize: 13,
        fontFamily: 'Pretendard_400Regular',
        lineHeight: 19,
        marginTop: 4,
        paddingLeft: 10,
        borderLeftWidth: 2,
    },

    // 빈 화면
    emptyScroll: { flex: 1 },
    emptyContent: {
        paddingTop: 44,
        paddingHorizontal: 20,
        paddingBottom: 24,
        alignItems: 'center',
    },
    emptyTitle: {
        fontSize: 15,
        fontFamily: 'Pretendard_600SemiBold',
        marginTop: 12,
        textAlign: 'center',
    },
    emptySubtitle: {
        fontSize: 13,
        fontFamily: 'Pretendard_400Regular',
        marginTop: 4,
        textAlign: 'center',
    },
    noResultBox: {
        alignItems: 'center',
        marginTop: 80,
        gap: 12,
    },

    // 지난번 조건
    recentSection: {
        width: '100%',
        marginTop: 30,
    },
    recentHeader: {
        fontSize: 11,
        fontFamily: 'Pretendard_700Bold',
        marginBottom: 7,
        marginLeft: 2,
    },
    inlineRecent: {
        marginBottom: 4,
    },
    recentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 9,
        marginBottom: 7,
    },
    recentBody: { flex: 1, minWidth: 0 },
    recentCondition: {
        fontSize: 13,
        fontFamily: 'Pretendard_600SemiBold',
    },
    recentMeta: {
        fontSize: 11,
        fontFamily: 'Pretendard_400Regular',
        marginTop: 1,
    },

    // 학습 바
    studyBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    // 학습 시작 버튼 — 아이콘 위, 제목 아래. 부가 설명은 붙이지 않는다(DESIGN.md §3).
    modeBtn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 9,
        borderRadius: Radius.md,
        borderWidth: 1,
    },
    modeBtnDisabled: {
        opacity: 0.4,
    },
    modeBtnLabel: {
        fontSize: 11.5,
        fontFamily: 'Pretendard_600SemiBold',
    },
});
