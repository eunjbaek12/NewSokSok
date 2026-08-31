// 배너 얼굴 판정과 취소 에러 — 실기에서 드러난 결함 셋의 회귀 테스트.
//
// 셋 다 코드 검토로는 안 잡히고 기기에서만 드러났다:
//
// 1) 🔴 고르기에서 **일부만 골라** 채우면 한도가 멀쩡히 남았는데도 "오늘 광고 혜택을
//    모두 사용했어요"가 떴다(실기에서 잔량 35개). `done && 남은 것 > 0` 을 quota 로
//    보낸 탓이다 — "한도가 잘랐다"와 "사용자가 적게 골랐다"는 다른 사건이다.
//
// 2) 🔴 스누즈로 뜬 배너가 **자기를 지웠다.** 약속을 소비하는 순간 개수 규칙이 거짓이라
//    같은 렌더에서 사라진다. 순수 함수로는 못 잡는 배선이라 소스로 못박는다.
//
// 3) 🔴 [중단] 이 `ReferenceError: Property 'DOMException'` 를 던졌다 — Hermes 에는
//    그 전역이 없다. 하필 abort 리스너 안이라 reject 가 일어나지 않고, 위에서
//    `e?.name === 'AbortError'` 로 갈라 둔 분기가 전부 빗나간다.

import fs from 'fs';
import path from 'path';
import { pickBannerFace, type FacePick } from '../features/bare-words/face';
import { abortError } from '../lib/abort-error';

function pick(over: Partial<FacePick> = {}) {
  const base: FacePick = {
    running: false,
    filled: 0,
    total: 0,
    currentTerm: null,
    notFound: [],
    outcome: null,
    bareCount: 0,
    entryCount: undefined,
    canWatchAd: false,
    adLoading: false,
    adError: null,
    rewardAmount: 20,
  };
  return pickBannerFace({ ...base, ...over });
}

/** 주석·빈 줄을 걷어낸 소스. 주석에 남은 옛 이력이 소스 검사에 걸리지 않게 한다. */
function codeOf(rel: string): string {
  const raw = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  return raw
    .split('\n')
    .filter(l => {
      const t = l.trim();
      return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

describe('배너 얼굴', () => {
  it('진행 중이면 다른 무엇보다 먼저 running', () => {
    const face = pick({ running: true, filled: 3, total: 8, currentTerm: 'dale', outcome: 'done', bareCount: 5 });
    expect(face).toEqual({ kind: 'running', filled: 3, total: 8, term: 'dale' });
  });

  it('하나도 못 채우고 전부 못 찾은 단어면 성과를 말하지 않는다', () => {
    const face = pick({ filled: 0, notFound: ['qxzvbn', 'wkjqzp'], outcome: 'done', bareCount: 2 });
    expect(face).toEqual({ kind: 'notFound', terms: ['qxzvbn', 'wkjqzp'] });
  });

  it('고른 것을 다 채웠고 남은 것도 없으면 완료', () => {
    expect(pick({ filled: 6, outcome: 'done', bareCount: 0 })).toEqual({ kind: 'done', filled: 6 });
  });

  // 🔴 결함 1 의 회귀. partial 을 quota 로 되돌리면 이 두 개가 깨진다.
  it('고른 것은 다 채웠는데 반쪽이 남으면 partial — quota 가 아니다', () => {
    const face = pick({ filled: 3, outcome: 'done', bareCount: 3, canWatchAd: false });
    expect(face).toEqual({ kind: 'partial', filled: 3, remaining: 3 });
  });

  it('partial 에는 광고 정보가 실리지 않는다 — 한도 얘기를 할 자리가 아니다', () => {
    const face = pick({ filled: 3, outcome: 'done', bareCount: 3, canWatchAd: true, rewardAmount: 20 });
    expect(face).not.toHaveProperty('canWatchAd');
    expect(face).not.toHaveProperty('rewardAmount');
  });

  it('한도가 대상을 잘랐을 때만 quota — 광고 상태를 그대로 싣는다', () => {
    const face = pick({ filled: 50, outcome: 'quota', bareCount: 124, canWatchAd: true, rewardAmount: 20 });
    expect(face).toEqual({
      kind: 'quota', filled: 50, remaining: 124,
      canWatchAd: true, adLoading: false, adError: null, rewardAmount: 20,
    });
  });

  it('사용자가 멈추면 stopped — 채운 것은 남고 이어갈 문이 열린다', () => {
    expect(pick({ filled: 4, outcome: 'stopped', bareCount: 2 }))
      .toEqual({ kind: 'stopped', filled: 4, remaining: 2 });
  });

  it('권유 얼굴은 큰 수가 앞이고 늘어난 수가 둘째 줄', () => {
    expect(pick({ bareCount: 210, entryCount: 124 })).toEqual({ kind: 'idle', count: 210, added: 86 });
  });

  it('처음 뜨거나 줄어든 뒤라면 늘어난 수를 말하지 않는다', () => {
    expect(pick({ bareCount: 174 })).toEqual({ kind: 'idle', count: 174, added: undefined });
    expect(pick({ bareCount: 100, entryCount: 174 })).toEqual({ kind: 'idle', count: 100, added: undefined });
  });
});

describe('스누즈로 뜬 배너는 소비 뒤에도 그 화면에서 사라지지 않는다', () => {
  // 🔴 결함 2 의 회귀. 순수 함수로 표현할 수 없는 배선(state 유지)이라 소스로 못박는다.
  const code = codeOf('features/bare-words/BareWordsSection.tsx');

  it('visible 계산이 snoozeOpened 를 함께 본다', () => {
    const line = code.split('\n').find(l => l.includes('const visible ='));
    expect(line).toBeTruthy();
    // 한 줄로 끝나지 않을 수 있으니 그 뒤까지 본다.
    const at = code.indexOf('const visible =');
    const stmt = code.slice(at, code.indexOf(';', at));
    expect(stmt).toContain('shouldShowBanner');
    expect(stmt).toContain('snoozeOpened');
  });

  it('소비할 때 snoozeOpened 를 세운다', () => {
    const at = code.indexOf('consumeSnooze(entry)');
    expect(at).toBeGreaterThan(-1);
    expect(code.slice(Math.max(0, at - 200), at)).toContain('setSnoozeOpened(true)');
  });
});

describe('취소 에러', () => {
  it('name 이 AbortError 다 — 위쪽 분기가 전부 이 이름으로 갈린다', () => {
    const e = abortError();
    expect(e.name).toBe('AbortError');
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe('Aborted');
  });

  // 🔴 결함 3 의 회귀. Hermes 에 없는 전역이라 되살아나면 중단이 조용히 깨진다.
  it('취소 경로가 DOMException 을 다시 쓰지 않는다', () => {
    for (const rel of ['lib/translation-api.ts', 'lib/gemini-api.ts', 'lib/enrich-queue-core.ts']) {
      expect(codeOf(rel)).not.toContain('DOMException');
    }
  });
});
