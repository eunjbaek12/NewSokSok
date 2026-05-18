-- v1.1 AI quota system
-- KST (UTC+9) 자정 기준 일일 한도 + 구독 tier 추적

-- =========================================================
-- 1. user_subscriptions — Pro/Free tier + 7일 무료 체험 추적
-- =========================================================
create table if not exists public.user_subscriptions (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  tier              text not null default 'free' check (tier in ('free', 'pro')),
  trial_started_at  timestamptz,
  trial_ends_at     timestamptz,
  pro_until         timestamptz,
  play_purchase_token text,
  play_product_id   text,
  updated_at        timestamptz not null default now()
);

alter table public.user_subscriptions enable row level security;

create policy "subscriptions_self_read"
  on public.user_subscriptions
  for select
  using (auth.uid() = user_id);

-- write는 service_role(Edge Function)만. 일반 사용자 직접 변경 차단.

-- 신규 가입 시 7일 Pro 트라이얼 자동 부여
create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_subscriptions (user_id, tier, trial_started_at, trial_ends_at)
  values (new.id, 'free', now(), now() + interval '7 days')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_subscription on auth.users;
create trigger on_auth_user_created_subscription
  after insert on auth.users
  for each row execute function public.handle_new_user_subscription();

-- =========================================================
-- 2. ai_usage_daily — 사용자별 일일 사용량 (KST 자정 기준)
-- =========================================================
create table if not exists public.ai_usage_daily (
  user_id         uuid not null references auth.users(id) on delete cascade,
  usage_date      date not null,
  word_count      integer not null default 0 check (word_count >= 0),
  rewarded_bonus  integer not null default 0 check (rewarded_bonus >= 0),
  call_count      integer not null default 0 check (call_count >= 0),
  updated_at      timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create index if not exists ai_usage_daily_date_idx on public.ai_usage_daily(usage_date);

alter table public.ai_usage_daily enable row level security;

create policy "usage_self_read"
  on public.ai_usage_daily
  for select
  using (auth.uid() = user_id);

-- write는 service_role(Edge Function)만.

-- =========================================================
-- 3. KST 자정 기준 오늘 날짜
-- =========================================================
create or replace function public.kst_today()
returns date
language sql
stable
as $$
  select ((now() at time zone 'Asia/Seoul')::date);
$$;

-- =========================================================
-- 4. 한도 + tier 동시 조회 + atomic 차감
-- =========================================================
-- Edge Function에서 한 번의 RPC로:
--   1) 사용자 tier 결정 (trial/pro/free)
--   2) 오늘 한도 조회
--   3) cost 차감 가능 여부 판단
--   4) 가능하면 word_count 차감 (UPSERT)
-- 반환: { allowed, tier, used_after, limit, bonus, reset_at_utc }
-- allowed=false 시 used/limit 그대로 (차감 X)

