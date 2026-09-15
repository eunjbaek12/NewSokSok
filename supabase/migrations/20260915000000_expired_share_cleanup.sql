-- 30일 지난 공유본 정리 — 스펙 §5.5 / §4.2 (순서는 §10의 8단계)
--
-- 친구에게 보낸 단어장은 30일이면 스스로 닫힌다(§2-4). 지금까지 «닫힌다»는
-- 조회에서 거르는 것뿐이었고(get_shared_deck 이 만료를 null 로 답한다), 행과
-- 단어는 그대로 남아 있었다. 이 파일이 그걸 실제로 지운다.
--
-- 🔴 **유예 7일.** 만료된 순간 이미 주소가 안 열리므로 미뤄도 받는 쪽 차이는 0이다.
--    유예가 사는 자리는 다른 데 있다 — 이 함수가 대상을 잘못 고르면 지워진 뒤에
--    되돌릴 길이 없고(free 플랜은 백업이 없다), 7일은 그걸 알아챌 시간이다.
--
-- 🔴 **지우기 전에 요약 한 줄을 남긴다**(§4.2). 만료 행을 그냥 지우면 열림·담김
--    수가 함께 사라져 「보낸 것 중 몇 개가 열렸나」를 영영 셀 수 없게 된다.
--
-- 지금 적용해도 지워지는 것은 **하나도 없다.** 기능이 2026-09-11 에 나갔고 수명이
-- 30일이라 가장 이른 만료가 10/11, 유예를 더하면 10/18 이다. 그때까지 이 함수는
-- 매일 돌면서 0건을 센다 — 그게 정상이다.

-- ─── 1. 요약 (§4.2) ──────────────────────────────────────────────────────────
-- 🔴 id 는 uuid 가 아니라 **text** 다. curated_themes.id 가 text 이고
--    get_shared_deck(p_id text) 도 그렇다 — 스펙 §4.2 의 «id uuid» 는 오기다.
--    uuid 로 만들면 insert ... select 가 타입 오류로 터진다.
--
-- **단어 내용은 남기지 않는다**(§4.2). 남기는 것은 수뿐이다.
create table if not exists public.share_events (
  id           text   primary key,
  creator_id   uuid,
  word_count   int    not null default 0,
  visibility   text,
  created_at   bigint,
  ended_at     bigint not null,
  open_count   int    not null default 0,
  save_count   int    not null default 0
);

-- 앱은 이 표를 읽지 않는다 — 운영 측정용이다. RLS 를 켜고 정책을 **하나도 두지
-- 않으면** service_role 과 대시보드만 읽는다. 나중에 «내가 보낸 것들» 같은 화면이
-- 생기면 그때 creator_id = auth.uid() 정책을 더한다.
alter table public.share_events enable row level security;

comment on table public.share_events is
  '만료돼 지워진 공유본의 요약. 단어 내용은 없다. cleanup_expired_shares() 가 채운다.';

-- ─── 2. 정리 함수 (§5.5-2) ───────────────────────────────────────────────────
-- p_dry_run 을 주면 **세기만 하고 지우지 않는다.** 처음 돌릴 때와, 유예·기준을
-- 바꿀 때는 반드시 이걸로 먼저 본다.
create or replace function public.cleanup_expired_shares(
  p_grace_days int     default 7,
  p_dry_run    boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_cutoff bigint;
  v_ids    text[];
  v_count  int;
begin
  -- 🔴 expires_at is not null 이 이 함수의 전부다. 공유 단어장에 «올린» 게시물은
  --    expires_at 이 null 이라 수명이 없다(§2-3) — 여기 걸리면 목록에 선 단어장이
  --    어느 날 소리 없이 사라진다.
  v_cutoff := (extract(epoch from now()) * 1000)::bigint
              - (p_grace_days::bigint * 86400000);

  select coalesce(array_agg(id), '{}'::text[]) into v_ids
    from public.curated_themes
   where expires_at is not null
     and expires_at <= v_cutoff;

  v_count := coalesce(array_length(v_ids, 1), 0);

  if v_count = 0 or p_dry_run then
    return jsonb_build_object(
      'matched', v_count,
      'deleted', 0,
      'dry_run', p_dry_run,
      'grace_days', p_grace_days,
      'cutoff', v_cutoff
    );
  end if;

  -- 요약 먼저 — 지운 뒤에는 셀 것이 없다. 지운 행은 다음 실행의 대상이 아니라서
  -- 같은 id 가 두 번 들어올 일은 없지만, 중간에 끊겨 다시 돌 때 터지지 않도록
  -- on conflict 로 받는다.
  insert into public.share_events (
    id, creator_id, word_count, visibility, created_at, ended_at, open_count, save_count
  )
  select t.id,
         t.creator_id,
         (select count(*) from public.curated_words w where w.theme_id = t.id),
         t.visibility,
         t.created_at,
         t.expires_at,
         t.open_count,
         t.save_count
    from public.curated_themes t
   where t.id = any(v_ids)
  on conflict (id) do nothing;

  -- curated_words 의 FK 에 on delete cascade 가 걸려 있는지 저장소에서 확인할 수
  -- 없다 — 그 테이블의 생성 마이그레이션이 없다(대시보드에서 만들어졌다).
  -- 그래서 단어를 **명시적으로 먼저** 지운다. cascade 가 있어도 결과는 같고,
  -- 없으면 이 줄이 고아 행 수천 개를 막는다.
  delete from public.curated_words  where theme_id = any(v_ids);
  delete from public.curated_themes where id       = any(v_ids);

  return jsonb_build_object(
    'matched', v_count,
    'deleted', v_count,
    'dry_run', false,
    'grace_days', p_grace_days,
    'cutoff', v_cutoff
  );
end;
$function$;

-- 아무도 직접 부르지 못하게 한다. 부르는 것은 cron(=postgres 롤)과 대시보드뿐이다.
revoke all on function public.cleanup_expired_shares(int, boolean) from public;

-- ─── 3. 매일 한 번 (§5.5-2) ──────────────────────────────────────────────────
-- pg_cron 확장이 켜져 있어야 예약이 선다. 꺼져 있으면 **조용히 건너뛴다** —
-- 표와 함수는 그대로 만들어지고, 확장을 켠 뒤 이 파일을 다시 돌리면 그때 걸린다.
-- (Supabase 대시보드 → Database → Extensions → pg_cron)
--
-- UTC 18:00 = KST 새벽 3시. 사람이 가장 적게 쓰는 시각이고, 이 작업은 급하지
-- 않으므로 낮 시간을 피한다.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron 이 꺼져 있어 예약을 건너뛴다 — 확장을 켠 뒤 이 파일을 다시 돌릴 것.';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'cleanup-expired-shares') then
    perform cron.unschedule('cleanup-expired-shares');
  end if;

  perform cron.schedule(
    'cleanup-expired-shares',
    '0 18 * * *',
    $cron$select public.cleanup_expired_shares()$cron$
  );
end $$;
