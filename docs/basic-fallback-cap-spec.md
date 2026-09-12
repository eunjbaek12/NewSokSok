# 한도 초과 「뜻만」 경로 — 기록과 상한

> 2026-09-12 작성 · **미착수, 다음 세션 착수용.**
> 배경 실측과 결정 이력은 `docs/pricing-decision.md` §5·§6 과 메모리 `project_pricing_redesign`.

---

## 1. 지금 무슨 일이 일어나나

Free 가 하루 한도(50 + 광고 20×2)를 다 쓴 뒤 단어를 검색하면, 서버는 **뜻만 담은 결과를
200 으로 돌려준다**(`supabase/functions/enrich-word/index.ts:233~266`). 사진 스캔·AI 생성은
같은 자리에서 429 로 끊기지만 자동완성만 통과시키는 **의도된 비대칭**이다 — 단어 하나를
찾다가 빈손으로 끝나는 막다른 길을 없애려는 설계다(같은 파일 :205~213 주석).

그 뒤가 비어 있다.

| | 상태 |
|---|---|
| 횟수 상한 | **없다.** 남은 방어선은 Edge 인스턴스별 분당 40회(`_shared/rate-limit.ts`)뿐이고, 이것은 인스턴스 로컬이라 총량을 막지 못한다 |
| 기록 | **없다.** `consume_ai_quota` 는 `allowed=false` 면 아무 행도 쓰지 않는다(`20260813020000_pro_3000_monthly_pool.sql:122`) — `word_count` 도 `call_count` 도 안 오른다 |
| 원가 | **모른다.** 캐시에 뜻이 있으면 0원, 없으면 `translateMeaningOnly`(`_shared/gemini-meaning.ts`)가 Vertex 를 부른다. 이 프롬프트 1회 값을 아직 안 쟀다 |

🔴 `docs/pricing-decision.md` §5 는 이 상한을 **"필수"**(하루 300 / 월 2,000)로 적어 두었다.
그 숫자만 구현되지 않은 채 나머지 설계가 나갔다.

🔴 **Pro 도 같은 구멍이다.** 월 3,000 을 넘긴 Pro 의 자동완성도 같은 분기로 들어가 무제한 basic 을 받는다.

---

## 2. 순서 — 재고 나서 조인다

숫자를 먼저 정하지 않는다. `docs/pricing-decision.md` 의 300/2,000 은 **full 사용량**
(최대 하루 575 · 월 1,347)에서 나온 값이라 basic 의 근거가 아니다.

### 0단계 — 기록 (서버만, 사용자 화면 변화 0) · ✅ **2026-09-12 적용·배선 확인 완료**

| 무엇 | 어디 |
|---|---|
| `basic_count` · `basic_miss_count` 컬럼 + `record_basic_serve(uuid, boolean)` RPC | `supabase/migrations/20260912000000_basic_serve_observability.sql` |
| basic 200 직전 fire-and-forget 호출 | `supabase/functions/enrich-word/index.ts` (basic 분기 끝) |
| 원가 실측 로그 `meaning-only usage` | `supabase/functions/_shared/gemini-meaning.ts` |

**관측 시작일 = 2026-09-12**(Edge 배포 v49 기준). 이 날짜 이전 행의 `0` 은 "basic 이 없었다"가
아니라 **"세지 않았다"** 이므로 §1단계 쿼리의 `usage_date >= '2026-09-12'` 에 그대로 들어간다.

**배선 확인(2026-09-12)** — 며칠 뒤 `0` 이 나왔을 때 "한도 초과가 없었다"인지 "계측이 안 붙었다"인지
구분할 수 없으므로, 배포 직후 실제로 한 번 태워 봤다. 임시 익명 계정의 `word_count` 를 9999 로 채워
basic 분기를 강제한 뒤 `enrich-word` 를 두 번 호출:

| 호출 | 응답 | `basic_count` | `basic_miss_count` |
|---|---|---|---|
| 1회차 (캐시 없음 → Vertex) | 200 `basic`, 뜻 O·예문 X | 1 | 1 |
| 2회차 (같은 단어, 캐시 히트) | 200 `basic`, `cached=true` | 2 | **1 (안 오름)** |

`word_count`·`call_count` 는 둘 다 0 그대로였다 — 「호출당 단어」 지표는 안 흔들린다.
확인 뒤 임시 계정·basic 캐시 행을 지웠고, 관측 시작선은 `basic_count > 0` **0행**이다.

적용 순서(둘 다 프로덕션):
```bash
npx -y supabase@latest db query --file supabase/migrations/20260912000000_basic_serve_observability.sql --linked
# 장부를 맞춘다 — db query 는 schema_migrations 에 안 남아서, 안 넣으면 다음 db push 때 되살아난다
npx -y supabase@latest db query "insert into supabase_migrations.schema_migrations(version,name) values ('20260912000000','basic_serve_observability') on conflict (version) do nothing;" --linked
npx -y supabase@latest functions deploy enrich-word             # 컬럼이 먼저 있어야 RPC 가 성공한다
```
🔴 **순서가 뒤집히면** 배포된 Edge 가 없는 RPC 를 부른다 — fire-and-forget 이라 사용자에게는
아무 일도 안 일어나지만 그동안의 basic 은 영영 안 세진다.

**무엇을** `ai_usage_daily` 에 `basic_count`(+ 원가를 바로 가르는 `basic_miss_count`) 컬럼을 더하고,
Edge 가 basic 을 실제로 내보낸 직후 전용 RPC(`record_basic_serve(p_user_id, p_cached)`)로 올린다.

