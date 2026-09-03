export {
  isBareWord,
  needsExample,
  hasText,
  bareWordsOldestFirst,
  fillTargetsOldestFirst,
  countBareWords,
  type FillTarget,
} from './detect';
export {
  shouldShowBanner,
  reconcileCount,
  afterDismiss,
  afterSnooze,
  consumeSnooze,
  type BareNoticeEntry,
  type BareNoticeMap,
} from './notice';
export { loadBareNotice, saveBareNoticeEntry, forgetBareNotice } from './notice-store';
export { useBareFill, type BareFillOutcome, type BareFillState, type BareFillOptions } from './useBareFill';
export { default as BareWordsSection } from './BareWordsSection';
// 배너·시트는 예문 학습도 그대로 쓴다 — 대상만 갈아 끼운 같은 한 벌이다.
export { default as BareWordsBanner, type BannerVariant, type BareWordsBannerProps } from './BareWordsBanner';
export { default as BareWordsSheet, type SheetVariant, type BareWordsSheetProps } from './BareWordsSheet';
export { pickBannerFace, type BannerFace } from './face';
export { pickChip, type ChipView, type ChipTone, type ChipIcon } from './chip';
export { default as FillChip } from './FillChip';
export { pickAdFillOffer, type AdFillOffer } from './ad-offer';
export { planFill, type FillPlan, type FillPlanInput } from './fill-plan';
export { setPendingFill, takePendingFill } from './pick-handoff';
export { splitBareWords, splitFillTargets } from './detect';
export { fillableUpdates, countsExampleFilled } from './merge';
export { loadUnfillable, markUnfillable, clearUnfillable, pruneUnfillable } from './unfillable';
