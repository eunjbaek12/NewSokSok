-- 굴절형 표제어의 원형(base_form)과 형태 코드(inflection).
-- 설계·근거: lib/inflection.ts · 로컬 대응 마이그레이션: lib/db/migrations/020_add_word_base_form.ts
--
-- 왜: 굴절형으로 저장된 표제어의 72%가 원형을 어디에도 알려주지 않았고(캐시 83,935행 실측),
-- 나머지 28% 중 일부는 사전 관행을 따라가다 **뜻 칸이 문법 설명에 잡아먹혔다**
--   went → 뜻="'go'의 과거 시제."  /  mice → 뜻="mouse의 복수형"
-- 뜻 칸은 플래시카드 뒷면·퀴즈 선택지에 그대로 나가는 칸이라, 형태 정보에 전용 자리를 준다.
--
-- 🔑 enrich_cache 는 건드리지 않는다. 결과가 jsonb 라 새 키가 그냥 들어가고, PROMPT_VERSION
--    도 올리지 않는다 — optional 키라서 옛 83,935행은 그 키가 빈 채로 여전히 유효하다.
--    (bump 는 옛 캐시가 *틀린 답*을 줄 때 하는 것이다. 2026-08-14 에 그 구분을 놓쳐
--     80,714행·₩37,412 어치를 버리고 v8→7 로 되돌린 기록이 enrich-word/index.ts 에 있다.)

alter table public.cloud_words
  add column if not exists base_form  text,
  add column if not exists inflection text;

-- 형태 코드는 닫힌 집합이다. 열어 두면 모델이 "동사 원형의 3인칭 단수 직설법 현재" 같은
-- 문장을 넣고, 그 순간 코드가 아니라 자유 텍스트가 되어 화면 i18n 이 깨진다.
-- 앱도 같은 목록으로 거르지만(lib/inflection.ts normalizeInflection), 서버에도 둔다 —
-- 옛 앱·직접 쓰기 경로가 이 테이블에 값을 넣을 수 있다.
alter table public.cloud_words
  drop constraint if exists cloud_words_inflection_valid;
alter table public.cloud_words
  add constraint cloud_words_inflection_valid check (
    inflection is null or inflection in (
      'plural', 'past', 'past_participle', 'third_person',
      'ing_form', 'comparative', 'superlative', 'conjugated'
    )
  );

-- 원형이 표제어보다 길 이유가 없다. cloud_words.term 에 상한이 없어 값만 방어한다.
alter table public.cloud_words
  drop constraint if exists cloud_words_base_form_len;
alter table public.cloud_words
  add constraint cloud_words_base_form_len check (
    base_form is null or length(base_form) <= 150
  );

-- 공식 덱에도 같은 칸을 연다. 지금 덱 데이터에는 값이 없어 전부 NULL 이지만, 컬럼이 없으면
-- 나중에 덱을 다시 만들 때 값을 실을 곳이 없다 — official_words.senses 가 반대 방향으로
-- 같은 실수를 했다(서버엔 있는데 로컬 words 에 컬럼이 없어 가져오기에서 통째로 버려진다).
alter table public.official_words
  add column if not exists base_form  text,
  add column if not exists inflection text;

alter table public.official_words
  drop constraint if exists official_words_inflection_valid;
alter table public.official_words
  add constraint official_words_inflection_valid check (
    inflection is null or inflection in (
      'plural', 'past', 'past_participle', 'third_person',
      'ing_form', 'comparative', 'superlative', 'conjugated'
    )
  );
