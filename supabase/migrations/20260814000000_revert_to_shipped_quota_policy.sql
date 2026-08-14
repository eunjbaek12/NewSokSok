-- 2026-08 새 쿼터/광고 정책을 "출시된 앱이 기대하는 상태"로 되돌린다.
--
-- 배경:
--   20260813000000_quota_ads_and_cache_levels 는 다음 앱 릴리스와 짝이 되는 정책인데
--   서버에만 먼저 적용됐다. 그 앱은 아직 심사/배포 전이라, 지금 스토어에 나가 있는
--   1.4.0 과 서버가 어긋난 상태로 며칠 돌았다. 특히:
--
--   🔴 grant_rewarded_bonus 의 시그니처가 (uuid,integer,integer) → (uuid) 로 바뀌면서
--      출시된 앱(components/ads/RewardedAdModal.tsx 가 p_amount·p_max_bonus 를 넘긴다)의
--      호출이 "함수 없음"으로 실패했다. 사용자는 보상형 광고를 끝까지 보고도 단어를
--      한 개도 받지 못한다. 8/13 배포 이후 계속.
--
-- 이 파일이 하는 일: 함수 5개를 20260518/20260519/20260727 정의로 되돌린다.
--   - ai_effective_plan   → (tier, day_limit) 2컬럼. Pro 1000 / 신규 24h 300 / 그 외 100.
--                           게스트(익명) 분기 제거 — 익명 로그인 자체가 미출시라 사용자가 없다.
--   - consume_ai_quota    → 월 한도 판정 제거
--   - get_ai_quota_status → 월 사용량 반환 제거
--   - refund_ai_quota     → 월 차감 제거
--   - grant_rewarded_bonus→ (uuid,integer,integer) 복원 ★ 위 장애 수정
--
-- ⚠️ 스키마는 일부러 남긴다: ai_usage_monthly 테이블, ai_usage_daily.rewarded_views /
--    ad_free_until, enrich_cache.enrichment_level. 쌓인 데이터를 버리지 않고, 다음
--    릴리스에서 새 정책을 켤 때 그대로 재사용하기 위해서다.
--
-- 📌 새 정책을 다시 켤 때 (앱 배포 이후):
--    20260813000000 파일을 새 타임스탬프로 복사해 적용하면 된다. 단 그때는
--    grant_rewarded_bonus 의 3인자 시그니처를 drop 하지 말 것 — 앱 업데이트에는 시차가
--    있어 구버전 앱이 한동안 남고, 한쪽만 남기면 그 사용자들의 광고 보상이 조용히 깨진다.
--    순서도 "앱 배포 먼저, 서버 정책 나중"이어야 한다.

-- =========================================================
-- 1. ai_effective_plan — 2컬럼으로 복귀 (반환 타입 변경이라 CASCADE 필요)
-- =========================================================
drop function if exists public.ai_effective_plan(uuid) cascade;
create function public.ai_effective_plan(p_user_id uuid)
returns table (tier text, day_limit integer)
language sql stable security definer set search_path = public
as $$
  select
    case
      when s.pro_until     > now() then 'pro'
      when s.trial_ends_at > now() then 'pro'   -- 폐지 이전에 받은 잔여 체험 (보존)
      else 'free'
    end,
    case
      when s.pro_until > now() or s.trial_ends_at > now() then 1000
      -- 신규 부스트: 가입 후 24시간
      when u.created_at > now() - interval '24 hours' then 300
      else 100
    end
  from public.user_subscriptions s
  join auth.users u on u.id = s.user_id
  where s.user_id = p_user_id;
$$;

-- =========================================================
-- 2. consume_ai_quota — 일일 한도 + 보상 보너스만
-- =========================================================
create or replace function public.consume_ai_quota(p_user_id uuid, p_cost integer)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_effective text; v_limit integer; v_today date := kst_today();
  v_used integer := 0; v_bonus integer := 0; v_calls integer := 0;
  v_allowed boolean; v_reset_at_utc timestamptz;
