# 운영 분석 쿼리 — 누가 쓰고 있나 · 무엇을 공부하나 · 얼마나 들어오나

Supabase 대시보드 → **SQL Editor**에 그대로 붙여넣어 실행한다.
전부 2026-07-25에 실제 실행해 결과를 확인한 쿼리다.

> 날짜 기준은 모두 **KST**. 서버는 UTC로 돌기 때문에 `at time zone 'Asia/Seoul'`을 빼면
> 오전 9시 이전 활동이 전날로 밀린다.

---

## 지표를 읽기 전에 — 이 데이터가 못 보는 것

이걸 모르면 숫자를 정반대로 해석하게 된다.

1. **게스트는 아예 안 잡힌다.** 비로그인 사용자의 데이터는 로컬 SQLite에만 있다.
   여기 나오는 수치는 전부 "로그인 사용자 중" 이다. 실제 DAU는 항상 이보다 크다.
2. **학습 통계는 2026-07-09부터만 존재한다.** `cloud_study_days` 동기화는 그때 들어갔다
   (migration `20260709000000_study_stats_sync.sql`). 그 이전 가입자의 `study_days = 0`은
   "안 썼다"가 아니라 **"기록할 방법이 없었다"** 이다.
3. **구버전 앱은 학습 기록을 올리지 않는다.** 동기화 코드가 담긴 빌드를 설치한 사용자만
   집계된다. 업데이트 안 한 사용자는 열심히 써도 `studied = 0`으로 보인다.
4. **동기화는 30초 디바운스다.** 지금 이 순간 쓰고 있는 사람은 아직 안 올라와 있을 수 있다.
5. **`auth.users.last_sign_in_at`은 사용 지표가 아니다.** 세션이 유지되면 갱신되지 않아서,
   매일 쓰는 사람도 몇 주 전으로 찍힌다. DAU 용도로 쓰면 안 된다.
6. **날짜 기준이 컬럼마다 다르다.** `cloud_study_days.date`·`cloud_memorized_log.date`는
   **기기 로컬 날짜**이고, `last_studied_at`·`created_at` 등 epoch ms 컬럼은 절대시각이다.
   해외 사용자는 이 둘이 하루 어긋나 한 세션이 이틀에 걸쳐 보인다 (Q8 참고).
7. **봇과 운영자 계정이 섞여 있다.** `@cloudtestlabaccounts.com`은 Play 사전 출시 보고서가
   돌리는 Firebase Test Lab이고, `eunjbaek12@` / `mtgirltreeguy@`는 운영자 본인이다.
   Q8의 `flag` 컬럼이 이 둘을 표시한다.

`cloud_words`의 단어 수가 500 / 1000 / 1500처럼 딱 떨어지면 대개 **공식 큐레이션 덱을
통째로 담은 것**이지 직접 추가한 게 아니다. 활동의 깊이로 오해하지 말 것.

---

## Q1. 오늘 활동한 사람 (간단 버전)

