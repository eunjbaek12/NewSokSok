/**
 * "AI가 찾지 못한 단어" 기억 — `@soksok_bare_unfillable`.
 *
 * 없으면 이 단어들이 **매 배치의 맨 앞을 영구히 차지한다.** 채우는 순서가 오래된 것부터인데
 * 못 채운 단어는 영원히 반쪽으로 남아 자리를 지키기 때문이다. 잔량이 5인데 앞의 5개가
 * 그런 단어면 사용자는 누를 때마다 0개를 받는다(한도는 404 환불로 안 깎이지만 배치 칸은
 * 그들이 다 먹는다). 시간이 갈수록 채울 수 있는 단어가 뒤로 밀린다.
 *
 * 🔴 **표시는 `isReal === false` 일 때만 한다.** `null`(네트워크·타임아웃 실패)로 표시하면
 * 안 된다 — 큐에 2차 패스가 있는 이유가 "1차 null 이 진짜 실패가 아니어서"이고, null 로
 * 은퇴시키면 지하철에서 한 번 누른 것만으로 멀쩡한 단어가 영구히 빠진다.
 *
 * 🔑 로컬 전용이고 동기화하지 않는다. §8 이 `enrichment_level` 컬럼을 기각한 근거가 그대로
 * 적용된다 — 이건 기기별 표시 힌트이고, 다른 기기에서 한 번 더 시도하는 것이 비용의 전부다.
 *
 * 해제는 두 가지로 일어난다:
 *   1. 사용자가 표제어를 고치면 — 오타를 고친 것이므로 다시 대상이 된다(호출부가 지운다).
 *   2. 단어가 더 이상 반쪽이 아니면 — 어떤 경로로든 채워졌으니 기억할 이유가 없다.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@soksok_bare_unfillable';

/** 단어 id 집합. 읽기 실패·깨진 값은 빈 집합 — 표시 힌트라 잃어도 한 번 더 시도할 뿐이다. */
export async function loadUnfillable(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

async function save(ids: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    // 표시 힌트라 실패해도 기능을 막지 않는다.
  }
}

/** AI 가 못 찾은 단어들을 기억에 더한다. */
export async function markUnfillable(wordIds: string[]): Promise<void> {
  if (wordIds.length === 0) return;
  const ids = await loadUnfillable();
  for (const id of wordIds) ids.add(id);
  await save(ids);
}

/** 표제어를 고쳤거나 어떤 경로로든 채워진 단어를 기억에서 지운다. */
export async function clearUnfillable(wordIds: string[]): Promise<void> {
  if (wordIds.length === 0) return;
  const ids = await loadUnfillable();
  let changed = false;
  for (const id of wordIds) if (ids.delete(id)) changed = true;
  if (changed) await save(ids);
}

/**
 * 더 이상 반쪽이 아닌 id 를 기억에서 걷어낸다.
 *
 * 단어를 지우거나 다른 단어장으로 옮겨도 id 가 남아 기억이 무한히 자라는 것을 막는다 —
 * 화면이 자기가 아는 반쪽 id 목록을 주면 그 밖은 전부 버린다.
 */
export async function pruneUnfillable(stillBareIds: Set<string>): Promise<void> {
  const ids = await loadUnfillable();
  const kept = new Set([...ids].filter(id => stillBareIds.has(id)));
  if (kept.size !== ids.size) await save(kept);
}
