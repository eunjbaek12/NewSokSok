-- 2026-08 pricing/quota policy: anonymous guest quota, tier-owned rewarded ads,
-- rolling 24h banner removal, Pro monthly allowance, and basic/full cache levels.

alter table public.ai_usage_daily
  add column if not exists rewarded_views integer not null default 0 check (rewarded_views >= 0),
  add column if not exists ad_free_until timestamptz;

create table if not exists public.ai_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  word_count integer not null default 0 check (word_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start)
);
alter table public.ai_usage_monthly enable row level security;

alter table public.enrich_cache
  add column if not exists enrichment_level text not null default 'full'
    check (enrichment_level in ('basic', 'full'));

-- Shared cache is an implementation detail. All reads must pass through the
-- Edge function so cache hits cannot bypass product quota.
drop policy if exists "enrich_cache_auth_read" on public.enrich_cache;

-- PostgreSQL cannot CREATE OR REPLACE a function when its table return shape
-- changes. CASCADE removes the two dependent quota functions, recreated below.
drop function if exists public.ai_effective_plan(uuid) cascade;
create function public.ai_effective_plan(p_user_id uuid)
returns table (tier text, day_limit integer, month_limit integer, reward_amount integer, reward_max_views integer)
language sql stable security definer set search_path = public
as $$
  select
    case when s.pro_until > now() or s.trial_ends_at > now() then 'pro'
         when coalesce(u.is_anonymous, false) then 'guest' else 'free' end,
    case when s.pro_until > now() or s.trial_ends_at > now() then 1000
         when not coalesce(u.is_anonymous, false) and u.created_at > now() - interval '24 hours' then 300
         when coalesce(u.is_anonymous, false) then 10 else 50 end,
    case when s.pro_until > now() or s.trial_ends_at > now() then 5000 else 0 end,
    case when coalesce(u.is_anonymous, false) then 10 else 20 end,
    case when coalesce(u.is_anonymous, false) then 1 else 2 end
  from public.user_subscriptions s join auth.users u on u.id = s.user_id
  where s.user_id = p_user_id;
$$;

create or replace function public.consume_ai_quota(p_user_id uuid, p_cost integer)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  p record; v_today date := kst_today(); v_period date := date_trunc('month', now() at time zone 'Asia/Seoul')::date;
  v_used integer := 0; v_bonus integer := 0; v_calls integer := 0; v_month_used integer := 0;
  v_views integer := 0; v_ad_free timestamptz; v_allowed boolean; v_reset timestamptz;
begin
  if p_cost is null or p_cost <= 0 then raise exception 'cost must be positive integer'; end if;
  insert into public.user_subscriptions(user_id,tier) values(p_user_id,'free') on conflict do nothing;
  select * into p from public.ai_effective_plan(p_user_id);
  select word_count,rewarded_bonus,call_count,rewarded_views,ad_free_until
    into v_used,v_bonus,v_calls,v_views,v_ad_free from public.ai_usage_daily
    where user_id=p_user_id and usage_date=v_today for update;
  if not found then v_used:=0; v_bonus:=0; v_calls:=0; v_views:=0; end if;
  if p.tier='pro' then
    select word_count into v_month_used from public.ai_usage_monthly
      where user_id=p_user_id and period_start=v_period for update;
    if not found then v_month_used:=0; end if;
  end if;
  v_allowed := v_used+p_cost <= p.day_limit+v_bonus
    and (p.tier <> 'pro' or v_month_used+p_cost <= p.month_limit);
  if v_allowed then
    insert into public.ai_usage_daily(user_id,usage_date,word_count,call_count,updated_at)
      values(p_user_id,v_today,p_cost,1,now()) on conflict(user_id,usage_date) do update
      set word_count=ai_usage_daily.word_count+excluded.word_count,
          call_count=ai_usage_daily.call_count+1, updated_at=now();
    v_used:=v_used+p_cost; v_calls:=v_calls+1;
    if p.tier='pro' then
      insert into public.ai_usage_monthly(user_id,period_start,word_count,updated_at)
        values(p_user_id,v_period,p_cost,now()) on conflict(user_id,period_start) do update
        set word_count=ai_usage_monthly.word_count+excluded.word_count,updated_at=now();
      v_month_used:=v_month_used+p_cost;
    end if;
  end if;
  v_reset:=(((v_today+1)::timestamp at time zone 'Asia/Seoul') at time zone 'UTC');
  return jsonb_build_object('allowed',v_allowed,'tier',p.tier,'used',v_used,'limit',p.day_limit,
    'bonus',v_bonus,'call_count',v_calls,'reset_at',v_reset,'month_used',v_month_used,
    'month_limit',p.month_limit,'reward_amount',p.reward_amount,'reward_views',v_views,
    'reward_max_views',p.reward_max_views,'ad_free_until',v_ad_free);
