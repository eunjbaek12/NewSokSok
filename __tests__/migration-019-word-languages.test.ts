/**
 * migration 019(큐레이션 덱 언어쌍 정정)를 **실제 SQLite 엔진** 위에서 검증한다.
 *
 * 018과 같은 이유로 엔진을 직접 돌린다 — 정정은 SQL 한 덩어리라 순수 함수로 못 나누고,
 * 조건을 하나만 틀려도 사용자가 직접 만든 단어장을 덮어쓰는 되돌리기 어려운 사고가 된다.
 *
 * 001→018 사다리를 먼저 태우고 오염 데이터를 넣은 뒤 019만 올린다 — 실제 업그레이드
 * (018까지 쓰던 기기가 019로 올라옴)와 같은 순서다.
 *
 * node:sqlite는 Node 22.5+ 내장(실험적). 없는 런타임에서는 스킵한다.
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: async (k: string, v: string) => { mem.set(k, v); },
      removeItem: async (k: string) => { mem.delete(k); },
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { MIGRATIONS } from '../lib/db/migrations';
import { useSyncStore } from '@/features/sync/store';

type Db = {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, ...p: any[]) => Promise<void>;
  getAllAsync: <T>(sql: string, ...p: any[]) => Promise<T[]>;
};

let DatabaseSync: any;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  DatabaseSync = null;
}

const describeIfSqlite = DatabaseSync ? describe : describe.skip;

function open() {
  const raw = new DatabaseSync(':memory:');
  const db: Db = {
    execAsync: async (sql: string) => { raw.exec(sql); },
    runAsync: async (sql: string, ...params: any[]) => {
      const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      raw.prepare(sql).run(...flat);
    },
    getAllAsync: async <T>(sql: string, ...params: any[]) => {
      const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      return raw.prepare(sql).all(...flat) as T[];
    },
  };
  const all = (sql: string, ...p: any[]) => raw.prepare(sql).all(...p) as any[];
  return { db, all };
}

async function migrateTo(db: Db, to: number, from = 0) {
  for (const m of MIGRATIONS.filter(m => m.version > from && m.version <= to)) {
    await m.up(db as any);
  }
}

const list = (db: Db, id: string, curated: number, src: string, tgt: string, deleted: number | null = null) =>
  db.runAsync(
    `INSERT INTO lists (id, title, isVisible, createdAt, lastStudiedAt, isCurated,
                        sourceLanguage, targetLanguage, deletedAt)
     VALUES (?, '덱', 1, 0, 0, ?, ?, ?, ?)`,
    id, curated, src, tgt, deleted,
  );

const word = (db: Db, id: string, listId: string, src: string | null, tgt: string | null, deleted: number | null = null) =>
  db.runAsync(
    `INSERT INTO words (id, listId, term, definition, exampleEn, meaningKr, isMemorized,
                        sourceLang, targetLang, deletedAt)
     VALUES (?, ?, ?, '', '', '뜻', 0, ?, ?, ?)`,
    id, listId, id, src, tgt, deleted,
  );

describeIfSqlite('migration 019 — 큐레이션 덱 언어쌍 정정', () => {
  beforeEach(async () => {
    await AsyncStorage.removeItem('@soksok_dirty_words');
    useSyncStore.setState({ dirtyWordIds: new Set() });
  });

  async function setup() {
    const { db, all } = open();
    await migrateTo(db, 18);
    // L1 큐레이션 ko>en (오염됨) · L2 큐레이션 en>ko (정상) · L3 사용자 리스트 · L4 zh>ko
    await list(db, 'L1', 1, 'ko', 'en');
    await list(db, 'L2', 1, 'en', 'ko');
    await list(db, 'L3', 0, 'en', 'ko');
    await list(db, 'L4', 1, 'zh', 'ko');
    await word(db, 'w1', 'L1', 'en', 'ko');        // 오염 → ko>en 으로
    await word(db, 'w2', 'L1', 'ko', 'en');        // 이미 정상
    await word(db, 'w3', 'L2', 'en', 'ko');        // 정상 덱의 정상 단어
    await word(db, 'w4', 'L3', 'en', 'ko');        // 사용자 리스트 — 손대지 않는다
    await word(db, 'w5', 'L1', 'en', 'ko', 12345); // 삭제된 단어
    await word(db, 'w6', 'L4', null, null);        // 언어가 NULL
    await migrateTo(db, 19, 18);
    const langs = Object.fromEntries(
      all(`SELECT id, sourceLang, targetLang FROM words`).map(r => [r.id, `${r.sourceLang}>${r.targetLang}`]),
    );
    return { db, all, langs };
  }

  test('큐레이션 덱의 오염된 단어만 리스트 언어로 정정된다', async () => {
    const { langs } = await setup();
    expect(langs.w1).toBe('ko>en');   // 정정
    expect(langs.w2).toBe('ko>en');   // 이미 정상 — 무변경
    expect(langs.w3).toBe('en>ko');   // 정상 덱 — 무변경
  });

  test('사용자가 만든 리스트(isCurated=0)는 건드리지 않는다', async () => {
    const { langs } = await setup();
    expect(langs.w4).toBe('en>ko');
  });

  test('삭제된 단어는 건드리지 않는다', async () => {
    const { langs } = await setup();
    expect(langs.w5).toBe('en>ko');
  });

  test('언어가 NULL인 단어도 정정된다 (!= 였으면 놓친다)', async () => {
    const { langs } = await setup();
    expect(langs.w6).toBe('zh>ko');
  });

  test('정정한 단어만 dirty로 마킹된다 — 이게 없으면 서버는 영영 그대로다', async () => {
    await setup();
    const marked = [...useSyncStore.getState().dirtyWordIds].sort();
    expect(marked).toEqual(['w1', 'w6']);
    const stored = JSON.parse((await AsyncStorage.getItem('@soksok_dirty_words'))!) as string[];
    expect(stored.sort()).toEqual(['w1', 'w6']);
  });

  test('hydrate 전에 돌아도 기존 dirty를 잃지 않는다', async () => {
    await AsyncStorage.setItem('@soksok_dirty_words', JSON.stringify(['offline-edit']));
    await setup();
    const stored = JSON.parse((await AsyncStorage.getItem('@soksok_dirty_words'))!) as string[];
    expect(stored.sort()).toEqual(['offline-edit', 'w1', 'w6']);
  });

  test('다시 돌려도 고칠 것이 없다 (멱등)', async () => {
    const { db, all } = await setup();
    const before = all(`SELECT id, sourceLang, targetLang FROM words ORDER BY id`);
    await migrateTo(db, 19, 18);
    expect(all(`SELECT id, sourceLang, targetLang FROM words ORDER BY id`)).toEqual(before);
  });
});
