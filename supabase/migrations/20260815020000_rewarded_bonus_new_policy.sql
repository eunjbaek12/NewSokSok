-- ⏳ 미적용 대기 — 정책 전환 세트의 일부다. 20260813020000 과 **함께** 적용할 것.
--
-- 왜 필요한가: 20260813020000 은 grant_rewarded_bonus 를 건드리지 않는다. 그 파일만
-- 적용하면 한도·상태 응답은 새 정책(Free 50 · 게스트 10 · Pro 월 3,000 · 보상 +20)이
-- 되는데, 실제 지급은 20260815010000 이 박아 둔 옛 값(+50 · 상한 200)으로 남는다 —
-- 앱은 "+20단어"라 표시하고 서버는 50을 주는 어긋남이 생긴다.
--
-- 이 파일은 1인자 grant 를 ai_effective_plan 기반으로 바꿔 그 어긋남을 없앤다.
-- 새 정책 값(같은 함수에서 읽으므로 한 곳만 고치면 전부 따라온다):
--   reward_amount     게스트 10 · 그 외 20
--   reward_max_views  게스트 1회 · 그 외 2회
--
-- 🔑 3인자는 지우지 않는다. 스토어 앱 업데이트에는 시차가 있어 1.4.0 이 한동안 남고,
--    지우면 그 사용자들의 보상형 광고가 무효가 된다(2026-08-13 에 실제로 그랬다).
--    ⚠️ 3인자는 호출자가 준 금액(+50)을 그대로 주므로 새 정책보다 후하다. 일부러 둔다 —
--    구 앱 UI 가 "+50단어"라고 적혀 있어, 서버만 20으로 깎으면 표시와 실제가 어긋난다.
--    구 앱 사용자는 곧 업데이트하므로 잠깐 후한 편이 낫다.
--
-- 🔑 Pro 는 광고 대상이 아니다(앱이 hasRewardViewsRemaining 에서 막는다). 서버에서도
--    예외를 던져 이중으로 막는다 — 20260813000000 의 1인자가 그렇게 했다.

create or replace function public.grant_rewarded_bonus(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  p         record;
  v_today   date := kst_today();
  d         record;
  v_until   timestamptz;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'forbidden';
  end if;

  select * into p from public.ai_effective_plan(p_user_id);
  if p.tier = 'pro' then
    raise exception 'pro users are not eligible';
  end if;

  insert into public.ai_usage_daily (user_id, usage_date, rewarded_bonus)
  values (p_user_id, v_today, 0)
  on conflict (user_id, usage_date) do nothing;

  select * into d
    from public.ai_usage_daily
   where user_id = p_user_id and usage_date = v_today
     for update;

  -- 상한에 닿으면 아무것도 바꾸지 않고 현재 상태만 돌려준다. 앱은 reward_max_views 로
  -- 이 경로에 오기 전에 버튼을 감춘다.
  if coalesce(d.rewarded_views, 0) >= p.reward_max_views then
    return jsonb_build_object(
      'granted', 0, 'bonus', coalesce(d.rewarded_bonus, 0), 'used', coalesce(d.word_count, 0),
      'reward_views', coalesce(d.rewarded_views, 0), 'ad_free_until', d.ad_free_until
    );
  end if;

  v_until := now() + interval '24 hours';
  update public.ai_usage_daily
     set rewarded_bonus = rewarded_bonus + p.reward_amount,
         rewarded_views = coalesce(rewarded_views, 0) + 1,
         ad_free_until  = v_until,
         updated_at     = now()
   where user_id = p_user_id and usage_date = v_today
  returning * into d;

  return jsonb_build_object(
    'granted', p.reward_amount, 'bonus', d.rewarded_bonus, 'used', coalesce(d.word_count, 0),
    'reward_views', d.rewarded_views, 'ad_free_until', d.ad_free_until
  );
end; $$;

grant execute on function public.grant_rewarded_bonus(uuid) to authenticated;
