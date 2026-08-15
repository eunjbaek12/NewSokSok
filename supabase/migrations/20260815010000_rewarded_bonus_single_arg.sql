-- 보상형 광고 RPC를 다음 앱 버전과 맞춘다 — 쿼터 정책은 그대로 둔다.
--
-- 배경: 다음 릴리스에 담길 앱은 grant_rewarded_bonus 를 1인자(p_user_id)로 부른다.
-- 그 시그니처는 20260813000000 이 만들었다가 20260814000000 이 지웠고(3인자 복원),
-- 대기 중인 20260813020000 은 이 함수를 아예 건드리지 않는다. 즉 지금 앱을 내보내면
-- "함수 없음"으로 **보상형 광고가 100% 실패**한다 — 2026-08-13 사고가 방향만 바꿔
-- 재현되는 것이다.
--
-- 🔑 3인자를 지우지 않는다. 두 시그니처가 공존하면 순서 위험이 사라진다 —
--    구 앱(1.4.0, 3인자)과 새 앱(1인자)이 동시에 정상 동작하므로 이 마이그레이션은
--    **앱 릴리스 전에 적용해도 안전**하다. 8/13 사고의 교훈이 이것이었다.
--    인자 개수가 달라 오버로딩 모호성도 없다(3인자의 p_amount 에는 default 가 없다).
--
-- 🔑 정책 값은 지금 서버가 돌리는 것 그대로다 — 광고 1회 +50, 일일 보너스 상한 200.
--    Free 한도 100 → 50 축소 같은 정책 전환은 이 파일의 범위가 아니다
--    (20260813020000 이 그것이고 여전히 미적용 대기 중이다).
--
-- 앱이 서버 응답에 기대하는 것 셋을 함께 채운다. 지금은 아무것도 안 주므로:
--   reward_amount     없으면 앱이 20으로 폴백해 "+20단어"라 표시하는데 실제로는 +50이다.
--   reward_max_views  없으면 앱이 "아직 볼 수 있다"로 판단해(reward-eligibility.ts)
--                     상한에 닿은 뒤에도 버튼을 띄우고, 눌러야 granted=0 을 받는다.
--   ad_free_until     앱은 한도가 남은 상태에서 광고를 볼 때 "24시간 동안 배너가
--                     사라져요"라고 약속하고(RewardedAdModal 의 rewardedBenefitBody)
--                     AppBannerAd 가 이 값으로 배너를 숨긴다. 안 주면 약속이 거짓이 된다.

-- =========================================================
-- 1. grant_rewarded_bonus — 1인자 시그니처 추가 (3인자는 그대로 둔다)
-- =========================================================
create or replace function public.grant_rewarded_bonus(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_today   date    := kst_today();
  v_amount  integer := 50;   -- 현 정책: 광고 1회 보상
  v_max     integer := 200;  -- 현 정책: 일일 보너스 상한(= 4회)
  v_bonus   integer;
  v_used    integer;
  v_views   integer;
  v_granted integer;
  v_until   timestamptz;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'forbidden';
  end if;

  insert into public.ai_usage_daily (user_id, usage_date, rewarded_bonus)
  values (p_user_id, v_today, 0)
  on conflict (user_id, usage_date) do nothing;

  select word_count, rewarded_bonus, coalesce(rewarded_views, 0), ad_free_until
    into v_used, v_bonus, v_views, v_until
    from public.ai_usage_daily
   where user_id = p_user_id and usage_date = v_today
     for update;

  v_granted := least(v_amount, v_max - v_bonus);
  if v_granted < 0 then v_granted := 0; end if;

  -- 상한에 닿아 줄 것이 없으면 조회수도 올리지 않고 배너 면제도 갱신하지 않는다.
  -- 앱은 reward_max_views 로 이 경로에 오기 전에 버튼을 감춘다.
  if v_granted > 0 then
    v_until := now() + interval '24 hours';
    update public.ai_usage_daily
       set rewarded_bonus = rewarded_bonus + v_granted,
           rewarded_views = coalesce(rewarded_views, 0) + 1,
           ad_free_until  = v_until,
           updated_at     = now()
     where user_id = p_user_id and usage_date = v_today;
    v_bonus := v_bonus + v_granted;
    v_views := v_views + 1;
  end if;

  return jsonb_build_object(
    'granted', v_granted, 'bonus', v_bonus, 'used', v_used,
    'reward_views', v_views, 'ad_free_until', v_until
  );
end; $$;

-- =========================================================
-- 2. get_ai_quota_status — 앱이 읽는 보상 관련 필드를 채운다
--    (기존 필드는 하나도 바꾸지 않는다 — 구 앱 호환)
-- =========================================================
create or replace function public.get_ai_quota_status(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_trial_ends timestamptz; v_pro_until timestamptz; v_effective text; v_limit integer;
  v_today date := kst_today(); v_used integer := 0; v_bonus integer := 0;
  v_views integer := 0; v_ad_free timestamptz;
  v_reset_at_utc timestamptz;
  v_reward_amount integer := 50;   -- grant_rewarded_bonus(uuid) 와 같은 값
  v_reward_max_views integer := 4; -- 상한 200 / 회당 50
begin
  insert into public.user_subscriptions (user_id, tier) values (p_user_id, 'free')
    on conflict (user_id) do nothing;

  select trial_ends_at, pro_until into v_trial_ends, v_pro_until
    from public.user_subscriptions where user_id = p_user_id;

  select p.tier, p.day_limit into v_effective, v_limit from public.ai_effective_plan(p_user_id) p;

  select word_count, rewarded_bonus, coalesce(rewarded_views, 0), ad_free_until
    into v_used, v_bonus, v_views, v_ad_free
    from public.ai_usage_daily where user_id = p_user_id and usage_date = v_today;
  if not found then v_used := 0; v_bonus := 0; v_views := 0; v_ad_free := null; end if;

  v_reset_at_utc := (((v_today + 1)::timestamp at time zone 'Asia/Seoul') at time zone 'UTC');

  return jsonb_build_object('tier', v_effective, 'used', v_used, 'limit', v_limit,
    'bonus', v_bonus, 'trial_ends_at', v_trial_ends, 'pro_until', v_pro_until,
    'reset_at', v_reset_at_utc,
    'reward_amount', v_reward_amount, 'reward_views', v_views,
    'reward_max_views', v_reward_max_views, 'ad_free_until', v_ad_free);
end; $$;

-- =========================================================
-- 3. 권한 — 클라이언트가 직접 부르는 둘만 grant
-- =========================================================
grant execute on function public.get_ai_quota_status(uuid) to authenticated;
grant execute on function public.grant_rewarded_bonus(uuid) to authenticated;
