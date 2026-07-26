# 운영 분석 쿼리 — "오늘 누가 앱을 썼나"

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

`cloud_words`의 단어 수가 500 / 1000 / 1500처럼 딱 떨어지면 대개 **공식 큐레이션 덱을
통째로 담은 것**이지 직접 추가한 게 아니다. 활동의 깊이로 오해하지 말 것.

---

## Q1. 오늘 활동한 사람 (가장 자주 쓸 쿼리)

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

---

## 스키마 메모 (쿼리 짤 때 매번 헷갈리는 것)

| 테이블 | 날짜 컬럼 | 타입 | 주의 |
|---|---|---|---|
| `cloud_study_days` | `date` | **text** `'YYYY-MM-DD'` | `updated_at`은 epoch **ms** bigint |
| `cloud_words` / `cloud_lists` | `updated_at` | epoch **ms** bigint | 초로 나눌 때 `/ 1000.0` |
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
