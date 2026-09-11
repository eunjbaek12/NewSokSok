-- 친구에게 단어장 보내기 — 서버 준비
-- 스펙: docs/share-to-friend-spec.md §5 (순서는 §10의 1~2단계)
--
-- 앱은 아직 이 컬럼들을 쓰지 않는다. 지금 적용해도 사용자에게 보이는 변화는
-- 없어야 한다 — 기존 2건은 visibility 기본값 'public' 이라 공유 단어장 탭에
-- 그대로 남는다. 라이브 동작이 바뀌는 것은 §5의 SELECT 정책 하나뿐이고,
-- 그것도 'public' 행에 대해서는 지금과 같다.

-- ─── 1. 인덱스 (§5.1) ────────────────────────────────────────────────────────
-- curated_words 의 인덱스는 PK 하나뿐이었다. 용량 트리거가 행마다
-- count(*) where theme_id = … 를 돌리므로 매 행 삽입이 전체 스캔이다.
-- 125행인 지금은 티가 안 나지만 2,000행을 넣으면 count 를 2,000번 한다.
create index if not exists curated_words_theme_id_idx
  on public.curated_words (theme_id);

-- ─── 2. 컬럼 (§4.1) ──────────────────────────────────────────────────────────
alter table public.curated_themes
  add column if not exists visibility     text   not null default 'public',
  add column if not exists expires_at     bigint,
  add column if not exists source_list_id text,
  add column if not exists open_count     int    not null default 0,
  add column if not exists save_count     int    not null default 0;

