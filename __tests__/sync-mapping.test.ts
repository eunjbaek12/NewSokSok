import {
  cloudListToVocaList,
  cloudWordToWord,
  wordToCloudRow,
  dbRowToWord,
} from '../features/sync/mapping';
import type { CloudList, CloudWord, Word } from '../shared/contracts';

const cloudWord = (over: Partial<CloudWord> = {}): CloudWord => ({
  id: 'W1', listId: 'L1', userId: 'U', term: 't', definition: 'd',
  phonetic: null, pos: null, exampleEn: 'e', exampleKr: null, meaningKr: 'm',
  isMemorized: false, isStarred: false, tags: '["x"]', position: 0,
  wrongCount: 0, assignedDay: null, sourceLang: 'en', targetLang: 'ko',
  lastReviewedAt: null, reviewSuccessCount: 0,
  baseForm: null, inflection: null,
  createdAt: 1, updatedAt: 2, deletedAt: null,
  ...over,
});

describe('sync/mapping', () => {
  test('cloudWordToWord: parses JSON tags, null-safe', () => {
    const w = cloudWordToWord(cloudWord());
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

  // ─── Gentle SRS 복습 상태 동기화 (§7) ──────────────────────────────────────
  //
  // 이 컬럼들이 매퍼에서 새면 재설치·기기 변경 시 복습 진도가 통째로 리셋되고,
  // 클라이언트가 NULL을 "due 아님"으로 취급하므로 그 단어들은 영영 복습에 안 걸린다.

  describe('복습 상태', () => {
    const word = (over: Partial<Word> = {}): Word => ({
      id: 'W1', term: 't', definition: 'd', exampleEn: 'e', meaningKr: 'm',
      isMemorized: true, isStarred: false, tags: [], createdAt: 1,
      ...over,
    });

    test('push: 복습 상태가 snake_case 행으로 실린다', () => {
      const row = wordToCloudRow(word({ lastReviewedAt: 1700, reviewSuccessCount: 3 }), 'L1');
      expect(row.last_reviewed_at).toBe(1700);
      expect(row.review_success_count).toBe(3);
    });

    test('push: 학습 이력이 없으면 0이 아니라 null로 올린다', () => {
      // 0으로 뭉개면 1970-01-01이 되어 복원한 기기에서 즉시 due로 쏟아진다.
      const row = wordToCloudRow(word({ lastReviewedAt: null }), 'L1');
      expect(row.last_reviewed_at).toBeNull();
      expect(row.review_success_count).toBe(0);
    });

    test('pull(dbRowToWord): 복습 상태가 로컬 도메인으로 돌아온다', () => {
      const w = dbRowToWord({
        id: 'W1', term: 't', is_memorized: true, is_starred: false,
        last_reviewed_at: 1700, review_success_count: 3,
      });
      expect(w.lastReviewedAt).toBe(1700);
      expect(w.reviewSuccessCount).toBe(3);
    });

    test('pull: 018 이전 빌드가 올린 행(컬럼 없음)은 null/0으로 안전 착지', () => {
      const w = dbRowToWord({ id: 'W1', term: 't', is_memorized: true, is_starred: false });
      expect(w.lastReviewedAt).toBeNull();
      expect(w.reviewSuccessCount).toBe(0);
    });

    test('cloudWordToWord도 복습 상태를 옮긴다', () => {
      const w = cloudWordToWord(cloudWord({ lastReviewedAt: 1700, reviewSuccessCount: 5 }));
      expect(w.lastReviewedAt).toBe(1700);
      expect(w.reviewSuccessCount).toBe(5);
    });

    test('왕복(push → pull)에서 값이 보존된다', () => {
      const original = word({ lastReviewedAt: 1700, reviewSuccessCount: 3 });
      const row = wordToCloudRow(original, 'L1');
      // 서버를 거쳐 돌아온 행을 흉내낸다(스네이크 케이스 그대로 내려온다).
      const back = dbRowToWord({ ...row, is_memorized: row.is_memorized, is_starred: row.is_starred });
      expect(back.lastReviewedAt).toBe(original.lastReviewedAt);
      expect(back.reviewSuccessCount).toBe(original.reviewSuccessCount);
    });
  });
});
