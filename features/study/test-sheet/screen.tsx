import React, { useState, useCallback, useRef, useEffect, useReducer } from 'react';
import { View, Text, Pressable, Platform, StyleSheet, TextInput, FlatList, Keyboard } from 'react-native';
import type { ScrollViewProps } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView, useKeyboardState } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useTheme } from '@/features/theme';
import { AppBannerAd, useAdsBottomInset } from '@/components/ads/AppBannerAd';
import { useLists, selectWordsForList, updatePlanProgress } from '@/features/vocab';
import { useStudyResultsStore, useStudySelection, applyStudySelection } from '@/features/study';
import { useSessionCommit, commitSessionResults } from '../use-session-commit';
import { shuffleArray } from '../choices';
import { useSettings } from '@/features/settings';
import StudySettingsModal, { StudySettings } from '../components/StudySettingsModal';
import { FontSize, FontWeight, Radius } from '@/constants/tokens';
import type { StudyResult, Word } from '@/lib/types';
import {
  sheetReducer,
  EMPTY_SESSION,
  newRows,
  canAdvance,
  canRetryWrong,
  collectResults,
  pendingCount,
  wrongCount,
  okCount,
  promptOf,
  answerOf,
  normalizeAnswer,
  type SheetMark,
  type SheetQuizType,
  type SheetRow,
} from './sheet';
import { AnswerKey, MarkIcon, type SheetColors as Colors } from './parts';

const QUIZ_TYPES: readonly SheetQuizType[] = ['meaning-to-term', 'term-to-meaning', 'mixed'];

// 풀 때 줄을 옮겨 가며 적으므로 자동 고침·추천이 철자를 대신 알려 주면 안 된다(D10).
// 🔴 안드로이드 추천 줄은 키보드 앱마다 달라 이것만으로 안 꺼질 수 있다 — 실기로 확인(스펙 §5).
const ANSWER_INPUT_PROPS = {
  autoCorrect: false,
  spellCheck: false,
  autoComplete: 'off',
  autoCapitalize: 'none',
  importantForAutofill: 'no',
} as const;

/**
 * 키보드가 떠 있을 때 입력 중인 줄이 가려지지 않게 한다. 행 수가 «전체»면 수백 줄이라
 * FlatList 로 가상화하되, 스크롤 뷰만 keyboard-controller 판으로 바꾼다 — 포커스가 옮겨 가면
 * 그 줄이 키보드 위로 오도록 알아서 굴린다.
 */
const renderKeyboardAwareScroll = (props: ScrollViewProps) => (
  <KeyboardAwareScrollView {...props} bottomOffset={24} />
);

