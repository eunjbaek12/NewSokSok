-- 개발자에게 메시지 — 앱 내 문의 + 답장.
--
-- 설계 SoT: docs/contact-design.md (목업 아티팩트)
--
-- 왜 필요한가:
--   FAQ의 결제 항목이 "고객센터로 문의해주세요"라고 안내하는데 실제로 갈 곳이 없었다.
--   스토어 리뷰에 불만이 쌓이기 전에 받아낼 창구가 앱 안에 있어야 한다.
--
-- 답장 경로가 이 스키마의 핵심 제약이다:
--   운영자는 reply_body 한 곳에만 쓰고, 사용자는 앱과 메일 양쪽에서 받는다.
--   특히 이메일을 적지 않은 사용자(게스트 다수)에게는 앱이 유일한 경로다.
--   Apple "이메일 가리기"(@privaterelay.appleid.com) 주소는 등록된 발신자만
--   통과시키므로 메일이 반송될 수 있고, 그래서 앱 경로를 정본으로 삼는다.
--
-- 게스트 조회 방식:
--   게스트는 user_id가 없어 RLS로 자기 행을 특정할 수 없다. 문의를 보낼 때
--   클라이언트가 만든 ticket_key를 SecureStore에 보관하고, 조회는 security definer
--   RPC(get_support_messages)로만 한다. RLS를 열어 클라이언트 필터에 맡기면
--   필터를 뺀 요청이 전체를 긁어갈 수 있으므로, select 경로를 RPC로 좁힌다.

create table if not exists public.support_messages (
  -- 클라이언트가 만들어 보낸다. 전송 타임아웃 뒤 사용자가 다시 눌러도 같은 id로
  -- 재시도되어 23505로 튕기므로 중복 문의가 생기지 않는다(멱등).
  id           uuid primary key,

  -- 답장을 읽고 이어서 보낸 메시지. 대시보드에서 한 줄기로 보이고, 알림 메일
  -- 제목에 [이어서]가 붙는다. 원본이 지워져도 메시지 자체는 남긴다.
  parent_id    uuid references public.support_messages(id) on delete set null,

  -- 게스트는 null. 계정을 지워도 결제 분쟁 이력은 남기되 신원은 끊는다.
  user_id      uuid references auth.users(id) on delete set null,

  -- 게스트가 자기 답장을 찾는 열쇠(로그인 사용자도 함께 저장한다 — 게스트로 보낸
  -- 뒤 로그인해도 이어서 볼 수 있게). 기기를 초기화하면 잃어버리며, 그건 정상
  -- 동작으로 받아들인다(그런 경우를 위해 reply_email이 있다).
  ticket_key   text not null check (char_length(ticket_key) between 16 and 64),

  -- 하루 5건을 세는 키(로그인 사용자는 user_id 기준). 남용 방어는 여기 한 곳뿐이며
  -- 앱 쪽 쿨다운은 두지 않는다 — 봇은 앱 화면을 거치지 않으므로 클라이언트 제한은
  -- 막고 싶은 것을 못 막고 연달아 쓰는 정상 사용자만 막는다.
  device_id    text,

  category     text not null default 'other' check (category in (
    'bug', 'idea', 'billing', 'content', 'account', 'other'
  )),

  -- 클라이언트 상한(5~2000자)과 같은 값. 경계를 서버에서도 지킨다.
  body         text not null check (char_length(body) between 5 and 2000),

  -- 비어 있으면 알림 메일 제목에 [회신불가]가 붙는다.
  reply_email  text check (reply_email is null or char_length(reply_email) <= 254),

  -- 앱 버전·OS·로케일·티어·보유 단어 수. 사용자가 토글을 끄면 null.
  diagnostics  jsonb check (diagnostics is null or pg_column_size(diagnostics) <= 4096),

  -- 운영자가 쓰는 유일한 곳. 채워지면 update 웹훅이 발화해 메일로도 나간다.
  reply_body   text check (reply_body is null or char_length(reply_body) <= 4000),
  replied_at   timestamptz,

  -- 답장 화면을 연 시각. 설정 행의 배지를 끄는 기준.
  read_at      timestamptz,

  status       text not null default 'new' check (status in (
    'new', 'read', 'answered', 'closed'
  )),
  admin_note   text,
  created_at   timestamptz not null default now()
);

