-- Final launch quota policy:
--   Guest: 10/day
--   Signed-in Free: 50/day (300 for the first 24 hours)
--   Pro: 3,000 per billing-anchored month, with the full pool available any day
--
-- consume_ai_quota still checks both day_limit and month_limit. Setting the Pro
-- day limit equal to the monthly limit removes the user-facing daily cap while
-- preserving the existing schema and monthly hard cost ceiling.
create or replace function public.ai_effective_plan(p_user_id uuid)
returns table (tier text, day_limit integer, month_limit integer, reward_amount integer, reward_max_views integer)
language sql stable security definer set search_path = public
as $$
  select
    case when s.pro_until > now() or s.trial_ends_at > now() then 'pro'
         when coalesce(u.is_anonymous, false) then 'guest' else 'free' end,
    case when s.pro_until > now() or s.trial_ends_at > now() then 3000
         when not coalesce(u.is_anonymous, false) and u.created_at > now() - interval '24 hours' then 300
         when coalesce(u.is_anonymous, false) then 10 else 50 end,
    case when s.pro_until > now() or s.trial_ends_at > now() then 3000 else 0 end,
    case when coalesce(u.is_anonymous, false) then 10 else 20 end,
    case when coalesce(u.is_anonymous, false) then 1 else 2 end
  from public.user_subscriptions s join auth.users u on u.id = s.user_id
  where s.user_id = p_user_id;
$$;

revoke all on function public.ai_effective_plan(uuid) from public,anon,authenticated;

-- The store-verified original subscription date anchors every user's monthly
-- quota. For pre-migration Pro rows, pro_until has the same renewal day and is
-- a better fallback than a global calendar-month boundary.
alter table public.user_subscriptions
  add column if not exists quota_anchor_at timestamptz;

update public.user_subscriptions
set quota_anchor_at = coalesce(quota_anchor_at, pro_until, updated_at)
where quota_anchor_at is null
  and (pro_until > now() or trial_ends_at > now());

create or replace function public.ai_quota_period_start(
  p_anchor timestamptz,
  p_at timestamptz default now()
)
returns date
language plpgsql stable security definer set search_path = public
as $$
declare
  v_anchor timestamp := coalesce(p_anchor, p_at) at time zone 'Asia/Seoul';
  v_at timestamp := p_at at time zone 'Asia/Seoul';
  v_months integer;
  v_candidate timestamp;
begin
  v_months := (extract(year from v_at)::integer - extract(year from v_anchor)::integer) * 12
    + extract(month from v_at)::integer - extract(month from v_anchor)::integer;
  v_candidate := v_anchor + make_interval(months => v_months);
  if v_candidate > v_at then
    v_candidate := v_anchor + make_interval(months => v_months - 1);
  end if;
  return v_candidate::date;
end;
$$;

create or replace function public.ai_quota_period_reset_at(
  p_anchor timestamptz,
  p_at timestamptz default now()
)
returns timestamptz
language plpgsql stable security definer set search_path = public
as $$
declare
  v_anchor timestamp := coalesce(p_anchor, p_at) at time zone 'Asia/Seoul';
  v_at timestamp := p_at at time zone 'Asia/Seoul';
  v_months integer;
  v_candidate timestamp;
begin
  v_months := (extract(year from v_at)::integer - extract(year from v_anchor)::integer) * 12
    + extract(month from v_at)::integer - extract(month from v_anchor)::integer;
  v_candidate := v_anchor + make_interval(months => v_months);
  if v_candidate > v_at then
    return v_candidate at time zone 'Asia/Seoul';
  end if;
  return (v_anchor + make_interval(months => v_months + 1)) at time zone 'Asia/Seoul';
end;
$$;

create or replace function public.consume_ai_quota(p_user_id uuid, p_cost integer)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  p record; s record; v_today date := kst_today(); v_period date;
  v_used integer := 0; v_bonus integer := 0; v_calls integer := 0; v_month_used integer := 0;
  v_views integer := 0; v_ad_free timestamptz; v_allowed boolean; v_reset timestamptz;
