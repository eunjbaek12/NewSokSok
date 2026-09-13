-- 한도 초과 「뜻만」(basic) 경로 관측 — 0단계. 상한은 아직 걸지 않는다.
-- 설계와 순서: docs/basic-fallback-cap-spec.md
--
-- 지금 Free 가 하루 한도를 다 쓴 뒤의 자동완성은 뜻만 담은 200 을 무제한으로 받는다.
-- consume_ai_quota 는 allowed=false 면 아무 행도 쓰지 않으므로(word_count·call_count 둘 다
-- 안 오른다) 이 경로는 **횟수도 원가도 기록이 없다**. 상한 숫자를 정하려면 먼저 재야 한다.
--
-- 🔴 이 마이그레이션이 적용된 날 **이전 행의 0 은 "basic 이 없었다"가 아니라 "세지 않았다"**
--    이다. 분포 쿼리에는 반드시 usage_date >= 관측시작일 을 건다. 실제 적용일은
--    docs/basic-fallback-cap-spec.md §2 0단계에 적는다(파일 이름의 날짜가 아니라 적용일).

alter table public.ai_usage_daily
  add column if not exists basic_count integer not null default 0 check (basic_count >= 0),
  add column if not exists basic_miss_count integer not null default 0 check (basic_miss_count >= 0);

comment on column public.ai_usage_daily.basic_count is
  '한도 초과 후 뜻만(basic) 을 실제로 내보낸 횟수. 2026-09-12 이전 행의 0 은 미관측.';
comment on column public.ai_usage_daily.basic_miss_count is
  'basic 중 캐시에 뜻이 없어 Vertex(translateMeaningOnly) 를 부른 횟수 = 실제 원가가 든 횟수.';

-- consume_ai_quota 안에서 세지 않는 이유: 그 함수는 mode 를 모른다. 거기서 세면 429 로
-- 끝난 사진 스캔·AI 생성까지 섞여 "뜻만 내보낸 횟수"가 아니게 된다. 판정이 Edge 에 있으니
-- Edge 에서 센다. word_count·call_count 는 건드리지 않는다 — 「호출당 단어」 지표
-- (docs/pricing-decision.md §12)가 흔들린다.
create or replace function public.record_basic_serve(p_user_id uuid, p_cached boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := kst_today();
  v_miss integer := case when coalesce(p_cached, false) then 0 else 1 end;
begin
  insert into public.ai_usage_daily(user_id, usage_date, basic_count, basic_miss_count, updated_at)
  values (p_user_id, v_today, 1, v_miss, now())
  on conflict (user_id, usage_date) do update
    set basic_count = ai_usage_daily.basic_count + 1,
        basic_miss_count = ai_usage_daily.basic_miss_count + v_miss,
        updated_at = now();
end $$;

-- Edge(service_role) 전용. 클라이언트가 부를 이유가 없고, 부를 수 있으면 관측치가 오염된다.
revoke all on function public.record_basic_serve(uuid, boolean) from public, anon, authenticated;
grant execute on function public.record_basic_serve(uuid, boolean) to service_role;
