import {
  collectScopeItems,
  selectPickResults,
  countActiveFilters,
  summarizeScope,
  scopeStillExists,
  pickFiltersKey,
  resultsToWords,
  shuffleWords,
  DEFAULT_PICK_FILTERS,
  PRESET_LIMIT,
  type PickFilters,
} from '../features/study/pick/filter';
import { scopeLabel, conditionLabel } from '../features/study/pick/labels';
import { applyStudySelection } from '../features/study/store';
import type { Word, VocaList } from '../lib/types';

// ─── Factories ────────────────────────────────────────────────────────────────

let seq = 0;
const word = (over: Partial<Word> = {}): Word => ({
  id: `w${++seq}`, term: 'apple', definition: '', exampleEn: '', meaningKr: '사과',
  isMemorized: false, isStarred: false, tags: [], assignedDay: null,
  ...over,
});

const list = (id: string, title: string, words: Word[], over: Partial<VocaList> = {}): VocaList => ({
  id, title, words, isVisible: true, createdAt: 0, ...over,
});

const filters = (over: Partial<PickFilters> = {}): PickFilters => ({ ...DEFAULT_PICK_FILTERS, ...over });

/** i18n 없이 라벨을 검사하기 위한 t 대역 — 키와 보간값을 그대로 드러낸다. */
const t = (key: string, opts?: any) =>
  opts ? `${key}(${Object.entries(opts).map(([k, v]) => `${k}=${v}`).join(',')})` : key;

// ─── collectScopeItems ────────────────────────────────────────────────────────

describe('collectScopeItems', () => {
  const a = list('a', '토익', [word({ term: 'one', assignedDay: 1 }), word({ term: 'two', assignedDay: 2 })]);
  const b = list('b', '회화', [word({ term: 'three' })]);

  test('전체 단어장이면 모든 단어장의 단어를 모은다', () => {
    expect(collectScopeItems([a, b], filters())).toHaveLength(3);
  });

  test('고른 단어장만 모은다', () => {
    const items = collectScopeItems([a, b], filters({ useAllLists: false, selectedListIds: ['b'] }));
    expect(items.map(i => i.word.term)).toEqual(['three']);
  });

  test('Day를 고르면 그 Day의 단어만', () => {
    const items = collectScopeItems([a, b], filters({
      useAllLists: false, selectedListIds: ['a'], selectedDaysByList: { a: [2] },
    }));
    expect(items.map(i => i.word.term)).toEqual(['two']);
  });

  test("Day가 'all'이면 그 단어장 전체", () => {
    const items = collectScopeItems([a], filters({
      useAllLists: false, selectedListIds: ['a'], selectedDaysByList: { a: 'all' },
    }));
    expect(items).toHaveLength(2);
  });

  test('Day를 골랐는데 배정이 없는 단어는 빠진다', () => {
    const c = list('c', '미배정', [word({ term: 'none', assignedDay: null })]);
    const items = collectScopeItems([c], filters({
      useAllLists: false, selectedListIds: ['c'], selectedDaysByList: { c: [1] },
    }));
    expect(items).toHaveLength(0);
  });

  test('단어장 이름이 결과에 붙는다 — 카드의 단어장 배지가 이 값을 쓴다', () => {
    expect(collectScopeItems([a], filters())[0].listName).toBe('토익');
  });
});

// ─── selectPickResults ────────────────────────────────────────────────────────

