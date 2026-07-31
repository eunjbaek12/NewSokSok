-- 보상형 보너스 cap + 가입 정책(체험 폐지 / 신규 24시간 부스트) 테스트
--
-- 실행: supabase test db   (로컬 Postgres = Docker 필요)
-- 마이그레이션: 20260518000000_ai_quota.sql,
--             20260519000000_quota_status_client_grant.sql (amount>100 가드, auth.uid 검증),
--             20260523000000_trial_reacquisition_guard.sql (email_hash / trial_history — 현재 미사용, 보존만),
--             20260727000000_signup_boost_replaces_trial.sql (가입 체험 폐지 + 첫 24시간 한도 300)

begin;
select plan(12);

-- ── grant_rewarded_bonus: 일 cap 200 ───────────────────────────────────────────
insert into auth.users (id, email)
values ('44444444-4444-4444-4444-444444444444', 'reward@test.dev');
insert into public.ai_usage_daily (user_id, usage_date, rewarded_bonus)
values ('44444444-4444-4444-4444-444444444444', public.kst_today(), 180);

-- 이미 180 → 50 요청해도 20 만 부여 (cap 200)
select is(
  (public.grant_rewarded_bonus('44444444-4444-4444-4444-444444444444', 50) ->> 'granted')::int,
  20,
  'bonus grant is clamped so the daily total never exceeds the 200 cap'
);
select is(
  (public.grant_rewarded_bonus('44444444-4444-4444-4444-444444444444', 50) ->> 'bonus')::int,
  200,
  'bonus saturates at the 200 cap'
);
-- 이미 cap → 추가 부여 0
select is(
  (public.grant_rewarded_bonus('44444444-4444-4444-4444-444444444444', 50) ->> 'granted')::int,
  0,
  'no further bonus is granted once the cap is reached'
);
-- 클라이언트 직접 호출 어뷰징 방어: amount > 100 차단
select throws_ok(
  $$ select public.grant_rewarded_bonus('44444444-4444-4444-4444-444444444444', 101) $$,
  'amount too large',
  'rejects an abusively large client-supplied amount'
);
-- 비정상 음수/0
select throws_ok(
  $$ select public.grant_rewarded_bonus('44444444-4444-4444-4444-444444444444', 0) $$,
  'amount must be positive integer',
  'rejects a non-positive amount'
);

-- ── 가입 정책: 체험 없음 + 첫 24시간 부스트 ──────────────────────────────────────
-- 무료 체험은 스토어 오퍼(결제 플로우)가 담당한다. 서버는 더 이상 체험을 주지 않는다.
insert into auth.users (id, email)
values ('55555555-5555-5555-5555-555555555555', 'fresh@test.dev');

select is(
  (select trial_ends_at from public.user_subscriptions
     where user_id = '55555555-5555-5555-5555-555555555555'),
  null::timestamptz,
  'a new signup no longer receives a server-side trial'
);
select is(
  (select tier from public.ai_effective_plan('55555555-5555-5555-5555-555555555555')),
  'free',
  'a new signup is on the free tier (the boost widens the limit, not the tier)'
);
-- 신규 부스트: 가입 후 24시간 이내는 300
select is(
  (select day_limit from public.ai_effective_plan('55555555-5555-5555-5555-555555555555')),
  300,
  'a signup within the last 24h gets the 300-word new-user boost'
);

-- 25시간 전 가입자 → 부스트 만료, 평시 Free 한도 100
insert into auth.users (id, email, created_at)
values ('66666666-6666-6666-6666-666666666666', 'yesterday@test.dev', now() - interval '25 hours');
select is(
  (select day_limit from public.ai_effective_plan('66666666-6666-6666-6666-666666666666')),
  100,
  'the boost expires 24h after signup, falling back to the 100-word free limit'
);

-- ⚠️ 폐지 이전에 받은 잔여 체험은 만료일까지 그대로 Pro로 계산돼야 한다.
--    (앱 업데이트로 남은 체험이 깎이지 않는다는 보장.)
insert into auth.users (id, email, created_at)
values ('77777777-7777-7777-7777-777777777777', 'legacytrial@test.dev', now() - interval '3 days');
update public.user_subscriptions
   set trial_ends_at = now() + interval '4 days'
 where user_id = '77777777-7777-7777-7777-777777777777';

select is(
  (select tier from public.ai_effective_plan('77777777-7777-7777-7777-777777777777')),
  'pro',
  'a trial granted before the policy change still resolves to pro until it expires'
);
select is(
  (select day_limit from public.ai_effective_plan('77777777-7777-7777-7777-777777777777')),
  1000,
  'that leftover trial keeps the full 1,000-word pro limit'
);

-- 유료 구독자는 종전과 동일
insert into auth.users (id, email, created_at)
values ('88888888-8888-8888-8888-888888888888', 'paid@test.dev', now() - interval '30 days');
update public.user_subscriptions
   set tier = 'pro', pro_until = now() + interval '20 days'
 where user_id = '88888888-8888-8888-8888-888888888888';

select is(
  (select day_limit from public.ai_effective_plan('88888888-8888-8888-8888-888888888888')),
  1000,
  'a paid subscriber keeps the 1,000-word pro limit'
);

select * from finish();
rollback;
