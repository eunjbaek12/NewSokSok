import { getDb, closeDb } from '../lib/db';
import { addWord, createList, getLists, initSeedDataIfEmpty } from '../features/vocab/db';

// Mock Expo SQLite since we are in Node
jest.mock('expo-sqlite', () => {
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(':memory:');

    return {
        openDatabaseAsync: async () => {
            // Return an object that matches our usage
            return {
                execAsync: (sql: string) => {
                    return new Promise<void>((resolve, reject) => {
                        db.exec(sql, (err: any) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                },
                runAsync: (sql: string, params: any[] = []) => {
                    return new Promise<void>((resolve, reject) => {
                        db.run(sql, params, function (err: any) {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                },
                getFirstAsync: (sql: string, params: any[] = []) => {
                    return new Promise<any>((resolve, reject) => {
                        db.get(sql, params, (err: any, row: any) => {
                            if (err) reject(err);
                            else resolve(row);
                        });
                    });
                },
                getAllAsync: (sql: string, params: any[] = []) => {
                    return new Promise<any[]>((resolve, reject) => {
                        db.all(sql, params, (err: any, rows: any) => {
                            if (err) reject(err);
                            else resolve(rows || []);
                        });
                    });
                },
                withTransactionAsync: async (cb: () => Promise<void>) => {
                    // sqlite3 doesn't have native async transaction wrapper, so we just run cb
                    await cb();
                },
                closeAsync: async () => {
                    db.close();
                }
            };
        }
    };
});

describe('features/vocab/db - addWord', () => {
    let listId: string;

    beforeAll(async () => {
        // Requires sqlite3 for the mock
        const db = await getDb();
        await initSeedDataIfEmpty();
        const lists = await getLists();
        if (lists.length === 0) {
            const newList = await createList('Test List');
            listId = newList.id;
        } else {
            listId = lists[0].id;
        }
    });

    afterAll(async () => {
        await closeDb();
    });

    it('should add a word successfully to an existing list', async () => {
        expect(listId).toBeDefined();

        const wordData = {
            term: 'Jest',
            definition: 'Delightful',
            exampleEn: 'I use Jest.',
            exampleKr: '나는 Jest를 사용한다.',
            meaningKr: '테스트',
            tags: ['test'],
            isStarred: false,
        };

        const newWord = await addWord(listId, wordData);

        expect(newWord.id).toBeDefined();
        expect(newWord.term).toBe('Jest');
        expect(newWord.tags).toEqual(['test']);

        // Check DB
        const lists = await getLists();
        const targetList = lists.find((l: any) => l.id === listId);
        expect(targetList).toBeDefined();
        if (targetList) {
            const dbWord = targetList.words.find((w: any) => w.id === newWord.id);
            expect(dbWord).toBeDefined();
            expect(dbWord?.term).toBe('Jest');
        }
    });
});

describe('features/vocab/db - setWordsMemorized', () => {
    let listId: string;
    let wordIds: string[] = [];

    beforeAll(async () => {
        await getDb();
        const lists = await getLists();
        listId = lists[0].id;

        // Add two words
        const w1 = await addWord(listId, { term: 'Word1', meaningKr: '뜻1', isStarred: false } as any);
        const w2 = await addWord(listId, { term: 'Word2', meaningKr: '뜻2', isStarred: false } as any);
        wordIds = [w1.id, w2.id];
    });

    it('should update multiple words to memorized status in one batch', async () => {
        const { setWordsMemorized } = require('../features/vocab/db');
        await setWordsMemorized(listId, wordIds, true);

        const lists = await getLists();
        const targetList = lists.find((l: any) => l.id === listId);
        const words = targetList?.words.filter((w: any) => wordIds.includes(w.id));

        expect(words).toHaveLength(2);
        expect(words?.every((w: any) => w.isMemorized)).toBe(true);
    });
});
