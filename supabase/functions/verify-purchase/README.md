# verify-purchase Edge Function

v1.1 Pro 구독 영수증 검증. Android Google Play 전용 (iOS는 v1.2).

## 흐름

1. 클라이언트(`features/billing/usePurchaseFlow`)가 `onPurchaseSuccess`에서 호출
2. Edge가 Play Developer API로 `purchaseToken` 진위 확인
3. `subscriptionState` 가 `ACTIVE` 또는 `IN_GRACE_PERIOD` 이고 productId·expiryTime 일치 시 `user_subscriptions` 갱신
4. 응답 ok면 클라이언트가 `finishTransaction` + quota refresh

## 필요한 Secret

| 이름 | 설명 |
|---|---|
| `PLAY_SA_CLIENT_EMAIL` | Play Developer API 서비스 계정 이메일 |
| `PLAY_SA_PRIVATE_KEY` | PEM 형식 private key (`\n` 이스케이프 허용) |
| `ANDROID_PACKAGE_NAME` | `com.soksokvoca` |

## 사용자 측 사전 작업

### 1. Play Developer API용 서비스 계정 생성

`Vertex AI 서비스 계정과 별개`로 두는 게 보안상 권장.

1. **Google Cloud Console** → 동일 프로젝트 → IAM → 서비스 계정 → 생성
   - 이름: `soksok-play-verify`
   - 권한 부여 단계는 건너뛰기 (다음 단계에서 Play Console에서 부여)
2. 생성된 계정 → **키** → 키 추가 → JSON → 다운로드
3. 다운로드한 JSON에서 `client_email`, `private_key` 추출

### 2. Play Console에서 API 접근 권한 부여

1. **Play Console** → 좌측 메뉴 → 설정 → API 접근
2. "Google Cloud 프로젝트 연결" — 위 1번에서 만든 SA가 속한 프로젝트 선택
3. 서비스 계정 목록에 위 SA가 표시될 때까지 새로고침
4. **권한 부여** → 앱 권한: "재무 데이터 + 주문 + 구독 보기" 부여 (최소)
5. 변경 사항 저장 (반영까지 ~24시간 걸릴 수 있음)

### 3. Supabase Secret 등록

```bash
supabase secrets set \
  PLAY_SA_CLIENT_EMAIL=soksok-play-verify@<project>.iam.gserviceaccount.com \
  ANDROID_PACKAGE_NAME=com.soksokvoca

# private key는 \n을 이스케이프하거나 파일로:
supabase secrets set PLAY_SA_PRIVATE_KEY="$(cat play-sa-key.json | jq -r .private_key)"
```

### 4. 배포

```bash
supabase functions deploy verify-purchase
```

## 알려진 한계 (v1.2 follow-up)

- **iOS 미지원** — StoreKit 2 JWS 검증 추가 필요 (`@apple/server-api-jws`).
- **실시간 갱신 알림(RTDN) 미연동** — 사용자가 앱 진입 / `verify-purchase` 호출 시점에만 상태 동기화. Google Pub/Sub topic + Edge webhook 별도 구축 필요.
- **취소·환불 처리** — 사용자 측에서 Play 구독 취소해도 `pro_until` 만료 전까지는 Pro 유지. 만료 후 자동 Free로 강등 (current `get_ai_quota_status` 로직).
- **Rate limit** — 분당 5건/사용자. isolate 단위 best-effort.
