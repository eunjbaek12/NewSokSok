-- Curation share fidelity — 공유 파이프라인에 언어쌍·아이콘·품사·태그 보존.
--
-- shareCuration → curated_themes/curated_words → fetchCloudCurations →
-- createCuratedList 경로에 이 컬럼들이 없어 공유 시 전부 유실됐다:
--   - 언어쌍: 비영어 덱이 받는 쪽에서 en→ko 기본값으로 저장(표시·편집·사전
--     링크 오동작), 큐레이션 탭 언어 필터에서도 커뮤니티 덱이 'all' 외 미노출
--   - 아이콘: 받는 쪽에서 항상 '✨' 고정
--   - pos: 품사 필터 기능이 공유받은 덱에서 무용지물
--   - tags: 카드 태그 칩 소실
--
-- 전부 nullable — 구버전 클라이언트는 새 컬럼을 보내지도 읽지도 않으므로
-- 하위호환 안전(select '*'는 여분 컬럼 무시). 적용 시점(2026-07-10)에
-- curated_themes는 빈 테이블이라 백필 불필요. RLS 정책 변경 없음.
-- CHECK 한도는 클라이언트 검증(WordSaveSchema pos<=60 등)과 동일 계약의
-- defense-in-depth.

alter table public.curated_themes
  add column if not exists source_language text
    check (source_language is null or char_length(source_language) <= 10),
  add column if not exists target_language text
    check (target_language is null or char_length(target_language) <= 10),
  add column if not exists icon text
    check (icon is null or char_length(icon) <= 10);

alter table public.curated_words
  add column if not exists pos text
    check (pos is null or char_length(pos) <= 60),
  add column if not exists tags jsonb
    check (tags is null or (jsonb_typeof(tags) = 'array' and pg_column_size(tags) <= 2048));