describe('selectPickResults', () => {
  const items = (words: Word[]) => words.map(w => ({ word: w, listId: 'a', listName: '토익' }));

  test('질의도 필터도 없고 browse가 꺼져 있으면 빈 결과', () => {
    const pool = items([word(), word()]);
    expect(selectPickResults(pool, '', filters(), false)).toHaveLength(0);
  });

  test('browse면 질의가 없어도 전체를 준다 — 조건으로 고르는 자세', () => {
    const pool = items([word(), word()]);
    expect(selectPickResults(pool, '', filters(), true)).toHaveLength(2);
  });

  test('미암기 필터', () => {
    const pool = items([word({ term: 'a', isMemorized: true }), word({ term: 'b' })]);
    const out = selectPickResults(pool, '', filters({ wordFilter: 'learning' }), false);
    expect(out.map(r => r.word.term)).toEqual(['b']);
  });

  test('별표는 상태와 조합된다 — 단일 선택군에 섞이지 않는 이유', () => {
    const pool = items([
      word({ term: 'a', isMemorized: false, isStarred: true }),
      word({ term: 'b', isMemorized: false, isStarred: false }),
      word({ term: 'c', isMemorized: true, isStarred: true }),
    ]);
    const out = selectPickResults(pool, '', filters({ wordFilter: 'learning', starredOnly: true }), false);
    expect(out.map(r => r.word.term)).toEqual(['a']);
  });

  test('품사 필터', () => {
    const pool = items([word({ term: 'a', pos: 'verb' }), word({ term: 'b', pos: 'noun' })]);
    const out = selectPickResults(pool, '', filters({ posFilter: 'verb' }), false);
    expect(out.map(r => r.word.term)).toEqual(['a']);
  });

  test('태그 필터', () => {
    const pool = items([word({ term: 'a', tags: ['비즈니스'] }), word({ term: 'b', tags: ['여행'] })]);
    const out = selectPickResults(pool, '', filters({ tag: '여행' }), false);
    expect(out.map(r => r.word.term)).toEqual(['b']);
  });

  describe('프리셋', () => {
    test('많이 틀린: 틀린 적 있는 것만, 많이 틀린 순', () => {
      const pool = items([
        word({ term: 'a', wrongCount: 1 }),
        word({ term: 'b', wrongCount: 5 }),
        word({ term: 'c', wrongCount: 0 }),
      ]);
      const out = selectPickResults(pool, '', filters({ wordFilter: 'wrongCount' }), false);
      expect(out.map(r => r.word.term)).toEqual(['b', 'a']);
    });

    test(`많이 틀린: ${PRESET_LIMIT}개에서 잘린다 — 상한이 붙은 유일한 예외`, () => {
      const pool = items(Array.from({ length: 80 }, (_, i) => word({ wrongCount: i + 1 })));
      expect(selectPickResults(pool, '', filters({ wordFilter: 'wrongCount' }), false)).toHaveLength(PRESET_LIMIT);
    });

    test('최근 추가: 만든 순 역순', () => {
      const pool = items([
        word({ term: 'old', createdAt: 100 }),
        word({ term: 'new', createdAt: 300 }),
        word({ term: 'mid', createdAt: 200 }),
      ]);
      const out = selectPickResults(pool, '', filters({ wordFilter: 'recent' }), false);
      expect(out.map(r => r.word.term)).toEqual(['new', 'mid', 'old']);
    });

    test(`최근 추가: ${PRESET_LIMIT}개에서 잘린다`, () => {
      const pool = items(Array.from({ length: 60 }, (_, i) => word({ createdAt: i })));
      expect(selectPickResults(pool, '', filters({ wordFilter: 'recent' }), false)).toHaveLength(PRESET_LIMIT);
    });

    test('프리셋은 다른 필터와 AND로 겹친다', () => {
      const pool = items([
        word({ term: 'a', wrongCount: 9, isStarred: true }),
        word({ term: 'b', wrongCount: 9, isStarred: false }),
      ]);
      const out = selectPickResults(pool, '', filters({ wordFilter: 'wrongCount', starredOnly: true }), false);
      expect(out.map(r => r.word.term)).toEqual(['a']);
    });

    test('프리셋만 켜도 질의 없이 결과가 나온다', () => {
      const pool = items([word({ term: 'a', wrongCount: 2 })]);
      expect(selectPickResults(pool, '', filters({ wordFilter: 'wrongCount' }), false)).toHaveLength(1);
    });
  });

  test('질의가 있으면 관련도 순 — 완전 일치가 앞', () => {
    const pool = items([word({ term: 'pineapple' }), word({ term: 'apple' })]);
    const out = selectPickResults(pool, 'apple', filters(), false);
    expect(out.map(r => r.word.term)).toEqual(['apple', 'pineapple']);
  });

  test('질의와 프리셋을 함께 쓰면 프리셋 정렬이 이긴다', () => {
    const pool = items([
      word({ term: 'apple', wrongCount: 1 }),
      word({ term: 'pineapple', wrongCount: 7 }),
    ]);
    const out = selectPickResults(pool, 'apple', filters({ wordFilter: 'wrongCount' }), false);
    expect(out.map(r => r.word.term)).toEqual(['pineapple', 'apple']);
  });

  test('결과를 자르지 않는다 — 세션을 끊는 일은 배치가 한다', () => {
    const pool = items(Array.from({ length: 1240 }, () => word()));
    expect(selectPickResults(pool, '', filters(), true)).toHaveLength(1240);
  });
});

// ─── 화면 → 학습 세션 왕복 ────────────────────────────────────────────────────

