# 수익화 인프라 셋업 가이드

쏙쏙 보카 v1.1 출시를 위한 운영자 사전 작업. 이 문서를 보면서 순서대로 진행.

작성일: 2026-05-17 / 정책 버전: v1 (3-tier: Free / BYOK / Pro 3,900원)

---

## 전체 체크리스트

```
□ Part A. GCP + Vertex AI Gemini 활성화
  □ A1. GCP 프로젝트 생성
  □ A2. Vertex AI API 활성화
  □ A3. 결제 계정 등록
  □ A4. 서비스 계정 키 발급
  □ A5. 일일 비용 알림 설정

□ Part B. AdMob 앱 등록 + 광고 단위 발급
  □ B1. AdMob 계정 생성·로그인
  □ B2. 앱 추가 (Android, 쏙쏙 보카)
  □ B3. 배너 광고 단위 발급
  □ B4. 보상형 광고 단위 발급
  □ B5. 광고 정책·앱-광고 ID 메모

□ Part C. Play Console 인앱상품 등록
  □ C1. 월 구독 상품 생성 (pro_monthly)
  □ C2. 연 구독 상품 생성 (pro_yearly)
  □ C3. 7일 무료 체험 설정
  □ C4. 라이선스 테스터 등록

□ 완료 후 전달할 값
  □ Vertex AI 서비스 계정 JSON
  □ AdMob 앱 ID + 배너/보상형 광고 단위 ID
  □ Play 구독 상품 ID (월/연)
```

소요 시간: 약 3~5시간 + 심사 대기(AdMob 1~2일, Play 구독 즉시~수 시간)

---

## Part A. GCP + Agent Platform (구 Vertex AI) Gemini

> ℹ️ **2026-04 리브랜딩**: Google이 Vertex AI를 "Gemini Enterprise Agent Platform"(콘솔 표시: **Agent Platform**)으로 변경. URL·SDK·기능 동일, 이름만 변경. 가이드의 "Vertex AI" 표현은 "Agent Platform"으로 읽으셔도 됩니다.

자동완성·AI 단어 생성·사진 스캔의 Gemini 호출은 Supabase Edge Function에서 운영자 키로 처리합니다. 무료 한도 의존 X, **Agent Platform 결제 등록 필수**.

### A1. GCP 프로젝트 생성

1. https://console.cloud.google.com/ 접속 → Google 계정 로그인
2. 상단 프로젝트 선택 드롭다운 → "새 프로젝트"
3. 프로젝트 이름: `soksok-voca-prod` (식별 용도)
4. 위치: 조직 없으면 비워두기
5. 만들기

> 기존에 `soksok-voca` 프로젝트가 있다면 그것을 재사용해도 됨. Google Sign-In용 OAuth 클라이언트가 이미 등록된 프로젝트와 동일 프로젝트 권장.

### A2. Agent Platform API 활성화

1. 왼쪽 메뉴 → API 및 서비스 → 라이브러리
2. **"Agent Platform API"** (또는 "Vertex AI API" — 둘 다 동일한 `aiplatform.googleapis.com`) 검색 → 클릭 → **사용 설정**
3. 직접 URL: https://console.cloud.google.com/apis/library/aiplatform.googleapis.com

> ℹ️ `Generative Language API`는 활성화 불필요. 그건 사용자가 Google AI Studio에서 자기 Gemini 키로 호출할 때(BYOK) 자동으로 쓰이는 것이고, Edge Function에서 운영자 키로 호출할 때는 Agent Platform API만 있으면 됨.

### A3. 결제 계정 등록 (필수)

Agent Platform(구 Vertex AI)은 결제 등록된 프로젝트에서만 사용 가능.

1. 왼쪽 메뉴 → 결제 → "결제 계정 연결"
2. 새 결제 계정 만들기 → 카드 정보 입력
3. **첫 사용자는 $300 크레딧(90일) 자동 제공** — 초기 비용 0
4. 결제 알림 설정: 결제 → 예산 및 알림 → 예산 만들기
   - 이름: `vertex-ai-monthly`
   - 금액: 월 $50 (DAU 1,000 기준 $1~3 예상, 안전 마진)
   - 알림 임계값: 50%, 90%, 100%

### A4. 서비스 계정 키 발급

Supabase Edge Function이 Vertex AI를 호출할 인증 자격.

