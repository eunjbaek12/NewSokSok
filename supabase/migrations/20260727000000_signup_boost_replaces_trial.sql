-- 가입 시 7일 Pro 체험 폐지 → 무료 체험은 스토어 오퍼(결제 플로우) 한 곳으로 일원화.
-- 대신 신규 가입자에게 "첫 24시간 한도 300"을 준다.
--
-- 배경:
--   체험을 두 번 주고 있었다. ① 가입 시 서버가 7일 Pro(이 파일 이전의 트리거),
--   ② Pro 결제 시 스토어 오퍼 7일. 합쳐서 최대 14일이고, ①은 체험받은 48명 중
--   유료 전환 0명으로 효과가 확인되지 않았다. 신규 사용자는 첫 주에 앱을 익히느라
--   Pro의 가치(한도 1,000·광고 제거)를 느낄 겨를이 없고, 8일째에 한도가 갑자기
--   100으로 떨어지며 "앱이 나빠졌다"는 인상만 남는다.
--
--   다만 ①에는 실제 효용이 하나 있었다. 가입 첫날 사진 스캔으로 교재를 통째
--   담는 사용자가 있는데(관측: 가입 당일 488단어), Free 한도 100이면 첫 스캔
--   도중에 막혀 그대로 이탈한다. 이 "첫 경험의 벽"만 따로 떼어 해결한다.
--
-- 이 마이그레이션이 하는 일:
--   1. 신규 가입 시 trial_ends_at 미부여 (Free로 시작)
--   2. 가입 후 24시간 이내면 일일 한도 100 → 300
--   3. 한도 계산을 ai_effective_plan()으로 단일화 (consume/status 두 곳의 표류 방지)
--
-- ⚠️ 이미 체험을 받은 사용자는 건드리지 않는다. user_subscriptions의 기존 행을
--    일절 UPDATE하지 않으므로, trial_ends_at이 미래인 사용자는 그 날짜까지 Pro를
--    그대로 유지한다. 앱을 업데이트해도 남은 체험이 깎이지 않는다.
--
--    trial_history 테이블과 email_hash()는 남겨둔다. 지금은 아무도 쓰지 않지만,
--    서버 체험을 되살릴 경우 "과거 수령 이력"이 있어야 재취득 어뷰징을 막을 수 있고,
--    한번 지우면 복구할 수 없는 데이터다.