> **무엇을 공부했는지(단어장 이름·단어)까지 보려면 [Q8](#q8-오늘-누가--무엇을-공부했나-종합)** 을 쓴다.
> Q1은 컬럼이 적어 "몇 명이 썼나"만 빠르게 볼 때 쓴다.

학습·단어 추가·AI 보강을 한 화면에 모은다. 어느 한 지표만 보면 사람을 놓친다 —
단어만 추가한 사용자는 `cloud_study_days`에 안 남고, 복습만 한 사용자는 `ai_usage_daily`에 안 남는다.

```sql
with d as (
  select (now() at time zone 'Asia/Seoul')::date as today
), ms as (   -- cloud_words/cloud_lists의 updated_at은 epoch **밀리초** bigint
  select (extract(epoch from ((select today from d)::timestamp at time zone 'Asia/Seoul')) * 1000)::bigint as t0
), s as (
  select user_id, studied_count, memorized_count, updated_at
    from cloud_study_days
   where date = (select to_char(today, 'YYYY-MM-DD') from d)   -- date는 text 컬럼
), w as (
  select user_id, count(*) as cnt, max(updated_at) as last_ms
    from cloud_words where updated_at >= (select t0 from ms) group by user_id
), l as (
  select user_id, count(*) as cnt, max(updated_at) as last_ms
    from cloud_lists where updated_at >= (select t0 from ms) group by user_id
), a as (
  select user_id, word_count, call_count
    from ai_usage_daily where usage_date = (select today from d)  -- 컬럼명은 usage_date (day 아님)
), ids as (
  select user_id from s
  union select user_id from w
  union select user_id from l
  union select user_id from a
)
select coalesce(u.raw_user_meta_data->>'nickname',      -- 앱에서 직접 정한 닉네임
                u.raw_user_meta_data->>'full_name',     -- Google/Apple 계정 이름
                u.raw_user_meta_data->>'name',
                split_part(u.email, '@', 1),
                left(u.id::text, 8))          as name,
       case when u.raw_user_meta_data ? 'nickname' then 'nick' else 'social' end as name_src,
       u.email,
       coalesce(s.studied_count, 0)   as studied,
       coalesce(s.memorized_count, 0) as memorized,
       coalesce(w.cnt, 0)             as words_touched,
       coalesce(l.cnt, 0)             as lists_touched,
       coalesce(a.word_count, 0)      as ai_words,
       to_char(
         to_timestamp(greatest(coalesce(s.updated_at, 0), coalesce(w.last_ms, 0), coalesce(l.last_ms, 0)) / 1000.0)
           at time zone 'Asia/Seoul', 'HH24:MI') as last_seen_kst
  from ids i
  join auth.users u on u.id = i.user_id
  left join s on s.user_id = i.user_id
  left join w on w.user_id = i.user_id
  left join l on l.user_id = i.user_id
  left join a on a.user_id = i.user_id
 order by 9 desc;
```

2026-07-25 실행 결과:

| name | src | email | studied | memorized | words | ai_words | last_seen |
|---|---|---|---|---|---|---|---|
| 박윤하 | social | younhaming@ | 0 | 0 | 25 | 26 | 19:32 |
| 박소하 | social | ssohassoha1211@ | 174 | 4 | 75 | 1 | 18:26 |
| 아단 정 | social | jeongadan109@ | 0 | 0 | 79 | 84 | 16:16 |
| 김호성 | social | kimosungk@ | 0 | 0 | 0 | 0 | 09:41 |

`order by 9`은 `last_seen_kst` 자리다. 컬럼을 넣고 뺄 때 같이 고쳐야 한다.

어제(`today`를 `- 1`로) 보려면 첫 CTE만 바꾼다:
`select (now() at time zone 'Asia/Seoul')::date - 1 as today`

## Q2. 최근 14일 DAU 추이

`active_users`(무엇이든 한 사람) vs `studied_users`(실제 학습 세션까지 간 사람)를 나눠 본다.
둘의 격차가 "단어만 담고 학습은 안 하는" 구간이다.

```sql
select x.day,
       count(distinct x.user_id)                                as active_users,
       count(distinct x.user_id) filter (where x.src = 'study') as studied_users,
       count(distinct x.user_id) filter (where x.src = 'ai')    as ai_users
  from (
    select date as day, user_id, 'study' as src from cloud_study_days
    union all
    select to_char(to_timestamp(updated_at / 1000.0) at time zone 'Asia/Seoul', 'YYYY-MM-DD'), user_id, 'word' from cloud_words
    union all
    select to_char(to_timestamp(updated_at / 1000.0) at time zone 'Asia/Seoul', 'YYYY-MM-DD'), user_id, 'list' from cloud_lists
    union all
    select to_char(usage_date, 'YYYY-MM-DD'), user_id, 'ai' from ai_usage_daily
  ) x
 where x.day >= to_char((now() at time zone 'Asia/Seoul')::date - 13, 'YYYY-MM-DD')
 group by x.day
 order by x.day desc;
```

## Q3. 가입 후 정착률 (한 줄 요약)

```sql
select count(*)                                        as signups,
       count(*) filter (where sd.days is null)         as never_studied,
       count(*) filter (where sd.days = 1)             as one_day_only,
       count(*) filter (where sd.days between 2 and 6) as days_2_6,
       count(*) filter (where sd.days >= 7)            as days_7_plus
  from auth.users u
  left join (select user_id, count(*) as days from cloud_study_days group by user_id) sd
    on sd.user_id = u.id;
```

⚠️ `never_studied`에는 위 한계 2·3번(7/9 이전 가입자, 구버전 앱)이 섞여 있다.
**7/9 이후 가입자로 좁혀야** 진짜 이탈률이 나온다 — `where u.created_at >= '2026-07-09'` 추가.

## Q4. 사용자별 상세 (누가 정착했고 누가 떠났나)

```sql
select u.email,
       to_char(u.created_at at time zone 'Asia/Seoul', 'MM-DD') as signup,
       coalesce(sd.days, 0)        as study_days,
       coalesce(sd.last_date, '-') as last_study,
       coalesce(wc.n, 0)           as words,
       coalesce(sub.tier, '-')     as tier
  from auth.users u
  left join (select user_id, count(*) as days, max(date) as last_date from cloud_study_days group by user_id) sd
    on sd.user_id = u.id
  left join (select user_id, count(*) as n from cloud_words group by user_id) wc
    on wc.user_id = u.id
  left join user_subscriptions sub on sub.user_id = u.id
 order by u.created_at desc;
```

## Q5. 학습 통계 기록이 언제부터 있나 (해석 기준선)

```sql
select min(date) as first_date, max(date) as last_date, count(distinct user_id) as users,
       to_char(to_timestamp(min(updated_at)/1000.0) at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') as first_sync_kst
  from cloud_study_days;
```

## Q6. 닉네임 — 누가 직접 정했나

닉네임은 별도 테이블이 없고 **`auth.users.raw_user_meta_data`** 에 들어간다.

```sql
select raw_user_meta_data->>'nickname'                                    as nickname,
       coalesce(raw_user_meta_data->>'full_name',
                raw_user_meta_data->>'name')                             as social_name,
       email
  from auth.users
 where raw_user_meta_data ? 'nickname';
```

⚠️ **`full_name`을 닉네임으로 착각하지 말 것.** 앱에서 정한 닉네임은 비표준 키 `nickname`에
따로 저장한다 — Google 로그인 때마다 `signInWithIdToken`이 OAuth 클레임(`full_name`/`name`/
`avatar_url`)을 다시 덮어쓰기 때문이다 (`features/auth/store.ts:144` 주석 참고).

2026-07-25 기준 **48명 중 닉네임을 직접 정한 사람은 5명**뿐이고, 나머지 43명은 소셜 계정 이름이
보이는 것이다. Q1의 `name_src` 컬럼이 이 둘을 구분한다(`nick` / `social`).

게스트의 닉네임은 로컬 AsyncStorage에만 있어 서버에서 볼 수 없다.

## Q7. 예문 학습 빈칸 품질 (회귀 감지)

예문 학습은 예문에서 표제어 자리를 찾아 빈칸으로 가린다. 못 찾으면 그 카드는 출제에서 빠진다
(`lib/example-blank.ts`). 수정 전에는 못 찾으면 **예문이 통째로 노출돼 정답이 공개**됐다 —
한국어 표제어의 31%가 그 상태였다. 프롬프트를 바꾸거나 새 언어를 추가한 뒤 이 비율을 확인한다.

### 정확한 측정 — 스크립트 (권장)

```bash
$env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"   # PowerShell
pnpm run diagnose:examples                             # 전수
pnpm run diagnose:examples --limit 2000 --samples 20   # 빠르게 + 실패 사례 보기
```

앱과 **같은 로직**(`segmentExample`)을 돌리므로 한국어 어간 폴백·라틴 굴절까지 반영된다.
SQL로는 대신할 수 없다.

기준선 (2026-07-26, 전수 19,441건):

| 표제어 문자 | 건수 | 출제 제외 | 빈칸 오배치 | 빈칸 2개+ |
|---|---|---|---|---|
| 한국어 | 10,049 | 2.8% | – | 0.9% |
| 라틴 | 7,319 | 1.2% | 0.0% | 2.6% |
| 중·일 | 2,018 | 4.4% | – | 1.5% |

남은 실패는 대부분 **1글자 어간의 불규칙 활용**(“쉽다”→“쉬워요”, “걷다”→“걸어요”)과
**르불규칙**(“떠오르다”→“떠올랐어요”)이다. 잡으려면 오탐(엉뚱한 자리에 빈칸)이 늘어 일부러 두었다.
`올리다 :: …게재하여…`처럼 예문에 표제어가 아예 없는 것은 생성 단계 문제다.

### 빠른 근사 — SQL

대시보드에서 대략만 볼 때. **앱 로직을 반영하지 못해 실제보다 나쁘게 나온다**
(리터럴 매칭이라 활용형을 전부 실패로 센다 — 한국어는 실제 2.8%인데 29%로 보인다).

```sql
with w as (
  select coalesce(source_lang, 'en') as lang,
         example_en,
         regexp_replace(term, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') as t_esc
    from cloud_words
   where coalesce(is_deleted, false) = false
     and example_en is not null and example_en <> ''
     and term is not null and term <> ''
)
select lang,
       count(*)                                                    as words,
       count(*) filter (where example_en !~* t_esc)                as literal_miss,
       round(100.0 * count(*) filter (where example_en !~* t_esc) / count(*), 1) as miss_pct
  from w group by lang order by words desc;
```

⚠️ `\y`(단어 경계)로 좁히면 **중국어·일본어가 전부 실패로 잡힌다** — 띄어쓰기가 없어서다.
한국어도 조사가 붙어 실패로 보인다. 언어별 규칙 차이는 SQL로 재현하지 말고 위 스크립트를 쓴다.

## Q8. 오늘 누가 · 무엇을 공부했나 (종합)

Q1이 "몇 명이 썼나"라면 이건 **"누가 어떤 단어장에서 어떤 단어를 봤나"** 다.
한 사람이 한 행이고, 학습 카운트 옆에 실제 단어장 제목과 단어 샘플이 붙는다.

첫 줄 `- 0`을 `- 1`로 바꾸면 어제. 아침에 돌리면 대개 비어 있으니 어제로 보는 편이 낫다.

```sql
with d as (
  select (now() at time zone 'Asia/Seoul')::date - 0 as day   -- ← 어제는 - 1
), b as (
  select day,
         to_char(day, 'YYYY-MM-DD')                                                           as day_txt,
         (extract(epoch from (day::timestamp     at time zone 'Asia/Seoul')) * 1000)::bigint  as t0,
         (extract(epoch from ((day+1)::timestamp at time zone 'Asia/Seoul')) * 1000)::bigint  as t1
    from d
), sd as (                              -- 학습 세션 카운트 (기기 로컬 날짜 기준!)
  select s.user_id, s.studied_count, s.memorized_count, s.updated_at
    from cloud_study_days s, b where s.date = b.day_txt
), ls as (                              -- 그날 학습한 단어장 + 완료율
  select l.user_id, count(*) as n, max(l.last_studied_at) as last_ms,
         array_to_string((array_agg(
           l.title || coalesce(' ' || round(l.last_result_percent::numeric) || '%', '')
           order by l.last_studied_at desc))[1:4], ' / ')
         || case when count(*) > 4 then ' 외 ' || (count(*) - 4) else '' end as titles
    from cloud_lists l, b
   where l.last_studied_at >= b.t0 and l.last_studied_at < b.t1
     and coalesce(l.is_deleted, false) = false
   group by l.user_id
), rv as (                              -- 그날 복습한 단어 (Gentle SRS)
  select w.user_id, count(*) as n, max(w.last_reviewed_at) as last_ms,
         array_to_string((array_agg(w.term order by w.last_reviewed_at desc))[1:5], ', ') as sample
    from cloud_words w, b
   where w.last_reviewed_at >= b.t0 and w.last_reviewed_at < b.t1
     and coalesce(w.is_deleted, false) = false
   group by w.user_id
), mm as (                              -- 그날 새로 외운 단어
  select m.user_id, count(*) as n,
         array_to_string((array_agg(coalesce(w.term, '?') order by m.created_at_ms desc))[1:5], ', ') as sample
    from cloud_memorized_log m
    join b on m.date = b.day_txt
    left join cloud_words w on w.id = m.word_id and w.user_id = m.user_id
   group by m.user_id
), ad as (                              -- 그날 추가한 단어
  select w.user_id, count(*) as n, max(w.created_at) as last_ms,
         array_to_string((array_agg(w.term order by w.created_at desc))[1:5], ', ')      as sample,
         array_to_string(array_agg(distinct w.source_lang || '→' || w.target_lang), ',') as langs
    from cloud_words w, b
   where w.created_at >= b.t0 and w.created_at < b.t1
     and coalesce(w.is_deleted, false) = false
   group by w.user_id
), ai as (
  select a.user_id, a.word_count, a.call_count from ai_usage_daily a, b where a.usage_date = b.day
), ids as (
  select user_id from sd union select user_id from ls union select user_id from rv
  union select user_id from mm union select user_id from ad union select user_id from ai
)
select coalesce(u.raw_user_meta_data->>'nickname',
                u.raw_user_meta_data->>'full_name',
                u.raw_user_meta_data->>'name',
                split_part(u.email, '@', 1), left(u.id::text, 8))          as name,
       case when u.email like '%@cloudtestlabaccounts.com'          then 'bot'
            when u.email in ('eunjbaek12@gmail.com',
                             'mtgirltreeguy@gmail.com')             then 'me'
            else '' end                                                    as flag,
       u.email,
       to_char(u.created_at at time zone 'Asia/Seoul', 'MM-DD')            as signup,
       coalesce(sd.studied_count, 0)   as studied,      -- 카드를 넘긴 수
       coalesce(sd.memorized_count, 0) as memorized,
       coalesce(ls.n, 0)               as decks,
       ls.titles                       as studied_decks,
       coalesce(rv.n, 0)               as reviewed,
       rv.sample                       as reviewed_words,
       coalesce(mm.n, 0)               as newly_memorized,
       mm.sample                       as memorized_words,
       coalesce(ad.n, 0)               as words_added,
       ad.sample                       as added_words,
       ad.langs,
       coalesce(ai.word_count, 0)      as ai_words,
       to_char(to_timestamp(greatest(coalesce(sd.updated_at, 0), coalesce(ls.last_ms, 0),
                                     coalesce(rv.last_ms, 0), coalesce(ad.last_ms, 0)) / 1000.0)
                 at time zone 'Asia/Seoul', 'HH24:MI')                     as last_seen_kst
  from ids i
  join auth.users u on u.id = i.user_id
  left join sd on sd.user_id = i.user_id
  left join ls on ls.user_id = i.user_id
  left join rv on rv.user_id = i.user_id
  left join mm on mm.user_id = i.user_id
  left join ad on ad.user_id = i.user_id
  left join ai on ai.user_id = i.user_id
 order by coalesce(sd.studied_count, 0) + coalesce(rv.n, 0) desc, last_seen_kst desc;
```

2026-07-30(어제) 실행 결과 — 발췌:

| name | studied | memorized | 학습한 단어장 | 복습 | 추가 | ai |
|---|---|---|---|---|---|---|
| Ellie Whipp | 500 | 407 | – | 0 | 0 | 0 |
| 서하랑 | 314 | 110 | 스카이 7.30 85% / 수특 0% | 122 | 122 | 125 |
| Eli | 56 | 5 | Basic Korean 500 19% / Korean Market Trip 50 18% | 65 | 0 | 0 |
| Danielle A | 38 | 38 | – | 0 | 0 | 0 |

**컬럼별 성격이 다르다** — 이걸 섞어 읽으면 안 된다.

| 컬럼 | 출처 | 날짜 기준 |
|---|---|---|
| `studied` / `memorized` / `newly_memorized` | `cloud_study_days`, `cloud_memorized_log`의 `date` | **기기 로컬 날짜** |
| `decks` / `reviewed` / `words_added` | `last_studied_at`·`last_reviewed_at`·`created_at` (기기 시계 epoch ms) | KST 절대시각 |
| `last_seen_kst` | 위 값들의 최대치 | KST |

⚠️ **`studied_decks`가 비어 있는데 `studied`가 큰 경우가 정상적으로 생긴다.** 위 표의 Ellie가
그 예다 — 해외 사용자라 기기 로컬 날짜(7/30)와 KST(7/31 새벽)가 어긋나서, 학습 카운트는
어제 행에 잡히고 단어장 갱신 시각은 오늘로 잡혔다. **하루 어긋나면 같은 세션을 이틀에 나눠
보게 되므로, 해외 사용자는 `- 0`과 `- 1`을 둘 다 봐야 한다.**

`flag` 컬럼: `bot`은 Play 사전 출시 보고서가 돌리는 Firebase Test Lab 계정이고(`@cloudtestlabaccounts.com`),
`me`는 운영자 본인 계정이다. **둘 다 실사용 지표에서 빼고 읽어야 한다** —
7/30 활동자 9명 중 3명이 여기 해당했다.

## Q9. 한 사람이 그날 무엇을 공부했나 (단어 단위 타임라인)

Q8에서 눈에 띈 사람을 파고들 때. `ilike` 검색어에 닉네임·이름·이메일 일부를 넣는다.

```sql
with d as (
  select (now() at time zone 'Asia/Seoul')::date - 0 as day   -- ← 어제는 - 1
), b as (
  select day, to_char(day, 'YYYY-MM-DD') as day_txt,
         (extract(epoch from (day::timestamp     at time zone 'Asia/Seoul')) * 1000)::bigint as t0,
         (extract(epoch from ((day+1)::timestamp at time zone 'Asia/Seoul')) * 1000)::bigint as t1
    from d
), who as (
  select id from auth.users
   where coalesce(raw_user_meta_data->>'nickname', raw_user_meta_data->>'full_name',
                  raw_user_meta_data->>'name', email) ilike '%검색어%'   -- ←
), ev as (
  select '복습' as kind, w.last_reviewed_at as ms, w.list_id, w.term, w.meaning_kr, w.definition,
         w.is_memorized, w.review_success_count
    from cloud_words w, b where w.user_id in (select id from who)
     and w.last_reviewed_at >= b.t0 and w.last_reviewed_at < b.t1
  union all
  select '암기표시', m.created_at_ms, w.list_id, coalesce(w.term, m.word_id), w.meaning_kr, w.definition,
         w.is_memorized, w.review_success_count
    from cloud_memorized_log m
    join b on m.date = b.day_txt
    left join cloud_words w on w.id = m.word_id and w.user_id = m.user_id
   where m.user_id in (select id from who)
  union all
  select '추가', w.created_at, w.list_id, w.term, w.meaning_kr, w.definition,
         w.is_memorized, w.review_success_count
    from cloud_words w, b where w.user_id in (select id from who)
     and w.created_at >= b.t0 and w.created_at < b.t1
)
select to_char(to_timestamp(ev.ms / 1000.0) at time zone 'Asia/Seoul', 'HH24:MI') as time_kst,
       ev.kind,
       left(coalesce(l.title, '-'), 28)                     as deck,
       ev.term,
       left(coalesce(ev.meaning_kr, ev.definition, ''), 30) as meaning,
       ev.is_memorized                                      as memorized,
       ev.review_success_count                              as streak
  from ev left join cloud_lists l on l.id = ev.list_id
 order by ev.ms desc
 limit 40;
```

`streak`(`review_success_count`)는 Gentle SRS 사다리 칸(0~7)이다. 복습을 연속으로 맞힐수록
올라가고, 다음 복습 간격이 늘어난다.

2026-07-31 새벽 `Danielle A` 실행 결과: 02:07에 `Basic Korean 500` 덱을 담고
02:10에 38개를 학습·암기했다 — **가입 3분 만에 첫 세션까지 간 경로**가 그대로 보인다.

## Q10. 가입자 추이

`auth.users.created_at` 기준. **로그인 사용자만** 세는 값이라 설치 수와 다르다
(설치는 Play Console / App Store Connect에서 본다).

### 일별 — 가입이 0인 날도 빠뜨리지 않는다

`generate_series`로 달력을 먼저 깔고 왼쪽 조인한다. 이렇게 안 하면 가입 없는 날이 행 자체로
사라져서, 띄엄띄엄 들어온 걸 매일 들어온 것처럼 착각한다.

```sql
with bounds as (
  select min((created_at at time zone 'Asia/Seoul')::date) as d0,
         (now() at time zone 'Asia/Seoul')::date           as d1
    from auth.users
), days as (
  select generate_series(d0, d1, interval '1 day')::date as day from bounds
), s as (
  select (created_at at time zone 'Asia/Seoul')::date as day, count(*) as n
    from auth.users group by 1
)
select to_char(d.day, 'MM-DD (Dy)')                as day,
       coalesce(s.n, 0)                            as signups,
       sum(coalesce(s.n, 0)) over (order by d.day) as cumulative
  from days d
  left join s on s.day = d.day
 order by d.day;
```

최근 30일만 보려면 **`bounds`는 그대로 두고** 마지막에 조건을 건다 —
`d0`를 잘라내면 `cumulative`가 전체 누적이 아니라 그 구간 안에서의 누적이 된다.

```sql
 where d.day >= (now() at time zone 'Asia/Seoul')::date - 29
```

### 주별 — 로그인 수단까지

```sql
with s as (
  select date_trunc('week', created_at at time zone 'Asia/Seoul')::date as wk,
         count(*)                                                          as n,
         count(*) filter (where raw_app_meta_data->>'provider' = 'google')  as google,
         count(*) filter (where raw_app_meta_data->>'provider' = 'apple')   as apple
    from auth.users
   group by 1
)
select to_char(wk, 'YYYY-MM-DD') as week_start,
       n as signups, google, apple,
       sum(n) over (order by wk) as cumulative
  from s order by wk;
```

2026-07-31 실행 결과 (총 59명):

| 주 시작 | 신규 | Google | Apple | 누적 | |
|---|---|---|---|---|---|
| 05-18 | 1 | 1 | 0 | 1 | |
| 06-08 | 13 | 9 | 4 | 16 | iOS 출시(6/12) |
| 06-15 | 1 | 0 | 1 | 17 | |
| 06-22 | 1 | 1 | 0 | 18 | |
| 06-29 | 6 | 5 | 1 | 24 | Android 출시(7/1) |
| 07-06 | 12 | 8 | 4 | 36 | |
| 07-13 | 7 | 4 | 3 | 43 | |
| 07-20 | 5 | 5 | 0 | 48 | |
| 07-27 | 11 | 7 | 4 | 59 | 5일치인데 이미 2위 |

읽을 때 주의:

- **`provider`는 최초 가입 수단이 아니라 최근 로그인 수단에 가깝다.** 게다가 같은 이메일의
  Google/Apple 계정은 **하나의 `user_id`로 자동 병합**된다(Supabase identity 자동 링크 — 정상 동작이다).
  Google/Apple 분해는 대략의 비율로만 본다.
- **탈퇴하면 행이 사라진다.** 과거 날짜의 신규 수가 나중에 소급해서 줄어든다.
- Q8의 `flag`에 해당하는 봇·운영자 계정도 이 숫자에 포함돼 있다.

## Q11. 오늘 쓴 사람은 "어떤 사람"인가 (프로필)

Q8이 **무엇을 했나**라면 이건 **누구인가**다. 활동량 대신 신규/기존, 모국어, 보유 단어,
정착 정도, 요금제를 본다. 하루 지표를 사람 단위로 해석할 때 쓴다.

```sql
with d as (
  select (now() at time zone 'Asia/Seoul')::date - 0 as day   -- ← 어제는 - 1
), b as (
  select day, to_char(day, 'YYYY-MM-DD') as day_txt,
         (extract(epoch from (day::timestamp     at time zone 'Asia/Seoul')) * 1000)::bigint as t0,
         (extract(epoch from ((day+1)::timestamp at time zone 'Asia/Seoul')) * 1000)::bigint as t1
    from d
), ev as (                              -- 활동 신호를 (시각, 종류)로 평탄화
  select s.user_id, s.updated_at as ms, '학습'::text as kind from cloud_study_days s, b where s.date = b.day_txt
  union all
  select l.user_id, l.last_studied_at,  '학습' from cloud_lists l, b
   where l.last_studied_at  >= b.t0 and l.last_studied_at  < b.t1
  union all
  select w.user_id, w.last_reviewed_at, '복습' from cloud_words w, b
   where w.last_reviewed_at >= b.t0 and w.last_reviewed_at < b.t1
  union all
  select w.user_id, w.created_at,       '추가' from cloud_words w, b
   where w.created_at       >= b.t0 and w.created_at       < b.t1
  union all
  select a.user_id, (extract(epoch from a.updated_at) * 1000)::bigint, 'AI' from ai_usage_daily a, b
   where a.usage_date = b.day
), act as (
  select user_id, min(ms) as first_ms, max(ms) as last_ms,
         string_agg(distinct kind, '+') as did
    from ev group by user_id
), prof as (                            -- 계정 전체 프로필 (오늘로 한정하지 않는다)
  select w.user_id,
         count(*) filter (where coalesce(w.is_deleted, false) = false)                    as words,
         count(*) filter (where w.is_memorized and coalesce(w.is_deleted, false) = false) as memorized_total,
         mode() within group (order by w.source_lang || '→' || w.target_lang)             as main_pair,
         mode() within group (order by w.target_lang)                                     as ui_lang
    from cloud_words w group by w.user_id
), sdays as (
  select user_id, count(*) as study_days, max(date) as last_study_date
    from cloud_study_days group by user_id
)
select coalesce(u.raw_user_meta_data->>'nickname', u.raw_user_meta_data->>'full_name',
                u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), left(u.id::text, 8)) as name,
       case when u.email like '%@cloudtestlabaccounts.com' then 'bot'
            when u.email in ('eunjbaek12@gmail.com', 'mtgirltreeguy@gmail.com') then 'me'
            else '' end                                                          as flag,
       ((select day from d) - (u.created_at at time zone 'Asia/Seoul')::date) + 1 as day_n,
       case when (u.created_at at time zone 'Asia/Seoul')::date = (select day from d) then '오늘 가입'
            when u.created_at > now() - interval '7 days'  then '신입(7일 내)'
            when u.created_at > now() - interval '30 days' then '한 달 내'
            else '기존' end                                                      as cohort,
       coalesce(p.main_pair, '-')                                                as main_pair,
       case p.ui_lang when 'ko' then '한국어 화자'
                      when 'en' then '영어 화자' else coalesce(p.ui_lang, '-') end as speaker,
       coalesce(p.words, 0)             as words,
       coalesce(p.memorized_total, 0)   as memorized,
       coalesce(sd.study_days, 0)       as study_days,
       case when sub.pro_until     > now() then 'pro'          -- 앱과 동일한 판정 순서
            when sub.trial_ends_at > now() then 'pro(체험)'
            when sub.tier = 'pro'          then 'pro(만료)'
            else 'free' end                                                      as tier,
       a.did                                                                     as today_did,
       to_char(to_timestamp(a.first_ms / 1000.0) at time zone 'Asia/Seoul', 'HH24:MI')
         || '~' || to_char(to_timestamp(a.last_ms / 1000.0) at time zone 'Asia/Seoul', 'HH24:MI')
                                                                                 as active_kst,
       u.email
  from act a
  join auth.users u on u.id = a.user_id
  left join prof  p  on p.user_id  = a.user_id
  left join sdays sd on sd.user_id = a.user_id
  left join user_subscriptions sub on sub.user_id = a.user_id
 order by a.last_ms desc;
```

2026-07-31 11:50 KST 실행 결과:

| name | cohort | 언어쌍 | 화자 | words | 암기 | 학습일 | tier | 오늘 한 일 | 활동(KST) |
|---|---|---|---|---|---|---|---|---|---|
| 산녀나무꾼 `me` | 신입 3일차 | es→ko | 한국어 | 303 | 31 | 2 | pro(만료) | AI+추가 | 03:04~11:49 |
| 백경현 | 한 달 내 11일차 | en→ko | 한국어 | 214 | 0 | 1 | free | AI+추가+학습 | 10:10~10:24 |
| Salamata | 오늘 가입 | – | – | 0 | 0 | 0 | pro(체험) | AI+학습 | 10:03 |
| Ellie Whipp | 오늘 가입 | ko→en | 영어 | 1000 | 407 | 1 | pro(체험) | 복습+추가+학습 | 02:03~05:56 |
| Danielle A | 오늘 가입 | ko→en | 영어 | 500 | 38 | 1 | pro(체험) | 복습+추가+학습 | 02:07~02:10 |
| 희민 조 | 한 달 내 26일차 | en→ko | 한국어 | 384 | 360 | 7 | free | 추가 | 00:29 |

읽는 법:

- **`speaker`는 `target_lang` 최빈값으로 추정한 모국어다.** 뜻을 한국어로 받으면 한국어 화자,
  영어로 받으면 영어 화자다. 국가 정보는 서버에 없으므로 이게 가장 가까운 신호다.
- **`active_kst`가 새벽대면 해외 사용자로 봐도 거의 맞다.** 위 표의 02시대 두 명이 그 예다
  (`ko→en` = 한국어를 배우는 영어 화자).
- **`tier` 판정 순서는 앱 서버 RPC와 같다** (`pro_until` → `trial_ends_at` → `free`,
  `20260518000000_ai_quota.sql`). `pro(만료)`는 결제했다가 끊긴 사람이고,
  `pro(체험)`은 **가입 시 자동 부여된 7일 체험**이다.
- **`words = 0`인데 `학습`이 찍힐 수 있다.** 동기화 30초 디바운스 때문에 방금 담은 단어가
  아직 안 올라온 것이다. `speaker`가 `-`인 것도 같은 이유(판단할 단어가 없음).
- `prof`/`sdays`는 **계정 전체 누적**이라 오늘 범위와 무관하다. `words`·`study_days`는
  "이 사람이 얼마나 쌓았나"이고, `today_did`만 오늘 것이다.

---

## 스키마 메모 (쿼리 짤 때 매번 헷갈리는 것)

| 테이블 | 날짜 컬럼 | 타입 | 주의 |
|---|---|---|---|
| `cloud_study_days` | `date` | **text** `'YYYY-MM-DD'` | **기기 로컬 날짜**. `updated_at`은 epoch **ms** bigint |
| `cloud_memorized_log` | `date` | **text** `'YYYY-MM-DD'` | 기기 로컬 날짜. `word_id`는 FK 아님(단어 삭제돼도 남음) → `left join` |
| `cloud_words` / `cloud_lists` | `updated_at` | epoch **ms** bigint | 초로 나눌 때 `/ 1000.0` |
| `cloud_lists` | `last_studied_at` | epoch **ms** bigint | 그날 학습한 단어장. 결과는 `last_result_percent`(real → `round()` 전에 `::numeric`) |
| `cloud_words` | `last_reviewed_at` | epoch **ms** bigint, **nullable** | NULL = 학습 이력 없음. `review_success_count`는 SRS 사다리 0~7 |
| `ai_usage_daily` | **`usage_date`** | date | `day` 아님. 수치는 `word_count`/`call_count` |
| `auth.users` | `created_at` / `last_sign_in_at` | timestamptz | `last_sign_in_at`은 DAU 지표 아님 |
| `auth.users` | `raw_user_meta_data` | jsonb | 닉네임은 `nickname` 키. `full_name`/`name`은 소셜 계정 이름 |

`public` 스키마에 `profiles` 같은 사용자 프로필 테이블은 **없다**. 이름 정보는 위 두 곳뿐이고,
공유 단어장에 한해 `cloud_lists.creator_name` / `curated_themes.creator_name`에 사본이 남는다.

## SQL Editor 없이 로컬에서 돌리려면

`.env`에는 service_role 키가 없다. CLI가 이미 로그인·링크돼 있으므로 거기서 얻는다.

```bash
supabase projects api-keys --project-ref ithqbclnwvyeultkyxbn -o json
# description에 'service'가 든 항목의 api_key → REST 호출 헤더 apikey/Authorization
```

출력 앞뒤에 CLI 업데이트 안내가 섞여 `JSON.parse`가 깨지므로 첫 `[` ~ 마지막 `]`만 잘라 쓴다.
**키는 화면에 찍거나 파일에 쓰지 말 것** — 스크립트 변수로만 쓴다.

임의 SQL을 실행하려면 Management API(`POST https://api.supabase.com/v1/projects/<ref>/database/query`,
body `{"query": "..."}`)를 쓴다. access token은 Windows 자격 증명 관리자의
`Supabase CLI:supabase` 항목에 **UTF-8 바이트**로 들어 있다 — `CredRead` 후 `PtrToStringUni`로
읽으면 깨지므로 `Marshal.Copy` → `Encoding.UTF8.GetString`으로 디코딩해야 한다.

PowerShell로 돌릴 때 밟은 함정 세 가지:

- **`pwsh`(PowerShell 7)로 실행할 것.** Windows PowerShell 5.1의 `Invoke-RestMethod`는 응답에
  charset이 없으면 ISO-8859-1로 디코딩해서 **한글 이름이 전부 깨진다**. 결과를 UTF-8 파일로
  써도 이미 깨진 뒤라 복구되지 않는다.
- `Get-Content -Raw`가 반환하는 건 PSObject라 `ConvertTo-Json`이 `PSPath` 등 ETS 속성까지
  통째로 직렬화한다(`expected string, received object` 400). `[IO.File]::ReadAllText`를 쓴다.
- 콘솔 출력 대신 UTF-8 파일로 떨어뜨린 뒤 읽는 편이 안전하다.
