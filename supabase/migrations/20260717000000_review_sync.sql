-- Gentle SRS 복습 상태 클라우드 동기화 — cloud_words에 lastReviewedAt / reviewSuccessCount 추가.
-- 설계: docs/gentle-srs-design.md §7. 로컬 대응은 SQLite migration 018.
--
-- 왜 필요한가: lastReviewedAt이 이 기능의 엔진인데 로컬 전용이면 **재설치·기기 변경 시
-- 복습 진도가 통째로 리셋**된다. 게다가 클라이언트는 두 컬럼이 NULL인 암기 단어를
-- "due 아님"으로 취급하므로(엔진 isWordDue — 복원 직후 서재 전체가 due로 쏟아지는
-- P1 위반을 막으려는 규칙), 동기화 없이 로그인하면 그 단어들이 **영영 복습에 안 걸린다.**
-- 즉 이 마이그레이션 없이는 로그인 한 번이 복습 기능을 조용히 무력화한다.
--
-- 타입:
--   last_reviewed_at     bigint  — epoch ms. cloud_words.position이 int4라 22003으로
--                                  터졌던 전례(20260711000000)를 따라 처음부터 bigint.
--                                  ms 타임스탬프(≈1.78e12)는 int4 최대값을 800배 넘는다.
--   review_success_count integer — 0..7. 작은 정수라 int4로 충분(사다리 6칸 + 은퇴).
--
-- NULL 의미: last_reviewed_at NULL = "학습 이력 없음". 미암기 단어와, 018 이전 빌드가
-- 올린 기존 행이 여기 해당한다. 클라이언트가 NULL을 due로 치지 않으므로 안전한 기본값이다.
-- review_success_count는 not null default 0 — 기존 행은 0이 되고, 엔진이 0을 사다리
-- 첫 칸으로 취급하므로(reviewIntervalDays) 별도 백필이 필요 없다.
--
-- 병합 규칙: **행 단위 LWW**(마지막 push가 이김) — cloud_words의 다른 컬럼과 동일하다.
-- study_days처럼 GREATEST 병합 RPC를 두지 않는 이유: 단어 행은 이미 통째로 LWW이고
-- (is_memorized·wrong_count도 같은 노출), 두 컬럼만 특별 병합하면 규칙이 갈라져
-- 나중에 추론이 어려워진다. 최악의 경우는 "두 기기에서 같은 단어를 같은 30초 창 안에
-- 학습" → 늦게 push한 쪽이 이겨 예정일이 조금 당겨지는 정도로, 스스로 수렴한다.
--
-- ⚠️ 배포 순서: **이 마이그레이션이 앱 배포보다 먼저**여야 한다. 호환은 한 방향으로만 성립한다.
--   구 클라이언트 → 신 서버: OK. 컬럼을 생략해도 nullable/default가 받아준다.
--   신 클라이언트 → 구 서버: **깨진다.** upsert가 없는 컬럼을 보내면 PostgREST가 스키마
--     캐시 에러(PGRST204)를 내고 배치 전체가 실패한다 → dirty가 영원히 안 빠지고
--     **단어 동기화 전체가 침묵 속에 막힌다**(position int4 사고와 같은 실패 방식).

alter table public.cloud_words
  add column if not exists last_reviewed_at bigint;

alter table public.cloud_words
  add column if not exists review_success_count integer not null default 0;
