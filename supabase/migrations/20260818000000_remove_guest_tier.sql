-- 게스트 등급을 없앤다 — is_anonymous 분기 전면 제거
--
-- 🔴🔴 적용 금지: 1.6.0 이 **양대 스토어에 도달한 뒤**에 올린다. 🔴🔴
--
-- 이 파일이 미적용 상태로 저장소에 있는 동안, 다른 마이그레이션을 `db push` 하면
-- 이것이 **함께 나간다**. 2026-08-13 에 그렇게 서버가 앱보다 먼저 바뀌어 출시된 앱의
-- 보상형 광고가 이틀간 무효가 됐다. 그때는 `db query --file` 로 다른 파일만 단독
-- 적용해 피했다 — 같은 상황이 오면 같은 방법을 쓸 것.
--
-- 왜 앱이 먼저인가 (docs/guest-policy-1.6.0-spec.md §2):
--   "게스트 하루 10단어"가 스토어 원고 10곳과 앱 문구에 적혀 있다. 서버만 먼저 바꾸면
--   문서가 거짓이 되고, 반대로 앱만 나가면 며칠 불편한 조합(리셋은 막혔는데 한도는
--   10)이 이어진다. 그래서 **출시 확인 직후 곧바로** 적용한다.
--
-- 선결 조건(이미 앱에 들어감): 게스트 로그아웃 시 익명 세션 유지(`86695c3`).
--   그게 없으면 한도를 50/300 으로 올리는 순간 로그아웃-재진입 우회의 1회 이득이
--   20단어에서 300단어가 된다.
--
-- 바뀌는 것
--   tier             is_anonymous → 'guest'                    ⇒ 'pro' / 'free' 만
--   day_limit        게스트 10 · 첫 24h 300 은 로그인만          ⇒ 누구나 첫 24h 300, 이후 50
--   reward_amount    게스트 10 / 그 외 20                        ⇒ 20
--   reward_max_views 게스트 1 / 그 외 2                          ⇒ 2
--
-- 첫 24시간 300 을 게스트에게도 주는 근거: 300 도입 후 가입 36명 중 첫날 AI 를 쓴
-- 사람이 10명이고 그중 50단어를 넘긴 사람은 1명(575단어)이다. 90%에게는 하루 90
-- (50 + 광고 20×2)으로 충분하고, 첫날 대량으로 쓰려는 10%를 놓치지 않으려 300 을 남긴다.
--
-- 재설치 우회(새 익명 계정 → 300 재획득)는 의도적으로 허용한다. 1회 이득이 약 120원인데
-- (AI 단어 1개 원가 ≈ 0.4원) 대가는 쌓아 둔 단어장 전체다. 대신 주 1회 관측한다
-- (스펙 §5-2: "24h 내 250+ 소진 후 활동 0" 계정을 IP/16 대역으로 묶어 셈).
--
-- 앱 영향: `tier` 에 'guest' 가 오지 않으므로 게스트도 요금제 화면에 Free 로 표시된다.
-- 광고 가드는 `tier === 'pro'` 만 보므로 영향 없다(lib/ads/admob.ts). 내부 분석은
-- auth.users.is_anonymous 로 계속 가능하다.
--
-- 반환형이 그대로라 `create or replace` 로 충분하다(컬럼이 바뀌면 42P13 이 나서 drop 이
-- 필요했다 — 20260813020000 이 그 경우였다).
--
-- 되돌리기: 서버 값이라 즉시 가능. 이 파일의 이전 정의는 20260813020000 에 있다.

create or replace function public.ai_effective_plan(p_user_id uuid)
returns table(tier text, day_limit integer, month_limit integer, reward_amount integer, reward_max_views integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    case when s.pro_until > now() or s.trial_ends_at > now() then 'pro' else 'free' end::text,
    case when s.pro_until > now() or s.trial_ends_at > now() then 3000
         when u.created_at > now() - interval '24 hours' then 300
         else 50 end::integer,
    case when s.pro_until > now() or s.trial_ends_at > now() then 3000 else 0 end::integer,
    20::integer,
    2::integer
  from public.user_subscriptions s join auth.users u on u.id = s.user_id
  where s.user_id = p_user_id;
$function$;