do $$
begin
  alter table public.curated_themes
    add constraint chk_curated_themes_visibility
    check (visibility in ('public', 'link'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.curated_themes
    add constraint chk_curated_themes_source_list_id_length
    check (source_list_id is null or length(source_list_id) <= 64);
exception when duplicate_object then null;
end $$;

-- 단어 순서. 서버에는 지금 순서 정보가 **아예 없다** — 한 배치 insert 라
-- created_at 이 전 행 동일하다(실측: 100단어 덱의 distinct created_at = 1).
-- 지금까지는 PostgREST 가 주는 물리적 순서에 기대 왔고, 그건 보장이 아니다.
-- 2,000단어를 청크로 나눠 넣으면 청크 경계에서 실제로 뒤섞인다.
alter table public.curated_words
  add column if not exists position int;

-- 만료 정리(§5.5)와 «보낸 주소 N개»(§6.3) 조회용.
create index if not exists curated_themes_expires_at_idx
  on public.curated_themes (expires_at) where expires_at is not null;
create index if not exists curated_themes_source_list_idx
  on public.curated_themes (source_list_id) where source_list_id is not null;

-- ─── 3. 용량 트리거 (§5.2, §5.5-3) ───────────────────────────────────────────
-- 상한 500 → 2,000. 실측 최대 단어장이 1,730이라 지금 있는 단어장 전부가
-- 한 번에 나간다(앱의 MAX_WORDS_PER_CURATION 도 함께 올린다).
create or replace function public.check_curation_word_count()
returns trigger
language plpgsql
as $function$
declare
  cnt int;
begin
  select count(*) into cnt from curated_words where theme_id = NEW.theme_id;
  if cnt >= 2000 then
    raise exception 'WORDS_PER_CURATION limit (2000) reached for theme %', NEW.theme_id
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$function$;

-- 50개 한도를 셀 때 **만료된 것은 빼야 한다.** 안 그러면 몇 달 뒤
-- «더 공유할 수 없어요»에 막히는데 정작 살아 있는 공유는 하나도 없게 된다.
create or replace function public.check_user_curation_count()
returns trigger
language plpgsql
as $function$
declare
  cnt int;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select count(*) into cnt from curated_themes
    where creator_id = NEW.creator_id
      and (expires_at is null or expires_at > v_now);
  if cnt >= 50 then
    raise exception 'CURATIONS_PER_USER limit (50) reached for user %', NEW.creator_id
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$function$;

-- ─── 4. 열람 수가 «수정 시각»을 오염시키지 않게 ──────────────────────────────
-- curated_themes 는 set_updated_at_ms() 트리거를 cloud_words·cloud_lists 등
-- 5개 테이블과 공유한다. 그 함수는 동기화의 pull 기준이라 손대면 안 된다.
-- 그래서 curated_themes 전용 함수를 새로 두고 이 테이블의 트리거만 바꾼다.
-- 카운터만 오른 update 는 updated_at 을 유지한다 — 공유물은 §2-4 대로
-- «보낸 내용이 그대로 굳는» 것이라, 남이 열었다고 갱신 시각이 움직이면
-- 나중에 그 값을 근거로 세는 실측이 전부 틀어진다.
create or replace function public.set_updated_at_ms_skip_counters()
returns trigger
language plpgsql
as $function$
begin
  if to_jsonb(new) - 'open_count' - 'save_count' - 'updated_at'
     is distinct from
     to_jsonb(old) - 'open_count' - 'save_count' - 'updated_at' then
    new.updated_at := (extract(epoch from now()) * 1000)::bigint;
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$function$;

drop trigger if exists curated_themes_set_updated_at on public.curated_themes;
create trigger curated_themes_set_updated_at
  before update on public.curated_themes
  for each row execute function public.set_updated_at_ms_skip_counters();

-- ─── 5. SELECT 정책 교체 (§5.3) ──────────────────────────────────────────────
-- 지금 조건은 qual = true — 익명 키만 있으면 전 테이블을 읽는다. 컬럼만
-- 추가하고 여기를 두면 ① 친구에게 보낸 단어장이 목록째 덤프되고(주소가
-- UUID 인 것과 무관) ② 구버전 앱이 select * 로 다 긁어 공유 단어장 탭에
-- 띄운다. 스토어 앱은 업데이트가 늦다 — 쿼터 정책 때 값을 치렀다.
--
-- creator_id = auth.uid() 를 남기는 이유: 보낸 사람이 §6.3의 «보낸 주소 N개»를
-- 세려면 자기 행은 읽을 수 있어야 한다. 남에게는 여전히 안 보인다.
drop policy if exists "themes_select_all" on public.curated_themes;
create policy "themes_select_public" on public.curated_themes
  for select using (
    visibility = 'public' or creator_id = auth.uid()
  );

drop policy if exists "words_select_all" on public.curated_words;
create policy "words_select_public" on public.curated_words
  for select using (
    exists (
      select 1 from public.curated_themes t
       where t.id = curated_words.theme_id
         and (t.visibility = 'public' or t.creator_id = auth.uid())
    )
  );

-- ─── 6. 주소로만 여는 RPC (§5.4) ─────────────────────────────────────────────
-- 목록 조회로는 못 보고, id 를 아는 사람만 연다. 만료·삭제·오타를 구분하지
-- 않고 전부 null 로 답한다 — §7의 «이유를 단정하지 않는다»가 여기서 나온다.
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

-- 담은 횟수. 열림과 달리 실제로 담긴 것만 센다(§4.1 — 화면에는 띄우지 않는다).
create or replace function public.bump_share_save(p_id text)
returns void
language sql
security definer
set search_path = public
as $function$
  update public.curated_themes
     set save_count = save_count + 1
   where id = p_id
     and (expires_at is null or expires_at > (extract(epoch from now()) * 1000)::bigint);
$function$;

-- 받는 사람은 로그인하지 않는다(§2-8). 게스트는 익명 세션이라 authenticated
-- 이지만, 웹 랜딩(GitHub Pages)은 anon 키로 부른다.
revoke all on function public.get_shared_deck(text, boolean) from public;
revoke all on function public.bump_share_save(text) from public;
grant execute on function public.get_shared_deck(text, boolean) to anon, authenticated;
grant execute on function public.bump_share_save(text) to anon, authenticated;
