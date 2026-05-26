-- 보상형 보너스 cap + 7일 체험 재취득 방지(어뷰징 가드) 테스트
--
-- 실행: supabase test db   (로컬 Postgres = Docker 필요)
-- 마이그레이션: 20260518000000_ai_quota.sql,
--             20260519000000_quota_status_client_grant.sql (amount>100 가드, auth.uid 검증),
--             20260523000000_trial_reacquisition_guard.sql (email_hash / trial_history)

begin;
select plan(11);

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

-- ── trial 재취득 방지 ────────────────────────────────────────────────────────────
-- 첫 가입: trial 부여 + 정규화된 이메일 해시를 trial_history 에 영구 기록
insert into auth.users (id, email)
values ('55555555-5555-5555-5555-555555555555', 'Recur@Test.dev');

select isnt(
  (select trial_ends_at from public.user_subscriptions
     where user_id = '55555555-5555-5555-5555-555555555555'),
  null::timestamptz,
  'first-ever signup receives a trial'
);
-- 해시는 lower(trim(email)) 정규화 후 SHA-256
select ok(
  exists (select 1 from public.trial_history
            where email_hash = public.email_hash('recur@test.dev')),
  'trial_history stores the normalized (lower+trim) email hash'
);

-- 계정 삭제: user_subscriptions 는 on delete cascade 로 사라지고, trial_history 는 남는다
delete from auth.users where id = '55555555-5555-5555-5555-555555555555';

select ok(
  not exists (select 1 from public.user_subscriptions
                where user_id = '55555555-5555-5555-5555-555555555555'),
  'deleting the account cascades away the subscription row'
);
select ok(
  exists (select 1 from public.trial_history
            where email_hash = public.email_hash('recur@test.dev')),
  'trial_history survives account deletion (no auth FK on it)'
);

-- 같은 이메일을 대문자/공백 변형으로 재가입 → 정규화 해시 일치 → 체험 없이 Free 시작
insert into auth.users (id, email)
values ('66666666-6666-6666-6666-666666666666', '  RECUR@test.dev ');
select is(
  (select trial_ends_at from public.user_subscriptions
     where user_id = '66666666-6666-6666-6666-666666666666'),
  null::timestamptz,
  'a re-registered email (case/space variant) starts on free with no new trial'
);

-- 무관한 새 이메일은 정상적으로 체험 부여
insert into auth.users (id, email)
values ('77777777-7777-7777-7777-777777777777', 'brandnew@test.dev');
select isnt(
  (select trial_ends_at from public.user_subscriptions
     where user_id = '77777777-7777-7777-7777-777777777777'),
  null::timestamptz,
  'an unrelated new email still gets a trial'
);

select * from finish();
rollback;
