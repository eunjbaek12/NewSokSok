-- AI 한도 핵심 RPC 테스트: consume_ai_quota / get_ai_quota_status / refund_ai_quota
--
-- 실행: supabase test db   (로컬 Postgres = Docker 필요)
-- 마이그레이션: 20260518000000_ai_quota.sql, 20260519000000_quota_status_client_grant.sql
--
-- 각 파일은 단일 트랜잭션 안에서 돌고 끝에 rollback 하므로 DB를 더럽히지 않는다.

begin;
select plan(15);

-- ── Fixtures ──────────────────────────────────────────────────────────────────
-- 신규 가입 트리거(handle_new_user_subscription)가 7일 trial을 자동 부여한다.
insert into auth.users (id, email)
values ('11111111-1111-1111-1111-111111111111', 'free-user@test.dev');

select isnt(
  (select trial_ends_at from public.user_subscriptions
     where user_id = '11111111-1111-1111-1111-111111111111'),
  null::timestamptz,
  'new signup is granted a 7-day trial'
);

-- free 한도(100)를 검증하려면 trial을 만료시켜 effective tier를 free로 떨어뜨린다.
update public.user_subscriptions
   set trial_started_at = now() - interval '8 days',
       trial_ends_at    = now() - interval '1 day'
 where user_id = '11111111-1111-1111-1111-111111111111';

select is(
  public.get_ai_quota_status('11111111-1111-1111-1111-111111111111') ->> 'tier',
  'free',
  'expired trial falls back to the free tier'
);

select is(
  (public.get_ai_quota_status('11111111-1111-1111-1111-111111111111') ->> 'limit')::int,
  100,
  'free tier daily limit is 100 words'
);

-- ── consume 경계: used = 99 에서 시작 ──────────────────────────────────────────
insert into public.ai_usage_daily (user_id, usage_date, word_count)
values ('11111111-1111-1111-1111-111111111111', public.kst_today(), 99);

-- cost 2 → 거부 (99 + 2 > 100)
select is(
  (public.consume_ai_quota('11111111-1111-1111-1111-111111111111', 2) ->> 'allowed')::boolean,
  false,
  'consume is denied when it would exceed the limit'
);

-- 거부된 호출은 카운터를 차감하지 않는다
select is(
  (select word_count from public.ai_usage_daily
     where user_id = '11111111-1111-1111-1111-111111111111'
       and usage_date = public.kst_today()),
  99,
  'a denied consume does not decrement the counter'
);

-- cost 1 → 정확히 경계에서 허용, used 가 100 으로
select is(
  (public.consume_ai_quota('11111111-1111-1111-1111-111111111111', 1) ->> 'used')::int,
  100,
  'consume succeeds exactly at the boundary and counts up to the limit'
);

-- 이제 used = 100 → 추가 cost 1 은 거부
select is(
  (public.consume_ai_quota('11111111-1111-1111-1111-111111111111', 1) ->> 'allowed')::boolean,
  false,
  'consume is denied once the limit is reached'
);

-- 보상형 보너스 50 을 더하면 유효 상한이 150 으로 확장된다
update public.ai_usage_daily
   set rewarded_bonus = 50
 where user_id = '11111111-1111-1111-1111-111111111111'
   and usage_date = public.kst_today();

select is(
  (public.consume_ai_quota('11111111-1111-1111-1111-111111111111', 50) ->> 'allowed')::boolean,
  true,
  'rewarded bonus extends the effective daily cap'
);

-- ── Pro tier (유료 구독) ────────────────────────────────────────────────────────
insert into auth.users (id, email)
values ('22222222-2222-2222-2222-222222222222', 'pro-user@test.dev');
update public.user_subscriptions
   set pro_until = now() + interval '30 days'
 where user_id = '22222222-2222-2222-2222-222222222222';

select is(
  public.get_ai_quota_status('22222222-2222-2222-2222-222222222222') ->> 'tier',
  'pro',
  'active pro_until yields the pro tier'
);
select is(
  (public.get_ai_quota_status('22222222-2222-2222-2222-222222222222') ->> 'limit')::int,
  1000,
  'pro tier daily limit is 1000 words'
);
select ok(
  (public.get_ai_quota_status('22222222-2222-2222-2222-222222222222') ->> 'reset_at')::timestamptz > now(),
  'reset_at is in the future (next KST midnight)'
);

-- ── Trial-as-pro (체험도 pro 한도) ──────────────────────────────────────────────
-- 서버 RPC는 trial 과 paid 를 모두 tier='pro' 로 반환한다. (클라이언트가 getProMode 로 구분)
insert into auth.users (id, email)
values ('33333333-3333-3333-3333-333333333333', 'trial-user@test.dev');

select is(
  public.get_ai_quota_status('33333333-3333-3333-3333-333333333333') ->> 'tier',
  'pro',
  'an active free trial is treated as pro for quota purposes'
);
select is(
  (public.get_ai_quota_status('33333333-3333-3333-3333-333333333333') ->> 'limit')::int,
  1000,
  'trial users get the pro daily limit'
);

-- ── refund_ai_quota (Vertex 호출 실패 시 한도 복원) ─────────────────────────────
insert into public.ai_usage_daily (user_id, usage_date, word_count)
values ('33333333-3333-3333-3333-333333333333', public.kst_today(), 10);

select public.refund_ai_quota('33333333-3333-3333-3333-333333333333', 4);
select is(
  (select word_count from public.ai_usage_daily
     where user_id = '33333333-3333-3333-3333-333333333333'
       and usage_date = public.kst_today()),
  6,
  'refund decrements the word counter'
);

-- 과도 환불은 0 에서 멈춘다 (greatest(0, ...))
select public.refund_ai_quota('33333333-3333-3333-3333-333333333333', 100);
select is(
  (select word_count from public.ai_usage_daily
     where user_id = '33333333-3333-3333-3333-333333333333'
       and usage_date = public.kst_today()),
  0,
  'refund floors the counter at zero'
);

select * from finish();
rollback;
