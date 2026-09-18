import type { StudyResult, Word } from '@/lib/types';

// 시험지 — 채점·세트 진행 규칙. 스펙은 docs/test-sheet-spec.md(§2 채점 · §3 기록).
// 순수 함수만 둔다(RN/expo import 없음) — 화면이 아니라 여기서 규칙을 테스트한다.

export type SheetDirection = 'meaning-to-term' | 'term-to-meaning';
export type SheetQuizType = SheetDirection | 'mixed';
export type SheetMark = 'ok' | 'no';

/**
 * 한 줄이 어떻게 매겨졌나. 결과 화면 답안지가 «정답»을 따로 적어 줄지 정하는 데 쓴다.
 * - `auto`    뜻→단어, 앱이 글자 비교로 매김
 * - `fixed`   앱이 틀림으로 매긴 줄을 «맞게 썼어요»로 고침
 * - `prefill` 단어→뜻, 적은 뜻이 정답 조각과 같아 ○를 미리 찍음
 * - `self`    사람이 ○·✕를 누름 — 빈칸, 단어→뜻, 미리 찍힌 ○를 바꾼 줄
 */
export type GradeMethod = 'auto' | 'fixed' | 'prefill' | 'self';

export interface SheetRow {
  word: Word;
  direction: SheetDirection;
  typed: string;
  /** null = 아직 안 매김(채점 전이거나, 채점 뒤 ○·✕를 기다리는 줄) */
  mark: SheetMark | null;
  method: GradeMethod | null;
  /**
   * 처음 채점에서 ✕였고 «틀린 N개만 다시 풀기»에서 ○ — 처음 채점 기록(records)의 줄에만 붙는다.
   * mark·typed 는 처음 것 그대로 두고(답안지가 처음 답을 보여 준다) 기록은 «외웠어요»로 친다(§3).
   */
  retriedOk?: boolean;
}

// ─── 채점 ─────────────────────────────────────────────────────────────────────

/**
 * 봐주는 것(§2): 대소문자 · 앞뒤 빈칸 · 단어 사이 두 칸 이상 빈칸.
 *
 * 규칙 밖으로 보이는 둘은 «철자가 같은데 글자 코드가 다른» 경우라 봐주는 게 아니다:
 * - NFC — 한글·악센트가 조합형으로 저장된 단어가 있어도 같은 글자로 본다
 * - ’ → ' — iOS 키보드는 자동 고침을 꺼도 작은따옴표를 둥근 따옴표로 바꾼다(don’t)
 */
