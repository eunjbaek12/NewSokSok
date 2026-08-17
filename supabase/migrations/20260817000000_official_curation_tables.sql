-- 공식 큐레이션 덱을 앱 번들에서 빼고 서버에 둔다 — 전용 테이블 신설
--
-- 설계 전문: docs/curation-server-migration-spec.md
--
-- 왜 커뮤니티 덱의 curated_themes 를 재사용하지 않는가 (2026-08-17 검토):
--   스토어 라이브(1.4.0) 의 fetchCloudCurations 가 curated_themes 를 필터 없이
--   전량 조회해 커뮤니티 탭에 그린다. 요청에 앱 버전이 실리지 않아(supabase 클라이언트에
--   커스텀 헤더가 없다) 서버 쪽 필터로 신·구버전을 가를 수도 없다. 즉 공식 64덱을 그
--   테이블에 넣으면 이미 배포된 앱의 커뮤니티 탭이 현재 덱 2개 위로 63개에 덮인다 —
--   되돌릴 수 없는 변화다. 여기에 용량 트리거(50덱/500단어, 64덱은 통과 못 한다) ·
--   position/senses 컬럼 부재 · UGC 정책(신고 FK, 소유자 삭제 권한)이 각각 더 걸린다.
--   별도 테이블에서는 "서버를 먼저 채워도 무해하다"가 비로소 참이 된다 — 구버전 앱은
--   이 테이블 이름을 모른다.
--
-- 쓰기 정책을 만들지 않는 것은 의도다. enrich_cache 와 같은 방식으로 service_role 만
-- 기록할 수 있게 두면, 사용자 계정으로는 수정·삭제가 원천 불가하고 용량 트리거도 필요
-- 없다(운영자 데이터라 방어 대상이 아니다).

create table if not exists public.official_themes (
  id              text primary key,          -- 번들 slug 그대로 (curated-ngsl-1)
  title           text not null,
  icon            text,
  description     text,
  category        text,
  level           text,                      -- beginner | intermediate | advanced
  source_language text not null,
  target_language text not null,
  -- word_count · top_tags 는 비정규화다. 목록 카드가 단어 수를 표시하고 단어들의 tags 를
  -- 집계해 칩을 그리기 때문에(features/curation/screen.tsx), 이게 없으면 목록을 그리는
  -- 데 단어 전량이 필요해져 "목록은 27KB" 라는 설계가 통째로 무너진다.
  word_count      integer not null,
  top_tags        jsonb   not null default '[]'::jsonb,
  position        integer not null default 0, -- 목록 정렬 순서(운영자 지정)
  is_published    boolean not null default false,
  -- 덱 내용을 고칠 때 올린다. 카탈로그에 실려 오므로 앱이 캐시를 버릴 근거가 된다.
  content_version integer not null default 1,
  created_at      bigint  not null,
  updated_at      bigint  not null,
  constraint official_themes_level_valid
    check (level is null or level in ('beginner', 'intermediate', 'advanced')),
  constraint official_themes_word_count_sane
    check (word_count >= 0 and word_count <= 5000)
);

create table if not exists public.official_words (
  id            text primary key,
  theme_id      text    not null references public.official_themes(id) on delete cascade,
  -- 덱 안 순서. 없으면 PostgREST 반환 순서가 보장되지 않아 빈도순 덱(NGSL·BSL)이
  -- 뒤섞인다 — 그 덱들에서 순서는 콘텐츠의 일부다.
  position      integer not null,
  term          text    not null,
  definition    text,
  -- ⚠️ meaning_kr / example_en 이라는 이름은 다국어 덱(64덱 중 29개가 한국어와 무관한
  --    언어쌍)에서 거짓이다. 알면서 유지한다 — meaningKr 이 앱 코드 459곳에 박혀 있어
  --    서버만 중립적 이름으로 바꾸면 curated_words 와 매핑 코드가 두 벌로 갈린다.
  meaning_kr    text,
  example_en    text,
  example_kr    text,
  pronunciation text,
  pos           text,
  tags          jsonb not null default '[]'::jsonb,
  senses        jsonb,                        -- 덱엔 없다. 시딩이 enrich_cache 에서 채운다
  -- enrich_cache_no_runaway 와 같은 취지의 최후 방어선. 시딩 입력이 그 캐시에서 오므로
  -- 이미 한 번 걸러진 값이지만, 덱 원본에서 오는 필드(예문·발음)는 안 걸러진 적이 있다.
  constraint official_words_no_runaway check (
    coalesce(length(definition), 0) <= 1000
    and coalesce(length(meaning_kr), 0) <= 1000
    and coalesce(length(example_en), 0) <= 1000
    and coalesce(length(example_kr), 0) <= 1000
  ),
  unique (theme_id, position)
);

create index if not exists official_words_theme_pos
  on public.official_words (theme_id, position);

alter table public.official_themes enable row level security;
alter table public.official_words  enable row level security;

-- 읽기는 전원 공개. 게스트(anon)도 큐레이션 탭을 쓰므로 authenticated 로 좁힐 수 없다.
-- is_published 로 시딩 중인 덱을 가린다 — 검증이 끝난 뒤 true 로 올린다.
create policy official_themes_select
  on public.official_themes
  for select
  to anon, authenticated
  using (is_published);

create policy official_words_select
  on public.official_words
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.official_themes t
       where t.id = official_words.theme_id
         and t.is_published
    )
  );

-- INSERT/UPDATE/DELETE 정책 없음 → service_role(시딩 스크립트)만 기록 가능.

-- updated_at(epoch ms) 자동 갱신. curated_themes 가 쓰는 함수를 그대로 쓴다.
create trigger official_themes_set_updated_at
  before insert or update on public.official_themes
  for each row execute function public.set_updated_at_ms();
