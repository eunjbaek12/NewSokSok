-- v1.1 보강: cloud_words의 (listId, term) unique 제약을
-- (listId, term, sourceLang, targetLang)로 확장. 같은 단어를 다른 도착어로
-- 클라우드에 저장할 수 있게 한다 (로컬 SQLite migration 015와 동일 의도).
--
-- cloud_words 테이블은 v1.1 출시 전 Supabase Dashboard에서 직접 생성되었기에
-- 인덱스 이름이 자동 생성됐을 수도, 직접 명명됐을 수도 있다. 안전하게:
--   1) (list_id, term) 기반 unique 인덱스/제약이 있으면 모두 drop
--   2) 새 unique 인덱스를 (list_id, lower(trim(term)), source_lang, target_lang)로 생성
--
-- snake_case 컬럼명 가정: list_id / source_lang / target_lang / is_deleted (engine.ts mapping 기준).
-- 컬럼명이 다르면 이 SQL 실행 시 즉시 에러로 드러나니 그때 수정한다.
--
-- soft-delete 행은 unique에서 제외 — 로컬과 동일 정책.

do $$
declare
  r record;
begin
  -- list_id+term을 키로 갖는 기존 인덱스 모두 drop (정확한 이름을 모름)
  for r in
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename  = 'cloud_words'
      and indexdef ilike '%UNIQUE%'
      and indexdef ilike '%list_id%'
      and indexdef ilike '%term%'
      and indexdef not ilike '%source_lang%'
  loop
    execute format('drop index if exists public.%I', r.indexname);
  end loop;

  -- 같은 의도의 table-level UNIQUE constraint도 정리
  for r in
    select conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'cloud_words'
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) ilike '%list_id%'
      and pg_get_constraintdef(c.oid) ilike '%term%'
      and pg_get_constraintdef(c.oid) not ilike '%source_lang%'
  loop
    execute format('alter table public.cloud_words drop constraint if exists %I', r.conname);
  end loop;
end $$;

create unique index if not exists idx_cloud_words_listid_term_lang_unique
  on public.cloud_words (list_id, lower(trim(term)), source_lang, target_lang)
  where is_deleted = false;
