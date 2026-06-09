// Localize system/internal tags (AI생성, 초급/중급/고급) for display.
//
// Tags are stored as stable Korean sentinels (they double as detection keys —
// e.g. ListCard checks `tags.includes(AI_GENERATED_TAG)`), so we never localize
// at storage time. Instead, render-time spots map known internal tags to the
// current UI language via i18n. User-typed tags, topics, and categories are not
// in the map and pass through unchanged.

import { INTERNAL_TAG_I18N } from '@shared/contracts';

export function displayTag(tag: string, t: (key: string) => string): string {
  const key = INTERNAL_TAG_I18N[tag];
  return key ? t(key) : tag;
}
