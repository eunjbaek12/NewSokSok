# verify-purchase Edge Function

v1.1 Pro 구독 영수증 검증. **Android(Google Play) + iOS(App Store Server API)** 양 플랫폼 지원 (2026-06-02 iOS 추가).

## 흐름

### Android
1. 클라이언트(`features/billing/usePurchaseFlow`)가 `onPurchaseSuccess`에서 호출 (`platform: 'android'`)
2. Edge가 Play Developer API(`subscriptionsv2`)로 `purchaseToken` 진위 확인
3. `subscriptionState` 가 `ACTIVE` 또는 `IN_GRACE_PERIOD` 이고 productId·expiryTime 일치 시 `user_subscriptions` 갱신
4. 응답 ok면 클라이언트가 `finishTransaction` + quota refresh

### iOS
1. 클라이언트가 `purchaseToken`(StoreKit JWS) + `platform: 'ios'` 전송
2. Edge가 JWS payload에서 `transactionId` 디코딩
3. App Store Server API `GET /inApps/v1/transactions/{id}` 호출 (production → 404면 sandbox fallback — TestFlight·시뮬레이터 대응)
4. `signedTransactionInfo` JWS payload에서 `bundleId`/`productId`/`expiresDate`/`revocationDate` 추출
5. 검증: bundleId 일치 + productId 일치 + 환불 안 됨 + expiresDate > now
6. iOS는 `originalTransactionId`를 안정 키로 `play_purchase_token` 컬럼에 저장 (갱신마다 변하는 `transactionId` 대신)

## 필요한 Secret

| 이름 | 설명 | 플랫폼 |
|---|---|---|
| `PLAY_SA_CLIENT_EMAIL` | Play Developer API 서비스 계정 이메일 | Android |
| `PLAY_SA_PRIVATE_KEY` | PEM 형식 RSA private key (`\n` 이스케이프 허용) | Android |
| `ANDROID_PACKAGE_NAME` | `com.soksokvoca` | Android |
| `APPLE_KEY_ID` | App Store Connect API Key ID (예: `ABC123XYZ`) | iOS |
| `APPLE_ISSUER_ID` | App Store Connect Issuer ID (UUID 형태) | iOS |
| `APPLE_BUNDLE_ID` | `com.soksokvoca` | iOS |
| `APPLE_PRIVATE_KEY` | App Store Connect API `.p8` EC P-256 private key (PEM, `\n` 이스케이프 허용) | iOS |

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

### 3. App Store Connect API 키 발급 (iOS)

1. **App Store Connect** → 사용자 및 액세스 → 통합 → **App Store Connect API**
2. **키 생성** → 이름: `soksok-verify-purchase`
3. 액세스: **App Manager** 또는 **In-App Purchase 관리** 권한 (최소: "Customer Support")
   - StoreKit Server API의 `inApps/v1/transactions/*` 호출엔 "Customer Support" 권한으로 충분
4. 생성 직후 `.p8` 키 파일을 **반드시 다운로드** (1회만 가능)
5. 화면에서 **Key ID**, **Issuer ID** 복사

### 4. Supabase Secret 등록

```bash
# Android
supabase secrets set \
  PLAY_SA_CLIENT_EMAIL=soksok-play-verify@<project>.iam.gserviceaccount.com \
  ANDROID_PACKAGE_NAME=com.soksokvoca

supabase secrets set PLAY_SA_PRIVATE_KEY="$(cat play-sa-key.json | jq -r .private_key)"

# iOS
supabase secrets set \
  APPLE_KEY_ID=ABC123XYZ \
  APPLE_ISSUER_ID=00000000-0000-0000-0000-000000000000 \
  APPLE_BUNDLE_ID=com.soksokvoca

supabase secrets set APPLE_PRIVATE_KEY="$(cat AuthKey_ABC123XYZ.p8)"
```

### 5. 배포

```bash
supabase functions deploy verify-purchase
```

## 알려진 한계 (v1.2+ follow-up)

- **JWS 서명 직접 검증 안 함** — Apple 응답 자체가 우리 JWT로 인증된 채널에서 받은 거라 payload만 사용. 위변조된 transactionId를 보내봐야 Apple이 404로 응답해 검증 통과 X. 더 엄격한 검증이 필요하면 Apple 인증서 체인으로 JWS 서명 검증 추가.
- **실시간 갱신 알림(RTDN / App Store Server Notifications V2) 미연동** — 사용자가 앱 진입 / `verify-purchase` 호출 시점에만 상태 동기화. 환불·취소를 즉시 받으려면 별도 webhook (`/notifications/v2`) 구축 필요.
- **취소·환불 처리** — 사용자 측에서 구독 취소해도 `pro_until` 만료 전까지는 Pro 유지. 만료 후 자동 Free로 강등 (current `get_ai_quota_status` 로직). 환불 즉시 강등이 필요하면 RTDN/SSN 연동 필요.
- **Rate limit** — 분당 5건/사용자. isolate 단위 best-effort.
