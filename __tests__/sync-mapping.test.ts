import { cloudListToVocaList, cloudWordToWord } from '../features/sync/mapping';
import type { CloudList, CloudWord } from '../shared/contracts';

describe('sync/mapping', () => {
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