export default function TestSheetScreen() {
  const { id, filter, isStarred: initialIsStarred, quizType: initialQuizType, sel, planDay } = useLocalSearchParams<{
    id: string;
    filter?: string;
    isStarred?: string;
    quizType?: string;
    sel?: string;
    planDay?: string;
  }>();
  const selectedIds = useStudySelection(sel);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const lists = useLists();
  const list = lists.find(l => l.id === id);
  const setStudyResults = useStudyResultsStore(s => s.setResults);
  const { studySettings, updateStudySettings } = useSettings();
  const adsBottomInset = useAdsBottomInset();
  const keyboardVisible = useKeyboardState(s => s.isVisible);
  const topInset = Platform.OS === 'web' ? insets.top + 67 : insets.top;

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settings, setSettings] = useState<StudySettings>({
    filter: (filter || 'all') as StudySettings['filter'],
    isStarred: initialIsStarred === 'true',
    // 처음 값은 뜻→단어(D5). 결과 화면의 «다시 학습»은 고른 방향을 들고 돌아온다.
    quizType: QUIZ_TYPES.includes(initialQuizType as SheetQuizType) ? (initialQuizType as SheetQuizType) : 'meaning-to-term',
    // 목업의 풀이 줄에는 품사가 없다 — 켜면 뜻이 같은 단어(big/large)를 가르는 데 도움이 된다.
    showPos: false,
  });
  const quizType = (settings.quizType ?? 'meaning-to-term') as SheetQuizType;
  const batchSetting = studySettings.testSheetBatchSize;

  const [studyWords, setStudyWords] = useState<Word[]>([]);
  const [session, dispatch] = useReducer(sheetReducer, EMPTY_SESSION);
  // 새 풀이 칸이 열릴 때마다 올린다 — 입력칸은 값을 들고 있지 않아(아래 typedRef) key 를
  // 바꿔야 앞 세트에 적은 글자가 남지 않는다.
  const [sheetNonce, setSheetNonce] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // 적은 글자는 state 가 아니라 ref 에 둔다. 한 글자마다 목록 전체를 다시 그리지 않으려는 것이고,
  // 채점할 때 한 번 읽으면 된다. 가상화로 줄이 내렸다 올라와도 defaultValue 로 되살린다.
  const typedRef = useRef<string[]>([]);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const listRef = useRef<FlatList<SheetRow>>(null);

  const startTime = useRef(Date.now());
  const results = useRef<StudyResult[]>([]);
  const sessionCompletedRef = useRef(false);
  const commitSession = useSessionCommit(id, results, sessionCompletedRef);

  // 중간에 나가면 «채점한 세트까지» 기록된다(§3) — 커밋 훅이 이 ref 를 읽는다.
  useEffect(() => {
    results.current = collectResults(session.records);
  }, [session.records]);

  const batchSizeOf = useCallback(
    (total: number) => (batchSetting === 'all' ? Math.max(total, 1) : batchSetting),
    [batchSetting],
  );
  const batchSize = batchSizeOf(studyWords.length);
  const totalSets = Math.max(1, Math.ceil(studyWords.length / batchSize));
  const isLastSet = session.setIndex + 1 >= totalSets;

  const resetSheetInputs = useCallback(() => {
    typedRef.current = [];
    inputRefs.current = [];
    setFocusedIndex(null);
    setSheetNonce(n => n + 1);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  // 단어 고르기 — 퀴즈와 같은 규칙. 방향·세트 크기·대상이 바뀌면 처음부터 다시 연다.
  const lastCoreRef = useRef<string | null>(null);
  useEffect(() => {
    let all = selectWordsForList(lists, id!);
    if (selectedIds) {
      all = applyStudySelection(all, selectedIds);
    } else {
      if (settings.isStarred) all = all.filter(w => w.isStarred);
      if (settings.filter === 'learning') all = all.filter(w => !w.isMemorized);
      else if (settings.filter === 'memorized') all = all.filter(w => w.isMemorized);
    }

    // 비어 있는지도 키에 넣는다 — 단어장이 늦게 채워지면(첫 렌더에 빈 목록) 그때 연다.
    const coreKey = [id, settings.filter, settings.isStarred, quizType, batchSetting, sel, all.length > 0].join('|');
    // 단어장이 바뀐 것(학습 기록 저장·다른 화면의 편집)만으로는 풀던 시험지를 갈아엎지 않는다.
    if (lastCoreRef.current === coreKey) return;
    lastCoreRef.current = coreKey;

    if (!selectedIds) all = shuffleArray(all);
    setStudyWords(all);
    dispatch({ type: 'start', rows: newRows(all.slice(0, batchSizeOf(all.length)), quizType) });
    results.current = [];
    startTime.current = Date.now();
    resetSheetInputs();
  }, [id, lists, selectedIds, sel, settings.filter, settings.isStarred, quizType, batchSetting, batchSizeOf, resetSheetInputs]);

  const applySettings = useCallback((next: StudySettings, nextBatchSize: number | 'all') => {
    setSettings(next);
    if (nextBatchSize !== studySettings.testSheetBatchSize) {
      updateStudySettings({ testSheetBatchSize: nextBatchSize });
    }
    setSettingsVisible(false);
  }, [studySettings.testSheetBatchSize, updateStudySettings]);

  const handleGrade = useCallback(() => {
    Keyboard.dismiss();
    dispatch({ type: 'grade', typed: session.rows.map((_, i) => typedRef.current[i] ?? '') });
    setFocusedIndex(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [session.rows]);

  const handleMark = useCallback((index: number, mark: SheetMark) => {
    Haptics.selectionAsync();
    dispatch({ type: 'mark', index, mark });
  }, []);

  const handleFix = useCallback((index: number) => {
    Haptics.selectionAsync();
    dispatch({ type: 'fix', index });
  }, []);

  const handleRetryWrong = useCallback(() => {
    dispatch({ type: 'retryWrong' });
    resetSheetInputs();
  }, [resetSheetInputs]);

  const finishSession = useCallback(async () => {
    // 완주 — 복습 기록은 결과 화면 몫. replace 언마운트 전에 반드시 먼저 세운다.
    sessionCompletedRef.current = true;
    const finalResults = collectResults(session.records);
    await commitSessionResults(id!, finalResults);
    const gotItRatio = finalResults.length > 0 ? finalResults.filter(r => r.gotIt).length / finalResults.length : 0;
    if (planDay && gotItRatio >= 0.5) await updatePlanProgress(id!, parseInt(planDay, 10) + 1);
    setStudyResults(finalResults, session.records);
    router.replace({
      pathname: '/study-results',
      params: {
        id,
        mode: 'test-sheet',
        duration: Date.now() - startTime.current,
        isStarred: settings.isStarred ? 'true' : 'false',
        sessionFilter: settings.filter,
        quizType,
      },
    });
  }, [session.records, id, planDay, setStudyResults, settings.isStarred, settings.filter, quizType]);

  const handleAdvance = useCallback(() => {
    if (!canAdvance(session)) return;
    if (isLastSet) {
      finishSession();
      return;
    }
    const start = (session.setIndex + 1) * batchSize;
    dispatch({ type: 'nextSet', rows: newRows(studyWords.slice(start, start + batchSize), quizType) });
    resetSheetInputs();
  }, [session, isLastSet, finishSession, batchSize, studyWords, quizType, resetSheetInputs]);

  // 엔터 = 다음 줄, 마지막 줄 엔터 = 키보드 내림(D9) — 내려가면 [채점하기]가 보인다.
  const handleSubmitRow = useCallback((index: number) => {
    const next = index + 1;
    if (next >= session.rows.length) {
      Keyboard.dismiss();
      return;
    }
    const input = inputRefs.current[next];
    if (input) input.focus();
    else listRef.current?.scrollToIndex({ index: next, viewPosition: 0.5 });
  }, [session.rows.length]);

  const handleClose = useCallback(async () => {
    await commitSession();
    router.back();
  }, [commitSession]);

  const settingsModal = (
    <StudySettingsModal
      visible={settingsVisible}
      mode="test-sheet"
      initialSettings={settings}
      initialBatchSize={studySettings.testSheetBatchSize}
      onClose={() => setSettingsVisible(false)}
      onApply={applySettings}
      hideTargetFilter={!!selectedIds}
    />
  );

  if (studyWords.length === 0) {
    return (
      <View style={[styles.container, styles.empty, { backgroundColor: colors.background }]}>
        <Ionicons name="document-text-outline" size={64} color={colors.textTertiary} style={{ marginBottom: 16 }} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('quiz.noQuestions')}</Text>
        <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>{t('quiz.noQuestionsDesc')}</Text>
        <View style={styles.emptyButtons}>
          <Pressable onPress={() => setSettingsVisible(true)} style={[styles.emptyBtn, { backgroundColor: colors.primaryButton }]}>
            <Text style={[styles.emptyBtnText, { color: colors.onPrimary }]}>{t('common.settingsChange')}</Text>
          </Pressable>
          <Pressable onPress={handleClose} style={[styles.emptyBtn, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.emptyBtnText, { color: colors.text }]}>{t('common.back')}</Text>
          </Pressable>
        </View>
        {settingsModal}
      </View>
    );
  }

  const graded = session.phase === 'graded';
  const pending = pendingCount(session.rows);
  const wrong = wrongCount(session.rows);
  const blocked = graded && !canAdvance(session);
  // 섞기면 줄마다 방향이 달라 «뜻 | 단어» 머리줄이 틀린 말이 된다 — 그때는 두지 않는다.
  const columns = quizType === 'mixed'
    ? null
    : quizType === 'meaning-to-term'
      ? [t('testSheet.colMeaning'), t('testSheet.colTerm')]
      : [t('testSheet.colTerm'), t('testSheet.colMeaning')];
  const showBottomBar = graded || !keyboardVisible;
  // 번호는 세트를 넘어 이어진다. 다시 풀기의 줄은 처음 세트에서의 번호를 그대로 쓴다.
  const setRecord = session.records[session.setIndex];
  const numberOf = (row: SheetRow, index: number) => {
    const original = session.retry && setRecord ? setRecord.findIndex(r => r.word.id === row.word.id) : index;
    return session.setIndex * batchSize + (original >= 0 ? original : index) + 1;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={handleClose} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.titleArea}>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
              {list?.title || t('testSheet.title')}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('studySettings.testSheetSettings')} onPress={() => setSettingsVisible(true)} hitSlop={12}>
            <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
        <View style={styles.progressContainer}>
          <View style={[styles.progressBarBg, { backgroundColor: colors.surfaceSecondary }]}>
            <View style={[styles.progressBarFill, { backgroundColor: colors.primaryButton, width: `${((session.setIndex + 1) / totalSets) * 100}%` }]} />
          </View>
          <Text style={[styles.progressText, { color: colors.textTertiary }]}>
            {t('testSheet.setProgress', { current: session.setIndex + 1, total: totalSets })}
          </Text>
        </View>
      </View>

      {graded && (
        <View style={styles.score}>
          <Text style={[styles.scoreBig, { color: colors.primary }]}>
            {okCount(session.rows)}
            <Text style={[styles.scoreTotal, { color: colors.textTertiary }]}> / {session.rows.length}</Text>
          </Text>
          <Text style={[styles.tally, { color: colors.textSecondary }]}>
            {t('testSheet.scoreWrong', { count: wrong })}
            {pending > 0 && (
              <>
                {' · '}
                <Text style={[styles.tallyPending, { color: colors.warning }]}>{t('testSheet.scorePending', { count: pending })}</Text>
              </>
            )}
          </Text>
        </View>
      )}

      {columns && (
        <View style={[styles.cols, { borderBottomColor: colors.borderLight }]}>
          <View style={styles.numCol} />
          <Text style={[styles.colText, styles.promptCol, { color: colors.textTertiary }]}>{columns[0]}</Text>
          <Text style={[styles.colText, styles.answerCol, { color: colors.textTertiary }]}>{columns[1]}</Text>
          <View style={styles.markCol} />
        </View>
      )}

      <FlatList
        ref={listRef}
        data={session.rows}
        keyExtractor={(row, index) => `${sheetNonce}-${index}-${row.word.id}`}
        renderScrollComponent={renderKeyboardAwareScroll}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={30}
        onScrollToIndexFailed={({ index }) => {
          listRef.current?.scrollToOffset({ offset: index * ROW_MIN_HEIGHT, animated: true });
        }}
        style={styles.list}
        renderItem={({ item, index }) => (
          <SheetRowView
            row={item}
            index={index}
            number={numberOf(item, index)}
            graded={graded}
            showPos={!!settings.showPos}
            focused={focusedIndex === index}
            isLast={index === session.rows.length - 1}
            defaultTyped={typedRef.current[index] ?? ''}
            colors={colors}
            t={t}
            inputRef={el => { inputRefs.current[index] = el; }}
            onChangeText={text => { typedRef.current[index] = text; }}
            onFocus={() => setFocusedIndex(index)}
            onBlur={() => setFocusedIndex(cur => (cur === index ? null : cur))}
            onSubmit={() => handleSubmitRow(index)}
            onMark={mark => handleMark(index, mark)}
            onFix={() => handleFix(index)}
          />
        )}
      />

      {showBottomBar && (
        <View style={[styles.bar, { borderTopColor: colors.borderLight, paddingBottom: insets.bottom + (adsBottomInset || 36) }]}>
          {graded && blocked && (
            <Text style={[styles.barNote, { color: colors.textTertiary }]}>
              {t(isLastSet ? 'testSheet.pendingNoteLast' : 'testSheet.pendingNote', { count: pending })}
            </Text>
          )}
          {graded && canRetryWrong(session) && (
            <Pressable accessibilityRole="button" onPress={handleRetryWrong} hitSlop={12} style={styles.retry}>
              <Text style={[styles.retryText, { color: colors.primary }]}>{t('testSheet.retryWrong', { count: wrong })}</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: blocked }}
            disabled={blocked}
            onPress={graded ? handleAdvance : handleGrade}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: colors.primaryButton },
              blocked && styles.primaryBtnDisabled,
              pressed && !blocked && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>
              {!graded ? t('testSheet.grade') : isLastSet ? t('testSheet.showResults') : t('testSheet.nextSet')}
            </Text>
          </Pressable>
        </View>
      )}

      {settingsModal}
      <AppBannerAd mode="bottom-anchor" />
    </View>
  );
}