export function normalizeAnswer(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function isTermMatch(typed: string, term: string): boolean {
  const a = normalizeAnswer(typed);
  return a !== '' && a === normalizeAnswer(term);
}

/**
 * 뜻을 조각으로 나눈다 — 쉼표와 ①②③ 병기 표시(§2). «곧, 얼마 안 있어» → [곧, 얼마 안 있어].
 * 괄호 안의 설명은 조각이 아니다: «(시간·돈을) 들이다»는 통째로 한 조각이다.
 * 전각 쉼표(，、)도 쉼표다 — 중국어·일본어 뜻은 이것으로 나열된다.
 */
export function splitMeaningPieces(meaning: string | null | undefined): string[] {
  return (meaning ?? '')
    .split(/[①②③④⑤,，、]/)
    .map(s => s.trim())
    .filter(Boolean);
}

/** 적은 뜻이 정답 뜻의 한 조각과 글자까지 같은가 — ○를 미리 찍는 조건. */
export function isMeaningPieceMatch(typed: string, meaning: string | null | undefined): boolean {
  const a = normalizeAnswer(typed);
  if (!a) return false;
  return splitMeaningPieces(meaning).some(p => normalizeAnswer(p) === a);
}

export function promptOf(row: Pick<SheetRow, 'word' | 'direction'>): string {
  return row.direction === 'meaning-to-term' ? (row.word.meaningKr ?? '') : row.word.term;
}

export function answerOf(row: Pick<SheetRow, 'word' | 'direction'>): string {
  return row.direction === 'meaning-to-term' ? row.word.term : (row.word.meaningKr ?? '');
}

/** 적은 답으로 한 줄을 매긴다. 빈칸은 매기지 않는다 — 정답을 보고 사람이 누른다. */
export function gradeRow(row: SheetRow, typed: string): SheetRow {
  const base = { ...row, typed };
  if (!normalizeAnswer(typed)) return { ...base, mark: null, method: 'self' };
  if (row.direction === 'meaning-to-term') {
    return isTermMatch(typed, row.word.term)
      ? { ...base, mark: 'ok', method: 'auto' }
      : { ...base, mark: 'no', method: 'auto' };
  }
  return isMeaningPieceMatch(typed, row.word.meaningKr)
    ? { ...base, mark: 'ok', method: 'prefill' }
    : { ...base, mark: null, method: 'self' };
}

/** 기록 기준의 ○·✕ — 다시 풀어 맞힌 줄은 ○다(§3). 다시 풀기 화면의 줄에는 retriedOk 가 없어 mark 그대로. */
export const isOk = (r: SheetRow) => r.mark === 'ok' || (r.mark === 'no' && !!r.retriedOk);
export const isWrong = (r: SheetRow) => r.mark === 'no' && !r.retriedOk;

export const pendingCount = (rows: readonly SheetRow[]) => rows.filter(r => r.mark === null).length;
export const wrongCount = (rows: readonly SheetRow[]) => rows.filter(isWrong).length;
export const okCount = (rows: readonly SheetRow[]) => rows.filter(isOk).length;

// ─── 키보드 ───────────────────────────────────────────────────────────────────

/**
 * 답 칸에 추천 줄을 끄는 키보드(비밀번호형 `visible-password`)를 쓸까(D10 · §5.3).
 *
 * 🔴 안드로이드 키보드는 autoCorrect={false}(= TYPE_TEXT_FLAG_NO_SUGGESTIONS)를 무시하고 추천을 띄운다.
 *    실기(Galaxy S22 삼성 키보드, 9/17): «무의미한 의료»에 futil 까지 치자 추천 줄에 **futility — 정답**.
 *    확실히 끄는 건 비밀번호형 칸뿐이다. iOS 는 autoCorrect·spellCheck 로 꺼져 쓰지 않는다.
 *
 * 쓰는 곳은 **뜻→단어 줄 중 출발어가 en·es** 뿐이다. 기준은 «막혔을 때도 답을 적을 수 있는가»:
 * - en·es — 로마자라 조합 없이 친다. 악센트(ó·ñ)도 길게 누르기로 삼성·Gboard 둘 다 된다(실기).
 *   막혀도 악센트 없이 적고 «맞게 썼어요»로 넘어갈 길이 있다.
 * - ko — 🔴 추천 줄에 정답이 그대로 뜨지만(«교사로»→«교사로서») 넣지 않는다. 삼성 키보드는 비밀번호형
 *   칸에서도 한글이 쳐지는데, **Gboard 는 영어 자판으로 고정돼 한국어로 못 바꾼다**(실기) — 답을 적을 수가 없다.
 * - vi·ja·zh — 키보드가 성조·가나·한자를 조합해 치는 언어라 막힐 위험이 크다(실기 못 함).
 * - 단어→뜻 줄 — 뜻은 대개 한국어라 위 ko 와 같다.
 *
 * ⚠️ «섞기»에서는 비밀번호형 칸과 보통 칸이 한 화면에 섞여, 삼성 키보드가 보통 칸에
 *    «삼성 패스로 더 빠르게 로그인하세요»를 띄운다. 글자를 치면 사라지고 입력은 막지 않는다.
 *    importantForAutofill="noExcludeDescendants" 로는 안 꺼졌다(키보드 쪽 판단) — 답이 새는 것보다 낫다고 두었다.
 */
const NO_SUGGESTION_SOURCE_LANGS: ReadonlySet<string> = new Set(['en', 'es']);

export function noSuggestionKeyboard(os: string, direction: SheetDirection, sourceLang: string | undefined): boolean {
  return os === 'android' && direction === 'meaning-to-term' && !!sourceLang && NO_SUGGESTION_SOURCE_LANGS.has(sourceLang);
}

// ─── 방향 ─────────────────────────────────────────────────────────────────────

/**
 * 줄마다 방향. «섞기»는 한 세트 안에서 반반(D5) — 홀수면 남는 한 줄은 뜻→단어(처음 값)로.
 * 어느 줄이 어느 방향인지는 섞는다. 앞 절반·뒤 절반으로 가르면 섞은 게 아니다.
 */
export function assignDirections(
  count: number,
  quizType: SheetQuizType,
  random: () => number = Math.random,
): SheetDirection[] {
  if (quizType !== 'mixed') return Array.from({ length: count }, () => quizType);
  const dirs: SheetDirection[] = Array.from({ length: count }, (_, i) =>
    i < Math.floor(count / 2) ? 'term-to-meaning' : 'meaning-to-term',
  );
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  return dirs;
}

export function newRows(
  words: readonly Word[],
  quizType: SheetQuizType,
  random: () => number = Math.random,
): SheetRow[] {
  const dirs = assignDirections(words.length, quizType, random);
  return words.map((word, i) => ({ word, direction: dirs[i], typed: '', mark: null, method: null }));
}

// ─── 세트 진행 ────────────────────────────────────────────────────────────────

export interface SheetSession {
  setIndex: number;
  phase: 'solving' | 'graded';
  /** «틀린 N개만 다시 풀기» 중 — 여기서 ○인 줄은 records 의 그 줄에 retriedOk 로 남는다(§3) */
  retry: boolean;
  /** 지금 화면에 있는 줄 */
  rows: SheetRow[];
  /**
   * 세트별 **처음 채점** 결과 + 다시 풀어 맞힘(retriedOk). 기록(§3)과 결과 화면 답안지(D21)가 여기서만 읽는다.
   * 채점한 세트만 들어 있다 — 채점 전인 세트는 나가도 기록되지 않는다.
   */
  records: SheetRow[][];
}

export type SheetAction =
  | { type: 'start'; rows: SheetRow[] }
  | { type: 'grade'; typed: readonly string[] }
  | { type: 'mark'; index: number; mark: SheetMark }
  | { type: 'fix'; index: number }
  | { type: 'retryWrong' }
  | { type: 'nextSet'; rows: SheetRow[] };

export const EMPTY_SESSION: SheetSession = { setIndex: 0, phase: 'solving', retry: false, rows: [], records: [] };

/**
 * 다음 세트(또는 결과 화면)로 갈 수 있나.
 * 처음 채점한 세트는 ○·✕가 다 눌려야 한다(D12) — 안 누른 줄을 틀림으로 넘기면 아는 단어가
 * «복습 필요»에 섞인다. 다시 풀기의 줄은 이미 틀림으로 정해졌고 안 누르면 그대로 남을 뿐이라 막지 않는다(D24).
 */
export function canAdvance(s: SheetSession): boolean {
  return s.phase === 'graded' && (s.retry || pendingCount(s.rows) === 0);
}

/** 채점 뒤 «틀린 N개만 다시 풀기»를 보일 수 있나(D13). 남은 ○·✕가 있으면 틀린 수가 아직 확정이 아니다. */
export function canRetryWrong(s: SheetSession): boolean {
  return canAdvance(s) && wrongCount(s.rows) > 0;
}

function withRows(s: SheetSession, rows: SheetRow[]): SheetSession {
  const records = s.records.slice();
  if (s.retry) {
    // 다시 풀기의 ○·✕는 처음 채점 줄의 retriedOk 로만 옮긴다 — ○를 ✕로 되돌리면 지운다.
    const okNow = new Map(rows.map(r => [r.word.id, r.mark === 'ok']));
    records[s.setIndex] = (records[s.setIndex] ?? []).map(r => {
      if (!okNow.has(r.word.id)) return r;
      const { retriedOk: _, ...rest } = r;
      return okNow.get(r.word.id) ? { ...rest, retriedOk: true } : rest;
    });
  } else {
    records[s.setIndex] = rows;
  }
  return { ...s, rows, records };
}

export function sheetReducer(s: SheetSession, a: SheetAction): SheetSession {
  switch (a.type) {
    case 'start':
      return { setIndex: 0, phase: 'solving', retry: false, rows: a.rows, records: [] };

    case 'grade': {
      if (s.phase !== 'solving') return s;
      const rows = s.rows.map((r, i) => gradeRow(r, a.typed[i] ?? ''));
      return withRows({ ...s, phase: 'graded' }, rows);
    }

    case 'mark': {
      const row = s.rows[a.index];
      if (s.phase !== 'graded' || !row) return s;
      const rows = s.rows.slice();
      rows[a.index] = { ...row, mark: a.mark, method: 'self' };
      return withRows(s, rows);
    }

    case 'fix': {
      // «맞게 썼어요»는 앱이 틀림으로 매긴 줄에만. 한 번 더 누르면 되돌린다(잘못 누른 경우).
      const row = s.rows[a.index];
      if (s.phase !== 'graded' || !row) return s;
      let next: SheetRow;
      if (row.method === 'auto' && row.mark === 'no') next = { ...row, mark: 'ok', method: 'fixed' };
      else if (row.method === 'fixed') next = { ...row, mark: 'no', method: 'auto' };
      else return s;
      const rows = s.rows.slice();
      rows[a.index] = next;
      return withRows(s, rows);
    }

    case 'retryWrong': {
      if (!canRetryWrong(s)) return s;
      const rows = s.rows
        .filter(r => r.mark === 'no')
        .map(r => ({ ...r, typed: '', mark: null, method: null }));
      return { ...s, phase: 'solving', retry: true, rows };
    }

    case 'nextSet':
      if (!canAdvance(s)) return s;
      return { ...s, setIndex: s.setIndex + 1, phase: 'solving', retry: false, rows: a.rows };
  }
}

// ─── 기록 · 답안지 ────────────────────────────────────────────────────────────

/**
 * 기록할 결과 — 처음 채점에서 ○·✕가 정해진 줄만. 다시 풀어 맞힌 줄은 «외웠어요»이되 lapsed —
 * 오답 +1 은 남기고 복습 사다리는 첫 칸부터(§3 · session-results.ts).
 */
export function collectResults(records: readonly (readonly SheetRow[] | undefined)[]): StudyResult[] {
  return records
    .flatMap(rows => rows ?? [])
    .filter(r => r.mark !== null)
    .map(r => (r.mark === 'no' && r.retriedOk
      ? { word: r.word, gotIt: true, lapsed: true }
      : { word: r.word, gotIt: r.mark === 'ok' }));
}

export type AnswerSheetItem =
  | { kind: 'set'; setNumber: number; ok: number; total: number }
  | { kind: 'row'; n: number; row: SheetRow };

/**
 * 결과 화면 답안지(D16·D19·D20). 번호는 세트를 넘어 이어지고, «틀린 것만»이어도 번호와
 * 세트 구분은 원래대로 둔다 — 틀린 줄이 없는 세트는 구분 줄째 빠진다.
 */
export function buildAnswerSheet(records: readonly SheetRow[][], onlyWrong = false): AnswerSheetItem[] {
  const items: AnswerSheetItem[] = [];
  let n = 0;
  records.forEach((rows, setIdx) => {
    const shown: AnswerSheetItem[] = [];
    for (const row of rows) {
      n += 1;
      if (onlyWrong && !isWrong(row)) continue;
      shown.push({ kind: 'row', n, row });
    }
    if (shown.length === 0) return;
    items.push({ kind: 'set', setNumber: setIdx + 1, ok: okCount(rows), total: rows.length }, ...shown);
  });
  return items;
}
