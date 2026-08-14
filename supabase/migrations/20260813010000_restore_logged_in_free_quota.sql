-- Keep the August guest/reward policy, but restore the established logged-in
-- Free allowance until the matching app release is ready to ship.
create or replace function public.ai_effective_plan(p_user_id uuid)
returns table (tier text, day_limit integer, month_limit integer, reward_amount integer, reward_max_views integer)
language sql stable security definer set search_path = public
as $$
  select
    case when s.pro_until > now() or s.trial_ends_at > now() then 'pro'
         when coalesce(u.is_anonymous, false) then 'guest' else 'free' end,
    case when s.pro_until > now() or s.trial_ends_at > now() then 1000
         when not coalesce(u.is_anonymous, false) and u.created_at > now() - interval '24 hours' then 300
         when coalesce(u.is_anonymous, false) then 10 else 100 end,
    case when s.pro_until > now() or s.trial_ends_at > now() then 5000 else 0 end,
    case when coalesce(u.is_anonymous, false) then 10 else 20 end,
    case when coalesce(u.is_anonymous, false) then 1 else 2 end
  from public.user_subscriptions s join auth.users u on u.id = s.user_id
  where s.user_id = p_user_id;
$$;

revoke all on function public.ai_effective_plan(uuid) from public,anon,authenticated;
