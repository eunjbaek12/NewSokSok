/**
 * 학습을 마친 순간의 축하 «순서» 판정.
 *
 * 🔴 이 분기는 여태 어떤 그물에도 안 걸렸다. 완주 테스트 9개는 전부 SQL·마이그레이션이라
 * 「완주와 마일스톤이 겹치면 무엇이 이기는가」를 지나쳤고, 실기에서는 검증 기기의 스트릭이
 * 0일이라 **실행조차 되지 않았다**. 판정이 study-results 화면의 useEffect 안에 있었기
 * 때문이다 — 순수 함수로 빼낸 지금 그 겹침이 표로 고정된다.
 *
 * 여기서 지키는 것 셋:
 *  1. 완주가 마일스톤을 이기되, **진 마일스톤을 소모하지 않는다**(다음 세션에 다시 온다)
 *  2. 공개 플래그가 닫혀 있어도 **마킹은 한다**(켜는 날 옛 완주가 되살아나지 않게)
 *  3. 플래그가 닫힌 세션에서 **마일스톤까지 함께 사라지지 않는다**
 */
import { pickCelebration } from '../features/stats/celebration';
import { COMPLETION_SHARE_ENABLED } from '../features/stats/completion';

const ON = true;
const OFF = false;

describe('pickCelebration — 완주가 스트릭 마일스톤을 이긴다', () => {
  it('완주만 있으면 완주를 띄운다', () => {
    expect(pickCelebration(true, 0, 0, ON)).toEqual({
      markCompletion: true,
      show: { kind: 'completion' },
    });
  });

  it('마일스톤만 있으면 마일스톤을 띄운다', () => {
    expect(pickCelebration(false, 7, 0, ON)).toEqual({
      markCompletion: false,
      show: { kind: 'milestone', milestone: 7 },
    });
  });

  it('🔴 겹치면 완주가 이긴다 — 팝업은 하나뿐이다', () => {
    const plan = pickCelebration(true, 7, 0, ON);
    expect(plan.show).toEqual({ kind: 'completion' });
  });

  it('🔴 진 마일스톤은 소모되지 않는다 — 다음 세션에 그대로 다시 온다', () => {
    // 7일째에 완주가 겹쳐 마일스톤 7 을 건너뛴 세션. maxCelebrated 를 올리는 곳은
    // 호출부의 saveMaxCelebrated 한 줄뿐이고, 그 자리는 show 가 milestone 일 때만 닿는다.
    expect(pickCelebration(true, 7, 0, ON).show).toEqual({ kind: 'completion' });
    // 같은 날 두 번째 세션(완주는 계획당 1회라 이제 없다) → 건너뛴 7 이 그대로 나온다.
    expect(pickCelebration(false, 7, 0, ON).show).toEqual({ kind: 'milestone', milestone: 7 });
  });

  it('둘 다 없으면 아무것도 띄우지 않는다 — 리뷰 요청을 시도할 자리', () => {
    expect(pickCelebration(false, 2, 0, ON)).toEqual({ markCompletion: false, show: null });
  });

  it('이미 축하한 마일스톤은 완주와 무관하게 다시 뜨지 않는다', () => {
    expect(pickCelebration(false, 7, 7, ON).show).toBeNull();
  });
});

describe('pickCelebration — 🚩 공개 플래그가 닫혀 있을 때', () => {
  it('완주를 띄우지 않는다', () => {
    expect(pickCelebration(true, 0, 0, OFF).show).toBeNull();
  });

  it('🔴 그래도 마킹은 한다 — 안 찍으면 켜는 날 옛 완주가 «지금 막»으로 되살아난다', () => {
    expect(pickCelebration(true, 0, 0, OFF).markCompletion).toBe(true);
  });

  it('🔴 마일스톤까지 함께 사라지지 않는다 — 완주에서 멈추지 않고 흘려보낸다', () => {
    const plan = pickCelebration(true, 7, 0, OFF);
    expect(plan.markCompletion).toBe(true);
    expect(plan.show).toEqual({ kind: 'milestone', milestone: 7 });
  });

  it('완주가 없으면 닫힌 플래그는 아무것도 바꾸지 않는다', () => {
    expect(pickCelebration(false, 7, 0, OFF)).toEqual(pickCelebration(false, 7, 0, ON));
    expect(pickCelebration(false, 2, 0, OFF)).toEqual(pickCelebration(false, 2, 0, ON));
  });
});

describe('🚩 완주 자랑하기 공개 플래그', () => {
  /**
   * 10/1 피처링 패키지에서 켠다. 이 테스트는 **켜는 날 함께 걸리라고** 있는 것이다 —
   * 스킨의 `skin-registry.test.ts` 「아직 선택기에는 없다」와 같은 역할이고, 그때
   * 진입점 셋(홈 시트 「자랑하기」 · 내 학습 보관함 줄 · 학습 결과 축하 모달)을 함께
   * 확인하라는 표식이다.
   */
  it('아직 닫혀 있다', () => {
    expect(COMPLETION_SHARE_ENABLED).toBe(false);
  });
});
