-- 탈퇴 → 재가입으로 7일 Pro 체험을 무한 재취득하는 어뷰징 방지.
--
-- 문제: 계정 탈퇴(delete_user)가 auth.users 행을 삭제하면 user_subscriptions가
--   on delete cascade(20260518000000_ai_quota.sql:8)로 함께 사라진다. 같은 구글
--   계정으로 재로그인하면 Supabase가 새 user_id를 발급 → on_auth_user_created_subscription
--   트리거가 매번 7일 trial을 재부여. user_id 기준이라 "과거 체험 수령 여부"를 알 수 없음.
--
-- 해결: 이메일의 SHA-256 해시를 trial_history에 영구 보존한다. 이 테이블은
--   auth.users FK를 두지 않으므로 계정 삭제 cascade의 영향을 받지 않는다.
--   트리거에서 이력이 있으면 trial 없이 Free로 시작, 없으면 trial 부여 + 이력 기록.
--
-- 개인정보: 평문 이메일이 아닌 해시만 저장(역산 불가). 어뷰징 방지라는 단일 목적.
--   개인정보처리방침 / account-deletion 안내에 "체험 재취득 방지용 이메일 해시 보존" 명시.

-- Supabase는 pgcrypto를 extensions 스키마에 제공 (digest 함수).
create extension if not exists pgcrypto with schema extensions;

-- =========================================================
-- trial_history — 체험 수령 이력 (계정 삭제와 무관하게 영구 보존)
-- =========================================================
create table if not exists public.trial_history (
  email_hash      text primary key,
  first_trial_at  timestamptz not null default now()
);

-- 클라이언트 접근 불필요 — 트리거(security definer)와 service_role만 사용.
-- RLS 켜고 정책을 두지 않으면 authenticated/anon은 일절 접근 불가.
alter table public.trial_history enable row level security;

-- 이메일 정규화(lower + trim) 후 SHA-256 해시. 동일 계정 식별을 안정화.
create or replace function public.email_hash(p_email text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(digest(lower(trim(p_email)), 'sha256'), 'hex');
$$;

-- =========================================================
-- 트리거 함수 교체 — 과거 체험 이력 확인 후 trial 부여 여부 결정
-- =========================================================
create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash        text;
  v_grant_trial boolean := true;
begin
  -- 이메일이 있으면 과거 체험 이력 조회. (이론상 이메일 없는 OAuth는 trial 부여로 폴백.)
  if new.email is not null and length(trim(new.email)) > 0 then
    v_hash := public.email_hash(new.email);
    if exists (select 1 from public.trial_history where email_hash = v_hash) then
      v_grant_trial := false;  -- 재가입자 → 체험 없이 Free
    end if;
  end if;

  if v_grant_trial then
    insert into public.user_subscriptions (user_id, tier, trial_started_at, trial_ends_at)
    values (new.id, 'free', now(), now() + interval '7 days')
    on conflict (user_id) do nothing;
    -- 체험 이력 기록 (다음 재가입 시 식별용)
    if v_hash is not null then
      insert into public.trial_history (email_hash)
      values (v_hash)
      on conflict (email_hash) do nothing;
    end if;
  else
    -- 과거 체험 수령자 → trial_ends_at 없이 Free로 시작
    insert into public.user_subscriptions (user_id, tier)
    values (new.id, 'free')
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

-- 트리거 자체는 동일(함수만 교체). 명시적으로 재생성해 멱등성 보장.
drop trigger if exists on_auth_user_created_subscription on auth.users;
create trigger on_auth_user_created_subscription
  after insert on auth.users
  for each row execute function public.handle_new_user_subscription();
