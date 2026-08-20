import { buildChoices, normalizeChoiceLabel, SAME_TOPIC_DISTANCE, type ChoiceContext } from '../features/study/choices';
import { Word } from '../lib/types';

const w = (id: string, term: string, meaningKr = ''): Word =>
  ({ id, term, meaningKr } as Word);

const byTerm = (x: Word) => x.term;
const byMeaning = (x: Word) => x.meaningKr ?? '';

describe('normalizeChoiceLabel', () => {
  test('대소문자·공백·병기 기호를 무시한다', () => {
    expect(normalizeChoiceLabel(' Apple ')).toBe('apple');
    expect(normalizeChoiceLabel('① 사과 ② 사죄')).toBe('사과 사죄');
    expect(normalizeChoiceLabel(null)).toBe('');
    expect(normalizeChoiceLabel('')).toBe('');
  });
});

describe('buildChoices', () => {
  test('정답은 항상 포함된다', () => {
    const answer = w('1', 'apple');
    const pool = [answer, w('2', 'banana'), w('3', 'cherry'), w('4', 'date')];
    const choices = buildChoices(pool, answer, byTerm);
    expect(choices).toHaveLength(4);
    expect(choices.map(c => c.id)).toContain('1');
  });

  test('정답과 표기가 같은 단어는 오답으로 쓰지 않는다', () => {
    // 같은 단어장에 "사과"가 중복 저장된 상황 — 예전에는 정답을 눌러도 오답 처리됐다.
    const answer = w('1', '사과');
    const pool = [answer, w('2', '사과'), w('3', '바나나'), w('4', '체리')];
    const choices = buildChoices(pool, answer, byTerm);
    expect(choices.map(c => c.id)).not.toContain('2');
    expect(choices).toHaveLength(3);
  });

  test('오답끼리 표시가 겹쳐도 하나만 남긴다', () => {
    const answer = w('1', 'beautiful', '아름다운');
    const pool = [answer, w('2', 'pretty', '예쁜'), w('3', 'lovely', '예쁜'), w('4', 'ugly', '못생긴')];
    const choices = buildChoices(pool, answer, byMeaning);
    const labels = choices.map(c => normalizeChoiceLabel(byMeaning(c)));
    expect(new Set(labels).size).toBe(labels.length);
  });

  test('퀴즈 방향에 따라 중복 기준이 달라진다', () => {
    // 표기는 다르지만 뜻이 같은 두 단어 — term 기준에서는 둘 다 쓸 수 있고,
    // meaning 기준에서는 하나만 쓸 수 있어야 한다.
    const answer = w('1', 'joy', '기쁨');
    const pool = [answer, w('2', 'delight', '기쁨'), w('3', 'anger', '분노')];
    expect(buildChoices(pool, answer, byTerm)).toHaveLength(3);
    expect(buildChoices(pool, answer, byMeaning)).toHaveLength(2);
  });

  test('라벨이 빈 단어는 빈 버튼이 되므로 제외한다', () => {
    const answer = w('1', 'apple', '사과');
    const pool = [answer, w('2', 'banana', ''), w('3', 'cherry', '   '), w('4', 'date', '대추')];
    const choices = buildChoices(pool, answer, byMeaning);
    expect(choices.map(c => c.id).sort()).toEqual(['1', '4']);
  });

  test('후보가 모자라면 있는 만큼만 돌려준다', () => {
    const answer = w('1', 'apple');
    expect(buildChoices([answer], answer, byTerm)).toHaveLength(1);
    expect(buildChoices([answer, w('2', 'banana')], answer, byTerm)).toHaveLength(2);
  });

  test('count로 선택지 수를 조절할 수 있다', () => {
    const answer = w('1', 'a');
    const pool = [answer, w('2', 'b'), w('3', 'c'), w('4', 'd'), w('5', 'e')];
    expect(buildChoices(pool, answer, byTerm, 3)).toHaveLength(3);
  });
});

// ── 다중정답 방지(docs/example-choices-multi-answer-spec.md) ──────────────────
// 제보 사례: "___ 먹을까요?" 의 정답이 "국수"인데 선택지에 "라면"이 함께 떠서, 문장상
// 맞는 답을 골라도 오답 처리됐다. 두 필터가 각각 다른 경로로 이것을 막는다.

const ctxOf = (
  words: Word[],
  frames: Record<string, string | null> = {},
  minDistance = SAME_TOPIC_DISTANCE,
): ChoiceContext => {
  const index = new Map(words.map((x, i) => [x.id, i]));
  return {
    frameOf: x => frames[x.id] ?? null,
    indexOf: x => index.get(x.id) ?? -1,
    minDistance,
  };
};

/** 셔플이 있으므로 여러 번 돌려 모든 결과를 모은다. */
const idsOverRuns = (run: () => Word[], times = 30): Set<string> => {
  const seen = new Set<string>();
  for (let i = 0; i < times; i++) for (const c of run()) seen.add(c.id);
  return seen;
};