**무엇을 안 세나** 404(모르는 단어)·500(폭주)로 끝난 호출. 사용자가 뜻을 못 받았으니 상한의
근거가 아니다. 그런 호출이 Vertex 를 불렀다면 그 원가는 `basic_miss_count` 에 안 잡힌다 —
**원가는 그만큼 과소집계된다**(의도한 것; 분포 판단에는 영향이 없다).

**왜 `consume_ai_quota` 안에서 세지 않나** 그 함수는 `mode` 를 모른다. 거기서 세면 429 로 끝난
사진 스캔·AI 생성까지 섞여 "뜻만 내보낸 횟수"가 아니게 된다. 판정은 Edge 에 있으므로 Edge 에서 센다.
`word_count`·`call_count` 는 건드리지 않는다 — 「호출당 단어」 지표(`docs/pricing-decision.md` §12)가 흔들린다.

**시그니처** `consume_ai_quota` 는 Edge 두 곳에서만 불린다(`enrich-word`, `generate-words`; 앱은 안 부른다).
그래도 이 단계에서는 손대지 않는 편이 안전하다 — 새 RPC 만 추가한다.

**원가** 추정 금지(`env_ai_script_cost_estimate`). Vertex SA 키는 Supabase Secrets 에만 있어
로컬에서 같은 모델을 부를 수 없으므로, `translateMeaningOnly` 안에서 `usageMetadata` 를
**로그로 남겨 운영 호출에서 잰다**. 프롬프트가 고정이라 몇 건이면 1회 값이 확정된다.

```
Edge Functions → enrich-word → Logs 에서  meaning-only usage  검색
→ prompt/output 토큰 × gemini-2.5-flash-lite 단가 × basic_miss_count = 이 경로의 월 원가
```

### 1단계 — 2주 관측 후 숫자 결정

```sql
-- 하루 basic 분포 (관측 시작일 이후)
select percentile_disc(0.5) within group (order by basic_count)  as p50,
       percentile_disc(0.9) within group (order by basic_count)  as p90,
       max(basic_count) as max_day,
       count(*) filter (where basic_count > 0) as days,
       count(distinct user_id) filter (where basic_count > 0) as users,
       sum(basic_count) as total, sum(basic_miss_count) as vertex_calls
  from public.ai_usage_daily where usage_date >= '2026-09-12';   -- 관측 시작일. 그 전은 미관측(0 이 아니다)
```

정상 사용자가 안 걸리는 자리에 상한을 둔다. 기준은 **"막을 사람이 아니라 막을 총액"** 이다 —
캐시 히트는 원가 0 이므로 실제로 방어해야 하는 것은 `basic_miss_count` 쪽이다.

### 2단계 — 상한 적용

Edge 의 basic 분기 진입 전에 카운터를 보고, 넘으면 `429 quota_exceeded` 로 돌려준다.

✅ **앱 변경은 필요 없다(확인 완료).** `lib/ai/edge-enrich.ts:94~98` 이 `quota_exceeded` 를 이미
처리해 전역 보상형 모달을 띄운다. 상한에 걸린 사용자는 "뜻만 왔어요" 배너 대신 그 모달을 본다.

⚠️ **그래도 착수 전 확인할 것 하나** — 「한도를 넘겨도 뜻은 나온다」가 스토어 원고에 약속으로
적혀 있는지. 앱 문구(`addWord.basicQuotaExceeded`)는 basic 이 실제로 왔을 때만 뜨므로 거짓이
되지 않지만, 원고는 매체가 달라 따로 본다(`store-assets/listing/` 전체에서 "뜻만" 검색).

### 3단계 — Pro 결정

Pro 에게도 같은 상한을 걸지, 월 풀을 넘긴 Pro 는 그대로 둘지. 유료 사용자가 1명이라
지금은 영향이 없고, 판단은 0단계 수치를 보고 한다.

---

## 3. 실행 시 함정 (전부 이 저장소에서 값을 치른 것들)

- 🔴 **`db push` 를 쓰지 말 것.** 미적용 마이그레이션을 전부 끌고 나간다(2026-08-13 사고).
  단독 적용은 `db query --file <파일>` → `migration repair --status applied <version>`.
  장부를 안 맞추면 다음 사람이 `db push` 할 때 되살아난다.
- 🔴 **라이브 정의부터 확인한다.** `consume_ai_quota` 는 정책마다 재정의돼 마이그레이션 파일이
  다섯 개다. 지금 도는 것은 `20260813020000` 기반(8/16 재적용)이니, 새 파일은
  `pg_get_functiondef` 로 **실제 설치된 본문**을 떠서 그 위에 쓴다.
- 🔴 **검증은 정의가 아니라 행으로.** `cross join lateral` 로 실제 사용자에게 함수를 돌려
  "누가 무엇을 받게 됐나"를 센다(게스트 등급 제거 때 쓴 방법).
- 🔴 **원가는 추정하지 말고 `usageMetadata` 로 1회 잰다.** 추정이 두 번 연속 빗나간 적 있다.
- ⚠️ free 플랜이라 **백업이 없다.** 파괴적 SQL 직전에만 `db query` + `json_agg` 로 떠 둔다.

---

## 4. 범위 밖 (알고도 두는 것)

**익명 계정을 계속 만들어 첫 24시간 300 을 반복 획득하는 경로.** 계정 단위 상한으로는 못 막고,
의도적으로 허용 중이다(1회 이득 ≈ 120원, 대가는 단어장 전체). 관측만 한다 —
`docs/guest-policy-1.6.0-spec.md` §5-2.