1. 왼쪽 메뉴 → IAM 및 관리자 → 서비스 계정
2. "서비스 계정 만들기"
3. 이름: `vertex-ai-proxy`
4. 역할: **Agent Platform 사용자** (`Agent Platform User`, `roles/aiplatform.user`) — 구 명칭 "Vertex AI 사용자"
5. 만들기
6. 생성된 계정 클릭 → "키" 탭 → 키 추가 → JSON
7. JSON 파일 다운로드 → **안전한 곳에 보관** (이게 운영자 키)

> ⚠️ 이 JSON을 절대 git에 커밋하지 말 것. Supabase Edge Function 환경변수에만 넣음.

### A5. 일일 비용 알림 (선택, 권장)

1. 결제 → 보고서 → 일별 비용 추이 확인 가능
2. 의심스러운 비용 폭증 시 키 회수 절차:
   - IAM → 서비스 계정 → `vertex-ai-proxy` → 키 → 키 삭제
   - 즉시 호출 차단됨

### A 단계 완료 후 가질 것

- ✅ GCP 프로젝트 ID (예: `soksok-voca-prod`)
- ✅ Vertex AI 서비스 계정 JSON 파일 (예: `vertex-ai-proxy@...iam.gserviceaccount.com.json`)

---

## Part B. AdMob 앱 등록 + 광고 단위 발급

### B1. AdMob 계정 생성

1. https://admob.google.com/ 접속 → Google 계정 로그인 (GCP와 같은 계정 권장)
2. 신규면 결제 정보·세금 정보 입력 (수익 받을 계좌)

### B2. 앱 추가

1. 왼쪽 메뉴 → "앱" → "앱 추가"
2. 플랫폼: **Android**
3. "앱이 Google Play에 등록되어 있나요?" → **예** (이미 빌드/업로드된 상태)
4. 앱 이름 또는 패키지명으로 검색 → 쏙쏙 보카 선택
5. 추가 완료 → **앱 ID** 메모 (`ca-app-pub-XXXXX~XXXXX`)

### B3. 배너 광고 단위 발급

1. 앱 선택 → 광고 단위 → 광고 단위 추가
2. 광고 형식: **배너**
3. 광고 단위 이름: `Banner — All Screens`
4. eCPM 하한가: 비워둠 (자동)
5. 만들기 → **광고 단위 ID** 메모 (`ca-app-pub-XXXXX/XXXXX`)

### B4. 보상형 광고 단위 발급

1. 광고 단위 추가
2. 광고 형식: **보상형**
3. 광고 단위 이름: `Rewarded — Quota Refill`
4. 보상 설정:
   - 보상 금액: `50`
   - 보상 항목: `words`
5. 만들기 → **광고 단위 ID** 메모

### B5. 정책 동의·확인

1. 정책 센터 → GDPR·CCPA 메시지 설정 (한국이면 GDPR 메시지만 활성)
2. 앱 정보 → 카테고리 = **교육**, 대상 = **만 13세 이상**
3. 사용자 메시지: "이 앱은 광고를 표시합니다" 자동 생성됨

> ⚠️ 14세 미만 사용자에게는 광고 표시 안 함 (정책상). 코드에서 사용자 연령 체크 후 `setRequestNonPersonalizedAdsOnly(true)` 또는 광고 비활성.

> AdMob 새 광고 단위는 첫 호출 후 **활성화까지 보통 몇 시간~24시간** 소요. 첫 출시 전 미리 등록해두기.

### B 단계 완료 후 가질 것

- ✅ AdMob 앱 ID (`ca-app-pub-XXXXX~XXXXX`)
- ✅ 배너 광고 단위 ID (`ca-app-pub-XXXXX/XXXXX`)
- ✅ 보상형 광고 단위 ID (`ca-app-pub-XXXXX/XXXXX`)

---

## Part C. Play Console 인앱상품 (구독)

### C1. 월 구독 상품 생성

1. Play Console → 앱 선택 → 좌측 메뉴 → 수익 창출 → 제품 → **구독**
2. "구독 만들기"
3. 제품 ID: `pro_monthly` (코드와 합쳐야 하니 정확히)
4. 이름: `Pro 멤버십 (월간)`
5. 설명:
   ```
   모든 광고 제거
   AI 단어 추가 일 1,000단어
   언제든 해지 가능
   ```
6. 혜택:
   - 광고 제거
   - AI 단어 추가 일 1,000단어