describe('찾은 수와 학습하는 수는 같다', () => {
  // 화면이 하는 일을 그대로 재현한다: 결과 → 단어 → 섞기 → id → 학습 화면의 좁히기.
  // 학습 화면은 `__custom__`을 "보이는 단어장 전부"로 풀어서 받으므로, 좁히기의
  // 입력은 걸러진 세트가 아니라 전체 단어다.
  const handoff = (results: ReturnType<typeof selectPickResults>, allWords: Word[]) =>
    applyStudySelection(allWords, shuffleWords(resultsToWords(results)).map(w => w.id));

  test('137개를 골랐으면 학습 화면도 137개를 받는다', () => {
    const all = Array.from({ length: 200 }, (_, i) => word({ term: `w${i}`, isMemorized: i % 3 === 0 }));
    const pool = all.map(w => ({ word: w, listId: 'a', listName: '토익' }));

    const results = selectPickResults(pool, '', filters({ wordFilter: 'learning' }), true);
    const session = handoff(results, all);

    expect(session).toHaveLength(results.length);
    expect(new Set(session.map(w => w.id))).toEqual(new Set(results.map(r => r.word.id)));
  });

  test('1,240개도 잘리지 않고 그대로 건너간다', () => {
    const all = Array.from({ length: 1240 }, () => word());
    const pool = all.map(w => ({ word: w, listId: 'a', listName: '토익' }));

    expect(handoff(selectPickResults(pool, '', filters(), true), all)).toHaveLength(1240);
  });

  test('프리셋 상한도 그대로 건너간다 — 화면이 50개라 했으면 세션도 50개', () => {
    const all = Array.from({ length: 90 }, (_, i) => word({ wrongCount: i + 1 }));
    const pool = all.map(w => ({ word: w, listId: 'a', listName: '토익' }));

    const results = selectPickResults(pool, '', filters({ wordFilter: 'wrongCount' }), true);
    expect(results).toHaveLength(PRESET_LIMIT);
    expect(handoff(results, all)).toHaveLength(PRESET_LIMIT);
  });

  test('넘긴 순서가 학습 순서다 — 섞은 결과를 학습 화면이 되돌리지 않는다', () => {
    const all = Array.from({ length: 20 }, (_, i) => word({ term: `w${i}` }));
    const ids = [all[7].id, all[2].id, all[15].id];
    expect(applyStudySelection(all, ids).map(w => w.term)).toEqual(['w7', 'w2', 'w15']);
  });

  test('고르고 나서 지워진 단어는 세션에서 조용히 빠진다', () => {
    const all = Array.from({ length: 5 }, (_, i) => word({ term: `w${i}` }));
    const results = selectPickResults(all.map(w => ({ word: w, listId: 'a', listName: '토익' })), '', filters(), true);
    const ids = resultsToWords(results).map(w => w.id);

    // 학습으로 넘어가는 사이 두 개가 삭제된 상황
    const survivors = all.slice(0, 3);
    expect(applyStudySelection(survivors, ids)).toHaveLength(3);
  });
});

// ─── countActiveFilters ───────────────────────────────────────────────────────

describe('countActiveFilters', () => {
  test('기본값은 0', () => {
    expect(countActiveFilters(filters())).toBe(0);
  });

  test('기본값이 아닌 값을 하나씩 센다', () => {
    expect(countActiveFilters(filters({ wordFilter: 'learning' }))).toBe(1);
    expect(countActiveFilters(filters({ wordFilter: 'learning', starredOnly: true }))).toBe(2);
    expect(countActiveFilters(filters({
      wordFilter: 'learning', starredOnly: true, posFilter: 'verb', tag: '여행',
      useAllLists: false, selectedListIds: ['a'],
    }))).toBe(5);
  });

  test('전체 단어장은 세지 않는다', () => {
    expect(countActiveFilters(filters({ useAllLists: true, selectedListIds: ['a'] }))).toBe(0);
  });
});

// ─── summarizeScope / scopeLabel ──────────────────────────────────────────────

describe('summarizeScope', () => {
  const a = list('a', '토익 900', [word()], { planTotalDays: 10 });
  const b = list('b', '회화', [word()]);
  const c = list('c', '베트남어', [word()]);
  const lists = [a, b, c];

  const label = (f: Partial<PickFilters>) => scopeLabel(summarizeScope(lists, filters(f)), t);

  test('기본값은 전체 단어장', () => {
    expect(label({})).toBe('search.scopeAllLists');
  });

  test('아무것도 안 골랐으면 선택 안 됨', () => {
    expect(label({ useAllLists: false, selectedListIds: [] })).toBe('search.scopeNone');
  });

  test('하나 · Day 전체면 이름만', () => {
    expect(label({ useAllLists: false, selectedListIds: ['a'] })).toBe('토익 900');
  });

  test('하나 · Day 연속이면 범위로', () => {
    expect(label({ useAllLists: false, selectedListIds: ['a'], selectedDaysByList: { a: [3, 4, 5] } }))
      .toBe('search.scopeDayRange(name=토익 900,from=3,to=5)');
  });

  test('하나 · Day 하나면 단수 문구', () => {
    expect(label({ useAllLists: false, selectedListIds: ['a'], selectedDaysByList: { a: [3] } }))
      .toBe('search.scopeDayOne(name=토익 900,day=3)');
  });

  test('하나 · Day가 이어지지 않으면 개수로', () => {
    expect(label({ useAllLists: false, selectedListIds: ['a'], selectedDaysByList: { a: [1, 4, 7] } }))
      .toBe('search.scopeDayCount(name=토익 900,count=3)');
  });

  test('Day 순서가 뒤섞여 들어와도 정렬해서 읽는다', () => {
    expect(label({ useAllLists: false, selectedListIds: ['a'], selectedDaysByList: { a: [5, 3, 4] } }))
      .toBe('search.scopeDayRange(name=토익 900,from=3,to=5)');
  });

  test('여럿이면 외 N개', () => {
    expect(label({ useAllLists: false, selectedListIds: ['a', 'b', 'c'] }))
      .toBe('search.scopeMulti(name=토익 900,rest=2)');
  });

  test('여럿 + 일부 Day면 그렇다고 말한다 — 이름을 다 나열하면 칩이 화면을 넘는다', () => {
    expect(label({ useAllLists: false, selectedListIds: ['a', 'b'], selectedDaysByList: { a: [1, 2] } }))
      .toBe('search.scopeMultiPartialDays(name=토익 900,rest=1)');
  });

  test('지워진 단어장 id는 요약에서 빠진다', () => {
    expect(label({ useAllLists: false, selectedListIds: ['a', 'gone'] })).toBe('토익 900');
  });
});

