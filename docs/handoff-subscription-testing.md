# 구독 서비스 테스트 플랜

쏙쏙 보카 Pro 구독(결제 → 검증 → tier/quota → 체험 어뷰징) 테스트 전략과 실행 방법.

작성일: 2026-05-26 / 대상: v1.1 결제 시스템

---

## 레이어 구조

구독 시스템은 4개 레이어로 나뉘고, 레이어마다 테스트 비용과 방법이 다르다.
원칙: **돈·시간이 드는 ④는 최소화하고 ①②③에서 로직을 다 잡는다.** 결제 버그의
대부분은 ②(tier 판정 경계)와 ③(상태 검증)에 있다.

| 레이어 | 대상 | 방법 | 실행 의존성 | 현재 상태 |
|---|---|---|---|---|
| ① 순수 로직 | `error-mapping.ts`, quota 헬퍼 | Jest | 없음 | ✅ 작성+통과 |
| ③ 구독 판정 | `verify-purchase/verify-logic.ts` | Jest | 없음 | ✅ 작성+통과 |
| ② DB RPC | quota/trial 마이그레이션 | pgTAP (`supabase test db`) | Docker | ✅ 작성 / ⏳ 실행 셋업 필요 |
| ③ 핸들러 통합 | `verify-purchase/index.ts` 전체 | Deno + Play API mock | Deno | ⬜ 미작성 (선택) |
| ④ 결제 E2E | `usePurchaseFlow.ts` + Play | 라이선스 테스터 실기기 | 실기기 | 📋 수동 체크리스트 |

---

## ① + ③(판정) — Jest (즉시 실행, 검증 완료)

```bash
pnpm test                                  # 전체
npx jest billing-verify-logic billing-error-mapping quota-pro-mode   # 구독 관련만
```

| 파일 | 커버 | 핵심 케이스 |
|---|---|---|
| `__tests__/billing-error-mapping.test.ts` | `mapPurchaseError` | 17개 expo-iap 코드 + 자체 throw 메시지, 취소 silent, 복원 제안 |
| `__tests__/quota-pro-mode.test.ts` | `getProMode` / `getTrialDaysLeft` | trial vs paid 구분, 만료 경계, 잔여일 ceil |
| `__tests__/billing-verify-logic.test.ts` | `evaluateSubscription` | ACTIVE/GRACE 인정, 상태·상품·만료 거부, now 주입 경계 |

> `getProMode` 는 서버가 trial/paid 를 모두 `tier='pro'` 로 반환하는 것을 클라이언트에서
> 구분하는 **유일한 지점**이다. ("체험인데 결제된 것처럼 보이던" 과거 버그.)

> ③ 의 판정 로직은 원래 `index.ts` 핸들러에 인라인이었으나, Deno 없이 테스트하기 위해
> 순수 함수 `verify-logic.ts` 로 추출했다(동작 동일). 핸들러는 이 함수를 호출한다.

---

## ② DB RPC — pgTAP (작성 완료, 실행 셋업 필요)

`supabase/tests/` 에 pgTAP 테스트가 있다. **로컬 Postgres 가 필요**하므로 Docker 가
설치돼 있어야 하고, 이 레포는 아직 `supabase init`(= `config.toml`) 이 안 돼 있다.

### 실행 셋업

```bash
# 1) Docker Desktop 설치 (Windows + OneDrive: 레포를 OneDrive 밖으로 옮기는 것을 권장 —
#    OneDrive 경로에서 볼륨 마운트/파일 동기화가 간섭할 수 있음)
# 2) supabase init       # config.toml 생성 (최초 1회)
# 3) supabase test db     # supabase/tests/*.sql 의 pgTAP 테스트 실행
```

`supabase test db` 는 로컬 DB를 띄우고 마이그레이션을 적용한 뒤 각 `*.test.sql` 을
트랜잭션으로 돌리고 rollback 한다.

### 커버하는 케이스

| 파일 | 대상 RPC | 핵심 |
|---|---|---|
| `supabase/tests/01_quota_core.test.sql` | `consume_ai_quota`, `get_ai_quota_status`, `refund_ai_quota` | Free 100 / Pro 1000 한도, 차감 경계(used+cost ≤ limit+bonus), 거부 시 미차감, 보너스 확장, trial=pro 한도, refund 0 floor |
| `supabase/tests/02_rewarded_and_trial.test.sql` | `grant_rewarded_bonus`, 가입 트리거 | 보너스 cap 200, amount>100 차단, **탈퇴→재가입 체험 재취득 방지**(이메일 해시 정규화·영구 보존) |

### 별도 권장 (pgTAP 으로 잡기 어려움)

- **동시성**: `consume_ai_quota` 의 `for update` 락이 동시 차감 race 를 막는지 →
  병렬 호출 스크립트(예: 동시 N건)로 합계가 정확히 차감되는지 부하 검증.
- **KST 자정 reset**: `usage_date` 를 어제로 넣고 오늘 조회 시 used=0 인지
  (01 테스트에 fixture 로 추가 가능).

---

## ③ 핸들러 통합 — Deno (선택, 미작성)

`verify-logic.ts` 가 판정 로직을 커버하므로 핸들러 통합은 우선순위가 낮다. 다만
다음은 `index.ts` 핸들러를 직접 때려야 검증된다 → Deno 설치 후 작성 권장:

- JWT 없음 → 401, 잘못된 JSON → 400
- `platform='ios'` → 400 (v1.1 미지원)
- **rate limit**: 같은 user 6번째 호출 → 429
- Play API 404/410 → 402, 그 외 5xx → 500 (`fetch` mock)
- 인정 시 `user_subscriptions` upsert (tier=pro) (supabase client mock)

```bash
# deno 설치 후
deno test --allow-env supabase/functions/verify-purchase/index.test.ts
```

---

## ④ 결제 E2E — 라이선스 테스터 (수동)

실제 Play Billing 은 자동화 불가. 단 두 가지 가속 장치가 있다:

1. **라이선스 테스터** (`handoff-monetization-setup.md` C4): 실제 청구 없는 가짜 결제.
   실제 `purchaseToken` 이 발급돼 ③ `verify-purchase` 까지 실경로로 흐른다.
2. **갱신 주기 단축**: 테스트 환경에서 Play 가 구독 주기를 압축한다(월간 ≈ 5분 등).
   7일 trial 도 수 분으로 단축 → **trial 만료 → Free 강등을 실시간 관찰 가능.**

### 수동 시나리오 체크리스트 (내부 테스트 트랙)

```
□ 정상 구매 → verifying → success → tier=pro 반영
□ 구매 중 취소 → silent, 버튼 재활성 (Alert 안 뜸)
□ 이미 구독 중 재구매 → AlreadyOwned → "복원" 버튼 노출
□ 구매 직후 앱 강제종료 → 재실행 시 auto-reconcile 복구 (usePurchaseFlow.ts:175)
□ 재설치 → restore() → tier 복원
□ trial 단축 만료 → Free 강등, 한도 100 복귀
□ 갱신 → pro_until 연장
□ 해지 → grace period 동안 유지 → 만료 후 강등
□ 환불 → 다음 verify 에서 402 → 강등
```

---

## 현재 환경 제약 (2026-05-26 기준)

- Jest + ts-jest: ✅ → ①③ 즉시 실행·검증됨
- supabase CLI 2.101.0: 있음 / **Docker 없음** + `supabase init` 미실행 → ② 실행 셋업 필요
- **Deno 없음** → ③ 핸들러 통합 테스트는 런타임 설치 필요
- OneDrive 경로 간섭 이력(prebuild fs 복사 실패) → 로컬 DB 컨테이너도 같은 위험
