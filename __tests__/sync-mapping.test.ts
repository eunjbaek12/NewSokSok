import { vocaListToCloudPush, wordToCloudPush, cloudListToVocaList, cloudWordToWord } from '../features/sync/mapping';
import type { VocaList, Word, CloudList, CloudWord } from '../shared/contracts';

describe('sync/mapping', () => {
  const fullList: VocaList = {
    id: 'L1',
    title: 'Test',
    words: [],
    isVisible: true,
    createdAt: 1000,
    lastStudiedAt: 1500,
    position: 42,
    isCurated: false,
    icon: '📘',
    planTotalDays: 7,
    planCurrentDay: 2,
    planWordsPerDay: 10,
    planStartedAt: 900,
    planUpdatedAt: 1400,
    planFilter: 'unmemorized',
    sourceLanguage: 'en',
    targetLanguage: 'ko',
    lastResultMemorized: 5,
    lastResultTotal: 10,
    lastResultPercent: 50,
  };

  test('vocaListToCloudPush: coerces null defaults + omits userId/updatedAt', () => {
    const push = vocaListToCloudPush(fullList);
    expect(push).toMatchObject({
      id: 'L1',
      title: 'Test',
      planFilter: 'unmemorized',
      isUserShared: false,
      creatorId: null,
      creatorName: null,
      downloadCount: 0,
      deletedAt: null,
    });
    expect('userId' in push).toBe(false);
    expect('updatedAt' in push).toBe(false);
  });

  test('vocaListToCloudPush: deletedAt forwarded', () => {
    const push = vocaListToCloudPush(fullList, { deletedAt: 9999 });
    expect(push.deletedAt).toBe(9999);
  });

  test('wordToCloudPush: empty-string coercion for NOT NULL columns', () => {
    const w = { id: 'W1', term: 't', isMemorized: false, isStarred: false, tags: [] } as unknown as Word;
    const push = wordToCloudPush(w, 'L1');
    expect(push.definition).toBe('');
    expect(push.exampleEn).toBe('');
    expect(push.meaningKr).toBe('');
    expect(push.tags).toBeNull(); // empty array → null JSON
  });

  test('wordToCloudPush: tags serialized when non-empty', () => {
    const w: Word = {
      id: 'W1', term: 't', definition: 'd', exampleEn: 'e', meaningKr: 'm',
      isMemorized: false, isStarred: false, tags: ['a', 'b'],
    };
    const push = wordToCloudPush(w, 'L1');
    expect(push.tags).toBe('["a","b"]');
  });

  test('cloudWordToWord: parses JSON tags, null-safe', () => {
    const c = {
      id: 'W1', listId: 'L1', userId: 'U', term: 't', definition: 'd',
      phonetic: null, pos: null, exampleEn: 'e', exampleKr: null, meaningKr: 'm',
      isMemorized: false, isStarred: false, tags: '["x"]', position: 0,
      wrongCount: 0, assignedDay: null, sourceLang: 'en', targetLang: 'ko',
      createdAt: 1, updatedAt: 2, deletedAt: null,
    } as CloudWord;
    const w = cloudWordToWord(c);
    expect(w.tags).toEqual(['x']);
  });

  test('cloudListToVocaList: round-trips fields', () => {
    const c: CloudList = {
      id: 'L1',
      userId: 'U',
      title: 'Test',
      isVisible: true,
      isCurated: false,
      icon: '📘',
      position: 42,
      planTotalDays: 7,
      planCurrentDay: 2,
      planWordsPerDay: 10,
      planStartedAt: 900,
      planUpdatedAt: 1400,
      planFilter: 'unmemorized',
      sourceLanguage: 'en',
      targetLanguage: 'ko',
      lastResultMemorized: 5,
      lastResultTotal: 10,
      lastResultPercent: 50,
      lastStudiedAt: 1500,
      isUserShared: false,
      creatorId: null,
      creatorName: null,
      downloadCount: 0,
      createdAt: 1000,
      updatedAt: 2000,
      deletedAt: null,
    };
    const back = cloudListToVocaList(c);
    expect(back.id).toBe('L1');
    expect(back.planFilter).toBe('unmemorized');
    expect(back.icon).toBe('📘');
  });
});
