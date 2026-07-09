-- 학습 통계(내 학습) 클라우드 동기화 — study_days · memorized_log의 서버 사본.
--
-- 로컬 SQLite(migration 016/017)에만 있던 스트릭·달력·날짜별 외운 단어 기록을
-- 계정에 백업한다. 재설치/기기 변경 시 스트릭이 0으로 리셋되던 구멍을 막는다.
--
-- 병합 규칙:
--   cloud_study_days  — 날짜별 GREATEST(max) 병합. 두 기기가 같은 날짜에 각자
--                       누적한 카운트는 합산하면 같은 활동이 이중 계산되므로,
--                       "최소한 과대계산이 없는" max를 취한다(클라이언트 pull도 동일).
--                       클라이언트는 plain upsert 대신 merge_study_days RPC를 쓴다
--                       (PostgREST upsert는 LWW라 다른 기기의 더 큰 값을 깎아먹는다).
--   cloud_memorized_log — append-only 합집합. (user_id, date, word_id) PK +
--                       ON CONFLICT DO NOTHING. 행은 갱신되지 않는다.
--
-- id 컬럼: PK가 아니라 pull 키셋 페이지네이션의 타이브레이커용(단조 (updated_at, id)
-- 커서 — engine.ts fetchAllSince와 동일 패턴, PostgREST 1000행 잘림 회피).
--
-- word_id는 cloud_words FK를 걸지 않는다: 로그는 불변 이력이라 단어가 나중에
-- 삭제(soft/hard)돼도 남아야 하고, 클라이언트 getDayDetail이 조인 시점에
-- 없는 단어를 알아서 제외한다.

create table if not exists cloud_study_days (
  id              uuid not null default gen_random_uuid() unique,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date            text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  studied_count   integer not null default 0 check (studied_count >= 0),
  memorized_count integer not null default 0 check (memorized_count >= 0),
  updated_at      bigint not null default 0,
  primary key (user_id, date)
);

create table if not exists cloud_memorized_log (
  id            uuid not null default gen_random_uuid() unique,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date          text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  word_id       text not null,
  created_at_ms bigint not null default 0,
  updated_at    bigint not null default 0,
  primary key (user_id, date, word_id)
);

-- (updated_at, id) 키셋 드레인용 인덱스. RLS로 user_id 스코프가 잡히므로 선두에 user_id.
create index if not exists cloud_study_days_pull_idx on cloud_study_days (user_id, updated_at, id);
create index if not exists cloud_memorized_log_pull_idx on cloud_memorized_log (user_id, updated_at, id);

-- updated_at 서버 강제(시계 skew 방지) — cloud_lists/cloud_words와 동일한 함수 재사용.
create or replace function set_updated_at_ms() returns trigger as $$
begin
  new.updated_at := (extract(epoch from now()) * 1000)::bigint;
  return new;
end; $$ language plpgsql;

drop trigger if exists cloud_study_days_set_updated_at on cloud_study_days;
create trigger cloud_study_days_set_updated_at
  before insert or update on cloud_study_days
  for each row execute function set_updated_at_ms();

drop trigger if exists cloud_memorized_log_set_updated_at on cloud_memorized_log;
create trigger cloud_memorized_log_set_updated_at
  before insert or update on cloud_memorized_log
  for each row execute function set_updated_at_ms();

-- RLS: 자기 행만.
alter table cloud_study_days enable row level security;
drop policy if exists study_days_own on cloud_study_days;
create policy study_days_own on cloud_study_days for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table cloud_memorized_log enable row level security;
drop policy if exists memorized_log_own on cloud_memorized_log;
create policy memorized_log_own on cloud_memorized_log for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 날짜별 max 병합 upsert. security invoker라 RLS가 그대로 적용되지만,
-- user_id를 auth.uid()로 직접 박아 호출자가 남의 행을 만들 여지를 없앤다.
-- 값이 커지지 않는 no-op 충돌은 WHERE로 걸러 updated_at 불필요 전진(에코 pull)을 줄인다.
create or replace function merge_study_days(p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into cloud_study_days as t (user_id, date, studied_count, memorized_count)
  select auth.uid(), r.date, greatest(coalesce(r.studied_count, 0), 0), greatest(coalesce(r.memorized_count, 0), 0)
  from jsonb_to_recordset(p_rows) as r(date text, studied_count integer, memorized_count integer)
  where r.date ~ '^\d{4}-\d{2}-\d{2}$'
  on conflict (user_id, date) do update
    set studied_count   = greatest(t.studied_count, excluded.studied_count),
        memorized_count = greatest(t.memorized_count, excluded.memorized_count)
    where t.studied_count < excluded.studied_count
       or t.memorized_count < excluded.memorized_count;
end;
$$;

revoke all on function merge_study_days(jsonb) from public, anon;
grant execute on function merge_study_days(jsonb) to authenticated;
