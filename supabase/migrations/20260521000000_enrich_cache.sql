-- v1.1 보강: 전 사용자 공용 enrich 캐시
-- enrich 결과(정의·뜻·예문·연상·품사·발음)는 (term, sourceLang, targetLang)에만
-- 의존하는 일반 사전 데이터라 사용자 간 공유 가능. 흔한 단어는 첫 호출만 Vertex를 타고
-- 이후 전원이 DB에서 즉시 받는다(운영자 Vertex 비용 절감).
--
-- 보안: 쓰기는 service_role(Edge Function)만 — 캐시 오염(악의적 주입) 차단.
--       읽기는 authenticated(Phase 2 BYOK 클라이언트 직접 조회용). Edge는 RLS 우회.

create table if not exists public.enrich_cache (
  source_lang    text not null,
  target_lang    text not null,
  term           text not null,
  result         jsonb not null,
  prompt_version integer not null default 1,
  hit_count      integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (source_lang, target_lang, term)
);

alter table public.enrich_cache enable row level security;

-- 읽기: 로그인 사용자. Edge Function은 service_role이라 이 정책과 무관하게 동작.
create policy "enrich_cache_auth_read"
  on public.enrich_cache
  for select
  to authenticated
  using (true);

-- INSERT/UPDATE/DELETE 정책 없음 → service_role(Edge Function)만 기록 가능.

-- 캐시 히트 카운트 원자적 증가 (인기 단어 분석용). Edge Function(service_role)에서만 호출.
create or replace function public.increment_enrich_cache_hit(
  p_source_lang text,
  p_target_lang text,
  p_term        text
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.enrich_cache
     set hit_count = hit_count + 1
   where source_lang = p_source_lang
     and target_lang = p_target_lang
     and term = p_term;
$$;

revoke execute on function public.increment_enrich_cache_hit(text, text, text) from public, anon, authenticated;