begin
  if p_cost is null or p_cost <= 0 then raise exception 'cost must be positive integer'; end if;

  insert into public.user_subscriptions (user_id, tier) values (p_user_id, 'free')
    on conflict (user_id) do nothing;

  select p.tier, p.day_limit into v_effective, v_limit from public.ai_effective_plan(p_user_id) p;

  -- 오늘 사용량 잠금 (동시 차감 경합 방지)
  select word_count, rewarded_bonus, call_count into v_used, v_bonus, v_calls
    from public.ai_usage_daily where user_id = p_user_id and usage_date = v_today for update;
  if not found then v_used := 0; v_bonus := 0; v_calls := 0; end if;

  v_allowed := (v_used + p_cost) <= (v_limit + v_bonus);

  if v_allowed then
    insert into public.ai_usage_daily (user_id, usage_date, word_count, call_count, updated_at)
    values (p_user_id, v_today, p_cost, 1, now())
    on conflict (user_id, usage_date) do update
      set word_count = ai_usage_daily.word_count + excluded.word_count,
          call_count = ai_usage_daily.call_count + 1, updated_at = now();
    v_used := v_used + p_cost; v_calls := v_calls + 1;
  end if;

  -- KST 익일 00:00을 UTC로
  v_reset_at_utc := (((v_today + 1)::timestamp at time zone 'Asia/Seoul') at time zone 'UTC');

  return jsonb_build_object('allowed', v_allowed, 'tier', v_effective, 'used', v_used,
    'limit', v_limit, 'bonus', v_bonus, 'call_count', v_calls, 'reset_at', v_reset_at_utc);
end; $$;

-- =========================================================
-- 3. get_ai_quota_status
-- =========================================================
create or replace function public.get_ai_quota_status(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_trial_ends timestamptz; v_pro_until timestamptz; v_effective text; v_limit integer;
  v_today date := kst_today(); v_used integer := 0; v_bonus integer := 0;
  v_reset_at_utc timestamptz;
begin
  insert into public.user_subscriptions (user_id, tier) values (p_user_id, 'free')
    on conflict (user_id) do nothing;

  select trial_ends_at, pro_until into v_trial_ends, v_pro_until
    from public.user_subscriptions where user_id = p_user_id;

  select p.tier, p.day_limit into v_effective, v_limit from public.ai_effective_plan(p_user_id) p;

  select word_count, rewarded_bonus into v_used, v_bonus
    from public.ai_usage_daily where user_id = p_user_id and usage_date = v_today;
  if not found then v_used := 0; v_bonus := 0; end if;

  v_reset_at_utc := (((v_today + 1)::timestamp at time zone 'Asia/Seoul') at time zone 'UTC');

  return jsonb_build_object('tier', v_effective, 'used', v_used, 'limit', v_limit,
    'bonus', v_bonus, 'trial_ends_at', v_trial_ends, 'pro_until', v_pro_until,
    'reset_at', v_reset_at_utc);
end; $$;

-- =========================================================
-- 4. refund_ai_quota
-- =========================================================
create or replace function public.refund_ai_quota(p_user_id uuid, p_cost integer)
returns void language plpgsql security definer set search_path = public
as $$
declare v_today date := kst_today();
begin
  if p_cost is null or p_cost <= 0 then return; end if;
  update public.ai_usage_daily
     set word_count = greatest(0, word_count - p_cost), updated_at = now()
   where user_id = p_user_id and usage_date = v_today;
end; $$;

-- =========================================================
-- 5. grant_rewarded_bonus — 출시된 앱이 부르는 3인자 시그니처 복원
-- =========================================================
drop function if exists public.grant_rewarded_bonus(uuid);
create or replace function public.grant_rewarded_bonus(
  p_user_id uuid, p_amount integer, p_max_bonus integer default 200
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_today date := kst_today(); v_bonus integer; v_used integer; v_granted integer;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive integer'; end if;
  -- 클라이언트 직접 호출이라 비정상 큰 값 차단 (정상 흐름: 50)
  if p_amount > 100 then raise exception 'amount too large'; end if;

  insert into public.ai_usage_daily (user_id, usage_date, rewarded_bonus)
  values (p_user_id, v_today, 0) on conflict (user_id, usage_date) do nothing;

  select word_count, rewarded_bonus into v_used, v_bonus
    from public.ai_usage_daily where user_id = p_user_id and usage_date = v_today for update;

  v_granted := least(p_amount, p_max_bonus - v_bonus);
  if v_granted < 0 then v_granted := 0; end if;

  if v_granted > 0 then
    update public.ai_usage_daily
       set rewarded_bonus = rewarded_bonus + v_granted, updated_at = now()
     where user_id = p_user_id and usage_date = v_today;
    v_bonus := v_bonus + v_granted;
  end if;

  return jsonb_build_object('granted', v_granted, 'bonus', v_bonus, 'used', v_used);
end; $$;

-- =========================================================
-- 6. 권한 — Edge(service_role)만 쓰는 것은 revoke, 클라이언트 호출분만 grant
-- =========================================================
revoke all on function public.ai_effective_plan(uuid)          from public, anon, authenticated;
revoke all on function public.consume_ai_quota(uuid, integer)  from public, anon, authenticated;
revoke all on function public.refund_ai_quota(uuid, integer)   from public, anon, authenticated;
grant execute on function public.get_ai_quota_status(uuid) to authenticated;
grant execute on function public.grant_rewarded_bonus(uuid, integer, integer) to authenticated;
