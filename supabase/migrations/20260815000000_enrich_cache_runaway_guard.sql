-- 공용 enrich 캐시에 폭주 산출물이 들어오지 못하게 막는 최후 방어선
--
-- 배경: 모델이 반복 루프에 빠져 같은 문장을 수만 자 뱉는 일이 실측 0.02% 비율로 있다.
-- JSON 이 우연히 닫히면 파싱을 통과해 그대로 저장되고, 한 번 들어가면 그 단어를 찾는
-- 모든 사용자에게 영구히 나간다. 2026-08-15 에 그렇게 굳은 16건(272,409자, 최대
-- vi>zh "vô" 84,512자)을 지웠다.
--
-- 왜 코드 검사만으로 부족한가: 캐시에 쓰는 경로가 셋이다 — scripts/seed-cache.ts,
-- supabase/functions/enrich-word, scripts/restore-seed-cache.ts. 코드 검사는 경로마다
-- 따로 넣어야 하고 새 경로가 생기면 또 빠뜨린다. 제약은 어디로 들어오든 막는다.
--
-- ⚠️ 이것은 코드 검사의 대체가 아니라 보완이다. 세 가지 이유로 코드 검사가 먼저다:
--   1. 시딩은 200건씩 묶어 upsert 한다 — 한 행이 위반하면 청크 전체가 실패한다
--      (U+0000 한 글자가 219건을 날린 전례가 있다).
--   2. CHECK 에서는 jsonb 배열을 순회할 수 없어(서브쿼리 불가) senses 안쪽 필드는
--      못 본다. 아래 전체 길이 10,000 이 그 자리를 느슨하게 메운다.
--   3. enrich-word 는 캐시 쓰기 실패를 로깅만 하고 응답은 정상 반환한다 — 제약만
--      있으면 캐시는 깨끗한데 그 사용자는 폭주를 본다.
-- 이 제약이 실제로 발동하면 코드 검사가 놓쳤다는 버그 신호다.
--
-- 경계값 근거(2026-08-15 캐시 81,630행 전수 실측):
--   필드 1,000  정상 최대는 526자(en>zh "let them cook" — 슬랭 어원 설명)이고
--               senses 2·3 그룹 33,756행은 max 499 에서 끝난다. 두 배로 잡았다.
--   전체 10,000 현재 최대가 2,251자(en>es "industry", senses 3개)다. 네 배 이상 여유.
-- 적용 시점 위반 행 0건.

alter table public.enrich_cache
  add constraint enrich_cache_no_runaway check (
    coalesce(length(result->>'definition'), 0) <= 1000
    and coalesce(length(result->>'meaningKr'), 0) <= 1000
    and coalesce(length(result->>'exampleEn'), 0) <= 1000
    and coalesce(length(result->>'exampleKr'), 0) <= 1000
    and length(result::text) <= 10000
  );

-- 🔴 이 파일은 db push 가 아니라 db query 로 단독 적용했다(2026-08-15).
--    20260813020000_pro_3000_monthly_pool.sql 이 아직 미적용으로 대기 중이라,
--    db push 를 쓰면 그것까지 함께 나가 출시된 앱의 보상형 광고가 다시 깨진다.
--    그 결과 이 파일이 더 큰 타임스탬프로 먼저 적용된 상태가 되므로, 나중에
--    20260813020000 을 올릴 때는 반드시 --include-all 을 붙일 것 — 타임스탬프가
--    역전되면 db push 가 exit 0 으로 조용히 건너뛴다.
