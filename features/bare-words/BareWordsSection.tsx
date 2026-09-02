/**
 * 배너 + 시트 + 실행을 하나로 묶는 컨테이너. 단어장 화면은 이것 하나만 렌더한다.
 *
 * 배선을 여기 모으는 이유: app/list/[id].tsx 는 이미 1,275줄이고, 이 기능만도 상태가
 * 예닐곱 개(표시 상태·시트·진행·광고)다. 화면 파일에 풀어 놓으면 어느 상태가 어느 기능의
 * 것인지 구분이 안 된다.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useSettings } from '@/features/settings';
import { useQuotaStore, useRewardedAd, getQuotaLeft } from '@/features/quota';
import { deriveDisplayLanguages } from '@/constants/languages';
import { todayStr, addDaysStr } from '@/features/stats';
import type { VocaList, Word } from '@/lib/types';
import { splitBareWords, isBareWord } from './detect';
import {
  shouldShowBanner, reconcileCount, afterDismiss, afterSnooze, consumeSnooze,
  type BareNoticeEntry,
} from './notice';
import { loadBareNotice, saveBareNoticeEntry } from './notice-store';
import { takePendingFill } from './pick-handoff';
import { loadUnfillable, pruneUnfillable } from './unfillable';
import { useBareFill } from './useBareFill';
import { pickBannerFace } from './face';
import BareWordsBanner from './BareWordsBanner';
import BareWordsSheet from './BareWordsSheet';

export default function BareWordsSection({
  listId, list, words,
}: {
  listId: string;
  list: VocaList | undefined;
  words: Word[];
}) {
  const { apiKey } = useSettings();
  // 렌더용 잔량 — store 를 구독해야 광고 보상·다른 화면의 소진이 이 화면에 반영된다.
  // 실행 시점의 잔량은 useBareFill 이 getState() 로 따로 읽는다(사진 스캔과 같은 갈래).
  const quotaStatus = useQuotaStore(s => s.status);
  const quotaLeftForUi = apiKey ? null : getQuotaLeft(quotaStatus);

  // AI 가 못 찾은 단어 — 배너·시트·채우기 대상에서 뺀다(주황 점은 그대로 남는다).
  const [unfillable, setUnfillable] = useState<ReadonlySet<string>>(() => new Set());
  const split = useMemo(() => splitBareWords(words, unfillable), [words, unfillable]);
  const bare = split.fillable;
  const bareCount = bare.length;
  const langs = useMemo(() => deriveDisplayLanguages(words, list), [words, list]);

  const fill = useBareFill(listId, list, langs, apiKey || undefined);

  const [entry, setEntry] = useState<BareNoticeEntry | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** 배너를 닫은 뒤 이 화면에 머무는 동안은 다시 그리지 않는다(저장값과 별개). */
  const [hiddenNow, setHiddenNow] = useState(false);
  /**
   * 스누즈 약속으로 이번 화면에서 배너를 열었다.
   *
   * 🔴 이것이 없으면 **배너가 뜨자마자 자기를 지운다.** 약속을 소비하는 순간 저장값에서
   * snoozeUntil 이 빠지고, 개수 규칙(`현재 > 닫을 때`)은 거짓이라 같은 렌더에서 사라진다 —
   * "내일 한 번 뜬다"는 §6 의 약속이 한 프레임만 지켜졌다. 실기에서 이렇게 드러났다:
   * 저장값의 snoozeUntil 은 소비됐는데(= 한 번 보였다는 증거) 화면엔 배너가 없었다.
   */
  const [snoozeOpened, setSnoozeOpened] = useState(false);

  const today = todayStr();

  const persist = useCallback((next: BareNoticeEntry | undefined) => {
    setEntry(next);
    void saveBareNoticeEntry(listId, next);
  }, [listId]);

  // 못 찾은 단어 목록. 🔴 화면에 돌아올 때마다 다시 읽는다 — 고르기 화면에서 철자를
  // 고치면 거기서 표시가 풀리는데, 마운트 때만 읽으면 이 화면이 옛 값을 계속 쓴다.
  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      const ids = await loadUnfillable();
      if (alive) setUnfillable(ids);
    })();
    return () => { alive = false; };
  }, []));

  // 🔴 화면에 들어올 때마다 저장값을 현재값까지 낮춘다. 이 한 줄이 없으면 174에서 닫고 →
  // 채우고 → 다시 174가 돼도 `174 > 174`가 거짓이라 배너가 영영 돌아오지 않는다.
  useEffect(() => {
    let alive = true;
    (async () => {
      const map = await loadBareNotice();
      if (!alive) return;
      const stored = map[listId];
      const fixed = reconcileCount(stored, bareCount);
      setEntry(fixed);
      setLoaded(true);
      if (fixed !== stored) void saveBareNoticeEntry(listId, fixed);
    })();
    return () => { alive = false; };
    // 최초 1회만 — 이후의 낮추기는 아래 effect 가 맡는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);

  // 채우는 동안 개수가 줄어드는 것도 같은 규칙으로 따라 내린다.
  useEffect(() => {
    if (!loaded) return;
    const fixed = reconcileCount(entry, bareCount);
    if (fixed !== entry) persist(fixed);
  }, [bareCount, entry, loaded, persist]);

  const visible = loaded && !hiddenNow
    && (shouldShowBanner(entry, bareCount, today) || (snoozeOpened && bareCount > 0));

  // 스누즈로 뜬 배너는 보여준 그 순간 약속을 소비한다 — 안 하면 "내일 한 번"이
  // 그날부터 영영이 된다(snoozeUntil 이 과거로 남아 매번 참). 대신 이 화면에 머무는
  // 동안은 snoozeOpened 가 배너를 붙잡는다(위 주석).
  useEffect(() => {
    if (!loaded || hiddenNow || bareCount <= 0) return;
    if (!entry?.snoozeUntil || today < entry.snoozeUntil) return;
    setSnoozeOpened(true);
    persist(consumeSnooze(entry));
  }, [loaded, hiddenNow, bareCount, entry, today, persist]);

  /**
   * 광고를 본 뒤 무엇을 할 것인가.
   *
   * 잔량 0 에서 본 광고는 시트를 ①의 얼굴로 **되돌린다** — 174개 중 20개만 되는 상황에서는
   * 어느 20개인지가 실제로 중요하고 ①에 [채울 단어 고르기]가 있다. 반대로 「광고 보고 N개
   * 채우기」는 **개수를 이미 약속했으므로** 광고가 끝나면 그대로 채운다. 약속한 문장이 다르면
   * 다음 동작도 달라야 한다.
   */
  const adIntentRef = useRef<'reopen' | 'fillAll'>('reopen');

  // 🔴 onGranted 는 setLoading(false) **앞에서** 불린다. 재진입 가드로 loading 을 보면
  // 여기서 시작한 채우기가 조용히 죽는다(useBareFill 은 AbortController 로 판정한다).
  const rewarded = useRewardedAd({
    onGranted: () => {
      fill.clearOutcome();
      if (adIntentRef.current === 'fillAll') {
        adIntentRef.current = 'reopen';
        setSheetOpen(false);
        // 대상은 전부 넘긴다 — 한도 자르기는 실행부가 하므로 여기서 수를 다시 세지 않는다.
        void fill.fill(bare);
        return;
      }
      setSheetOpen(true);
    },
  });

  const watchAd = useCallback((intent: 'reopen' | 'fillAll') => {
    adIntentRef.current = intent;
    rewarded.watch();
  }, [rewarded]);

  // 배치가 끝나면 방금 표시된 "못 찾은 단어"를 반영한다 — 그래야 다음 배치에서 빠진다.
  // 동시에 더 이상 반쪽이 아닌 id 를 정리해 기억이 무한히 자라지 않게 한다.
  useEffect(() => {
    if (fill.running || !fill.outcome) return;
    let alive = true;
    (async () => {
      const stillBare = new Set(words.filter(isBareWord).map(w => w.id));
      await pruneUnfillable(stillBare);
      const ids = await loadUnfillable();
      if (alive) setUnfillable(ids);
    })();
    return () => { alive = false; };
  }, [fill.running, fill.outcome, words]);

  // 고르기 화면에서 돌아왔다 — 고른 것을 그 순서대로 채운다.
  // takePendingFill 은 읽으면서 비우므로 다시 들어와도 재실행되지 않는다.
  useFocusEffect(useCallback(() => {
    const ids = takePendingFill(listId);
    if (!ids) return;
    const byId = new Map(words.map(w => [w.id, w]));
    const picked = ids.map(i => byId.get(i)).filter((w): w is Word => !!w);
    if (picked.length > 0) void fill.fill(picked);
    // fill 은 매 렌더 새 객체지만 여기서 구독할 이유가 없다(포커스 시 1회).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, listId]));

  if (!visible && !fill.running && !fill.outcome) return null;

  const face = pickBannerFace({
    running: fill.running,
    // 「마무리하는 중」·「기다리는 중」도 배너가 진다 — 단어장 화면에는 칩이 없다.
    stopping: fill.stopping,
    waitingUntil: fill.waitingUntil,
    filled: fill.filled,
    total: fill.total,
    currentTerm: fill.currentTerm,
    notFound: fill.notFound,
    outcome: fill.outcome,
    bareCount,
    entryCount: entry?.count,
    canWatchAd: rewarded.canWatch,
    adLoading: rewarded.loading,
    adError: rewarded.error,
    rewardAmount: rewarded.rewardAmount,
  });

  return (
    <>
      <BareWordsBanner
        face={face}
        onOpenSheet={() => setSheetOpen(true)}
        onDismiss={() => {
          // 진행 결과 배너(완료·중단·한도)의 ✕ 는 결과만 지운다 — 권유 배너로 돌아가되,
          // 대상이 남아 있으면 개수 규칙이 다시 판정한다.
          if (fill.outcome) { fill.clearOutcome(); return; }
          persist(afterDismiss(bareCount));
          setHiddenNow(true);
        }}
        onStop={fill.stop}
        onResume={() => { fill.clearOutcome(); void fill.fill(bare); }}
        onWatchAd={() => watchAd('reopen')}
        onSnooze={() => {
          persist(afterSnooze(bareCount, addDaysStr(today, 1)));
          fill.clearOutcome();
          setHiddenNow(true);
        }}
        onOpenPlans={() => router.push('/plans')}
      />

      <BareWordsSheet
        visible={sheetOpen}
        bareCount={bareCount}
        quotaLeft={quotaLeftForUi}
        unlimited={!!apiKey}
        canWatchAd={rewarded.canWatch}
        adLoading={rewarded.loading}
        adError={rewarded.error}
        rewardAmount={rewarded.rewardAmount}
        onClose={() => setSheetOpen(false)}
        onFill={(count) => {
          setSheetOpen(false);
          void fill.fill(bare.slice(0, count));
        }}
        onPick={() => {
          setSheetOpen(false);
          router.push({ pathname: '/fill-bare/[id]', params: { id: listId } });
        }}
        onWatchAd={() => watchAd('reopen')}
        onFillWithAd={() => watchAd('fillAll')}
        onSnooze={() => {
          setSheetOpen(false);
          persist(afterSnooze(bareCount, addDaysStr(today, 1)));
          setHiddenNow(true);
        }}
        onOpenPlans={() => { setSheetOpen(false); router.push('/plans'); }}
      />
    </>
  );
}
