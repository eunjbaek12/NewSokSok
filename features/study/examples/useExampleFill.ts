/**
 * 예문 학습의 「예문 없는 단어 채우기」 배선 — 대상·시트·광고·실행을 한 곳에 모은다.
 *
 * 이 기능이 생긴 이유는 하나다. **예문 학습이 묻지 않고 한도를 썼다** — 예문 없는 단어가
 * 섞인 단어장에서 학습을 열면 그 단어 전부를 배경에서 AI로 채웠고, 한 번의 탭이 하루치
 * 한도를 넘겼다(Free 50단어/일). 이제 규칙은 하나다:
 *
 *   **AI가 단어를 채우는 일은 언제나 사용자가 누른 버튼 뒤에서만 일어난다.**
 *
 * 🔑 따라오는 것 하나 — **거절이 실패가 되면 안 된다.** 「예문 학습」이 한 약속은 학습이지
 * 생성이 아니다. 예문 있는 단어가 8개면 8개로 학습이 성립하고, 배너를 무시하면 그것으로
 * 끝이다(차감 없음).
 *
 * 🔑 배너·시트·차감·부분 채움 판정·고르기 화면은 1.6.2 채우기의 것을 **그대로** 쓴다.
 * 갈리는 것은 대상 하나다 — 저쪽은 `isBareWord`(뜻만 있는 단어), 여기는 `needsExample`.
 * 두 집합은 28% 어긋나므로(예문 없는 단어 1,672 중 460) 대상을 갈아 끼우지 않으면
 * 「12개」라고 알린 뒤 4개만 채워진다(docs/example-study-consent-spec.md §3).
 *
 * 🔴 **컴포넌트가 아니라 훅인 이유**: 예문 학습 화면은 출제할 것이 없으면 이른 return 으로
 * 완전히 다른 트리를 그린다. 배선을 컴포넌트로 두면 채우다가 첫 단어가 들어오는 순간
 * 화면이 그 갈래를 넘어가면서 **컴포넌트가 언마운트돼 진행 배너가 통째로 사라진다** —
 * 채우기는 계속 도는데 화면은 아무 말도 안 하게 된다. 상태는 화면 최상단(이 훅)에 두고,
 * 배너·시트는 어느 갈래에서 그려도 되는 그림으로만 남긴다.
 *
 * 🔴 여기서는 `pruneUnfillable` 을 부르지 않는다. 그 함수는 **준 집합 밖을 전부 버리므로**
 * 필터에 걸린 일부만 아는 이 화면이 부르면 다른 단어장의 기억까지 지운다. 정리는 단어장
 * 화면(BareWordsSection)이 자기 전체 목록으로 한다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useSettings } from '@/features/settings';
import { useQuotaStore, useRewardedAd, getQuotaLeft } from '@/features/quota';
import { deriveDisplayLanguages } from '@/constants/languages';
import {
  needsExample, splitFillTargets, pickBannerFace, pickChip, useBareFill, takePendingFill, loadUnfillable,
  countsExampleFilled, type BareWordsBannerProps, type BareWordsSheetProps, type ChipView,
} from '@/features/bare-words';
import type { VocaList, Word } from '@/lib/types';

interface Args {
  listId: string;
  list: VocaList | undefined;
  /** 이번 세션이 다루는 단어 전부(필터 결과). 대상도 언어도 여기서 나온다. */
  words: Word[];
  /**
   * 권유 배너를 낼지. 출제할 것이 하나도 없을 때는 화면이 큰 글씨로 직접 말하므로 끈다 —
   * 같은 말을 두 번 하지 않는다. 진행·결과 얼굴은 이 값과 무관하게 언제나 나온다.
   */
  idleBanner: boolean;
}

export interface ExampleFillUi {
  /** 채울 대상 — 예문이 없고 AI 가 못 찾은 것도 아닌 단어, 오래 담아둔 것부터. */
  targets: Word[];
  /** 지금 채우는 중인가. 화면은 이 값으로 **합류를 미룬다**(screen.tsx 의 즉시 합류 주석). */
  running: boolean;
  /**
   * **카드가 없는 화면**(출제할 것이 하나도 없을 때)에서 배너를 그릴 자리인가.
   * 거기서는 뺏을 카드가 없으므로 배너가 모든 얼굴을 그대로 진다.
   */
  showBanner: boolean;
  /**
   * **카드가 있는 화면**에서 권유 배너를 그릴 자리인가 — 세션의 **첫 문항 동안만** 참이다.
   * 나머지는 전부 칩이 진다(chip.ts 머리말: 배너가 카드의 몫을 먹는다).
   */
  showIntroBanner: boolean;
  /** 진도 줄에 얹을 칩. `null` 이면 그릴 것이 없다(대상 0이거나 지금 배너가 그 말을 하고 있다). */
  chip: ChipView | null;
  bannerProps: BareWordsBannerProps;
  sheetProps: BareWordsSheetProps;
  /** 「N개 채우기」를 화면이 직접 낼 때(출제할 것이 없는 화면) 쓰는 진입점. */
  openSheet: () => void;
  /** 첫 문항이 끝났다 — 권유 배너를 칩으로 접는다. */
  collapseBanner: () => void;
  /** 문항이 바뀌었다 — 결과 얼굴을 거둔다. */
  clearResult: () => void;
}