describe('buildChoices — 필터 A (문형 일치)', () => {
  test('빈칸을 뺀 문장이 정답과 같은 후보는 오답으로 쓰지 않는다', () => {
    const answer = w('1', '국수');
    const pool = [answer, w('2', '라면'), w('3', '비빔밥'), w('4', '영수증'), w('5', '지하철'), w('6', '우산')];
    // 라면만 정답과 같은 문형이다 — 빈칸에 넣으면 그대로 말이 된다.
    const frames = { '1': '먹을까요?', '2': '먹을까요?', '3': '주세요.', '4': '주세요.', '5': '어디예요?', '6': '없어요.' };
    const seen = idsOverRuns(() => buildChoices(pool, answer, byTerm, 4, ctxOf(pool, frames, 0)));
    expect(seen.has('2')).toBe(false);
    expect(seen.has('3')).toBe(true);
  });

  test('문형을 모르는 후보(예문 없음·빈칸 실패)는 배제하지 않는다', () => {
    const answer = w('1', '국수');
    const pool = [answer, w('2', '라면'), w('3', '비빔밥'), w('4', '영수증')];
    // 후보 셋 다 frameOf가 null — 판정할 근거가 없으므로 전부 쓸 수 있어야 한다.
    const choices = buildChoices(pool, answer, byTerm, 4, ctxOf(pool, { '1': '먹을까요?' }, 0));
    expect(choices).toHaveLength(4);
  });

  test('정답의 문형을 모르면 필터 A는 아예 걸리지 않는다', () => {
    const answer = w('1', '국수');
    const pool = [answer, w('2', '라면'), w('3', '비빔밥'), w('4', '영수증')];
    const frames = { '2': '먹을까요?', '3': '먹을까요?', '4': '먹을까요?' };
    expect(buildChoices(pool, answer, byTerm, 4, ctxOf(pool, frames, 0))).toHaveLength(4);
  });

  test('빈 문형끼리는 같은 것으로 묶지 않는다', () => {
    // 예문이 표제어뿐이면 문형이 "" 가 된다. 이것을 같은 문형으로 보면 그런 단어들이
    // 통째로 서로의 오답에서 사라진다.
    const answer = w('1', '국수');
    const pool = [answer, w('2', '라면'), w('3', '비빔밥'), w('4', '영수증')];
    const frames = { '1': '', '2': '', '3': '', '4': '' };
    expect(buildChoices(pool, answer, byTerm, 4, ctxOf(pool, frames, 0))).toHaveLength(4);
  });
});

describe('buildChoices — 필터 B (주제 블록 근접)', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => w(String(i), 'w' + i));

  test('단어장 안에서 가까운 후보는 오답으로 쓰지 않는다', () => {
    const pool = many(60);
    const answer = pool[30];
    const seen = idsOverRuns(() => buildChoices(pool, answer, byTerm, 4, ctxOf(pool)));
    for (const id of seen) {
      if (id === answer.id) continue;
      expect(Math.abs(Number(id) - 30)).toBeGreaterThan(SAME_TOPIC_DISTANCE);
    }
  });

  test('거리 21은 남는다 (경계)', () => {
    const pool = many(60);
    const answer = pool[30];
    // 거리 21 이상은 9 · 51 · 52 뿐이고 나머지는 전부 20 이내다. 오답 목표가 3개이므로
    // 딱 셋만 남겨 둔다 — 두 개만 두면 목표를 못 채워 폴백이 B를 풀어 버린다.
    const far = ['9', '51', '52'];
    const near = pool.filter(x => far.includes(x.id) || Math.abs(Number(x.id) - 30) <= 20);
    const seen = idsOverRuns(() => buildChoices(near, answer, byTerm, 4, ctxOf(pool)));
    expect([...seen].sort()).toEqual(['30', '51', '52', '9']);
  });
});

describe('buildChoices — 폴백 (작은 단어장 보호)', () => {
  test('후보가 모자라면 B를 풀되 A는 유지한다', () => {
    // 5개짜리 단어장 — 전부 인접하므로 B를 그대로 걸면 오답이 0개가 된다.
    const answer = w('1', '국수');
    const pool = [answer, w('2', '라면'), w('3', '비빔밥'), w('4', '영수증'), w('5', '지하철')];
    const frames = { '1': '먹을까요?', '2': '먹을까요?', '3': '주세요.', '4': '없어요.', '5': '어디예요?' };
    const seen = idsOverRuns(() => buildChoices(pool, answer, byTerm, 4, ctxOf(pool, frames)));
    expect(buildChoices(pool, answer, byTerm, 4, ctxOf(pool, frames))).toHaveLength(4);
    expect(seen.has('2')).toBe(false); // A는 살아 있다
  });

  test('그래도 모자라면 A도 풀어 현행 동작으로 되돌아간다', () => {
    // 정답 포함 4개뿐이고 셋 다 같은 문형 — 여기서 A를 고집하면 선택지가 1개가 된다.
    const answer = w('1', '국수');
    const pool = [answer, w('2', '라면'), w('3', '비빔밥'), w('4', '영수증')];
    const frames = { '1': '먹을까요?', '2': '먹을까요?', '3': '먹을까요?', '4': '먹을까요?' };
    expect(buildChoices(pool, answer, byTerm, 4, ctxOf(pool, frames))).toHaveLength(4);
  });

  test('ctx를 넘기지 않으면 동작이 예전과 똑같다 (퀴즈 회귀 방지)', () => {
    const answer = w('1', '국수');
    const pool = [answer, w('2', '라면'), w('3', '비빔밥'), w('4', '영수증')];
    // ctx가 있었다면 전부 걸릴 조건이지만, 안 넘겼으므로 아무것도 걸러지지 않는다.
    expect(buildChoices(pool, answer, byTerm)).toHaveLength(4);
  });

  test('정답은 어떤 조합에서도 선택지에 남는다', () => {
    const answer = w('1', '국수');
    const pool = [answer, w('2', '라면'), w('3', '비빔밥')];
    const frames = { '1': '먹을까요?', '2': '먹을까요?', '3': '먹을까요?' };
    for (const ctx of [undefined, ctxOf(pool, frames), ctxOf(pool, frames, 0)]) {
      expect(buildChoices(pool, answer, byTerm, 4, ctx).map(c => c.id)).toContain('1');
    }
    expect(buildChoices([answer], answer, byTerm, 4, ctxOf([answer], frames))).toHaveLength(1);
  });
});