// ─── 한 줄 ────────────────────────────────────────────────────────────────────

interface SheetRowViewProps {
  row: SheetRow;
  index: number;
  number: number;
  graded: boolean;
  showPos: boolean;
  focused: boolean;
  isLast: boolean;
  defaultTyped: string;
  colors: Colors;
  t: TFunction;
  inputRef: (el: TextInput | null) => void;
  onChangeText: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onSubmit: () => void;
  onMark: (mark: SheetMark) => void;
  onFix: () => void;
}

function SheetRowView({
  row, number, graded, showPos, focused, isLast, defaultTyped, colors, t,
  inputRef, onChangeText, onFocus, onBlur, onSubmit, onMark, onFix,
}: SheetRowViewProps) {
  const prompt = promptOf(row);
  const answer = answerOf(row);
  const isTermPrompt = row.direction === 'term-to-meaning';
  const waiting = graded && row.mark === null;

  return (
    <View style={[styles.row, { borderBottomColor: colors.borderLight }, waiting && { backgroundColor: colors.surface }]}>
      <Text style={[styles.num, styles.numCol, { color: colors.textTertiary }]}>{number}</Text>

      <View style={styles.promptCol}>
        <Text style={[isTermPrompt ? styles.promptTerm : styles.promptMeaning, { color: colors.text }]}>{prompt}</Text>
        {showPos && !!row.word.pos && (
          <Text style={[styles.pos, { color: colors.textTertiary }]}>{row.word.pos}</Text>
        )}
      </View>

      <View style={styles.answerCol}>
        {!graded ? (
          <TextInput
            ref={inputRef}
            {...ANSWER_INPUT_PROPS}
            defaultValue={defaultTyped}
            onChangeText={onChangeText}
            onFocus={onFocus}
            onBlur={onBlur}
            onSubmitEditing={onSubmit}
            returnKeyType={isLast ? 'done' : 'next'}
            submitBehavior={isLast ? 'blurAndSubmit' : 'submit'}
            accessibilityLabel={t('testSheet.answerInputLabel', { n: number })}
            selectionColor={colors.primary}
            style={[
              styles.input,
              { color: colors.text, borderBottomColor: focused ? colors.primary : colors.border },
              focused && styles.inputFocused,
            ]}
          />
        ) : (
          <GradedAnswer row={row} answer={answer} colors={colors} t={t} onMark={onMark} onFix={onFix} />
        )}
      </View>

      <View style={styles.markCol}>
        {graded && row.method !== 'self' && row.mark !== null && (
          <MarkIcon
            mark={row.mark}
            colors={colors}
            // 미리 찍힌 ○만 누를 수 있다(§2) — 누르면 ✕가 되고 ○·✕ 버튼이 나온다.
            onPress={row.method === 'prefill' ? () => onMark('no') : undefined}
            label={t(row.mark === 'ok' ? 'testSheet.markOk' : 'testSheet.markNo')}
          />
        )}
      </View>
    </View>
  );
}

