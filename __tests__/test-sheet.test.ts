import {
  normalizeAnswer,
  isTermMatch,
  splitMeaningPieces,
  isMeaningPieceMatch,
  gradeRow,
  assignDirections,
  newRows,
  sheetReducer,
  canAdvance,
  canRetryWrong,
  collectResults,
  buildAnswerSheet,
  noSuggestionKeyboard,
  EMPTY_SESSION,
  type SheetRow,
  type SheetSession,
} from '../features/study/test-sheet/sheet';
import { StudySettingsSchema } from '../shared/contracts';
import type { Word } from '../lib/types';

let seq = 0;
const word = (term: string, meaningKr: string, over: Partial<Word> = {}): Word => ({
  id: `w${++seq}`, term, definition: '', exampleEn: '', meaningKr,
  isMemorized: false, isStarred: false, tags: [], assignedDay: null,
  ...over,
});

const row = (w: Word, direction: SheetRow['direction'] = 'meaning-to-term'): SheetRow =>
  ({ word: w, direction, typed: '', mark: null, method: null });

// ─── 세트 크기 (D6) ───────────────────────────────────────────────────────────

describe('시험지 세트 크기 설정', () => {
  it('이미 저장된 학습 설정(필드 없음)을 읽어도 처음 값 10이 채워진다', () => {
    const stored = { studyBatchSize: 'all', sentenceBatchSize: 20, shuffle: true, autoPlaySound: false };
    const parsed = StudySettingsSchema.parse(stored);
    expect(parsed.testSheetBatchSize).toBe(10);
    // 학습 단위는 따로다 — 저장돼 있던 값이 그대로 남는다
    expect(parsed.studyBatchSize).toBe('all');
  });
});

// ─── 뜻 → 단어 정규화 (§2) ─────────────────────────────────────────────────────

describe('뜻→단어: 봐주는 것과 틀림', () => {
  it('대소문자·앞뒤 빈칸·겹친 빈칸은 봐준다', () => {
    expect(isTermMatch('Borrow', 'borrow')).toBe(true);
    expect(isTermMatch('  borrow ', 'borrow')).toBe(true);
    expect(isTermMatch('look   after', 'look after')).toBe(true);
  });

  it('철자 한 글자 · 다른 꼴 · 뜻이 같은 다른 단어는 틀림', () => {
    expect(isTermMatch('borow', 'borrow')).toBe(false);
    expect(isTermMatch('borrowed', 'borrow')).toBe(false);
    expect(isTermMatch('enough', 'sufficient')).toBe(false);
  });

  it('붙여 쓴 것은 봐주지 않는다 — 빈칸 «두 칸 이상»만 봐준다', () => {
    expect(isTermMatch('lookafter', 'look after')).toBe(false);
  });

  it('빈칸은 맞은 것이 아니다', () => {
    expect(isTermMatch('', '')).toBe(false);
    expect(isTermMatch('   ', 'borrow')).toBe(false);
  });

  it('iOS 둥근 따옴표와 조합형 글자는 같은 글자로 본다', () => {
    expect(isTermMatch('don’t', "don't")).toBe(true);
    expect(isTermMatch('café', 'café')).toBe(true);
    expect(normalizeAnswer('가')).toBe('가');
  });
});

// ─── 뜻 조각 (§2) ─────────────────────────────────────────────────────────────

describe('뜻 조각 나누기', () => {
  it('쉼표로 나눈다', () => {
    expect(splitMeaningPieces('곧, 얼마 안 있어')).toEqual(['곧', '얼마 안 있어']);
  });

  it('①②③ 병기로 나눈다 — 첫 번호 앞은 빈 조각이라 버려진다', () => {
    expect(splitMeaningPieces('① 주문하다 ② 순서')).toEqual(['주문하다', '순서']);
    expect(splitMeaningPieces('① 주문하다, 명령하다 ② 순서')).toEqual(['주문하다', '명령하다', '순서']);
  });

  it('괄호 속 가운뎃점은 나누지 않는다', () => {
    expect(splitMeaningPieces('(시간·돈을) 들이다, 투자하다')).toEqual(['(시간·돈을) 들이다', '투자하다']);
  });

  it('전각 쉼표도 쉼표다', () => {
    expect(splitMeaningPieces('借，借用')).toEqual(['借', '借用']);
    expect(splitMeaningPieces('借りる、借用する')).toEqual(['借りる', '借用する']);
  });

  it('조각과 글자까지 같을 때만 미리 ○', () => {
    expect(isMeaningPieceMatch('곧', '곧, 얼마 안 있어')).toBe(true);
    expect(isMeaningPieceMatch('투자하다', '(시간·돈을) 들이다, 투자하다')).toBe(true);
    expect(isMeaningPieceMatch('이용할 수 있는', '이용할 수 있는')).toBe(true);
    expect(isMeaningPieceMatch('필요하다', '필요로 하다, 요구하다')).toBe(false);
    expect(isMeaningPieceMatch('들이다', '(시간·돈을) 들이다, 투자하다')).toBe(false);
    expect(isMeaningPieceMatch('', '곧')).toBe(false);
  });
});

