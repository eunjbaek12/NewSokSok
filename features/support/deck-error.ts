// «단어·번역 오류 알리기»가 문의 표에 싣는 덱 — 판단만 모은 순수 함수.
//
// 화면은 app/deck-error.tsx, 서버 칸은 supabase/migrations/20260914000000.

export interface SupportTheme {
  id: string;
  title: string;
}

// 서버 칸의 상한과 같은 값.
export const THEME_ID_MAX = 64;
export const THEME_TITLE_MAX = 200;

/**
 * insert 에 얹을 덱 칸. **덱이 없으면 키 자체를 싣지 않는다.**
 *
 * PostgREST 는 표에 없는 칸을 값이 null 이어도 거절한다. 칸을 더하는 마이그레이션보다 앱이
 * 먼저 나가면 `theme_id: null` 한 줄 때문에 평소 문의까지 전부 실패한다 — 그래서 제보일 때만 싣는다.
 *
 * id·제목은 둘 다 있어야 싣는다(서버의 짝 제약 chk_support_messages_theme_pair 와 같다).
 */
export function themeColumns(
  theme: SupportTheme | null | undefined,
): { theme_id?: string; theme_title?: string } {
  const id = theme?.id.trim();
  const title = theme?.title.trim();
  if (!id || !title) return {};
  return { theme_id: id.slice(0, THEME_ID_MAX), theme_title: title.slice(0, THEME_TITLE_MAX) };
}

/**
 * 전송이 실패해 메일 앱으로 보낼 때 본문 맨 앞에 붙는 줄. 메일에는 칸이 없으니 본문에 적는다.
 * 읽는 사람이 운영자라 앱 언어와 무관하게 한국어 표지로 고정한다(알림 메일과 같은 기준).
 */
export function themeMailLines(theme: SupportTheme | null | undefined): string[] {
  const cols = themeColumns(theme);
  if (!cols.theme_id) return [];
  return [`[단어장] ${cols.theme_title} (${cols.theme_id})`, ''];
}
