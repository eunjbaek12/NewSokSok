/**
 * "뜻만 남은 단어" 판정 — AI 한도를 넘겨 담아 뜻만 채워진 단어를 찾는다.
 *
 * 배경: 한도가 소진되면 자동완성은 막다른 길이 되지 않으려고 `enrichment_level: 'basic'`
 * 으로 **뜻만** 돌려준다(features/quota/basic-notice-copy.ts). 담는 속도는 안 떨어지지만
 * 발음·예문·영영뜻이 빈 단어가 그대로 쌓인다. 2026-08-29 실측으로 한 사용자가 84분에
 * 223단어를 담았고 그중 174개가 이 상태였다.
 *
 * 🔴 판정을 `enrichment_level` 컬럼으로 하지 않는 이유: 로컬 Word(lib/types.ts)에도
 * 서버 cloud_words 에도 그런 칸이 없다. AutoFillResult.enrichmentLevel 은 응답에만 실려
 * 저장되지 않으므로 컬럼을 새로 만들어도 **오늘 쌓여 있는 것들을 소급해서 못 잡는다** —
 * 정작 필요한 대상이 그것이다. 그래서 칸이 비었는지로 판정하고, 오판(손으로 적은 단어)은
 * 고르기 화면에서 사용자가 걷어낸다.
 *
 * 🔴 조건은 AND 다. 세 칸이 **모두** 비어야 한다 — basic 폴백이 채우는 칸이 meaning_kr
 * 하나뿐이라 이 조합이 그 흔적과 정확히 겹친다. OR 로 하면 "예문만 없는 정상 단어"까지
 * 쓸어 담아 대상이 폭증하고, 채워도 안 채워지는 칸을 계속 두드리게 된다.
 */

import type { Word } from '@/lib/types';

/** 값이 실제로 채워져 있는가. 공백뿐인 칸은 빈 것으로 본다. */
function filled(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * 뜻은 있는데 발음·예문·영영뜻이 전부 빈 단어.
 *
 * 뜻조차 없으면 대상이 아니다 — 그건 채우다 만 것이 아니라 아직 아무것도 아닌 것이고,
 * AI 에 보낼 근거(표제어 말고는)도 없다.
 */
export function isBareWord(w: Word): boolean {
  if (!filled(w.meaningKr)) return false;
  return !filled(w.phonetic) && !filled(w.exampleEn) && !filled(w.definition);
}

/**
 * 반쪽 단어를 **오래 담아둔 것부터** 돌려준다.
 *
 * 🔑 순서가 규칙의 일부다. 방금 담은 것부터 채우면 한도가 매번 새 단어에 쓰여
 * 먼저 밀린 것들이 영영 뒤로 간다(docs/fill-bare-words-spec.md §5).
 * createdAt 이 없는 옛 단어는 0 이 되어 맨 앞에 선다 — 실제로 가장 오래된 것들이다.
 */
export function bareWordsOldestFirst(words: Word[]): Word[] {
  return words
    .filter(isBareWord)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

export function countBareWords(words: Word[]): number {
  let n = 0;
  for (const w of words) if (isBareWord(w)) n += 1;
  return n;
}