// ─── 한 줄 채점 ───────────────────────────────────────────────────────────────

describe('gradeRow', () => {
  const borrow = word('borrow', '빌리다');

  it('뜻→단어: 앱이 매긴다', () => {
    expect(gradeRow(row(borrow), 'borrow')).toMatchObject({ mark: 'ok', method: 'auto', typed: 'borrow' });
    expect(gradeRow(row(borrow), 'borow')).toMatchObject({ mark: 'no', method: 'auto' });
  });

  it('빈칸은 방향과 무관하게 매기지 않는다', () => {
    expect(gradeRow(row(borrow), '  ')).toMatchObject({ mark: null, method: 'self' });
    expect(gradeRow(row(borrow, 'term-to-meaning'), '')).toMatchObject({ mark: null, method: 'self' });
  });

  it('단어→뜻: 조각이 같으면 ○를 미리, 아니면 사람이 매긴다 — ✕로 매기지는 않는다', () => {
    expect(gradeRow(row(borrow, 'term-to-meaning'), '빌리다')).toMatchObject({ mark: 'ok', method: 'prefill' });
    expect(gradeRow(row(borrow, 'term-to-meaning'), '빌려주다')).toMatchObject({ mark: null, method: 'self' });
  });
});

// ─── 섞기 (D5) ────────────────────────────────────────────────────────────────

describe('assignDirections', () => {
  it('고정 방향은 전부 같은 방향', () => {
    expect(assignDirections(3, 'term-to-meaning')).toEqual(['term-to-meaning', 'term-to-meaning', 'term-to-meaning']);
  });

  it('섞기는 반반, 홀수면 남는 줄은 뜻→단어', () => {
    const count = (dirs: string[], d: string) => dirs.filter(x => x === d).length;
    const ten = assignDirections(10, 'mixed');
    expect(count(ten, 'term-to-meaning')).toBe(5);
    const seven = assignDirections(7, 'mixed');
    expect(count(seven, 'term-to-meaning')).toBe(3);
    expect(count(seven, 'meaning-to-term')).toBe(4);
    expect(assignDirections(1, 'mixed')).toEqual(['meaning-to-term']);
  });

  it('섞기는 앞뒤로 가르지 않고 섞는다', () => {
    // random 이 늘 0 이면 Fisher–Yates 는 매번 0번과 바꾼다 — 첫 줄이 뒤쪽 방향으로 온다.
    const dirs = assignDirections(4, 'mixed', () => 0);
    expect(dirs).not.toEqual(['term-to-meaning', 'term-to-meaning', 'meaning-to-term', 'meaning-to-term']);
  });
});

// ─── 키보드 (D10 · §5.3) ──────────────────────────────────────────────────────

describe('noSuggestionKeyboard', () => {
  it('안드로이드 뜻→단어 줄, 출발어 en·es 에만 추천 줄을 끄는 키보드', () => {
    expect(noSuggestionKeyboard('android', 'meaning-to-term', 'en')).toBe(true);
    expect(noSuggestionKeyboard('android', 'meaning-to-term', 'es')).toBe(true);
  });

  it('ko 는 넣지 않는다 — Gboard 비밀번호형 칸은 한글을 못 친다', () => {
    expect(noSuggestionKeyboard('android', 'meaning-to-term', 'ko')).toBe(false);
  });

  it('조합해 치는 언어·출발어 모름·단어→뜻 줄·iOS 는 보통 키보드', () => {
    for (const lang of ['vi', 'ja', 'zh', undefined]) {
      expect(noSuggestionKeyboard('android', 'meaning-to-term', lang)).toBe(false);
    }
    expect(noSuggestionKeyboard('android', 'term-to-meaning', 'en')).toBe(false);
    expect(noSuggestionKeyboard('ios', 'meaning-to-term', 'en')).toBe(false);
  });
});

// ─── 세트 진행 (D12 · D13 · §3) ────────────────────────────────────────────────