function GradedAnswer({ row, answer, colors, t, onMark, onFix }: {
  row: SheetRow;
  answer: string;
  colors: Colors;
  t: SheetRowViewProps['t'];
  onMark: (mark: SheetMark) => void;
  onFix: () => void;
}) {
  const blank = !normalizeAnswer(row.typed);
  const typedStyle = row.direction === 'meaning-to-term' ? styles.typedTerm : styles.typedMeaning;

  // 빈칸 — 정답을 보여 주고 사람이 매긴다(D8)
  if (blank) {
    return (
      <View style={styles.answerStack}>
        <Text style={[styles.blank, { color: colors.textTertiary }]}>{t('testSheet.notWritten')}</Text>
        <Text style={[styles.rightAnswer, { color: colors.text }]}>{answer}</Text>
        <MarkChoice mark={row.mark} colors={colors} t={t} onMark={onMark} />
      </View>
    );
  }

  // 뜻→단어, 앱이 매긴 줄
  if (row.method === 'auto' || row.method === 'fixed') {
    if (row.method === 'auto' && row.mark === 'ok') {
      return <Text style={[typedStyle, { color: colors.text }]}>{row.typed}</Text>;
    }
    if (row.method === 'auto') {
      return (
        <View style={styles.answerStack}>
          <Text style={[styles.wrongTyped, { color: colors.warning }]}>{row.typed}</Text>
          <Text style={[styles.rightAnswer, { color: colors.text }]}>{answer}</Text>
          <Pressable accessibilityRole="button" onPress={onFix} hitSlop={12} style={styles.fixBtn}>
            <Text style={[styles.fixText, { color: colors.primary }]}>{t('testSheet.fixCorrect')}</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.answerStack}>
        <Text style={[typedStyle, { color: colors.text }]}>{row.typed}</Text>
        <AnswerKey answer={answer} colors={colors} t={t} />
        <Pressable accessibilityRole="button" onPress={onFix} hitSlop={12} style={styles.fixBtn}>
          <Text style={[styles.fixText, { color: colors.textSecondary }]}>{t('testSheet.undoFix')}</Text>
        </Pressable>
      </View>
    );
  }

  // 단어→뜻 — 적은 뜻과 정답 뜻을 나란히(§2). 미리 찍힌 ○는 오른쪽 표시로 끝난다.
  const sameAsAnswer = normalizeAnswer(row.typed) === normalizeAnswer(answer);
  return (
    <View style={styles.answerStack}>
      <Text style={[typedStyle, { color: colors.text }]}>{row.typed}</Text>
      {!sameAsAnswer && <AnswerKey answer={answer} colors={colors} t={t} />}
      {row.method === 'self' && <MarkChoice mark={row.mark} colors={colors} t={t} onMark={onMark} />}
    </View>
  );
}

