/**
 * 배너 표시 상태 저장 — `@soksok_bare_notice`.
 *
 * 기기별 표시 상태라 **동기화하지 않는다**(dirty 표시도 하지 않는다). 다른 기기에서
 * 닫았다고 이 기기에서 안 뜰 이유가 없고, 반대도 마찬가지다.
 *
 * 규칙 자체는 notice.ts 의 순수 함수에 있다 — 여기는 읽고 쓰기만 한다.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BareNoticeEntry, BareNoticeMap } from './notice';

const KEY = '@soksok_bare_notice';

/** 읽기 실패·깨진 값은 빈 맵으로 — 표시 상태라 잃어도 배너가 한 번 더 뜰 뿐이다. */
export async function loadBareNotice(): Promise<BareNoticeMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as BareNoticeMap;
  } catch {
    return {};
  }
}

/**
 * 한 단어장의 항목을 쓴다. `undefined`를 주면 그 항목을 지운다.
 * 다른 단어장의 항목은 건드리지 않으려고 읽고-합치고-쓴다.
 */
export async function saveBareNoticeEntry(
  listId: string,
  entry: BareNoticeEntry | undefined,
): Promise<void> {
  try {
    const map = await loadBareNotice();
    if (entry) map[listId] = entry;
    else delete map[listId];
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // 표시 상태라 실패해도 기능을 막지 않는다.
  }
}

/** 단어장을 지웠을 때 남은 항목을 치운다. */
export async function forgetBareNotice(listId: string): Promise<void> {
  await saveBareNoticeEntry(listId, undefined);
}
