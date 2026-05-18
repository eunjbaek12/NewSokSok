# enrich-word Edge Function

운영자(operator)의 Vertex AI Gemini 키로 단어를 보강(definition·meaning·example 등)하는 Supabase Edge Function.

## 흐름

```
[App] ──Bearer JWT──> [Edge Function] ──> [consume_ai_quota RPC]
                              │                    │ (quota 차감)
                              │                    ↓
                              │           [ai_usage_daily / user_subscriptions]
                              │
                              └─ Service Account JWT → OAuth2 → Vertex AI Gemini
```

## 환경변수 (Supabase Secrets)

```bash
# 1. Vertex AI (운영자 GCP)
supabase secrets set VERTEX_PROJECT_ID="avocado-491710"
supabase secrets set VERTEX_LOCATION="us-central1"           # 또는 asia-northeast3
supabase secrets set VERTEX_MODEL="gemini-2.5-flash-lite"    # 기본값
supabase secrets set VERTEX_SA_CLIENT_EMAIL="avocado-ai-proxy@avocado-491710.iam.gserviceaccount.com"

# private_key는 JSON 파일에서 그대로 복사 (\n 이스케이프 포함된 1줄 형태)
supabase secrets set VERTEX_SA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADAN...\n-----END PRIVATE KEY-----\n"
```

> `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`는 Supabase가 자동 주입.

## 배포

```bash
# 1. DB 마이그레이션 (한 번)
supabase db push

# 2. Edge Function 배포
supabase functions deploy enrich-word

# 3. 동작 확인 (앱 토큰으로 직접 호출 테스트)
curl -X POST "https://<project>.supabase.co/functions/v1/enrich-word" \
  -H "Authorization: Bearer <user_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"term":"serendipity","sourceLang":"en","targetLang":"ko","mode":"autocomplete"}'
```

## 클라이언트 활성화

배포 + 환경변수 설정 + 마이그레이션 적용이 모두 끝난 후, 앱 빌드에 다음 환경변수 추가:

```bash
EXPO_PUBLIC_ENRICH_VIA_EDGE=1
```

미설정이면 클라이언트는 v1 동작(BYOK + 영어 사전 fallback)으로 유지.

## 요청 / 응답

### Request
```http
POST /functions/v1/enrich-word
Authorization: Bearer <supabase JWT>
Content-Type: application/json

{
  "term": "serendipity",
  "sourceLang": "en",         // en|ko|ja|zh
  "targetLang": "ko",
  "mode": "autocomplete"      // autocomplete=1 / generate=20 / photo=15
}
```

### 200 OK
```json
{
  "result": {
    "term": "serendipity",
    "definition": "...",
    "meaningKr": "...",
    "exampleEn": "...",
    "exampleKr": "...",
    "mnemonic": "...",
    "pos": "noun",
    "phonetic": "/ˌsɛrənˈdɪpɪti/"
  },
  "quota": {
    "tier": "free",
    "used": 1,
    "limit": 100,
    "bonus": 0,
    "reset_at": "2026-05-19T15:00:00.000Z"
  }
}
```

### 429 quota_exceeded
```json
{ "error": "quota_exceeded", "quota": { "tier": "free", "used": 100, "limit": 100, "bonus": 0, "reset_at": "..." } }
```

### 429 rate_limited
```json
{ "error": "rate_limited", "retry_after": 45 }
```

### 401 / 400 / 500
구조: `{ "error": "<code>" }`

## 비용 가중치 (`COST_BY_MODE`)

| mode | cost (단어) | 용도 |
|---|---|---|
| `autocomplete` | 1 | AI 자동 완성 (단일 단어) |
| `generate` | 20 | AI 단어 생성 (1세트) |
| `photo` | 15 | 사진 스캔 (1장 분석) |

생성 1세트가 20단어인 이유: 일반적인 1회 호출이 약 20개를 만들어내고, 토큰 사용량도 약 20배. 사진은 OCR 오버헤드(이미지 입력)까지 포함해 15단어로 책정 — 자세한 정책은 `CLAUDE.md` Monetization 참고.

## tier 결정 로직

`consume_ai_quota` RPC가 다음 우선순위로 effective tier 계산:

1. `pro_until > now()` → Pro (정식 구독)
2. `trial_ends_at > now()` → Pro (7일 무료 체험)
3. 그 외 → Free

Free=100단어/일, Pro=1000단어/일. `rewarded_bonus`(보상형 광고)가 더해져 일 절대 상한 Free 300단어, Pro 1200단어.

## 안전장치

- **JWT 검증**: 헤더의 Bearer 토큰을 Supabase가 자동 검증
- **Rate limit**: 사용자당 분당 20회 (per-isolate, in-memory)
- **Atomic 차감**: `consume_ai_quota`가 `SELECT FOR UPDATE` 락으로 race 방지
- **실패 환불**: Vertex 호출 실패 시 `refund_ai_quota`로 한도 복원

## 운영자 필수 안전망 (코드 외)

GCP 콘솔에서 추가 설정 권장:

| 설정 위치 | 내용 |
|---|---|
| **Billing → Budgets & alerts** | 월 $10/$20 등 cap + 80%/100% 알림 |
| **IAM → Quotas (Vertex AI)** | 분당/일당 호출 수 한도 직접 설정 |
| **Service Account 권한** | `roles/aiplatform.user`만. 다른 권한 부여 금지 |

봇 가입 대공습 같은 최악 시나리오에서도 GCP Budget cap이 지출 차단선.
