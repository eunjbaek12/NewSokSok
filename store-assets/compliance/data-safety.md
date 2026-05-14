# Data Safety 폼 답변지

Play Console → 앱 콘텐츠 → **Data Safety** 설문에 그대로 답변하면 됩니다.

근거: `features/auth/store.ts`, `features/sync/engine.ts`, `lib/db/migrations/`, `components/PhotoImportWorkflow.tsx`, `app.json` 권한.

---

## 1. 데이터 수집 및 공유

### Q. 이 앱이 사용자 데이터를 수집하거나 공유하나요?
**예 (Yes)** — Google 로그인 사용자의 계정 정보와 사용자가 입력한 학습 콘텐츠를 Supabase 클라우드에 저장.

(게스트 모드 사용자는 기기 내 로컬 저장만 — 그 경우 데이터 수집 없음. 하지만 Play의 Data Safety는 *앱이 수집할 가능성이 있는 모든 데이터*를 신고해야 하므로 "수집함" 으로 답변.)

### Q. 모든 데이터 수집과 공유가 [Play 정책](https://support.google.com/googleplay/android-developer/answer/10787469)을 준수하나요?
**예 (Yes)**

### Q. 사용자가 데이터 삭제를 요청할 수 있나요?
**예, 앱 내에서 계정 삭제 기능 제공 (Yes, in-app account deletion)**
- 위치: 설정 → 계정 → 탈퇴
- 구현: `features/auth/store.ts` `deleteAccount()` 함수

### Q. 전송 중 데이터가 암호화되나요?
**예 (Yes)** — Supabase API 호출은 HTTPS/TLS, Google 로그인은 OAuth 표준.

---

## 2. 수집·공유 데이터 카테고리

각 카테고리에 대해 다음을 답합니다:
- **Collected**: 수집 여부
- **Shared**: 제3자와 공유 여부
- **Optional / Required**: 사용자가 선택할 수 있는지
- **Processed ephemerally**: 임시 처리만 하고 저장 안 하는지
- **Purpose**: 사용 목적 (앱 기능 / 계정 관리 / 분석 / 광고 / 개인화 등)

### 📧 개인 정보 (Personal info)

**이메일 주소 (Email address)**
- Collected: ✅ Yes
- Shared: ❌ No (Supabase는 서비스 운영을 위한 데이터 처리자, 광고·마케팅 목적 외부 공유 아님)
- Optional: ❌ Required (Google 로그인 사용 시)
- Purpose: **Account management** (계정 식별/로그인)

**이름 (Name)**
- Collected: ✅ Yes (Google 계정의 full_name)
- Shared: ❌ No
- Optional: ❌ Required (Google 로그인 시 자동 제공)
- Purpose: **Account management, App functionality** (앱 내 표시·큐레이션 공유자명)

**사용자 ID (User IDs)**
- Collected: ✅ Yes (Supabase auth.uid())
- Shared: ❌ No
- Optional: ❌ Required
- Purpose: **Account management**

> ❌ 수집 안 함: 주소, 전화번호, 인종/민족, 정치적·종교적 신념, 성적 지향, 기타 개인정보

### 📸 사진 및 동영상 (Photos and videos)

**사진 (Photos)**
- Collected: ✅ Yes (사진 스캔 기능 사용 시)
- Shared: ✅ Yes — **Google (Gemini API)**
- Optional: ✅ Optional (사용자가 사진 스캔 기능을 사용할 때만)
- Processed ephemerally: ✅ Yes — 사진은 사용자의 본인 Gemini API 키로 직접 전송, 우리 서버를 거치지 않고 OCR 결과만 받음. 사진 자체는 우리 시스템에 저장 안 됨.
- Purpose: **App functionality** (OCR로 단어 추출)

> ❌ 동영상: 수집 안 함

### 🎤 오디오 파일 (Audio files)

**음성 또는 사운드 녹음 (Voice or sound recordings)**
- Collected: ⚠️ Yes — 음성 입력 기능 (마이크 권한)
- Shared: ❌ No (기기 내 음성 인식 또는 OS의 Speech Recognition 사용)
- Optional: ✅ Optional (사용자가 음성 입력 기능 사용 시)
- Processed ephemerally: ✅ Yes — 인식된 텍스트만 사용, 오디오 데이터 자체는 저장 안 함
- Purpose: **App functionality** (음성을 텍스트로 변환해 단어 입력)

### 📚 앱 활동 (App activity)

**앱 내 검색 기록 (In-app search history)**
- Collected: ✅ Yes (단어장 검색)
- Shared: ❌ No (로컬 저장만, 클라우드 동기화에도 포함 안 됨)
- Purpose: **App functionality**

**사용자가 생성한 콘텐츠 (User-generated content)**
- Collected: ✅ Yes — 단어, 단어장, 학습 결과
- Shared: ⚠️ 조건부 — 큐레이션 공유 기능 사용 시 **다른 사용자에게 공개**
- Optional: ✅ Optional for sharing (공유는 사용자가 선택)
- Purpose: **App functionality, Personalization** (학습 데이터 클라우드 동기화 + 선택적 공유)

**기타 사용자 활동 (Other user-generated content)**
- 학습률·암기율 통계, 별표·즐겨찾기, 학습 일정
- Same handling as above

### 🚫 수집/공유 안 하는 카테고리 (명시적으로 "No" 답변)

- **재무 정보** (결제·신용카드·구매내역): 인앱 결제 없음
- **위치 정보**: 사용 안 함 (`expo-location` 의존성 제거 — 위치 권한 미요청)
- **건강·피트니스**
- **메시지** (SMS, 채팅)
- **연락처**
- **달력**
- **기기/기타 ID** (Advertising ID 등 — 사용 안 함)
- **분석/광고 데이터**: Firebase Analytics·Crashlytics·Sentry 등 트래킹 SDK 미설치

---

## 3. 보안 관행 (Security practices)

### 데이터가 전송 중 암호화되나요?
✅ Yes (HTTPS/TLS via Supabase SDK + Google OAuth)

### 데이터 삭제 메커니즘이 있나요?
✅ Yes — 앱 내 계정 삭제 기능 제공

### 보안 검토를 받았나요?
- 독립 보안 검토는 받지 않음 (개인/소규모 앱)
- 답변: **No, but follow standard practices** 또는 해당 항목 비워둠

---

## 4. 종합 답변 요약표

Play Console에 입력할 때 빠르게 참고:

| 항목 | 답변 |
|---|---|
| 데이터 수집 여부 | Yes |
| 데이터 공유 여부 | Yes (사용자 선택 시: 사진→Gemini, 콘텐츠→커뮤니티) |
| 사용자 데이터 삭제 가능 | Yes (in-app) |
| 전송 중 암호화 | Yes |
| 광고 ID 사용 | No |
| 트래킹/분석 SDK | No |
| 인앱 결제 | No |
