/**
 * 위젯 헤드리스 핸들러 — **앱이 꺼져 있어도** 안드로이드가 부른다.
 *
 * 지금은 진단판이다(`./DiagnosticWidget` 주석 참조). 실기에서 두 수치를 읽고 나면
 * 여기가 진짜 위젯의 데이터 계층이 된다: 복습 → 미암기 순으로 단어를 고르고,
 * 판정은 `commitSessionResults` 한 곳을 지나며, 그 Day 의 암기 비율이 50% 를 넘으면
 * `updatePlanProgress` 로 홈 카드의 Day 도 넘긴다(9/18 확정).
 *
 * 🔴 **`getDb()` 를 부르지 않는다.** 그 함수는 열면서 마이그레이션 사다리를 돈다 —
 * 앱이 꺼진 채 위젯이 스키마를 바꾸는 일은 없어야 한다. 진단은 읽기만 하므로 직접 연다.
 */
import React from 'react';
import * as SQLite from 'expo-sqlite';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { DiagnosticWidget, type DiagnosticData } from './DiagnosticWidget';

declare global {
  var __WIDGET_ENTRY_START: number | undefined;
  var __WIDGET_ENTRY_READY: number | undefined;
}

interface DbProbe {
  ok: boolean;
  headline: string;
  meaning: string;
  schema: number;
  dbMs: number;
}

/**
 * DB 를 열어 안 외운 단어 한 줄을 읽는다. 실패해도 던지지 않고 **메시지를 돌려준다** —
 * 위젯이 빈 얼굴로 남으면 무엇이 막혔는지 알 길이 없다.
 */
async function probeDb(): Promise<DbProbe> {
  const started = Date.now();
  let db: SQLite.SQLiteDatabase | null = null;
  try {
    db = await SQLite.openDatabaseAsync('soksok_voca.db');
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const row = await db.getFirstAsync<{ term: string; meaningKr: string }>(
      'SELECT term, meaningKr FROM words WHERE isMemorized = 0 ORDER BY rowid LIMIT 1',
    );
    return {
      ok: true,
      headline: row?.term ?? '(안 외운 단어 없음)',
      meaning: row?.meaningKr ?? '',
      schema: version?.user_version ?? 0,
      dbMs: Date.now() - started,
    };
  } catch (e) {
    return {
      ok: false,
      headline: e instanceof Error ? e.message : String(e),
      meaning: '',
      schema: -1,
      dbMs: Date.now() - started,
    };
  } finally {
    // 헤드리스 컨텍스트는 곧 사라지지만, WAL 락을 남긴 채 죽지 않게 닫아 둔다.
    try {
      await db?.closeAsync();
    } catch {
      // 닫기 실패는 진단 결과를 바꾸지 않는다.
    }
  }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetAction === 'WIDGET_DELETED') return;

  const enteredAt = Date.now();
  const entryStart = globalThis.__WIDGET_ENTRY_START ?? enteredAt;
  const entryReady = globalThis.__WIDGET_ENTRY_READY ?? enteredAt;

  const previousTaps = Number(props.clickActionData?.taps ?? 0);
  const taps = props.widgetAction === 'WIDGET_CLICK' ? previousTaps + 1 : previousTaps;

  const probe = await probeDb();

  const data: DiagnosticData = {
    ...probe,
    // 앱 번들을 불러오는 데 걸린 시간. 이 컨텍스트가 이번 탭에 새로 떴다면
    // 사용자가 기다린 시간의 대부분이 이 값이다.
    bundleMs: entryReady - entryStart,
    // 컨텍스트 나이. 수백 ms 면 방금 떴다는 뜻이고, 몇 분이면 이미 살아 있던 것이다 —
    // 첫 탭과 두 번째 탭이 왜 다른지가 이 한 값으로 갈린다.
    ageMs: enteredAt - entryReady,
    taps,
  };

  props.renderWidget(<DiagnosticWidget data={data} />);
}
