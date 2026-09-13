-- 중재 조치를 «삭제»에서 «가림»으로 (docs/share-to-friend-spec.md §8)
--
-- 지금 관리자가 할 수 있는 조치는 삭제뿐이다. 그런데 덱을 지우면 curation_reports 가
-- on delete cascade 로 함께 사라진다 — 무엇을 왜 지웠는지가 아무 데도 남지 않는다.
-- 신고를 받아 처리해도 기록이 남지 않으면 반복 위반도, 조치 여부도 되짚을 수 없다.
--
-- 그래서 조치를 가림으로 바꾼다. 행은 남고 목록·주소에서만 사라진다.
--   1) visibility 에 'removed' 추가
--   2) moderate_curation() — 관리자만 부른다. 가리고(또는 되돌리고), 같은 트랜잭션에서
--      그 덱의 pending 신고를 처리로 표시한다.
--   3) get_shared_deck 이 가려진 것을 주지 않게 한다 (지금은 만료만 본다 — 가려도
--      주소로는 계속 열린다).
--
-- 🔑 일반 UPDATE 정책을 넓히지 않은 이유: 관리자에게 남의 덱 제목·작성자 이름까지
--    고칠 권한을 주게 된다. 중재에 필요한 건 «가린다» 하나뿐이라 그것만 하는 함수를 낸다.
--    공유 탭 조회(fetchCloudCurations)는 이미 visibility='public' 만 보므로 앱은 손대지
--    않아도 가려진 덱이 목록에서 사라진다.

-- ─── 1. visibility 에 'removed' ────────────────────────────────────────────────
alter table public.curated_themes
  drop constraint if exists chk_curated_themes_visibility;
alter table public.curated_themes
  add constraint chk_curated_themes_visibility
  check (visibility in ('public', 'link', 'removed'));

-- ─── 2. 중재 함수 ─────────────────────────────────────────────────────────────
create or replace function public.moderate_curation(
  p_theme_id text,
  p_hide boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_before  text;
  v_after   text;
  v_reports int;
begin
  if not exists (select 1 from public.app_admins where user_id = auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  select visibility into v_before from public.curated_themes where id = p_theme_id;
  if v_before is null then return null; end if;

  -- 되돌리기는 게시물로 돌린다. 링크 공유는 되돌릴 일이 없다 — 30일이면 스스로 끝난다.
  v_after := case when p_hide then 'removed' else 'public' end;
  update public.curated_themes set visibility = v_after where id = p_theme_id;

  -- 조치를 신고 쪽에도 적는다. 신고가 없어도(운영자가 스스로 발견) 가릴 수 있다.
  update public.curation_reports
     set status = case when p_hide then 'reviewed' else 'dismissed' end
   where theme_id = p_theme_id
     and status = 'pending';
  get diagnostics v_reports = row_count;

  return jsonb_build_object(
    'id', p_theme_id,
    'before', v_before,
    'after', v_after,
    'reports_marked', v_reports
  );
end;
$function$;

revoke all on function public.moderate_curation(text, boolean) from public;
grant execute on function public.moderate_curation(text, boolean) to authenticated;

-- ─── 3. 가려진 것은 주소로도 열리지 않는다 ────────────────────────────────────
-- 20260911000000 의 본문에 visibility 조건 한 줄만 더한 것이다. 만료와 마찬가지로
-- 이유를 말하지 않고 null 로 답한다(§7 — 서버는 만료·삭제·오타를 구분하지 못한다).
create or replace function public.get_shared_deck(
  p_id text,
  p_preview boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_theme public.curated_themes%rowtype;
  v_now   bigint := (extract(epoch from now()) * 1000)::bigint;
  v_limit int := case when p_preview then 10 else 2000 end;
  v_words jsonb;
  v_total int;
begin
  select * into v_theme from public.curated_themes where id = p_id;
  if not found then return null; end if;
  if v_theme.visibility = 'removed' then return null; end if;
  if v_theme.expires_at is not null and v_theme.expires_at <= v_now then
    return null;
  end if;

  select count(*) into v_total from public.curated_words where theme_id = p_id;

  select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb) into v_words
  from (
    select id, term, definition, meaning_kr, example_en, example_kr,
           pronunciation, pos, tags
      from public.curated_words
     where theme_id = p_id
     order by position nulls last, created_at, id
     limit v_limit
  ) w;

  update public.curated_themes
     set open_count = open_count + 1
   where id = p_id;

  return jsonb_build_object(
    'id',              v_theme.id,
    'title',           v_theme.title,
    'description',     v_theme.description,
    'creator_name',    v_theme.creator_name,
    'icon',            v_theme.icon,
    'source_language', v_theme.source_language,
    'target_language', v_theme.target_language,
    'created_at',      v_theme.created_at,
    'expires_at',      v_theme.expires_at,
    'visibility',      v_theme.visibility,
    'word_count',      v_total,
    'preview',         p_preview,
    'words',           v_words
  );
end;
$function$;

revoke all on function public.get_shared_deck(text, boolean) from public;
grant execute on function public.get_shared_deck(text, boolean) to anon, authenticated;
