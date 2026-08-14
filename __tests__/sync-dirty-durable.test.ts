/**
 * `markWordsDirtyDurable` — hydrate 이전에 불려도 저장된 dirty를 지우지 않는다.
 *
 * 왜 이 테스트가 있나: 마이그레이션 019(큐레이션 덱 언어쌍 정정)가 고친 단어를 dirty로
 * 마킹해야 서버까지 반영되는데, 마이그레이션은 DB 초기화 시점이라 `hydrateDirty()`보다
 * 먼저 돌 수 있다. 그때 평소 경로(`markWordsDirty`)를 쓰면 메모리가 빈 Set이라
 * AsyncStorage를 자기 id로만 덮어써 **오프라인에서 고쳐 둔 기존 dirty가 통째로 날아간다**
 * — 그 수정은 서버에 영영 못 올라간다.
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: async (k: string, v: string) => { mem.set(k, v); },
      removeItem: async (k: string) => { mem.delete(k); },
      __mem: mem,
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncStore } from '@/features/sync/store';

const DIRTY_WORDS_KEY = '@soksok_dirty_words';
const stored = async (): Promise<string[]> => {
  const raw = await AsyncStorage.getItem(DIRTY_WORDS_KEY);
  return raw ? JSON.parse(raw) : [];
};

beforeEach(async () => {
  await AsyncStorage.removeItem(DIRTY_WORDS_KEY);
  useSyncStore.setState({ dirtyWordIds: new Set() });
});

describe('markWordsDirtyDurable', () => {
  it('hydrate 전에 불려도 저장된 dirty를 보존한다', async () => {
    // 지난 실행에서 오프라인 수정이 쌓여 있고, 아직 hydrate되지 않은 상태.
    await AsyncStorage.setItem(DIRTY_WORDS_KEY, JSON.stringify(['offline-1', 'offline-2']));
    expect(useSyncStore.getState().dirtyWordIds.size).toBe(0);

    await useSyncStore.getState().markWordsDirtyDurable(['migrated-1']);

    expect((await stored()).sort()).toEqual(['migrated-1', 'offline-1', 'offline-2']);
    expect([...useSyncStore.getState().dirtyWordIds].sort())
      .toEqual(['migrated-1', 'offline-1', 'offline-2']);
  });

  it('평소 경로(markWordsDirty)는 같은 상황에서 저장분을 잃는다 — 이 차이가 존재 이유다', async () => {
    await AsyncStorage.setItem(DIRTY_WORDS_KEY, JSON.stringify(['offline-1']));

    useSyncStore.getState().markWordsDirty(['migrated-1']);
    await new Promise(r => setTimeout(r, 0)); // persistSet은 fire-and-forget

    expect(await stored()).toEqual(['migrated-1']);
  });

  it('메모리에 이미 있는 id도 함께 유지한다', async () => {
    await AsyncStorage.setItem(DIRTY_WORDS_KEY, JSON.stringify(['stored-1']));
    useSyncStore.setState({ dirtyWordIds: new Set(['memory-1']) });

    await useSyncStore.getState().markWordsDirtyDurable(['new-1']);

    expect((await stored()).sort()).toEqual(['memory-1', 'new-1', 'stored-1']);
  });

  it('중복은 합쳐지고 빈 입력은 저장분을 그대로 둔다', async () => {
    await AsyncStorage.setItem(DIRTY_WORDS_KEY, JSON.stringify(['a', 'b']));

    await useSyncStore.getState().markWordsDirtyDurable(['b', 'c', 'c']);
    expect((await stored()).sort()).toEqual(['a', 'b', 'c']);

    await useSyncStore.getState().markWordsDirtyDurable([]);
    expect((await stored()).sort()).toEqual(['a', 'b', 'c']);
  });

  it('읽기에 실패하면 저장분을 덮어쓰지 않고 메모리에만 남긴다', async () => {
    await AsyncStorage.setItem(DIRTY_WORDS_KEY, JSON.stringify(['keep-me']));
    const original = AsyncStorage.getItem;
    (AsyncStorage as any).getItem = async () => { throw new Error('read failed'); };

    try {
      await useSyncStore.getState().markWordsDirtyDurable(['new-1']);
    } finally {
      (AsyncStorage as any).getItem = original;
    }

    // 저장된 값은 손대지 않았다 — 나중 hydrate가 둘을 합친다.
    expect(await stored()).toEqual(['keep-me']);
    expect([...useSyncStore.getState().dirtyWordIds]).toEqual(['new-1']);
  });
});