export function useExampleFill({ listId, list, words, idleBanner }: Args): ExampleFillUi {
  const { apiKey } = useSettings();
  // 렌더용 잔량은 store 를 구독해서 읽는다 — 광고 보상이 이 화면에 바로 반영돼야 한다.
  const quotaStatus = useQuotaStore(s => s.status);
  const quotaLeftForUi = apiKey ? null : getQuotaLeft(quotaStatus);
  const langs = useMemo(() => deriveDisplayLanguages(words, list), [words, list]);

  // AI 가 못 찾은 단어는 대상에서 뺀다 — 안 빼면 오래된 순 맨 앞을 영구히 차지해
  // 잔량을 다 먹고 사용자는 0개를 받는다(unfillable.ts 머리말).
  // 🔴 화면에 돌아올 때마다 다시 읽는다. 고르기 화면에서 철자를 고치면 거기서 표시가 풀린다.
  const [unfillable, setUnfillable] = useState<ReadonlySet<string>>(() => new Set());
  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => { const ids = await loadUnfillable(); if (alive) setUnfillable(ids); })();
    return () => { alive = false; };
  }, []));

  const targets = useMemo(
    () => splitFillTargets(words, unfillable, needsExample).fillable,
    [words, unfillable],
  );

  // 🔴 예문 학습은 **예문을 받으러 왔다** — 세는 기준이 다르다(merge.ts 의 countsExampleFilled).
  const fill = useBareFill(listId, list, langs, apiKey || undefined, { countsAsFilled: countsExampleFilled });

  const [sheetOpen, setSheetOpen] = useState(false);
  /**
   * 배너를 닫았다 — **이 세션 동안만**이다.
   *
   * 🔑 단어장 배너와 달리 저장하지 않는다. 저쪽은 들어올 때마다 뜨는 상시 배너라 "언제 다시
   * 뜰까"를 기억해야 하지만, 이것은 학습을 열 때 한 번 나오는 안내다 — 다음에 예문 학습을
   * 열면 그때 다시 묻는 것이 맞다.
   */
  const [dismissed, setDismissed] = useState(false);

  /**
   * 광고를 본 뒤 무엇을 할 것인가.
   *
   * 잔량 0 에서 본 광고는 시트를 ①의 얼굴로 **되돌린다**(어느 것을 채울지 다시 고를 수 있게).
   * 「광고 보고 N개 채우기」는 **개수를 이미 약속했으므로** 광고가 끝나면 그대로 채운다.
   */
  const adIntentRef = useRef<'reopen' | 'fillAll'>('reopen');
  const rewarded = useRewardedAd({
    onGranted: () => {
      fill.clearOutcome();
      if (adIntentRef.current === 'fillAll') {
        adIntentRef.current = 'reopen';
        setSheetOpen(false);
        // 대상은 전부 넘긴다 — 한도 자르기는 실행부가 한다.
        void fill.fill(targets);
        return;
      }
      setSheetOpen(true);
    },
  });

  const watchAd = useCallback((intent: 'reopen' | 'fillAll') => {
    adIntentRef.current = intent;
    rewarded.watch();
  }, [rewarded]);

  // 대상이 사라지면(다 채웠거나 필터가 바뀌었거나) 닫아 둔 기억도 지운다 — 다시 예문 없는
  // 단어가 생기면 물어야 한다.
  useEffect(() => {
    if (targets.length === 0) setDismissed(false);
  }, [targets.length]);

  /**
   * 권유 배너를 접었는가 — **세션의 첫 문항이 끝나면** 참이 되고 다시 열리지 않는다.
   *
   * 🔑 8초 타이머가 아니라 **문항 전환**에 맞추는 이유: 글자 크기 단계는 문항이 바뀔 때만
   * 초기화된다(screen.tsx 의 setSentenceSteps(INITIAL)). 타이머로 접으면 문항 **도중에**
   * 칸만 커지고 글자는 작은 채 남는다 — 단계는 단조 증가라 스스로 되돌아오지 않는다.
   * 접히는 자리를 초기화 자리에 포개면 한 번에 제 크기로 돌아온다.
   */
  const [collapsed, setCollapsed] = useState(false);
  const collapseBanner = useCallback(() => setCollapsed(true), []);

  /**
   * 문항이 바뀌면 결과 얼굴을 거둔다 — 성과는 몇 초면 읽힌다.
   *
   * 🔴 **한도 도달은 예외다.** 그것은 방금 한 일의 결과가 아니라 «오늘의 상태»다. 문항이
   * 바뀌었다고 칩이 ✨ 로 돌아가면 «다시 눌러 보라»는 뜻이 되는데 오늘은 안 된다 —
   * 다음 배치를 시작하거나 광고를 보기 전까지 ⏱ 로 남겨 둔다.
   */
  const { outcome: fillOutcome, clearOutcome } = fill;
  const clearResult = useCallback(() => {
    if (fillOutcome === 'quota') return;
    clearOutcome();
  }, [fillOutcome, clearOutcome]);

  // 고르기 화면에서 돌아왔다 — 고른 것을 그 순서대로 채운다(읽으면서 비우므로 1회만).
  useFocusEffect(useCallback(() => {
    const ids = takePendingFill(listId);
    if (!ids) return;
    const byId = new Map(words.map(w => [w.id, w]));
    const picked = ids.map(i => byId.get(i)).filter((w): w is Word => !!w);
    if (picked.length > 0) void fill.fill(picked);
    // fill 은 매 렌더 새 객체지만 여기서 구독할 이유가 없다(포커스 시 1회).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, listId]));

  const face = pickBannerFace({
    running: fill.running,
    stopping: fill.stopping,
    waitingUntil: fill.waitingUntil,
    filled: fill.filled,
    total: fill.total,
    currentTerm: fill.currentTerm,
    notFound: fill.notFound,
    outcome: fill.outcome,
    bareCount: targets.length,
    canWatchAd: rewarded.canWatch,
    adLoading: rewarded.loading,
    adError: rewarded.error,
    rewardAmount: rewarded.rewardAmount,
  });

  const openSheet = useCallback(() => setSheetOpen(true), []);

  // 권유 배너는 첫 문항까지, 그 뒤로는 칩. 배너가 떠 있는 동안은 칩을 내지 않는다 —
  // 같은 말을 두 번 하지 않는다.
  const showIntroBanner = !collapsed && face.kind === 'idle' && idleBanner && !dismissed && targets.length > 0;

  return {
    targets,
    running: fill.running,
    // 권유 얼굴만 조건부다. 진행·결과는 사용자가 누른 것에 대한 응답이라 언제나 보여준다.
    showBanner: face.kind !== 'idle' || (idleBanner && !dismissed && targets.length > 0),
    showIntroBanner,
    chip: showIntroBanner ? null : pickChip(face),
    collapseBanner,
    clearResult,
    bannerProps: {
      variant: 'example',
      face,
      onOpenSheet: openSheet,
      onDismiss: () => {
        // 결과 배너의 ✕ 는 결과만 지운다 — 대상이 남았으면 권유 배너로 돌아간다.
        if (fill.outcome) { fill.clearOutcome(); return; }
        setDismissed(true);
      },
      onStop: fill.stop,
      onResume: () => { fill.clearOutcome(); void fill.fill(targets); },
      onWatchAd: () => watchAd('reopen'),
      onSnooze: () => { fill.clearOutcome(); setDismissed(true); },
      onOpenPlans: () => router.push('/plans'),
    },
    sheetProps: {
      variant: 'example',
      visible: sheetOpen,
      // 🔑 시트가 **지금 얼굴 그대로** 열린다 — 칩을 누르면 언제든 진행 상황이 보인다.
      // 배너가 지던 [중단]·[이어서 채우기]가 여기로 옮겨 왔다.
      face,
      onStop: fill.stop,
      onResume: () => { setSheetOpen(false); fill.clearOutcome(); void fill.fill(targets); },
      bareCount: targets.length,
      quotaLeft: quotaLeftForUi,
      unlimited: !!apiKey,
      canWatchAd: rewarded.canWatch,
      adLoading: rewarded.loading,
      adError: rewarded.error,
      rewardAmount: rewarded.rewardAmount,
      onClose: () => setSheetOpen(false),
      onFill: (count: number) => {
        setSheetOpen(false);
        void fill.fill(targets.slice(0, count));
      },
      onPick: () => {
        setSheetOpen(false);
        router.push({ pathname: '/fill-bare/[id]', params: { id: listId, target: 'example' } });
      },
      onWatchAd: () => watchAd('reopen'),
      onFillWithAd: () => watchAd('fillAll'),
      onSnooze: () => { setSheetOpen(false); setDismissed(true); },
      onOpenPlans: () => { setSheetOpen(false); router.push('/plans'); },
    },
    openSheet,
  };
}