// ─── scopeStillExists ─────────────────────────────────────────────────────────

describe('scopeStillExists', () => {
  const lists = [list('a', '토익', [word()])];

  test('전체 단어장은 언제나 유효', () => {
    expect(scopeStillExists(lists, filters())).toBe(true);
  });

  test('가리키던 단어장이 남아 있으면 유효', () => {
    expect(scopeStillExists(lists, filters({ useAllLists: false, selectedListIds: ['a'] }))).toBe(true);
  });

  test('전부 지워졌으면 무효 — 눌렀더니 0개가 나오는 줄은 보여주지 않는다', () => {
    expect(scopeStillExists(lists, filters({ useAllLists: false, selectedListIds: ['gone'] }))).toBe(false);
  });
});

// ─── pickFiltersKey ───────────────────────────────────────────────────────────

describe('pickFiltersKey', () => {
  test('같은 조합은 같은 키 — 지난번 조건에 중복으로 쌓이지 않는다', () => {
    const one = filters({ wordFilter: 'learning', useAllLists: false, selectedListIds: ['a', 'b'] });
    const two = filters({ wordFilter: 'learning', useAllLists: false, selectedListIds: ['b', 'a'] });
    expect(pickFiltersKey(one)).toBe(pickFiltersKey(two));
  });

  test('Day 순서 차이도 흡수한다', () => {
    const base = { useAllLists: false, selectedListIds: ['a'] };
    expect(pickFiltersKey(filters({ ...base, selectedDaysByList: { a: [2, 1] } })))
      .toBe(pickFiltersKey(filters({ ...base, selectedDaysByList: { a: [1, 2] } })));
  });

  test('전체 단어장이면 남아 있는 선택 목록을 보지 않는다', () => {
    expect(pickFiltersKey(filters({ selectedListIds: ['a'] }))).toBe(pickFiltersKey(filters()));
  });

  test('조건이 다르면 키도 다르다', () => {
    expect(pickFiltersKey(filters({ wordFilter: 'learning' }))).not.toBe(pickFiltersKey(filters({ wordFilter: 'memorized' })));
    expect(pickFiltersKey(filters({ starredOnly: true }))).not.toBe(pickFiltersKey(filters()));
  });
});

// ─── conditionLabel ───────────────────────────────────────────────────────────

describe('conditionLabel', () => {
  const lists = [list('a', '토익 900', [word()])];

  test('기본값이면 범위만 말한다', () => {
    expect(conditionLabel(filters(), lists, t)).toBe('search.scopeAllLists');
  });

  test('고른 것을 순서대로 이어 붙인다', () => {
    const label = conditionLabel(filters({
      wordFilter: 'learning', posFilter: 'verb',
      useAllLists: false, selectedListIds: ['a'], selectedDaysByList: { a: [3, 4, 5] },
    }), lists, t);
    expect(label).toBe('search.filterLearning · pos.verb · search.scopeDayRange(name=토익 900,from=3,to=5)');
  });

  test('프리셋은 상한을 라벨에 달고 다닌다', () => {
    expect(conditionLabel(filters({ wordFilter: 'wrongCount' }), lists, t))
      .toBe(`search.presetWrong ${PRESET_LIMIT} · search.scopeAllLists`);
  });

  test('별표와 태그도 들어간다', () => {
    expect(conditionLabel(filters({ starredOnly: true, tag: '여행' }), lists, t))
      .toBe('search.starredChip · #여행 · search.scopeAllLists');
  });
});