function MarkChoice({ mark, colors, t, onMark }: {
  mark: SheetMark | null;
  colors: Colors;
  t: SheetRowViewProps['t'];
  onMark: (mark: SheetMark) => void;
}) {
  return (
    <View style={styles.markChoice}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('testSheet.markOk')}
        accessibilityState={{ selected: mark === 'ok' }}
        onPress={() => onMark('ok')}
        hitSlop={{ top: 8, bottom: 8 }}
        style={[
          styles.markBtn,
          { borderColor: mark === 'ok' ? colors.primary : colors.border, backgroundColor: mark === 'ok' ? colors.primaryLight : colors.background },
        ]}
      >
        <Ionicons name="ellipse-outline" size={18} color={colors.primary} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('testSheet.markNo')}
        accessibilityState={{ selected: mark === 'no' }}
        onPress={() => onMark('no')}
        hitSlop={{ top: 8, bottom: 8 }}
        style={[
          styles.markBtn,
          { borderColor: mark === 'no' ? colors.warning : colors.border, backgroundColor: mark === 'no' ? colors.warningLight : colors.background },
        ]}
      >
        <Ionicons name="close" size={20} color={colors.warning} />
      </Pressable>
    </View>
  );
}

const ROW_MIN_HEIGHT = 58;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  empty: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: FontSize.title,
    fontFamily: FontWeight.semibold,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: FontSize.body,
    fontFamily: FontWeight.regular,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 40,
  },
  emptyButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  emptyBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: Radius.md,
  },
  emptyBtnText: {
    fontSize: FontSize.body,
    fontFamily: FontWeight.semibold,
  },
  // 학습 · 상세 계열 헤더(DESIGN.md §1.2) — 퀴즈와 같은 값
  header: {
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleArea: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Pretendard_700Bold',
  },
  progressContainer: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 8,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontFamily: 'Pretendard_500Medium',
    minWidth: 70,
    textAlign: 'right',
  },
  score: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  scoreBig: {
    fontSize: 24,
    fontFamily: FontWeight.bold,
  },
  scoreTotal: {
    fontSize: FontSize.body,
    fontFamily: FontWeight.semibold,
  },
  tally: {
    fontSize: FontSize.label,
    fontFamily: FontWeight.medium,
  },
  tallyPending: {
    fontFamily: FontWeight.semibold,
  },
  cols: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
    paddingHorizontal: 16,
    paddingTop: 9,
    paddingBottom: 7,
    borderBottomWidth: 1,
  },
  colText: {
    fontSize: FontSize.caption,
    fontFamily: FontWeight.semibold,
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: ROW_MIN_HEIGHT,
    borderBottomWidth: 1,
  },
  numCol: {
    width: 18,
  },
  promptCol: {
    flex: 1.3,
  },
  answerCol: {
    flex: 1,
  },
  markCol: {
    width: 24,
    alignItems: 'flex-end',
  },
  num: {
    fontSize: FontSize.label,
    fontFamily: FontWeight.medium,
  },
  promptMeaning: {
    fontSize: FontSize.bodyLg,
    fontFamily: FontWeight.medium,
    lineHeight: 20,
  },
  promptTerm: {
    fontSize: FontSize.action,
    fontFamily: FontWeight.semibold,
    lineHeight: 21,
  },
  pos: {
    fontSize: FontSize.label,
    fontFamily: FontWeight.regular,
    marginTop: 2,
  },
  input: {
    height: 34,
    paddingHorizontal: 2,
    paddingVertical: 0,
    paddingBottom: 4,
    borderBottomWidth: 1.5,
    fontSize: FontSize.action,
    fontFamily: FontWeight.medium,
  },
  inputFocused: {
    borderBottomWidth: 2,
  },
  answerStack: {
    gap: 2,
  },
  typedTerm: {
    fontSize: FontSize.action,
    fontFamily: FontWeight.semibold,
  },
  typedMeaning: {
    fontSize: FontSize.bodyLg,
    fontFamily: FontWeight.medium,
  },
  wrongTyped: {
    fontSize: FontSize.body,
    fontFamily: FontWeight.medium,
    textDecorationLine: 'line-through',
  },
  rightAnswer: {
    fontSize: FontSize.action,
    fontFamily: FontWeight.semibold,
  },
  blank: {
    fontSize: FontSize.small,
    fontFamily: FontWeight.regular,
  },
  fixBtn: {
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  fixText: {
    fontSize: FontSize.label,
    fontFamily: FontWeight.semibold,
  },
  markChoice: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 7,
  },
  markBtn: {
    width: 46,
    height: 30,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  barNote: {
    fontSize: FontSize.label,
    fontFamily: FontWeight.medium,
    textAlign: 'center',
  },
  retry: {
    alignSelf: 'center',
    paddingVertical: 2,
  },
  retryText: {
    fontSize: FontSize.bodyLg,
    fontFamily: FontWeight.semibold,
    textAlign: 'center',
  },
  primaryBtn: {
    height: 52,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  primaryBtnDisabled: {
    opacity: 0.4,
  },
  primaryBtnText: {
    fontSize: FontSize.action,
    fontFamily: FontWeight.semibold,
  },
});
