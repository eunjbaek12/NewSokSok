/**
 * 위젯 헤드리스 핸들러 — **앱이 꺼져 있어도** 안드로이드가 부른다.
 *
 * 9/19 실측: 앱이 완전히 내려간 상태에서 번들 88ms + 진입 167ms + DB 190ms ≈ 0.45초,
 * 프로세스가 살아 있으면 DB 17ms 로 거의 즉시다. 그래서 «뜻을 가렸다 탭으로 공개»(W5)가
 * 성립한다 — 그 탭은 대개 위젯을 보고 이어서 누르는 쪽이다.
 *
 * 🔴 **`getDb()` 를 그냥 부르지 않는다.** 그 함수는 열면서 마이그레이션 사다리를 돈다.
 * 사용자는 앱을 열기 전에 위젯을 먼저 놓을 수 있고(9/19 실기에서 실제로 그렇게 됐다),
 * 그때 **앱이 아니라 위젯이 스키마를 만드는** 일은 없어야 한다. 스키마 번호를 먼저 읽어
 * 앱이 준비한 DB 인지 확인하고, 아니면 «앱을 한 번 열어 주세요»를 그린다.
 */
import React from 'react';
import * as SQLite from 'expo-sqlite';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import i18n from '@/i18n';
import { fetchAllLists } from '@/features/vocab';
import { selectReviewWords } from '@/features/study';
import { SCHEMA_VERSION } from '@/lib/db/migrations';
import type { VocaList } from '@/lib/types';
import { WordWidget, MessageWidget, WIDGET_ACTION } from './WordWidget';
import { pickWidgetContent, WIDGET_NEW_DAILY_CAP, WIDGET_REVIEW_DAILY_CAP } from './next-word';
import { loadWidgetState, saveWidgetState, clearWidgetState, type WidgetState } from './state';

/**
 * 앱이 이미 만들어 둔 DB 인가. 마이그레이션을 돌리지 않고 번호만 읽는다.
 * 🔑 `openDatabaseAsync` 는 파일이 없으면 **빈 파일을 만들어 준다** — 그래서 «열기»는 늘
 * 성공하고 «읽기»에서 죽는다. 번호가 0 이면 앱이 한 번도 안 열린 것이다.
 */
async function isSchemaReady(): Promise<boolean> {
  let db: SQLite.SQLiteDatabase | null = null;
  try {
    db = await SQLite.openDatabaseAsync('soksok_voca.db');
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    return (row?.user_version ?? 0) >= SCHEMA_VERSION;
  } catch {
    return false;
  } finally {
    try {
      await db?.closeAsync();
    } catch {
      // 닫기 실패는 판정을 바꾸지 않는다.
    }
  }
}

/** 판정을 기록한다. 무거운 모듈이라 실제로 누를 때만 불러온다. */
async function judge(list: VocaList, wordId: string, gotIt: boolean): Promise<void> {
  const word = list.words.find(w => w.id === wordId);
  if (!word) return;
  const { commitWidgetJudgement } = await import('./commit');
  await commitWidgetJudgement({ list, word, gotIt });
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const widgetId = props.widgetInfo.widgetId;

  if (props.widgetAction === 'WIDGET_DELETED') {
    await clearWidgetState(widgetId);
    return;
  }

  const now = Date.now();

  if (!(await isSchemaReady())) {
    props.renderWidget(
      <MessageWidget
        title={i18n.t('widget.needAppTitle')}
        sub={i18n.t('widget.needAppSub')}
        action={i18n.t('widget.openApp')}
      />,
    );
    return;
  }

  let state = await loadWidgetState(widgetId, now);
  let lists: VocaList[] = await fetchAllLists();

  // 판정 탭 — 지금 띄워 둔 단어일 때만 받는다. 연타하거나 늦게 도착한 탭이
  // **다음 단어의 판정이 되는 것**을 막는 유일한 방법이다(§-2 «누른 직후»).
  const tappedWordId = String(props.clickActionData?.wordId ?? '');
  const isJudgement =
    props.widgetAction === 'WIDGET_CLICK' &&
    (props.clickAction === WIDGET_ACTION.gotIt || props.clickAction === WIDGET_ACTION.again);

  if (isJudgement && tappedWordId && tappedWordId === state.wordId && state.listId) {
    const list = lists.find(l => l.id === state.listId);
    if (list) {
      await judge(list, tappedWordId, props.clickAction === WIDGET_ACTION.gotIt);
      // 방금 쓴 결과를 반영한 목록으로 다음 단어를 고른다.
      lists = await fetchAllLists();
    }
    state = {
      ...state,
      revealed: false,
      wordId: null,
      doneReview: state.mode === 'review' ? state.doneReview + 1 : state.doneReview,
      doneNew: state.mode === 'new' ? state.doneNew + 1 : state.doneNew,
    };
  }

  if (
    props.widgetAction === 'WIDGET_CLICK' &&
    props.clickAction === WIDGET_ACTION.reveal &&
    tappedWordId &&
    tappedWordId === state.wordId
  ) {
    state = { ...state, revealed: true };
  }

  const content = pickWidgetContent({
    lists,
    now,
    doneToday: { review: state.doneReview, new: state.doneNew },
    pinnedListId: state.pinnedListId,
    reviewCandidates: selectReviewWords(lists, now, WIDGET_REVIEW_DAILY_CAP),
  });

  if (content.kind === 'empty') {
    const next: WidgetState = { ...state, wordId: null, listId: null, mode: null, revealed: false };
    await saveWidgetState(widgetId, next);

    if (content.reason === 'done-today') {
      props.renderWidget(
        <MessageWidget title={i18n.t('widget.doneTitle')} sub={i18n.t('widget.doneSub')} />,
      );
      return;
    }
    const isEmptyList = content.reason === 'empty-list';
    props.renderWidget(
      <MessageWidget
        title={i18n.t(isEmptyList ? 'widget.emptyListTitle' : 'widget.noListsTitle')}
        sub={i18n.t(isEmptyList ? 'widget.emptyListSub' : 'widget.noListsSub')}
        action={i18n.t('widget.openApp')}
      />,
    );
    return;
  }

  // 단어가 바뀌었으면 뜻은 다시 가린다 — 앞 단어에서 열어 둔 상태가 따라오면 안 된다.
  const revealed = state.wordId === content.word.id ? state.revealed : false;
  const next: WidgetState = {
    ...state,
    wordId: content.word.id,
    listId: content.listId,
    mode: content.mode,
    revealed,
  };
  await saveWidgetState(widgetId, next);

  props.renderWidget(
    <WordWidget
      mode={content.mode}
      term={content.word.term}
      meaning={content.word.meaningKr || content.word.definition}
      listTitle={content.listTitle}
      revealed={revealed}
      done={content.done}
      cap={content.mode === 'review' ? WIDGET_REVIEW_DAILY_CAP : WIDGET_NEW_DAILY_CAP}
      wordId={content.word.id}
    />,
  );
}