-- =========================================================
-- 1. 가입 트리거 — 체험 없이 Free로 시작
-- =========================================================
create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- 체험은 스토어 오퍼가 담당한다. 서버는 Free 행만 만든다.
  -- (신규 혜택은 trial이 아니라 ai_effective_plan의 첫 24시간 한도 상향으로 준다.)
  insert into public.user_subscriptions (user_id, tier)
  values (new.id, 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- 트리거 자체는 동일(함수만 교체). 명시적으로 재생성해 멱등성 보장.
drop trigger if exists on_auth_user_created_subscription on auth.users;
create trigger on_auth_user_created_subscription
  after insert on auth.users
  for each row execute function public.handle_new_user_subscription();

-- =========================================================
-- 2. 유효 등급 + 일일 한도 — 단일 진실 공급원
-- =========================================================
-- consume_ai_quota와 get_ai_quota_status가 각자 한도를 계산하고 있어서, 한쪽만
-- 고치면 "쓸 수 있는 양"과 "화면에 보이는 양"이 어긋난다. 한 함수로 합친다.
--
-- 반환 tier는 'free' | 'pro'. 신규 부스트는 tier를 바꾸지 않는다 — Pro가 아니라
-- Free의 한도만 넓힌 것이므로, 광고 제거 등 Pro 전용 혜택이 딸려가면 안 된다.
create or replace function public.ai_effective_plan(p_user_id uuid)
returns table (tier text, day_limit integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when s.pro_until    > now() then 'pro'
      when s.trial_ends_at > now() then 'pro'   -- 폐지 이전에 받은 잔여 체험 (보존)
      else 'free'
    end,
    case
      when s.pro_until > now() or s.trial_ends_at > now() then 1000
      -- 신규 부스트: 가입 후 24시간. "가입 당일"이 아니라 24시간인 이유는
      -- 23:50에 가입한 사용자의 첫날이 10분으로 끝나지 않게 하기 위해서다.
      when u.created_at > now() - interval '24 hours' then 300
      else 100
    end
  from public.user_subscriptions s
  join auth.users u on u.id = s.user_id
  where s.user_id = p_user_id;
$$;

-- =========================================================
-- 3. consume_ai_quota — 한도 계산만 위임, 나머지 로직 동일
-- =========================================================
create or replace function public.consume_ai_quota(
  p_user_id  uuid,
  p_cost     integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective    text;
  v_limit        integer;
  v_today        date := kst_today();
  v_used         integer := 0;
  v_bonus        integer := 0;
  v_calls        integer := 0;
  v_allowed      boolean;
  v_reset_at_utc timestamptz;
begin
  if p_cost is null or p_cost <= 0 then
    raise exception 'cost must be positive integer';
  end if;

  -- 자동 행 생성(가입 트리거가 못 잡은 케이스 보호용)
  insert into public.user_subscriptions (user_id, tier)
  values (p_user_id, 'free')
  on conflict (user_id) do nothing;

  select p.tier, p.day_limit
    into v_effective, v_limit
    from public.ai_effective_plan(p_user_id) p;

  -- 오늘 사용량 잠금 (concurrent 차감 race condition 방지)
  select word_count, rewarded_bonus, call_count
    into v_used, v_bonus, v_calls
    from public.ai_usage_daily
   where user_id = p_user_id and usage_date = v_today
   for update;

  if not found then
    v_used := 0; v_bonus := 0; v_calls := 0;
  end if;

  v_allowed := (v_used + p_cost) <= (v_limit + v_bonus);

  if v_allowed then
    insert into public.ai_usage_daily (user_id, usage_date, word_count, call_count, updated_at)
    values (p_user_id, v_today, p_cost, 1, now())
    on conflict (user_id, usage_date) do update
      set word_count = ai_usage_daily.word_count + excluded.word_count,
          call_count = ai_usage_daily.call_count + 1,
          updated_at = now();
    v_used := v_used + p_cost;
    v_calls := v_calls + 1;
  end if;

  -- KST 익일 00:00을 UTC로
  v_reset_at_utc :=
    (((v_today + 1)::timestamp at time zone 'Asia/Seoul') at time zone 'UTC');

  return jsonb_build_object(
    'allowed',     v_allowed,
    'tier',        v_effective,
    'used',        v_used,
    'limit',       v_limit,
    'bonus',       v_bonus,
    'call_count',  v_calls,
    'reset_at',    v_reset_at_utc
  );
end;
$$;

-- =========================================================
-- 4. get_ai_quota_status — 동일 한도 계산 사용
-- =========================================================
create or replace function public.get_ai_quota_status(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trial_ends   timestamptz;
  v_pro_until    timestamptz;
  v_effective    text;
  v_limit        integer;
  v_today        date := kst_today();
  v_used         integer := 0;
  v_bonus        integer := 0;
  v_reset_at_utc timestamptz;
begin
  insert into public.user_subscriptions (user_id, tier)
  values (p_user_id, 'free')
  on conflict (user_id) do nothing;

  select trial_ends_at, pro_until
    into v_trial_ends, v_pro_until
    from public.user_subscriptions
   where user_id = p_user_id;

  select p.tier, p.day_limit
    into v_effective, v_limit
    from public.ai_effective_plan(p_user_id) p;

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

-- Edge Function이 service_role로 호출. anon/authenticated 권한 부여 불필요.
revoke all on function public.ai_effective_plan(uuid) from public, anon, authenticated;
