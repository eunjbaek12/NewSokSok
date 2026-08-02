/**
 * Migration 015 검증: words unique 키가
 * (listId, LOWER(TRIM(term)), sourceLang, targetLang)로 확장됐는지.
 *
 * - 같은 (term, sourceLang, targetLang) 재추가 → DUPLICATE_WORD (회귀 방지)
 * - 같은 term + 다른 targetLang → 모두 성공 (옵션 1 핵심 동작)
 * - 같은 term + 다른 sourceLang → 모두 성공 (덤)
 */

import { getDb, closeDb } from '../lib/db';
import { addWord, createList, getLists, initSeedDataIfEmpty } from '../features/vocab/db';

jest.mock('expo-sqlite', () => {
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(':memory:');
    return {
        openDatabaseAsync: async () => ({
            execAsync: (sql: string) => new Promise<void>((resolve, reject) => {
                db.exec(sql, (err: any) => (err ? reject(err) : resolve()));
            }),
            runAsync: (sql: string, params: any[] = []) => new Promise<void>((resolve, reject) => {
                db.run(sql, params, function (err: any) { err ? reject(err) : resolve(); });
            }),
            getFirstAsync: (sql: string, params: any[] = []) => new Promise<any>((resolve, reject) => {
                db.get(sql, params, (err: any, row: any) => (err ? reject(err) : resolve(row)));
            }),
            getAllAsync: (sql: string, params: any[] = []) => new Promise<any[]>((resolve, reject) => {
                db.all(sql, params, (err: any, rows: any) => (err ? reject(err) : resolve(rows || [])));
            }),
            withTransactionAsync: async (cb: () => Promise<void>) => { await cb(); },
            closeAsync: async () => { db.close(); },
        }),
    };
});

describe('migration 015 — words unique key on (listId, term, sourceLang, targetLang)', () => {
    let listId: string;

    beforeAll(async () => {
        await getDb();
        await initSeedDataIfEmpty({ listTitle: 'Sample', words: [] });
        const list = await createList('Unique Test List');
        listId = list.id;
    });

    afterAll(async () => {
        await closeDb();
    });

    it('throws DUPLICATE_WORD when (term, sourceLang, targetLang) all match', async () => {
        await addWord(listId, { term: 'apple', meaningKr: '사과', sourceLang: 'en', targetLang: 'ko' } as any);
        await expect(
            addWord(listId, { term: 'apple', meaningKr: '사과2', sourceLang: 'en', targetLang: 'ko' } as any),
        ).rejects.toThrow('DUPLICATE_WORD');
    });

    it('allows the same term with a different targetLang', async () => {
        // 위 테스트가 'apple/en→ko'를 이미 넣었음. 같은 term을 ja로 추가 → 통과해야 함.
        const jp = await addWord(listId, { term: 'apple', meaningKr: 'りんご', sourceLang: 'en', targetLang: 'ja' } as any);
        expect(jp.id).toBeDefined();

        const es = await addWord(listId, { term: 'apple', meaningKr: 'manzana', sourceLang: 'en', targetLang: 'es' } as any);
        expect(es.id).toBeDefined();

        // 같은 (term, source, target) 재시도는 여전히 막힘
        await expect(
            addWord(listId, { term: 'apple', meaningKr: 'りんご (dup)', sourceLang: 'en', targetLang: 'ja' } as any),
        ).rejects.toThrow('DUPLICATE_WORD');
    });

    it('allows the same term with a different sourceLang', async () => {
        // 같은 단어장 안에서 source까지 다를 수 있는 케이스 — 디자인상 word.sourceLang 컬럼이
        // 존재하므로 통과해야 한다.
        const w1 = await addWord(listId, { term: 'banana', meaningKr: '바나나', sourceLang: 'en', targetLang: 'ko' } as any);
        const w2 = await addWord(listId, { term: 'banana', meaningKr: '바나나(es)', sourceLang: 'es', targetLang: 'ko' } as any);
        expect(w1.id).toBeDefined();
        expect(w2.id).toBeDefined();
    });

    it('normalizes term (case + trim) inside the unique key', async () => {
        await addWord(listId, { term: 'cherry', meaningKr: '체리', sourceLang: 'en', targetLang: 'ko' } as any);
        // 대소문자/공백만 다른 재시도는 막혀야 함
        await expect(
            addWord(listId, { term: '  CHERRY ', meaningKr: '체리2', sourceLang: 'en', targetLang: 'ko' } as any),
        ).rejects.toThrow('DUPLICATE_WORD');
        // 다른 targetLang은 통과
        const ja = await addWord(listId, { term: 'Cherry', meaningKr: 'チェリー', sourceLang: 'en', targetLang: 'ja' } as any);
        expect(ja.id).toBeDefined();
    });
});
