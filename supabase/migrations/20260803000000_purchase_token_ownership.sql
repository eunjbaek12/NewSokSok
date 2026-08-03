-- 구매 토큰 소유권 — 결제 하나가 여러 앱 계정에 Pro를 주던 것을 막는다.
--
-- 배경 (2026-08-03 실측):
--   구매는 스토어 계정(Google Play / Apple ID)에 귀속되고 권한은 앱 계정
--   (auth.users)에 귀속되는데, 그 둘을 잇는 바인딩이 어디에도 없었다.
--   verify-purchase는 스토어에 "이 구독이 유효한가"만 묻고 그 답을 지금 로그인한
--   user_id에 적었다. 스토어는 "누구 것인가"에 답하지 않으므로, 같은 Play 계정으로
--   다른 앱 계정에 로그인해 복원하는 것만으로 결제 하나가 계정 여럿에 Pro를 뿌렸다.
--
--   실제 상태: purchase_token 1개 → user_id 2개, pro_until이 밀리초까지 동일.
--
--   user_subscriptions의 유일한 인덱스가 user_id primary key뿐이라, 같은 토큰이
--   다른 user_id로 들어오면 upsert(onConflict: 'user_id')가 그냥 새 행을 만들었다.
--
-- 선점 정책: 먼저 귀속된 계정이 계속 보유한다. 계정을 옮기려는 정상 사용자는
--   조용한 자동 이전이 아니라 명시적인 이전 절차로 다뤄야 한다 — 소유자를 말없이
--   바꿔주면 "의도한 이전"과 "권한 새기"를 서버가 구분할 수 없다.
--
-- ⚠️ 아래 1번은 되돌릴 수 없다. 중복으로 판정된 행의 구독 필드를 비운다.

-- =========================================================
-- 1. 기존 중복 정리 — 인덱스를 걸기 전에 반드시 선행
-- =========================================================
-- 같은 토큰을 공유하는 행 중 updated_at이 가장 이른 것(= 먼저 귀속된 계정)만
-- 남기고 나머지의 구독 필드를 비운다. 동률이면 user_id로 결정해 결과를 고정한다.
--
-- pro_until까지 지우는 이유: ai_effective_plan()이 pro_until > now()면 tier를
-- 'pro'로 보므로, 토큰만 지우면 만료일까지 Pro가 그대로 유지된다.
-- play_product_id까지 지우는 이유: launchReconcile이 이 값을 "구독 이력 있음"
-- 게이트로 써서, 남겨두면 그 계정이 앱 시작마다 재검증을 시도해 409만 받는다.
do $$
declare
  v_cleared integer;
begin
  with ranked as (
    select user_id,
           row_number() over (
             partition by play_purchase_token
             order by updated_at asc, user_id asc
           ) as rn
    from public.user_subscriptions
    where play_purchase_token is not null
  )
  update public.user_subscriptions s
     set tier              = 'free',
         pro_until         = null,
         play_purchase_token = null,
         play_product_id   = null,
         updated_at        = now()
    from ranked r
   where r.user_id = s.user_id
     and r.rn > 1;

  get diagnostics v_cleared = row_count;
  raise notice 'purchase-token cleanup: % row(s) demoted to free', v_cleared;
end $$;

-- =========================================================
-- 2. 부분 unique 인덱스 — 최종 방어선
-- =========================================================
-- 애플리케이션 검사(verify-purchase의 findTokenOwner)는 좋은 에러 메시지를 위한
-- 것이고, 동시 요청 경쟁이나 조회 실패(fail-open)까지 막는 것은 이 인덱스다.
-- null 제외: 구독한 적 없는 사용자(대다수)는 이 컬럼이 null이라 서로 충돌하면 안 된다.
create unique index if not exists user_subscriptions_purchase_token_uniq
  on public.user_subscriptions (play_purchase_token)
  where play_purchase_token is not null;