create or replace function public.consume_ai_quota(
  p_user_id  uuid,
  p_cost     integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier         text;
  v_trial_ends   timestamptz;
  v_pro_until    timestamptz;
  v_effective    text;
  v_limit        integer;
  v_today        date := kst_today();
  v_used         integer := 0;
  v_bonus        integer := 0;
  v_calls        integer := 0;
  v_allowed      boolean;
  v_reset_at_utc timestamptz;
begin
  if p_cost is null or p_cost <= 0 then
    raise exception 'cost must be positive integer';
  end if;

  -- 자동 행 생성(트라이얼 트리거가 못 잡은 케이스 보호용)
  insert into public.user_subscriptions (user_id, tier)
  values (p_user_id, 'free')
  on conflict (user_id) do nothing;

  select tier, trial_ends_at, pro_until
    into v_tier, v_trial_ends, v_pro_until
    from public.user_subscriptions
   where user_id = p_user_id;

  -- effective tier: pro_until 유효 → pro, trial_ends_at 유효 → pro(트라이얼), 그 외 → free
  if v_pro_until is not null and v_pro_until > now() then
    v_effective := 'pro';
  elsif v_trial_ends is not null and v_trial_ends > now() then
    v_effective := 'pro';
  else
    v_effective := 'free';
  end if;

  v_limit := case when v_effective = 'pro' then 1000 else 100 end;

  -- 오늘 사용량 잠금 (concurrent 차감 race condition 방지)
  select word_count, rewarded_bonus, call_count
    into v_used, v_bonus, v_calls
    from public.ai_usage_daily
   where user_id = p_user_id and usage_date = v_today
   for update;

  if not found then
    v_used := 0; v_bonus := 0; v_calls := 0;
  end if;

  v_allowed := (v_used + p_cost) <= (v_limit + v_bonus);

  if v_allowed then
    insert into public.ai_usage_daily (user_id, usage_date, word_count, call_count, updated_at)
    values (p_user_id, v_today, p_cost, 1, now())
    on conflict (user_id, usage_date) do update
      set word_count = ai_usage_daily.word_count + excluded.word_count,
          call_count = ai_usage_daily.call_count + 1,
          updated_at = now();
    v_used := v_used + p_cost;
    v_calls := v_calls + 1;
  end if;

  -- KST 익일 00:00을 UTC로
  v_reset_at_utc :=
    (((v_today + 1)::timestamp at time zone 'Asia/Seoul') at time zone 'UTC');

  return jsonb_build_object(
    'allowed',     v_allowed,
    'tier',        v_effective,
    'used',        v_used,
    'limit',       v_limit,
    'bonus',       v_bonus,
    'call_count',  v_calls,
    'reset_at',    v_reset_at_utc
  );
end;
$$;

-- =========================================================
-- 5. 보상형 광고 시청 → 한도 추가 (cap 200)
-- =========================================================
-- Free 한도 100 + 보상 최대 200 = 일 절대 상한 300 (광고 4회까지)
create or replace function public.grant_rewarded_bonus(
  p_user_id   uuid,
  p_amount    integer,
  p_max_bonus integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today  date := kst_today();
  v_bonus  integer;
  v_used   integer;
  v_granted integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive integer';
  end if;

  insert into public.ai_usage_daily (user_id, usage_date, rewarded_bonus)
  values (p_user_id, v_today, 0)
  on conflict (user_id, usage_date) do nothing;

  select word_count, rewarded_bonus
    into v_used, v_bonus
    from public.ai_usage_daily
   where user_id = p_user_id and usage_date = v_today
   for update;

  v_granted := least(p_amount, p_max_bonus - v_bonus);
  if v_granted < 0 then v_granted := 0; end if;

  if v_granted > 0 then
    update public.ai_usage_daily
       set rewarded_bonus = rewarded_bonus + v_granted,
           updated_at = now()
     where user_id = p_user_id and usage_date = v_today;
    v_bonus := v_bonus + v_granted;
  end if;

  return jsonb_build_object(
    'granted',  v_granted,
    'bonus',    v_bonus,
    'used',     v_used
  );
end;
$$;

-- =========================================================
-- 6. 현재 사용량 조회 (앱 시작 시 캐시 갱신용)
-- =========================================================
create or replace function public.get_ai_quota_status(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier         text;
  v_trial_ends   timestamptz;
  v_pro_until    timestamptz;
  v_effective    text;
  v_limit        integer;
  v_today        date := kst_today();
  v_used         integer := 0;
  v_bonus        integer := 0;
  v_reset_at_utc timestamptz;
begin
  insert into public.user_subscriptions (user_id, tier)
  values (p_user_id, 'free')
  on conflict (user_id) do nothing;

  select tier, trial_ends_at, pro_until
    into v_tier, v_trial_ends, v_pro_until
    from public.user_subscriptions
   where user_id = p_user_id;

  if v_pro_until is not null and v_pro_until > now() then
    v_effective := 'pro';
  elsif v_trial_ends is not null and v_trial_ends > now() then
    v_effective := 'pro';
  else
    v_effective := 'free';
  end if;

  v_limit := case when v_effective = 'pro' then 1000 else 100 end;

  select word_count, rewarded_bonus
    into v_used, v_bonus
    from public.ai_usage_daily
   where user_id = p_user_id and usage_date = v_today;

  if not found then v_used := 0; v_bonus := 0; end if;

  v_reset_at_utc :=
    (((v_today + 1)::timestamp at time zone 'Asia/Seoul') at time zone 'UTC');

  return jsonb_build_object(
    'tier',     v_effective,
    'used',     v_used,
    'limit',    v_limit,
    'bonus',    v_bonus,
    'trial_ends_at', v_trial_ends,
    'pro_until',     v_pro_until,
    'reset_at', v_reset_at_utc
  );
end;
$$;

-- =========================================================
-- 7. 차감 환불 (Vertex 호출 실패 시 사용자 한도 복원)
-- =========================================================
create or replace function public.refund_ai_quota(
  p_user_id uuid,
  p_cost    integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := kst_today();
begin
  if p_cost is null or p_cost <= 0 then return; end if;
  update public.ai_usage_daily
     set word_count = greatest(0, word_count - p_cost),
         updated_at = now()
   where user_id = p_user_id and usage_date = v_today;
end;
$$;

-- Edge Function이 service_role로 호출. anon/authenticated 권한 부여 불필요.
revoke all on function public.consume_ai_quota(uuid, integer)  from public, anon, authenticated;
revoke all on function public.grant_rewarded_bonus(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.get_ai_quota_status(uuid)        from public, anon, authenticated;
revoke all on function public.refund_ai_quota(uuid, integer)   from public, anon, authenticated;