describe('sheetReducer', () => {
  const set1 = [word('borrow', '빌리다'), word('decide', '결정하다'), word('attend', '참석하다')];
  const set2 = [word('invest', '투자하다'), word('require', '요구하다')];

  const start = (): SheetSession =>
    sheetReducer(EMPTY_SESSION, { type: 'start', rows: newRows(set1, 'meaning-to-term') });

  it('채점하면 이 세트의 처음 결과가 기록된다', () => {
    const s = sheetReducer(start(), { type: 'grade', typed: ['borrow', 'decid', ''] });
    expect(s.phase).toBe('graded');
    expect(s.records[0].map(r => r.mark)).toEqual(['ok', 'no', null]);
  });

  it('채점 전에는 다음 세트로 못 간다', () => {
    const s = start();
    expect(canAdvance(s)).toBe(false);
    expect(sheetReducer(s, { type: 'nextSet', rows: newRows(set2, 'meaning-to-term') })).toBe(s);
  });

  it('○·✕가 남으면 다음 세트로 못 간다 — 누르면 풀린다', () => {
    let s = sheetReducer(start(), { type: 'grade', typed: ['borrow', 'decid', ''] });
    expect(canAdvance(s)).toBe(false);
    expect(canRetryWrong(s)).toBe(false);
    expect(sheetReducer(s, { type: 'nextSet', rows: [] })).toBe(s);

    s = sheetReducer(s, { type: 'mark', index: 2, mark: 'ok' });
    expect(canAdvance(s)).toBe(true);
    expect(s.records[0][2]).toMatchObject({ mark: 'ok', method: 'self' });

    s = sheetReducer(s, { type: 'nextSet', rows: newRows(set2, 'meaning-to-term') });
    expect(s).toMatchObject({ setIndex: 1, phase: 'solving', retry: false });
    expect(s.rows).toHaveLength(2);
  });

  it('«맞게 썼어요»는 앱이 틀린 줄만 ○로 바꾸고, 다시 누르면 되돌린다', () => {
    let s = sheetReducer(start(), { type: 'grade', typed: ['borrow', 'enough', ''] });
    s = sheetReducer(s, { type: 'fix', index: 1 });
    expect(s.records[0][1]).toMatchObject({ mark: 'ok', method: 'fixed' });
    s = sheetReducer(s, { type: 'fix', index: 1 });
    expect(s.records[0][1]).toMatchObject({ mark: 'no', method: 'auto' });

    // 맞은 줄·빈칸 줄에는 효과가 없다
    expect(sheetReducer(s, { type: 'fix', index: 0 })).toBe(s);
    expect(sheetReducer(s, { type: 'fix', index: 2 })).toBe(s);
  });

  it('다시 풀어 맞힌 줄은 «외웠어요»로 기록된다 — 처음 적은 답과 ✕는 답안지용으로 남고', () => {
    let s = sheetReducer(start(), { type: 'grade', typed: ['borow', 'decide', 'atend'] });
    expect(canRetryWrong(s)).toBe(true);

    s = sheetReducer(s, { type: 'retryWrong' });
    expect(s).toMatchObject({ phase: 'solving', retry: true });
    expect(s.rows.map(r => r.word.term)).toEqual(['borrow', 'attend']);
    expect(s.rows.every(r => r.typed === '' && r.mark === null)).toBe(true);
    // 채점 전에는 아직 아무것도 안 바뀐다
    expect(s.records[0].some(r => r.retriedOk)).toBe(false);

    s = sheetReducer(s, { type: 'grade', typed: ['borrow', 'atend'] });
    expect(s.rows.map(r => r.mark)).toEqual(['ok', 'no']);
    expect(s.records[0].map(r => [r.typed, r.mark, !!r.retriedOk])).toEqual([
      ['borow', 'no', true],
      ['decide', 'ok', false],
      ['atend', 'no', false],
    ]);
    const results = collectResults(s.records);
    expect(results.map(r => [r.word.term, r.gotIt, !!r.lapsed])).toEqual([
      ['borrow', true, true],
      ['decide', true, false],
      ['attend', false, false],
    ]);
  });

  it('다시 풀기에서 ○를 ✕로 바꾸면 기록도 틀림으로 돌아간다', () => {
    let s = sheetReducer(start(), { type: 'grade', typed: ['borow', 'decide', 'attend'] });
    s = sheetReducer(s, { type: 'retryWrong' });
    s = sheetReducer(s, { type: 'grade', typed: ['borrow'] });
    expect(s.records[0][0].retriedOk).toBe(true);

    s = sheetReducer(s, { type: 'mark', index: 0, mark: 'no' });
    expect(s.records[0][0]).toMatchObject({ mark: 'no', typed: 'borow' });
    expect(s.records[0][0].retriedOk).toBeUndefined();
    expect(collectResults(s.records)[0]).toEqual({ word: s.records[0][0].word, gotIt: false });
  });

  it('두 번째 다시 풀기에서 맞혀도 기록된다 — 첫 번째에서 맞힌 줄은 그대로', () => {
    let s = sheetReducer(start(), { type: 'grade', typed: ['borow', 'decide', 'atend'] });
    s = sheetReducer(s, { type: 'retryWrong' });
    s = sheetReducer(s, { type: 'grade', typed: ['borrow', 'atend'] });
    s = sheetReducer(s, { type: 'retryWrong' });
    expect(s.rows.map(r => r.word.term)).toEqual(['attend']);
    s = sheetReducer(s, { type: 'grade', typed: ['attend'] });
    expect(s.records[0].map(r => !!r.retriedOk)).toEqual([true, false, true]);
    expect(collectResults(s.records).every(r => r.gotIt)).toBe(true);
  });

  it('다시 풀어도 틀리거나 안 누른 줄은 처음 채점대로 틀림', () => {
    let s = sheetReducer(start(), { type: 'grade', typed: ['borow', 'decide', 'atend'] });
    s = sheetReducer(s, { type: 'retryWrong' });
    s = sheetReducer(s, { type: 'grade', typed: ['borrrow', ''] });
    expect(s.rows.map(r => r.mark)).toEqual(['no', null]);
    expect(collectResults(s.records).map(r => [r.gotIt, !!r.lapsed])).toEqual([
      [false, false], [true, false], [false, false],
    ]);
  });

  it('다시 풀기에서는 빈칸이 남아도 다음 세트로 갈 수 있다', () => {
    let s = sheetReducer(start(), { type: 'grade', typed: ['borow', 'decide', 'attend'] });
    s = sheetReducer(s, { type: 'retryWrong' });
    s = sheetReducer(s, { type: 'grade', typed: [''] });
    expect(s.rows[0].mark).toBeNull();
    expect(canAdvance(s)).toBe(true);
  });

  it('틀린 게 없으면 다시 풀기는 없다', () => {
    const s = sheetReducer(start(), { type: 'grade', typed: ['borrow', 'decide', 'attend'] });
    expect(canRetryWrong(s)).toBe(false);
    expect(sheetReducer(s, { type: 'retryWrong' })).toBe(s);
  });
});