7. 기본 요금제 추가
   - 청구 기간: 1개월
   - 결제 옵션: 자동 갱신
   - 가격: **₩3,900** (KR), 다른 국가는 자동 변환
8. 저장 → "활성화"

### C2. 연 구독 상품 생성

1. 다시 "구독 만들기"
2. 제품 ID: `pro_yearly`
3. 이름: `Pro 멤버십 (연간)`
4. 설명: 위와 동일 + "월 환산 약 2,992원, 14% 할인"
5. 혜택: 동일
6. 기본 요금제:
   - 청구 기간: 1년
   - 가격: **₩35,900** (KR)
7. 저장 → 활성화

### C3. 7일 무료 체험 설정 (둘 다 적용)

각 구독에:
1. 기본 요금제 → "혜택 추가" → "무료 체험"
2. 기간: 7일
3. 적용 대상: 신규 사용자만
4. 저장

### C4. 라이선스 테스터 등록

개발 중 결제 흐름 테스트용. 실제 결제 안 되고 가짜 결제.

1. Play Console → 설정 → 라이선스 테스트
2. 본인 Google 계정 이메일 추가
3. 라이선스 응답: `RESPOND_NORMALLY`

### C 단계 완료 후 가질 것

- ✅ 월 구독 상품 ID: `pro_monthly`
- ✅ 연 구독 상품 ID: `pro_yearly`
- ✅ 라이선스 테스터 등록된 계정

---

## 완료 후 전달할 값 (Claude에게)

작업 완료되면 아래 값을 알려주세요. 그래야 코드 작업이 가능합니다.

| 항목 | 예시 형식 | 어디에 쓰는가 |
|---|---|---|
| GCP 프로젝트 ID | `soksok-voca-prod` | Edge Function 호출 |
| Vertex AI 서비스 계정 JSON | 파일 자체 | Supabase Edge Function 환경변수 |
| AdMob 앱 ID | `ca-app-pub-XXXXX~XXXXX` | `app.json` `android.config.googleMobileAdsAppId` |
| 배너 광고 단위 ID | `ca-app-pub-XXXXX/XXXXX` | 배너 컴포넌트 |
| 보상형 광고 단위 ID | `ca-app-pub-XXXXX/XXXXX` | 보상형 광고 훅 |
| 월 구독 상품 ID | `pro_monthly` | Play Billing 통합 |
| 연 구독 상품 ID | `pro_yearly` | Play Billing 통합 |

서비스 계정 JSON은 **민감 정보**이므로 Slack/메시지로 직접 보내지 말고, 안전한 경로(예: 1Password, Bitwarden)로 보관 후 필요시 일부만 공유.

---

## 예상 비용 (운영자 부담)

| 항목 | 초기 (DAU 0~100) | 성장 (DAU 1,000) | 성숙 (DAU 10,000) |
|---|---|---|---|
| Vertex AI Gemini | $0~5/월 | $15~30/월 | $150~300/월 |
| Supabase Edge Function | 무료 (50만 호출/월 free tier) | 무료 | 약 $25/월 |
| Play Console 등록비 | $25 (일회성) | 0 | 0 |
| AdMob | 무료 | 무료 | 무료 |

GCP 첫 사용자 $300 크레딧으로 초기 6개월~1년 비용 0 가능.

---

## 주의사항

- **결제 카드 등록은 GCP + Play Console 모두 필요** (Vertex AI 사용 + Play 개발자 등록비 $25)
- **AdMob 광고 단위 활성화에 최대 24시간** — 첫 출시 전 미리 등록
- **구독 상품은 Play Console에서 "활성화" 필수** — 활성화 안 하면 결제 시도 시 오류
- **라이선스 테스터 계정 = 실제 결제 안 됨** — 출시 후 본인이 가짜 결제로 흐름 검증 가능
- 14세 미만 사용자 대응: AdMob 정책 + 한국 정보통신망법(아동 광고 제한) 둘 다 준수

---

## 다음 단계 (이 가이드 완료 후)

값 전달받으면 Claude가 다음 작업 진행:
1. Phase 1 — Naver 비공식 API 호출 제거 (즉시 시작 가능)
2. Phase 2 — Supabase Edge Function 작성 (Vertex AI 서비스 계정 필요)
3. Phase 3 — AdMob SDK + Play Billing 통합 (광고/상품 ID 필요)
4. Phase 4~6 — UI 개편, 정리, 빌드
