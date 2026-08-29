/**
 * 배너 + 시트 + 실행을 하나로 묶는 컨테이너. 단어장 화면은 이것 하나만 렌더한다.
 *
 * 배선을 여기 모으는 이유: app/list/[id].tsx 는 이미 1,275줄이고, 이 기능만도 상태가
 * 예닐곱 개(표시 상태·시트·진행·광고)다. 화면 파일에 풀어 놓으면 어느 상태가 어느 기능의
 * 것인지 구분이 안 된다.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useSettings } from '@/features/settings';
import { useQuotaStore, useRewardedAd, getQuotaLeft } from '@/features/quota';
import { deriveDisplayLanguages } from '@/constants/languages';
import { todayStr, addDaysStr } from '@/features/stats';
import type { VocaList, Word } from '@/lib/types';
import { bareWordsOldestFirst } from './detect';
import {
  shouldShowBanner, reconcileCount, afterDismiss, afterSnooze, consumeSnooze,
  type BareNoticeEntry,
} from './notice';
import { loadBareNotice, saveBareNoticeEntry } from './notice-store';
import { takePendingFill } from './pick-handoff';
import { useBareFill } from './useBareFill';
import BareWordsBanner, { type BannerFace } from './BareWordsBanner';
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

  const bare = useMemo(() => bareWordsOldestFirst(words), [words]);
  const bareCount = bare.length;
  const langs = useMemo(() => deriveDisplayLanguages(words, list), [words, list]);

  const fill = useBareFill(listId, list, langs, apiKey || undefined);

  const [entry, setEntry] = useState<BareNoticeEntry | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** 배너를 닫은 뒤 이 화면에 머무는 동안은 다시 그리지 않는다(저장값과 별개). */
  const [hiddenNow, setHiddenNow] = useState(false);

  const today = todayStr();

  const persist = useCallback((next: BareNoticeEntry | undefined) => {
    setEntry(next);
    void saveBareNoticeEntry(listId, next);
  }, [listId]);

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

  const visible = loaded && !hiddenNow && shouldShowBanner(entry, bareCount, today);

  // 스누즈로 뜬 배너는 보여준 그 순간 약속을 소비한다 — 안 하면 "내일 한 번"이
  // 그날부터 영영이 된다(snoozeUntil 이 과거로 남아 매번 참).
  useEffect(() => {
    if (!visible || !entry?.snoozeUntil) return;
    if (today >= entry.snoozeUntil) persist(consumeSnooze(entry));
  }, [visible, entry, today, persist]);

  // 🔴 onGranted 는 setLoading(false) **앞에서** 불린다. 여기서 시트를 ①의 얼굴로 되돌리기만
  // 하고 곧장 채우지 않는 것이 설계다 — 174개 중 20개만 되는 상황에서는 어느 20개인지가
  // 실제로 중요하고, ①에 [채울 단어 고르기]가 있다. 그대로 갈 사람은 한 번 더 누르면 된다.
  const rewarded = useRewardedAd({
    onGranted: () => {
      fill.clearOutcome();
      setSheetOpen(true);
    },
  });

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

  const face = pickFace();

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
        onWatchAd={rewarded.watch}
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
        onWatchAd={rewarded.watch}
        onSnooze={() => {
          setSheetOpen(false);
          persist(afterSnooze(bareCount, addDaysStr(today, 1)));
          setHiddenNow(true);
        }}
        onOpenPlans={() => { setSheetOpen(false); router.push('/plans'); }}
      />
    </>
  );

  /**
   * 얼굴은 상태 하나로 갈린다 — 진행 중 > 결과 > 권유 순.
   * 판정을 여러 곳에 복제하지 않는다(rewarded-copy.ts 주석의 사고가 그것이었다).
   */
  function pickFace(): BannerFace {
    if (fill.running) {
      return { kind: 'running', filled: fill.filled, total: fill.total, term: fill.currentTerm };
    }
    if (fill.outcome === 'done' && bareCount === 0) {
      return { kind: 'done', filled: fill.filled };
    }
    if (fill.outcome === 'stopped') {
      return { kind: 'stopped', filled: fill.filled, remaining: bareCount };
    }
    if (fill.outcome === 'quota' || (fill.outcome === 'done' && bareCount > 0)) {
      return {
        kind: 'quota',
        filled: fill.filled,
        remaining: bareCount,
        canWatchAd: rewarded.canWatch,
        adLoading: rewarded.loading,
        adError: rewarded.error,
        rewardAmount: rewarded.rewardAmount,
      };
    }
    // 다시 뜬 이유가 "늘어서"이면 늘어난 수를 둘째 줄에 적는다. 🔴 대상은 언제나 전부다.
    const added = entry && bareCount > entry.count ? bareCount - entry.count : undefined;
    return { kind: 'idle', count: bareCount, added };
  }
}
