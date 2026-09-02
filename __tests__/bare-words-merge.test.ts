/**
 * 채우기가 **빈 칸만** 쓰는지 지키는 가드.
 *
 * 이게 없던 동안 `useBareFill` 은 `if (result.phonetic) updates.phonetic = …` 이었다 —
 * 로컬에 값이 있든 없든 AI 값으로 덮었다. 실제 범위는 좁았지만(2026-09-02 실측: 대상
 * 1,212행 중 덮일 수 있는 행 4) **대상을 넓히는 순간 커지는** 종류라 먼저 떼어 고쳤다.
 * 예문 학습에서 "예문 없는 단어"를 대상으로 삼으면 발음·정의를 손으로 적어 둔 단어가
 * 통째로 들어온다(그런 행이 460개).
 *
 * 실패 방식이 조용하다는 점이 이 테스트의 존재 이유다 — 덮어써도 화면은 멀쩡하고,
 * 사용자는 자기가 적은 값이 언제 바뀌었는지 알 방법이 없다.
 */
import { fillableUpdates } from '@/features/bare-words/merge';

const AI = {
  phonetic: 'ˈæpəl',
  exampleEn: 'She ate an apple.',
  exampleKr: '그녀는 사과를 먹었다.',
  definition: 'a round fruit',
  pos: 'noun',
};

const EMPTY = { phonetic: '', exampleEn: '', exampleKr: '', definition: '', pos: '' };

describe('fillableUpdates — 빈 칸만 채운다', () => {
  it('전부 빈 단어는 AI가 준 칸을 모두 받는다', () => {
    expect(fillableUpdates(EMPTY, AI)).toEqual(AI);
  });

  it('손으로 적어 둔 칸은 건드리지 않는다', () => {
    const mine = { ...EMPTY, phonetic: '내가 적은 발음', pos: '내가 적은 품사' };
    const out = fillableUpdates(mine, AI);
    expect(out.phonetic).toBeUndefined();
    expect(out.pos).toBeUndefined();
    // 비어 있던 칸은 그대로 채워진다 — 한도 하나로 값어치는 챙긴다.
    expect(out.exampleEn).toBe(AI.exampleEn);
    expect(out.definition).toBe(AI.definition);
  });

  it('예문만 없는 단어는 예문만 받는다 (예문 학습이 대상을 넓혔을 때의 모양)', () => {
    const target = { ...AI, exampleEn: '', exampleKr: '' };
    expect(fillableUpdates(target, AI)).toEqual({
      exampleEn: AI.exampleEn,
      exampleKr: AI.exampleKr,
    });
  });

  it('AI가 빈 문자열을 주면 쓰지 않는다 (있던 값을 지우면 안 된다)', () => {
    const target = { ...EMPTY, definition: '내가 적은 정의' };
    const out = fillableUpdates(target, { ...AI, phonetic: '', exampleEn: '   ' });
    expect(out.phonetic).toBeUndefined();
    expect(out.exampleEn).toBeUndefined();
    expect(out.definition).toBeUndefined();
  });

  it('공백뿐인 칸은 빈 것으로 본다', () => {
    expect(fillableUpdates({ ...EMPTY, pos: '   ' }, AI).pos).toBe(AI.pos);
  });

  it('채울 게 없으면 빈 객체 — 호출부가 이걸로 "안 셈"을 판정한다', () => {
    expect(fillableUpdates(AI, AI)).toEqual({});
  });

  it('뜻은 목록에 없다 — 어떤 경우에도 meaningKr을 쓰지 않는다', () => {
    const out = fillableUpdates(EMPTY, { ...AI, meaningKr: '덮어쓰면 안 되는 뜻' } as never);
    expect(out).not.toHaveProperty('meaningKr');
  });
});
