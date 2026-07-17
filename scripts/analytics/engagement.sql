-- 사용자 활용도(engagement) 조회 — Supabase 대시보드 → SQL Editor에 붙여넣어 실행.
--
-- ⚠️ 읽기 전에 알아야 할 3가지 한계 (숫자를 오해하지 않기 위해)
--
-- 1. 여기 보이는 건 **로그인(Google/Apple) 사용자뿐**이다. 게스트 모드는 로컬 SQLite
--    전용이라 Supabase에 아무 흔적도 남기지 않는다. 전체 설치 수·DAU의 SoT는
--    Play Console / App Store Connect이고, 이 쿼리는 "계정을 만든 사람 중 얼마나
--    실제로 쓰는가"만 답한다.
--
-- 2. 학습 통계(cloud_study_days / cloud_memorized_log)는 2026-07-09 마이그레이션
--    (앱 1.1.4+)부터 올라온다. 그 이전 빌드에 머문 사용자는 열심히 학습해도 여기선
--    0으로 보인다. 즉 학습 지표는 **하한선(최소한 이만큼은 쓴다)**이지 정확한 값이 아니다.
--
-- 3. 동기화는 30초 디바운스라 방금 한 학습은 아직 안 올라와 있을 수 있다.
--
-- 날짜 경계는 KST(Asia/Seoul) 기준. cloud_study_days.date는 'YYYY-MM-DD' text다.

-- ════════════════════════════════════════════════════════════════════════
-- 쿼리 1 — 활용도 퍼널 (한 눈에 "몇 명이나 잘 쓰나")
-- ════════════════════════════════════════════════════════════════════════
with today_kst as (
  select (now() at time zone 'Asia/Seoul')::date as d
),
users as (
  select id, created_at, last_sign_in_at from auth.users
),
-- 사용자별 살아있는 단어 수
word_counts as (
  select user_id, count(*) as words
  from cloud_words
  where is_deleted = false
  group by user_id
),
-- 사용자별 학습한 날 수 / 마지막 학습일
study as (
  select
    user_id,
    count(*) filter (where studied_count > 0)                        as study_days,
    max(date) filter (where studied_count > 0)                       as last_study_date,
    count(*) filter (
      where studied_count > 0
        and date >= to_char((select d from today_kst) - 6, 'YYYY-MM-DD')
    )                                                                as study_days_7d
  from cloud_study_days
  group by user_id
),
memorized as (
  select user_id, count(*) as memorized_words
  from cloud_memorized_log
  group by user_id
)
select * from (
  values
    ('1. 가입자 (전체)',
     (select count(*) from users)),

    ('2. └ 최근 30일 신규 가입',
     (select count(*) from users where created_at >= now() - interval '30 days')),

    ('3. └ 최근 7일 신규 가입',
     (select count(*) from users where created_at >= now() - interval '7 days')),

    ('4. 단어를 1개라도 저장 (앱을 열어본 사람)',
     (select count(*) from word_counts where words >= 1)),

    ('5. └ 단어 20개+ (덱을 실제로 만든 사람)',
     (select count(*) from word_counts where words >= 20)),

    ('6. 학습 기록 1일+ (⚠️1.1.4+ 빌드만)',
     (select count(*) from study where study_days >= 1)),

    ('7. └ 학습 3일+',
     (select count(*) from study where study_days >= 3)),

    ('8. └ 학습 7일+ ★진성 사용자',
     (select count(*) from study where study_days >= 7)),

    ('9. 외운 단어 10개+',
     (select count(*) from memorized where memorized_words >= 10)),

    ('10. 최근 7일 내 학습 ★살아있는 사용자 (WAU)',
     (select count(*) from study where study_days_7d >= 1)),

    ('11. 최근 7일 내 로그인 (앱 실행 흔적)',
     (select count(*) from users where last_sign_in_at >= now() - interval '7 days')),

    ('12. 최근 30일 AI 기능 사용',
     (select count(distinct user_id) from ai_usage_daily
       where usage_date >= (select d from today_kst) - 29)),

    ('13. 현재 Pro 구독 중 (트라이얼 제외)',
     (select count(*) from user_subscriptions
       where pro_until is not null and pro_until > now())),

    ('14. 트라이얼 진행 중',
     (select count(*) from user_subscriptions
       where trial_ends_at is not null and trial_ends_at > now()))
) as t(지표, 명);


-- ════════════════════════════════════════════════════════════════════════
-- 쿼리 2 — 사용자별 상세 (사용자가 적을 때 가장 유용. 본인 테스트 계정 식별용)
-- ════════════════════════════════════════════════════════════════════════
with today_kst as (
  select (now() at time zone 'Asia/Seoul')::date as d
)
select
  u.email,
  (u.created_at at time zone 'Asia/Seoul')::date            as 가입일,
  (u.last_sign_in_at at time zone 'Asia/Seoul')::date       as 마지막로그인,
  coalesce(l.lists, 0)                                      as 단어장,
  coalesce(w.words, 0)                                      as 단어,
  coalesce(s.study_days, 0)                                 as 학습일수,
  s.last_study_date                                         as 마지막학습,
  coalesce(m.memorized_words, 0)                            as 외운단어,
  coalesce(a.ai_days, 0)                                    as AI사용일,
  coalesce(a.ai_words, 0)                                   as AI단어수,
  sub.tier,
  (sub.pro_until at time zone 'Asia/Seoul')::date           as pro만료
from auth.users u
left join (
  select user_id, count(*) as lists from cloud_lists where is_deleted = false group by user_id
) l on l.user_id = u.id
left join (
  select user_id, count(*) as words from cloud_words where is_deleted = false group by user_id
) w on w.user_id = u.id
left join (
  select
    user_id,
    count(*) filter (where studied_count > 0)  as study_days,
    max(date) filter (where studied_count > 0) as last_study_date
  from cloud_study_days group by user_id
) s on s.user_id = u.id
left join (
  select user_id, count(*) as memorized_words from cloud_memorized_log group by user_id
) m on m.user_id = u.id
left join (
  select user_id, count(*) as ai_days, sum(word_count) as ai_words
  from ai_usage_daily group by user_id
) a on a.user_id = u.id
left join user_subscriptions sub on sub.user_id = u.id
order by coalesce(s.study_days, 0) desc, coalesce(w.words, 0) desc;


-- ════════════════════════════════════════════════════════════════════════
-- 쿼리 3 — 최근 30일 일별 활동 추이 (DAU 흐름 · 스파이크 원인 추적)
-- ════════════════════════════════════════════════════════════════════════
select
  date                                        as 날짜,
  count(*) filter (where studied_count > 0)   as 학습한사람,
  sum(studied_count)                          as 학습단어합,
  sum(memorized_count)                        as 외운단어합
from cloud_study_days
where date >= to_char((now() at time zone 'Asia/Seoul')::date - 29, 'YYYY-MM-DD')
group by date
order by date desc;
