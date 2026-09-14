import type { VocaList } from '@/lib/types';
import { deriveDisplayLanguages } from '@/constants/languages';

// 공유 단어장에 «무엇이 올라가는가»를 한 곳에서 정한다.
//
// 공유 창의 미리보기와 실제 업로드(shareCuration)가 같은 규칙을 읽어야 한다. 예전 미리보기는
// 단어장에 아이콘이 없으면 ✨를 그렸고(실제로는 아이콘 없이 올라갔다), 언어쌍은 단어장 메타를
// 읽었다(실제로는 단어 최빈 언어로 올라갔다). 미리보기가 다르면 사용자는 올라간 뒤에야 안다.

/**
 * 공유 경계 태그 정리 — 하드 실패(zod) 대신 조용히 걸러낸다(태그는 부가 정보라 태그 하나
 * 때문에 공유 전체가 막히면 안 됨). 서버 CHECK(jsonb array·2KB)와 같은 계약의 상한.
 */
export function sanitizeShareTags(tags: string[] | undefined): string[] | null {
  if (!tags?.length) return null;
  const cleaned = tags
    .map(t => t.trim())
    .filter(t => t.length > 0 && t.length <= 60)
    .slice(0, 20);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * 공유 단어장에 올라갈 모습. 반환값은 공유 탭이 서버에서 받아 그리는 모양과 같다 —
 * 호출부는 이것을 `communityToCard`에 그대로 넘겨 목록과 같은 카드로 그린다.
 */
export function toSharedThemePreview(list: VocaList, creatorName: string): VocaList {
  const { source, target } = deriveDisplayLanguages(list.words, list);
  return {
    ...list,
    icon: list.icon || undefined,
    creatorName: creatorName.trim() || undefined,
    sourceLanguage: source,
    targetLanguage: target,
    words: list.words.map(w => ({ ...w, tags: sanitizeShareTags(w.tags) ?? [] })),
  };
}

/**
 * 공유할 때 붙는 작성자 이름. **닉네임만 쓴다 — Google 계정 이름으로 대신하지 않는다.**
 *
 * 예전에는 닉네임이 비면 `full_name`(Google 계정 실명 전체)으로 올렸다. 공유 창은 그 이름을
 * 보여 주지 않았으므로 사용자는 실명이 공개되는지 모른 채 올렸다(2026-09-11 실측: 공유된 덱 2개가
 * 모두 작성자명 = Google 실명). 비어 있으면 null — 호출부가 닉네임을 먼저 받는다.
 */
export function resolveShareCreatorName(nickname: string | undefined | null): string | null {
  const trimmed = (nickname ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}