-- curation_reports와 달리 unique 제약을 걸지 않는다 — 신고와 달리 문의는 여러 번
-- 보내는 게 정상이다. 남용은 아래 rate limit 트리거가 막는다.
create index if not exists idx_support_messages_user
  on public.support_messages(user_id, created_at desc);
create index if not exists idx_support_messages_ticket
  on public.support_messages(ticket_key);
create index if not exists idx_support_messages_status
  on public.support_messages(status, created_at desc);
create index if not exists idx_support_messages_parent
  on public.support_messages(parent_id);

alter table public.support_messages enable row level security;

-- =========================================================
-- 하루 5건 — 남용 방어의 유일한 지점
-- =========================================================
create or replace function public.support_messages_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
    from public.support_messages
   where created_at > now() - interval '1 day'
     and (
       (new.user_id is not null and user_id = new.user_id)
       or (new.user_id is null and new.device_id is not null and device_id = new.device_id)
     );

  if recent_count >= 5 then
    -- 클라이언트가 이 문자열로 "오늘은 여기까지 보낼 수 있어요"를 띄운다.
    raise exception 'SUPPORT_RATE_LIMIT' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_support_messages_rate_limit on public.support_messages;
create trigger trg_support_messages_rate_limit
  before insert on public.support_messages
  for each row execute function public.support_messages_rate_limit();

-- 답장이 채워지는 순간 상태를 함께 옮긴다. 운영자가 reply_body만 쓰면 되도록
-- (status를 따로 바꾸는 걸 잊어도 목록이 어긋나지 않는다).
create or replace function public.support_messages_touch_reply()
returns trigger
language plpgsql
as $$
begin
  if new.reply_body is not null and coalesce(old.reply_body, '') <> new.reply_body then
    new.replied_at := now();
    new.read_at := null;          -- 새 답장이므로 배지를 다시 켠다
    if new.status in ('new', 'read') then
      new.status := 'answered';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_support_messages_touch_reply on public.support_messages;
create trigger trg_support_messages_touch_reply
  before update on public.support_messages
  for each row execute function public.support_messages_touch_reply();

-- =========================================================
-- RLS
-- =========================================================

-- 게스트도 보낼 수 있어야 한다(로그인 강요 금지). user_id 위조만 막는다.
drop policy if exists "support_messages_insert" on public.support_messages;
create policy "support_messages_insert"
  on public.support_messages for insert
  to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- 로그인 사용자의 직접 조회. 게스트 조회는 아래 RPC로만 한다(정책으로는 표현할 수
-- 없다 — RLS는 요청자가 가진 ticket_key를 알 수 없기 때문).
drop policy if exists "support_messages_select_own" on public.support_messages;
create policy "support_messages_select_own"
  on public.support_messages for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "support_messages_admin_all" on public.support_messages;
create policy "support_messages_admin_all"
  on public.support_messages for all
  to authenticated
  using (exists (select 1 from public.app_admins where user_id = auth.uid()))
  with check (exists (select 1 from public.app_admins where user_id = auth.uid()));

-- =========================================================
-- 조회 RPC — 게스트/로그인 공통 경로
-- =========================================================
--
-- security definer로 RLS를 우회하되, ticket_key를 아는 사람에게만 그 행을 준다.
-- URL과 같은 성격의 비밀이라, 문의 본문에 결제 정보를 적지 않도록 화면
-- 플레이스홀더가 상황 설명만 유도한다.
create or replace function public.get_support_messages(p_ticket_key text default null)
returns setof public.support_messages
language sql
security definer
set search_path = public
stable
as $$
  select *
    from public.support_messages
   where (auth.uid() is not null and user_id = auth.uid())
      or (p_ticket_key is not null and ticket_key = p_ticket_key)
   order by created_at desc
   limit 20;
$$;

revoke all on function public.get_support_messages(text) from public;
grant execute on function public.get_support_messages(text) to anon, authenticated;

-- 답장 화면을 연 시각 기록 → 설정 행의 배지가 꺼진다.
create or replace function public.mark_support_read(p_ticket_key text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.support_messages
     set read_at = now(),
         status = case when status = 'answered' then 'closed' else status end
   where reply_body is not null
     and read_at is null
     and (
       (auth.uid() is not null and user_id = auth.uid())
       or (p_ticket_key is not null and ticket_key = p_ticket_key)
     );
$$;

revoke all on function public.mark_support_read(text) from public;
grant execute on function public.mark_support_read(text) to anon, authenticated;
