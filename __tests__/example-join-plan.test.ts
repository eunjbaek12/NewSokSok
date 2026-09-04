/**
 * 채운 단어를 **언제** 붙이는가 — 시점 판정.
 *
 * 🔴 이 파일이 존재하는 이유(2026-09-03 iOS 실기): 3개를 채우고 「다 채웠어요」까지 본
 * 사람이 화면을 보고 **「다 채워졌는데 문항은 5개야」**라고 읽었다. 설계대로 도는데도
 * 안 된 것으로 보였다 — 합류가 묶음이 끝날 때까지 침묵했기 때문이다.
 *
 * 🔑 이 파일이 지키는 문장은 둘이다.
 *   ① 「전체」에는 경계가 없으므로 **기다릴 이유도 없다.**
 *   ② 숫자로 정한 경계는 **사용자의 것**이라 채우기가 지울 수 없다.
 */

import { shouldJoinNow } from '../features/study/examples/join-plan';

const join = (over: Partial<Parameters<typeof shouldJoinNow>[0]> = {}) =>
  shouldJoinNow({ batchSize: 'all', filling: false, studyCount: 5, joinableCount: 3, ...over });

describe('shouldJoinNow — 「전체」는 기다리지 않는다', () => {
  it('🔴 채우기가 끝나면 즉시 붙인다 — 5문항 세션에 3개를 채운 실기 그 자체', () => {
    // 진도가 3/5 에서 3/8 로 한 번에 오른다. 이것을 안 하면 5번째를 풀 때까지 화면이 침묵한다.
    expect(join()).toBe(true);
  });

  it('채우는 중에는 붙이지 않는다 — 문항이 하나씩 늘면 진도 표시가 흔들린다', () => {
    // 스펙 §6 이 1안(진행 중 하나씩)을 버린 이유가 이것이고, 그 판단은 그대로 살아 있다.
    expect(join({ filling: true })).toBe(false);
  });

  it('붙일 것이 없으면 아무 일도 하지 않는다', () => {
    expect(join({ joinableCount: 0 })).toBe(false);
  });

  it('🔴 채우는 중이면서 붙일 것이 있어도 기다린다 — 두 조건이 겹칠 때', () => {
    expect(join({ filling: true, joinableCount: 12 })).toBe(false);
  });
});

describe('shouldJoinNow — 숫자로 정한 묶음은 사용자의 것이다', () => {
  it('🔴 5개씩 끊어 달라고 한 사람에게는 즉시 붙이지 않는다', () => {
    // 붙이면 진도가 3/8 이 되는데 이번 묶음은 여전히 5문항이다 — 화면이 거짓말을 한다.
    // 합류가 사라지는 것은 아니다: 묶음이 끝나는 자리의 flushJoin 이 그대로 받는다.
    expect(join({ batchSize: 5 })).toBe(false);
  });

  it('묶음 크기가 대상보다 커도 마찬가지다 — 크기가 아니라 «끊기로 정했는가»가 기준이다', () => {
    expect(join({ batchSize: 20, studyCount: 5, joinableCount: 3 })).toBe(false);
  });

  it('묶음 크기 1 도 사용자가 정한 경계다', () => {
    expect(join({ batchSize: 1 })).toBe(false);
  });
});

describe('shouldJoinNow — 아직 열리지 않은 세션', () => {
  it('🔴 출제할 것이 하나도 없으면 여기서 붙이지 않는다 — 첫 개방이 맡는 자리다', () => {
    // 예문 있는 단어가 0개인 「채워야 시작된다」 화면. 두 곳이 같은 일을 하면 규칙이 갈린다.
    expect(join({ studyCount: 0 })).toBe(false);
  });

  it('첫 문항이 하나라도 있으면 이 판정이 맡는다', () => {
    expect(join({ studyCount: 1, joinableCount: 1 })).toBe(true);
  });
});
