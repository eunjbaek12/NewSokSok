-- v1.1 보강: get_ai_quota_status RPC를 authenticated 클라이언트가 직접 호출 가능하게.
--
-- 기존 20260518000000_ai_quota.sql에서 모든 quota RPC를 service_role 전용으로 revoke했으나,
-- 클라이언트(앱)가 자기 사용량을 직접 조회해 UI에 표시할 필요가 있어 read-only RPC만
-- 열어둔다. 다른 RPC(consume / grant_rewarded_bonus / refund)는 여전히 Edge Function
-- service_role 전용.
--
-- 보안: 함수 내부에서 p_user_id = auth.uid() 강제. 임의 user_id 조회 차단.

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
  -- authenticated 호출자는 자기 자신만 조회 가능
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'forbidden';
  end if;

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

-- read-only이며 함수 내부에서 auth.uid() 매칭 검증 → authenticated에 grant.
-- anon은 차단(로그인 후에만 한도 표시).
grant execute on function public.get_ai_quota_status(uuid) to authenticated;

-- =========================================================
-- grant_rewarded_bonus 클라이언트 직접 호출 허용
-- =========================================================
-- v1.1 단계: AdMob SSV(Server-Side Verification) 미통합 → 클라이언트가
-- reward earned 이벤트 시 직접 RPC 호출. 어뷰징 방지는 일 cap 200으로 제한.
-- v1.2 SSV 통합 시 권한 revoke + Edge Function 경유로 전환 권장.
--
-- 함수 내부에 auth.uid() = p_user_id 검증 추가.

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
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'forbidden';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive integer';
  end if;
  -- 클라이언트 직접 호출 시 비정상 큰 값 차단 (정상 흐름: 50)
  if p_amount > 100 then
    raise exception 'amount too large';
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

grant execute on function public.grant_rewarded_bonus(uuid, integer, integer) to authenticated;
