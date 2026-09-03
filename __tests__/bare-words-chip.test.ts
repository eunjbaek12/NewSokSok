/**
 * 칩이 무엇을 말하는가 — chip.ts + face.ts 의 새 갈래(기다림·마무리).
 *
 * 예문 학습 화면에서 배너는 카드의 몫을 먹는다(chip.ts 머리말: 문장 칸 143 → 51dp).
 * 그래서 얼굴 다섯이 칩 하나로 접혔는데, 칩에는 **아이콘·숫자·색 셋뿐**이라 상태를 잃기 쉽다.
 * 특히 주황이 둘(429 대기 · 오늘 한도)이라 **숫자 모양이 그 둘을 가르는 유일한 단서**다.
 */

import { pickBannerFace, type BannerFace } from '../features/bare-words/face';
import { pickChip } from '../features/bare-words/chip';

const base = {
  running: false,
  filled: 0,
  total: 0,
  currentTerm: null,
  notFound: [] as string[],
  outcome: null,
  bareCount: 0,
  canWatchAd: true,
  adLoading: false,
  adError: null,
  rewardAmount: 20,
};

describe('pickBannerFace — 도는 동안의 세 갈래', () => {
  it('멈추는 중이 기다리는 중을 이긴다 — 사용자에게 중요한 것은 «곧 멈춘다»', () => {
    const face = pickBannerFace({
      ...base, running: true, stopping: true, waitingUntil: Date.now() + 30_000,
      filled: 2, total: 7,
    });
    expect(face.kind).toBe('stopping');
  });

  it('기다리는 중이 도는 중을 이긴다 — 안 그러면 최대 60초가 「채우는 중」으로 얼어붙는다', () => {
    const until = Date.now() + 18_000;
    const face = pickBannerFace({ ...base, running: true, waitingUntil: until, filled: 2, total: 7 });
    expect(face).toEqual({ kind: 'waiting', filled: 2, total: 7, term: null, waitingUntil: until });
  });

  it('평소에는 도는 중', () => {
    const face = pickBannerFace({ ...base, running: true, filled: 2, total: 7, currentTerm: 'apple' });
    expect(face.kind).toBe('running');
  });

  it('도는 중이 아니면 stopping·waitingUntil 은 무시한다', () => {
    const face = pickBannerFace({
      ...base, running: false, stopping: true, waitingUntil: Date.now() + 9_000,
      outcome: 'done', filled: 3, bareCount: 0,
    });
    expect(face.kind).toBe('done');
  });
});

describe('pickChip — 얼굴 하나가 칩 하나로', () => {
  const chip = (face: BannerFace) => pickChip(face);

  it('할 일은 테두리 + ✨ + 남은 수', () => {
    expect(chip({ kind: 'idle', count: 7 })).toEqual({
      icon: 'sparkles', label: '7', tone: 'ghost', spin: false,
    });
  });

  it('대상이 0이면 칩을 그리지 않는다', () => {
    expect(chip({ kind: 'idle', count: 0 })).toBeNull();
  });

  it('도는 중은 채운 색 + 도는 아이콘 + 진행 꼴', () => {
    expect(chip({ kind: 'running', filled: 2, total: 7, term: 'apple' })).toEqual({
      icon: 'sync', label: '2/7', tone: 'solid', spin: true,
    });
  });

  it('마무리하는 중도 아직 받는 중이라 도는 얼굴을 쓴다', () => {
    expect(chip({ kind: 'stopping', filled: 2, total: 7 })).toEqual({
      icon: 'sync', label: '2/7', tone: 'solid', spin: true,
    });
  });

  it('완료는 ✓ + **받은 수** — 남은 수로 돌아가면 방금 한 일이 사라진다', () => {
    expect(chip({ kind: 'done', filled: 4 })).toEqual({
      icon: 'checkmark', label: '4', tone: 'solid', spin: false,
    });
    expect(chip({ kind: 'stopped', filled: 4, remaining: 3 })?.label).toBe('4');
    expect(chip({ kind: 'partial', filled: 4, remaining: 3 })?.label).toBe('4');
  });

  it('못 찾음은 ⚠ + 못 찾은 수', () => {
    expect(chip({ kind: 'notFound', terms: ['banna', 'recieve'] })).toEqual({
      icon: 'alert-circle', label: '2', tone: 'warn', spin: false,
    });
  });

  it('오늘 한도는 ⏱ + 남은 대상', () => {
    const c = chip({
      kind: 'quota', filled: 2, remaining: 3,
      canWatchAd: true, adLoading: false, adError: null, rewardAmount: 20,
    });
    expect(c).toEqual({ icon: 'time-outline', label: '3', tone: 'warn', spin: false });
  });

  it('🔴 주황 둘은 **숫자 모양**으로 갈린다 — 아이콘·색이 같으므로 여기가 유일한 단서다', () => {
    const waiting = chip({ kind: 'waiting', filled: 2, total: 7, term: null, waitingUntil: 0 })!;
    const quota = chip({
      kind: 'quota', filled: 2, remaining: 3,
      canWatchAd: false, adLoading: false, adError: null, rewardAmount: 20,
    })!;

    expect(waiting.tone).toBe('warn');
    expect(quota.tone).toBe('warn');
    expect(waiting.icon).toBe(quota.icon);      // 같은 아이콘이라
    expect(waiting.label).toContain('/');       // 진행 꼴이면 곧 이어진다
    expect(quota.label).not.toContain('/');     // 단수면 오늘은 끝
  });

  it('도는 얼굴만 아이콘을 돌린다 — 멈춘 화면에서 도는 아이콘은 거짓말이다', () => {
    const spinning: BannerFace[] = [
      { kind: 'running', filled: 1, total: 3, term: null },
      { kind: 'stopping', filled: 1, total: 3 },
    ];
    const still: BannerFace[] = [
      { kind: 'idle', count: 3 },
      { kind: 'waiting', filled: 1, total: 3, term: null, waitingUntil: 0 },
      { kind: 'done', filled: 3 },
      { kind: 'stopped', filled: 1, remaining: 2 },
      { kind: 'partial', filled: 1, remaining: 2 },
      { kind: 'notFound', terms: ['x'] },
      { kind: 'quota', filled: 1, remaining: 2, canWatchAd: true, adLoading: false, adError: null, rewardAmount: 20 },
    ];
    spinning.forEach(f => expect(pickChip(f)?.spin).toBe(true));
    still.forEach(f => expect(pickChip(f)?.spin ?? false).toBe(false));
  });
});
