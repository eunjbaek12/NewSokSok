-- 공식 단어장 «단어·번역 오류 알리기» — 문의 표에 «어느 덱» 칸
--
-- 설계: 목업 아티팩트 «오류 알리기 흐름»(2026-09-14 확정). 공식 덱 상세 오른쪽 위 버튼이
-- 여는 전용 화면(app/deck-error.tsx)이 support_messages 에 행 하나를 넣는다. 문의하기와
-- 같은 표를 쓰는 이유: 운영자 답장 경로(reply_body → 앱 설정 › 문의하기 + 배지), 하루 5건
-- 제한, 알림 웹훅을 그대로 받는다.
--
-- 덱을 본문이 아니라 칸에 두는 이유:
--   1) 본문에 «[단어장] 제목 (id)»를 붙이면 문의하기가 그 본문을 인용하면서 내부 id 가
--      사용자에게 보인다.
--   2) 문의하기는 답장 없는 최근 메시지를 «읽고 답장드릴게요» 카드로 띄운다. 이 화면은 답장을
--      약속하지 않으므로 답장이 오기 전에는 목록에서 빼야 하는데, category='content' 로는
--      문의하기에서 칩으로 고른 일반 문의와 가를 수 없다.
--   3) 알림 메일 제목에 덱 이름을 넣는다 — 본문 첫 줄을 문자열로 파싱하지 않고 칸에서 읽는다.
--
-- FK 를 걸지 않는다: 제보는 «그때 사용자가 본 덱»의 기록이다. 덱이 내려가거나 id 가 바뀌어도
-- 제보는 남아야 하고, 제목도 그 시점 값을 보존한다.
--
-- 🔴 앱보다 먼저 적용한다. 새 앱은 제보일 때 insert 에 theme_id 를 싣는데, 칸이 없으면
--    PostgREST 가 거절해 제보가 실패한다. 칸이 먼저 생기는 건 구버전 앱에 영향이 없다
--    (싣지 않고, 조회 RPC 의 새 조건은 theme_id 가 빈 행을 전부 그대로 준다).

alter table public.support_messages
  add column if not exists theme_id    text
    check (theme_id is null or char_length(theme_id) <= 64),
  add column if not exists theme_title text
    check (theme_title is null or char_length(theme_title) <= 200);

-- 둘은 함께 온다. 하나만 있으면 메일 제목·답장 카드가 반쪽을 그린다.
do $$
begin
  alter table public.support_messages
    add constraint chk_support_messages_theme_pair
    check ((theme_id is null) = (theme_title is null));
exception when duplicate_object then null;
end $$;

-- 조회 RPC — 답장이 오지 않은 제보는 주지 않는다.
-- 20260728000000 본문에 마지막 조건 한 줄만 더했다. 조건을 limit 앞(SQL)에서 거는 이유:
-- 앱에서 거르면 제보가 최근 20건을 채운 날 진짜 문의의 답장이 목록 밖으로 밀려난다.
create or replace function public.get_support_messages(p_ticket_key text default null)
returns setof public.support_messages
language sql
security definer
set search_path = public
stable
as $$
  select *
    from public.support_messages
   where ((auth.uid() is not null and user_id = auth.uid())
       or (p_ticket_key is not null and ticket_key = p_ticket_key))
     and (theme_id is null or reply_body is not null)
   order by created_at desc
   limit 20;
$$;

revoke all on function public.get_support_messages(text) from public;
grant execute on function public.get_support_messages(text) to anon, authenticated;
