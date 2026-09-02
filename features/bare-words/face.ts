/**
 * 배너가 지금 어떤 얼굴이어야 하는가 — 순수 함수.
 *
 * 화면(BareWordsSection)에서 뽑아낸 이유는 하나다: **여기가 실기에서 두 번 틀린 자리**라
 * 테스트로 붙들어야 한다. 컴포넌트 안의 클로저로 두면 어느 조합이 어느 얼굴이 되는지
 * 눈으로 확인하는 수밖에 없고, 그 눈이 두 번 다 놓쳤다.
 *
 * 판정은 한 곳에만 둔다 — rewarded-copy.ts 주석의 사고가 *제목·본문·버튼이 각자 판정하다
 * 제목만 소진 분기를 빠뜨린 것*이었다.
 */

import type { BareFillOutcome } from './useBareFill';

export type BannerFace =
  | { kind: 'idle'; count: number; added?: number }
  | { kind: 'running'; filled: number; total: number; term: string | null }
  /**
   * 서버가 429 로 «조금 쉬라»고 답해 다음 호출을 기다리는 중.
   *
   * 🔑 **진행의 한 갈래이지 실패가 아니다.** 큐는 그 단어를 버리지 않고 남은 초만큼 기다렸다
   * 다시 부른다. 이 얼굴이 없으면 화면이 최대 60초 동안 「채우는 중」에 얼어붙어 고장으로
   * 보인다(그 60초는 `MAX_RETRY_AFTER_SEC`).
   */
  | { kind: 'waiting'; filled: number; total: number; term: string | null; waitingUntil: number }
  /**
   * [중단]을 눌렀고, **이미 나간 요청을 받는 중**이다.
   *
   * 🔴 이 얼굴에는 다시 멈출 길을 주지 않는다 — 이미 멈춘 뒤라 멈출 것이 없는데 버튼이
   * 남아 있으면 «아직 안 멈췄나»로 읽힌다.
   */
  | { kind: 'stopping'; filled: number; total: number }
  /** 사용자가 [중단] 을 눌렀다. */
  | { kind: 'stopped'; filled: number; remaining: number }
  /**
   * 고른 것은 다 채웠는데 단어장에 반쪽이 남았다(고르기에서 일부만 골랐을 때).
   *
   * 🔴 이것을 quota 로 보내면 **한도가 멀쩡히 남아 있는데 "오늘 광고 혜택을 모두
   * 사용했어요"라고 거짓말한다.** 실기에서 잔량 35개를 두고 그 문구가 떴다.
   * 남은 것이 있으니 문은 열어 두되(= stopped 와 같은 틀) 성과를 그대로 말한다.
   */
  | { kind: 'partial'; filled: number; remaining: number }
  | { kind: 'quota'; filled: number; remaining: number; canWatchAd: boolean; adLoading: boolean; adError: string | null; rewardAmount: number }
  | { kind: 'done'; filled: number }
  /** 채운 것이 하나도 없고 전부 "AI 가 모르는 단어"였다. terms 는 이름을 대는 데 쓴다. */
  | { kind: 'notFound'; terms: string[] };

export interface FacePick {
  /** 배치 실행 상태(useBareFill). */
  running: boolean;
  /** [중단]을 눌렀고 아직 받는 중. `running` 과 함께 참일 때만 뜻이 있다. */
  stopping?: boolean;
  /**
   * 429 로 쉬는 중이면 **다시 부를 시각**(epoch ms). 아니면 null.
   * 🔑 남은 초가 아니라 시각인 이유: 초로 주면 1초마다 이 판정을 다시 돌려야 하는데,
   * 그러면 도는 내내 화면 전체가 초당 한 번씩 다시 그려진다. 세는 것은 시트가 혼자 한다.
   */
  waitingUntil?: number | null;
  filled: number;
  total: number;
  currentTerm: string | null;
  notFound: string[];
  outcome: BareFillOutcome | null;
  /** 지금 채울 수 있는 반쪽 수(못 찾은 단어는 이미 빠진 값). */
  bareCount: number;
  /** 마지막으로 닫았을 때의 개수 — 늘어난 수를 둘째 줄에 적는 데 쓴다. */
  entryCount?: number;
  /** 광고 상태. quota 얼굴에만 쓰인다. */
  canWatchAd: boolean;
  adLoading: boolean;
  adError: string | null;
  rewardAmount: number;
}

/**
 * 얼굴은 상태 하나로 갈린다 — 진행 중 > 결과 > 권유 순.
 *
 * 도는 동안은 다시 셋으로 갈린다: **멈추는 중 > 기다리는 중 > 도는 중**. 순서가 이런 이유는
 * [중단]을 누른 뒤에도 429 대기가 남아 있을 수 있는데, 그때 사용자에게 중요한 것은
 * «곧 멈춘다»이지 «서버를 기다린다»가 아니기 때문이다.
 */
export function pickBannerFace(s: FacePick): BannerFace {
  if (s.running) {
    if (s.stopping) return { kind: 'stopping', filled: s.filled, total: s.total };
    if (s.waitingUntil != null) {
      return { kind: 'waiting', filled: s.filled, total: s.total, term: s.currentTerm, waitingUntil: s.waitingUntil };
    }
    return { kind: 'running', filled: s.filled, total: s.total, term: s.currentTerm };
  }

  // 🔴 하나도 못 채웠고 전부 "AI 가 모르는 단어"였다면 성과를 말하지 않는다.
  if (s.filled === 0 && s.notFound.length > 0) {
    return { kind: 'notFound', terms: s.notFound };
  }

  if (s.outcome === 'stopped') {
    return { kind: 'stopped', filled: s.filled, remaining: s.bareCount };
  }

  // 한도가 대상을 잘랐다 — 오늘 더 못 하니 광고·내일·Pro 로 갈린다.
  if (s.outcome === 'quota') {
    return {
      kind: 'quota',
      filled: s.filled,
      remaining: s.bareCount,
      canWatchAd: s.canWatchAd,
      adLoading: s.adLoading,
      adError: s.adError,
      rewardAmount: s.rewardAmount,
    };
  }

  if (s.outcome === 'done') {
    // 🔴 남은 반쪽이 있으면 "모두 준비됐어요"는 거짓이고, 한도 얘기도 거짓이다.
    return s.bareCount > 0
      ? { kind: 'partial', filled: s.filled, remaining: s.bareCount }
      : { kind: 'done', filled: s.filled };
  }

  // 다시 뜬 이유가 "늘어서"이면 늘어난 수를 둘째 줄에 적는다. 🔴 대상은 언제나 전부다.
  const added = s.entryCount != null && s.bareCount > s.entryCount
    ? s.bareCount - s.entryCount
    : undefined;
  return { kind: 'idle', count: s.bareCount, added };
}