// ─── 기록 · 답안지 ────────────────────────────────────────────────────────────

describe('collectResults', () => {
  it('중간에 나가면 채점한 세트까지 — ○·✕가 안 눌린 줄은 빼고', () => {
    const a = word('borrow', '빌리다');
    const b = word('decide', '결정하다');
    const c = word('attend', '참석하다');
    const records: SheetRow[][] = [[
      { ...row(a), typed: 'borrow', mark: 'ok', method: 'auto' },
      { ...row(b), typed: 'decid', mark: 'no', method: 'auto' },
      { ...row(c), typed: '', mark: null, method: 'self' },
    ]];
    expect(collectResults(records)).toEqual([{ word: a, gotIt: true }, { word: b, gotIt: false }]);
  });
});

describe('buildAnswerSheet', () => {
  const graded = (term: string, mark: 'ok' | 'no'): SheetRow =>
    ({ ...row(word(term, '뜻')), typed: term, mark, method: 'auto' });
  const records = [
    [graded('a', 'ok'), graded('b', 'no')],
    [graded('c', 'ok'), graded('d', 'ok')],
    [graded('e', 'no'), graded('f', 'ok')],
  ];

  it('번호는 세트를 넘어 이어지고, 세트마다 구분 줄에 점수', () => {
    const items = buildAnswerSheet(records);
    expect(items.map(i => (i.kind === 'set' ? `set${i.setNumber}:${i.ok}/${i.total}` : i.n))).toEqual([
      'set1:1/2', 1, 2, 'set2:2/2', 3, 4, 'set3:1/2', 5, 6,
    ]);
  });

  it('다시 풀어 맞힌 줄은 세트 점수에서 맞은 것, «틀린 것»에서는 빠진다', () => {
    const retried = [[graded('a', 'ok'), { ...graded('b', 'no'), retriedOk: true }], [graded('c', 'no')]];
    const label = (items: ReturnType<typeof buildAnswerSheet>) =>
      items.map(i => (i.kind === 'set' ? `set${i.setNumber}:${i.ok}/${i.total}` : i.n));
    expect(label(buildAnswerSheet(retried))).toEqual(['set1:2/2', 1, 2, 'set2:0/1', 3]);
    expect(label(buildAnswerSheet(retried, true))).toEqual(['set2:0/1', 3]);
  });

  it('틀린 것만: 원래 번호를 지키고, 틀린 줄이 없는 세트는 구분 줄째 뺀다', () => {
    const items = buildAnswerSheet(records, true);
    expect(items.map(i => (i.kind === 'set' ? `set${i.setNumber}:${i.ok}/${i.total}` : i.n))).toEqual([
      'set1:1/2', 2, 'set3:1/2', 5,
    ]);
  });
});