begin
  if p_cost is null or p_cost <= 0 then raise exception 'cost must be positive integer'; end if;
  insert into public.user_subscriptions(user_id,tier) values(p_user_id,'free') on conflict do nothing;
  select * into p from public.ai_effective_plan(p_user_id);
  select * into s from public.user_subscriptions where user_id=p_user_id;
  select word_count,rewarded_bonus,call_count,rewarded_views,ad_free_until
    into v_used,v_bonus,v_calls,v_views,v_ad_free from public.ai_usage_daily
    where user_id=p_user_id and usage_date=v_today for update;
  if not found then v_used:=0; v_bonus:=0; v_calls:=0; v_views:=0; end if;
  if p.tier='pro' then
    v_period:=public.ai_quota_period_start(s.quota_anchor_at,now());
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
  v_reset:=case when p.tier='pro'
    then public.ai_quota_period_reset_at(s.quota_anchor_at,now())
    else (((v_today+1)::timestamp at time zone 'Asia/Seoul') at time zone 'UTC') end;
  return jsonb_build_object('allowed',v_allowed,'tier',p.tier,'used',v_used,'limit',p.day_limit,
    'bonus',v_bonus,'call_count',v_calls,'reset_at',v_reset,'month_used',v_month_used,
    'month_limit',p.month_limit,'reward_amount',p.reward_amount,'reward_views',v_views,
    'reward_max_views',p.reward_max_views,'ad_free_until',v_ad_free);
end $$;

create or replace function public.get_ai_quota_status(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare p record; s record; d record; v_month integer:=0; v_today date:=kst_today();
  v_period date; v_reset timestamptz;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then raise exception 'forbidden'; end if;
  insert into public.user_subscriptions(user_id,tier) values(p_user_id,'free') on conflict do nothing;
  select * into p from public.ai_effective_plan(p_user_id);
  select * into s from public.user_subscriptions where user_id=p_user_id;
  select * into d from public.ai_usage_daily where user_id=p_user_id and usage_date=v_today;
  if p.tier='pro' then
    v_period:=public.ai_quota_period_start(s.quota_anchor_at,now());
    select coalesce((select word_count from public.ai_usage_monthly where user_id=p_user_id and period_start=v_period),0) into v_month;
    v_reset:=public.ai_quota_period_reset_at(s.quota_anchor_at,now());
  else
    v_reset:=(((v_today+1)::timestamp at time zone 'Asia/Seoul') at time zone 'UTC');
  end if;
  return jsonb_build_object('tier',p.tier,'used',coalesce(d.word_count,0),'limit',p.day_limit,
    'bonus',coalesce(d.rewarded_bonus,0),'trial_ends_at',s.trial_ends_at,'pro_until',s.pro_until,
    'reset_at',v_reset,'month_used',v_month,'month_limit',p.month_limit,
    'reward_amount',p.reward_amount,'reward_views',coalesce(d.rewarded_views,0),
    'reward_max_views',p.reward_max_views,'ad_free_until',d.ad_free_until);
end $$;

create or replace function public.refund_ai_quota(p_user_id uuid, p_cost integer)
returns void language plpgsql security definer set search_path = public
as $$
declare p record; s record; v_today date:=kst_today(); v_period date;
begin
  if p_cost is null or p_cost <= 0 then return; end if;
  update public.ai_usage_daily set word_count=greatest(0,word_count-p_cost),updated_at=now()
    where user_id=p_user_id and usage_date=v_today;
  select * into p from public.ai_effective_plan(p_user_id);
  if p.tier='pro' then
    select * into s from public.user_subscriptions where user_id=p_user_id;
    v_period:=public.ai_quota_period_start(s.quota_anchor_at,now());
    update public.ai_usage_monthly set word_count=greatest(0,word_count-p_cost),updated_at=now()
      where user_id=p_user_id and period_start=v_period;
  end if;
end $$;

revoke all on function public.ai_quota_period_start(timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.ai_quota_period_reset_at(timestamptz,timestamptz) from public,anon,authenticated;