end $$;

create or replace function public.get_ai_quota_status(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare p record; s record; d record; v_month integer:=0; v_today date:=kst_today();
  v_period date:=date_trunc('month',now() at time zone 'Asia/Seoul')::date; v_reset timestamptz;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then raise exception 'forbidden'; end if;
  insert into public.user_subscriptions(user_id,tier) values(p_user_id,'free') on conflict do nothing;
  select * into p from public.ai_effective_plan(p_user_id);
  select * into s from public.user_subscriptions where user_id=p_user_id;
  select * into d from public.ai_usage_daily where user_id=p_user_id and usage_date=v_today;
  if p.tier='pro' then
    select coalesce((select word_count from public.ai_usage_monthly where user_id=p_user_id and period_start=v_period),0) into v_month;
  end if;
  v_reset:=(((v_today+1)::timestamp at time zone 'Asia/Seoul') at time zone 'UTC');
  return jsonb_build_object('tier',p.tier,'used',coalesce(d.word_count,0),'limit',p.day_limit,
    'bonus',coalesce(d.rewarded_bonus,0),'trial_ends_at',s.trial_ends_at,'pro_until',s.pro_until,
    'reset_at',v_reset,'month_used',v_month,'month_limit',p.month_limit,
    'reward_amount',p.reward_amount,'reward_views',coalesce(d.rewarded_views,0),
    'reward_max_views',p.reward_max_views,'ad_free_until',d.ad_free_until);
end $$;

create or replace function public.refund_ai_quota(p_user_id uuid, p_cost integer)
returns void language plpgsql security definer set search_path = public
as $$
declare p record; v_today date:=kst_today(); v_period date:=date_trunc('month',now() at time zone 'Asia/Seoul')::date;
begin
  if p_cost is null or p_cost <= 0 then return; end if;
  update public.ai_usage_daily set word_count=greatest(0,word_count-p_cost),updated_at=now()
    where user_id=p_user_id and usage_date=v_today;
  select * into p from public.ai_effective_plan(p_user_id);
  if p.tier='pro' then
    update public.ai_usage_monthly set word_count=greatest(0,word_count-p_cost),updated_at=now()
      where user_id=p_user_id and period_start=v_period;
  end if;
end $$;

drop function if exists public.grant_rewarded_bonus(uuid,integer,integer);
drop function if exists public.grant_rewarded_bonus(uuid,integer);
create or replace function public.grant_rewarded_bonus(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare p record; v_today date:=kst_today(); d record; v_until timestamptz;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'forbidden'; end if;
  select * into p from public.ai_effective_plan(p_user_id);
  if p.tier='pro' then raise exception 'pro users are not eligible'; end if;
  select * into d from public.ai_usage_daily where user_id=p_user_id and usage_date=v_today for update;
  if coalesce(d.rewarded_views,0) >= p.reward_max_views then
    return jsonb_build_object('granted',0,'bonus',coalesce(d.rewarded_bonus,0),'reward_views',coalesce(d.rewarded_views,0),'ad_free_until',d.ad_free_until);
  end if;
  v_until:=now()+interval '24 hours';
  insert into public.ai_usage_daily(user_id,usage_date,rewarded_bonus,rewarded_views,ad_free_until,updated_at)
    values(p_user_id,v_today,p.reward_amount,1,v_until,now()) on conflict(user_id,usage_date) do update
    set rewarded_bonus=ai_usage_daily.rewarded_bonus+p.reward_amount,
        rewarded_views=ai_usage_daily.rewarded_views+1,ad_free_until=v_until,updated_at=now()
    returning * into d;
  return jsonb_build_object('granted',p.reward_amount,'bonus',d.rewarded_bonus,'reward_views',d.rewarded_views,'ad_free_until',d.ad_free_until);
end $$;

grant execute on function public.get_ai_quota_status(uuid) to authenticated;
grant execute on function public.grant_rewarded_bonus(uuid) to authenticated;
revoke all on function public.ai_effective_plan(uuid) from public,anon,authenticated;
