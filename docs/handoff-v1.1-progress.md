# v1.1 (광고·인앱구독) 작업 인수인계

작성일: 2026-05-19 (약관·정책 갱신 커밋 반영)

다음 세션으로 이어갈 인수인계 문서. v1 내부 테스트 출시 완료 + v1.1 코드 작업은 거의 마무리 단계.

---

## 한 줄 현재 상황

**v1 AAB** Play 내부 테스트 트랙 업로드 성공. **v1.1 코드 작업**은 AdMob + Pro 인앱구매 + 약관·정책까지 모두 완료. **남은 건 #14 통합 테스트 + Production AAB 재빌드** 하나 (사용자 측 인프라 사전 작업 마무리 후).

---

## 정책 확정사항 (Task #1 — 완료)

### 단계적 출시 (v1 → v1.1)

```
v1 (출시 완료): 3-tier 골격
   • Free (게스트 + 로그인 무료)
   • BYOK (자기 Gemini 키, 고급 설정에 격하 완료)
   • Pro 미구현 — 인앱구매 통합 후 활성화

v1.1 (코드 완료, 인프라 대기): 3-tier + 광고 + 결제
   • Free: 배너 광고 + AI 단어 추가 일 100단어
       한도 초과 시 보상형 광고 → +50단어 (선택)
       일 절대 상한 300단어
   • BYOK: 배너 광고 + 자기 키 무제한 (설정 → 고급 설정)
   • Pro: 월 3,900원 / 연 35,900원 (14% 할인)
       모든 광고 제거 + AI 단어 추가 일 1,000단어
       7일 무료 체험 (자동 결제 X)
   • 신규 가입 첫 7일: 배너 없음
   • 14세 미만: 광고 비활성

v1.2 (이후): Pro Lite 추가 검토
   • BYOK 등록자 한정 광고 제거 옵션
   • 월 1,900원 / 연 17,900원
```

### 단위 표기
사용자에게 보여줄 단위 = **"단어 수"** (포인트 X)
- 자동완성 1단어 = 1단어 카운트
- AI 단어 생성 1세트 = 20단어 카운트
- 사진 스캔 1장 = 약 15단어 카운트 (OCR 오버헤드는 운영자 흡수)

---

## 완료된 코드 작업 (커밋됨)

| 커밋 | 작업 |
|---|---|
| `d1acef5` | Naver 비공식 API 제거 + Datamuse 분리 |
| `24e74cb` | 어린왕자 큐레이션 제거 + Alice/Sherlock PD 출처 명시 |
| `6b85162` | 오픈소스 및 데이터 출처 페이지 추가 (`app/licenses.tsx`) |
| `4453c7e` | v1.1 정책·인프라 가이드 + CLAUDE.md 갱신 |
| `0d69260` | Play Console 최종 스크린샷 추가 |
| `8d74ac8` | **FAQ v1.1 정책 반영** (#10 완료) |
| `af3bde4` | **AI quota Edge Function 도입** — Vertex AI + 사용자별 일일 한도 (#3·#6 완료) |
| `d2e6738` | **설정 UI 개편** — 요금제 화면 + BYOK 고급 설정 격하 (#7 완료) |
| `a530683` | **#4 AdMob SDK 통합** — 배너 (8개 화면) + 보상형 모달 + 한도 카운터 + 클라이언트 RPC grant 마이그레이션 |
| `09cee4a` | **#5 Pro 인앱구매 골격** — expo-iap + plans.tsx 결제 흐름 + verify-purchase Edge Function |
| `83509b5` | **#11 약관·개인정보·계정삭제 페이지** — 광고·결제 조항 반영 |

### #4 작업 상세 (`a530683`)

신규/수정 파일:
- `package.json` — `react-native-google-mobile-ads ^15.4.0` 추가
- `app.config.js` — AdMob Expo plugin 등록 + `EXPO_PUBLIC_ADMOB_*_APP_ID` env → 테스트 App ID fallback
- `lib/ads/admob.ts` — 광고 단위 ID resolver (`AD_UNIT_BANNER`, `AD_UNIT_REWARDED`) + `initAdMob()` + `isAdsAllowed()` 가드 (Pro/트라이얼/under14 차단)
- `features/quota/store.ts` — 전역 quota Zustand 스토어 + `notifyQuotaExceeded` 이벤트
- `components/ads/AppBannerAd.tsx` — `mode='tab-anchor' | 'bottom-anchor' | 'inline'` 배너
- `components/ads/RewardedAdModal.tsx` — Free 한도 초과 시 보상형 광고 + `grant_rewarded_bonus` RPC 호출
- `supabase/migrations/20260519000000_quota_status_client_grant.sql` — `get_ai_quota_status` / `grant_rewarded_bonus`를 authenticated 클라이언트에 grant + `auth.uid()` 검증
- `lib/ai/edge-enrich.ts` — quota_exceeded 응답 시 store에 신호
- `app/_layout.tsx` — `initAdMob()` 호출 + 로그인 시 quota refresh + 글로벌 `RewardedAdModal` 마운트
- `app/plans.tsx` — 새 quota store로 마이그레이션
- `app/add-word.tsx` — 헤더 우측에 한도 chip (`Free + non-BYOK + 로그인` 조건)
- `i18n/locales/{ko,en}.json` — `ads.*` 키 신설
- 배너 통합 화면:
  - 탭 4개 (`mode="tab-anchor"`): `app/(tabs)/index.tsx`, `vocab-lists.tsx`, `settings.tsx`, `features/curation/screen.tsx`
  - 학습 모드 4개 (`mode="bottom-anchor"`, **TODO: 답 버튼 16dp 정밀 보정 follow-up**): `features/study/{flashcards,quiz,examples,autoplay}/screen.tsx`

### #5 작업 상세 (`09cee4a`)

신규/수정 파일:
- `package.json` — `expo-iap ^3.1.23` 추가
- `app.json` — `expo-iap` plugin 등록
- `lib/billing/skus.ts` — `SKU_PRO_MONTHLY` / `SKU_PRO_YEARLY` 상수 (env override)
- `features/billing/usePurchaseFlow.ts` — useIAP wrapper. `connected/products/stage/error` + `buy/restore`
- `app/plans.tsx` — '곧 출시' Alert 제거 → 월/연 구매 버튼 + 복원 + 성공/실패 Alert
- `i18n/locales/{ko,en}.json` — `plans.subscribeYearlyCta/MonthlyCta/restoreCta` 등 추가
- `supabase/functions/_shared/google-auth.ts` — 범용 Google SA OAuth2 토큰 발급
- `supabase/functions/verify-purchase/index.ts` — Play Developer API로 subscription 검증 + `user_subscriptions` 업데이트
- `supabase/functions/verify-purchase/README.md` — Play API 서비스 계정 등록 + Secret + deploy 가이드
- `CLAUDE.md` — 환경변수 섹션 갱신 (AdMob + Play SKU)

### #11 작업 상세 (`83509b5`)

- `i18n/locales/{ko,en}.json` — "AI 기능 및 일일 한도" / "Pro 구독 및 결제" / "광고" 섹션 신설 + "개인정보" 보강
- `docs/privacy-policy.html` — 수집 항목/제3자 위탁/앱 권한 표 보강, "5-1. Pro 구독 결제 및 환불" 섹션 신설, 14세 미만 광고 비활성 명시
- `docs/account-deletion.html` — "3-1. Pro 구독 사용자 안내" 신설 (계정 삭제 ≠ 구독 자동 해지)

> 미커밋: `.claude/settings.local.json` (로컬 설정, 커밋 X).

---

## 남은 작업 (v1.1)

### 코드 작업

| Task | 작업 | 상태 | 차단 |
|---|---|---|---|
| ~~#4~~ | ~~AdMob SDK 통합 + 배너 + 보상형~~ | ✅ 완료 (테스트 ID) | 실 ID는 EAS Secret 등록만 |
| ~~#5~~ | ~~Pro 인앱구매 통합 + 영수증 검증~~ | ✅ 완료 (Android) | Play 상품 등록 + Play SA + Edge deploy 필요 |
| ~~#10~~ | ~~FAQ v1.1 정책 반영~~ | ✅ | — |
| ~~#11~~ | ~~약관·개인정보·계정삭제 갱신~~ | ✅ | — |
| **#14** | **통합 테스트 + Production AAB 재빌드** | 🟡 시작 가능 | 사용자 측 인프라 사전 작업 완료 후 의미 있음 |

### Follow-up (출시 차단 위험 / v1.2)

| 항목 | 우선순위 | 비고 |
|---|---|---|
| **학습 화면 답 버튼 16dp 정밀 보정** | 🔴 **출시 차단 위험** | flashcards/quiz/examples/autoplay 4개 화면. AdMob 정책 위반 시 광고 거부 가능. 각 화면 답 영역 wrapper에 `paddingBottom = insets.bottom + BANNER_SLOT_HEIGHT + 16` 추가. TODO 코멘트로 표시되어 있음 |
| **iOS Liquid Glass NativeTabs 배너** | 🟡 iOS 출시 시 | Android 출시엔 영향 없음. iOS 출시 결정 시 `app/(tabs)/_layout.tsx`의 NativeTabLayout 경로 검토 |
| **AdMob SSV(서버측 검증)** | 🟡 v1.2 | 현재 클라이언트가 직접 `grant_rewarded_bonus` RPC 호출. 일 cap 200으로 어뷰징 제한. SSV 통합 시 어뷰징 완전 차단 |
| **iOS StoreKit 검증** | 🟡 v1.2 | `verify-purchase`가 platform='android'만 허용. iOS StoreKit 2 JWS 검증 (`@apple/server-api-jws`) 추가 필요 |
| **실시간 갱신 알림(RTDN) webhook** | 🟡 v1.2 | Pub/Sub topic + Edge webhook. 취소/환불 즉시 반영. 현재는 만료 시점까지 Pro 유지 |
| **`finishTransaction` 타이밍** | 🟢 동작은 OK | verify 실패 시 미finished 상태 유지 → Play가 재전송할 가능성. 다음 진입 시 동일 토큰 재검증 (현 흐름이 처리) |

---

## 사용자 측 진행 상황 (운영자 작업)

### Play Console v1 등록 — ✅ 완료

| 단계 | 상태 |
|---|---|
| 1. 앱 생성 | ✅ |
| 2. 정책 선언 10개 | ✅ |
| 3. 스토어 등록정보 | ✅ |
| 4. AAB 업로드 (내부 테스트 트랙) | ✅ 광고 ID '사용 안 함'으로 변경 후 성공 |
| 5. SHA-1 → Google OAuth 등록 | ⏳ 확인 필요 |
| 6. 본인 기기 옵트인·설치·검증 | ⏳ 확인 필요 |

> v1.1 빌드 업로드 시 광고 ID 선언을 다시 **"사용함"** 으로 변경 + 데이터 보안 폼에 광고 ID·구매 내역 추가.

### Part A — GCP Agent Platform (구 Vertex AI) ✅ 완료
| 항목 | 값 |
|---|---|
| Agent Platform API | ✅ 활성화 |
| 결제 등록 | ✅ |
| 서비스 계정 | `avocado-ai-proxy@<project>.iam.gserviceaccount.com` |
| 역할 | `roles/aiplatform.user` |
| JSON 키 | ✅ 발급·보관 |

### Part B — AdMob ⏳ 미완료 (v1.1 출시 차단)

- [ ] AdMob 앱 등록 → App ID (Android) 발급
- [ ] 배너 광고 단위 ID 발급
- [ ] 보상형 광고 단위 ID 발급
- [ ] EAS Secret 등록:
  - `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID`
  - `EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID`
  - `EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID`

> 신규 광고 단위는 활성화까지 ~24시간. 테스트 ID로 동작 검증은 이미 가능.

### Part C — Play 인앱구독 ⏳ 미완료 (v1.1 출시 차단)

- [ ] Play Console에 구독 상품 등록:
  - `pro_monthly` (₩3,900/월)
  - `pro_yearly` (₩35,900/연)
- [ ] 각 상품에 7일 무료 체험 offer 추가
- [ ] 라이선스 테스터 등록 (테스트 결제용)

### Part D — Play Developer API 서비스 계정 ⏳ 미완료 (`verify-purchase` 동작 조건)

- [ ] GCP Console에서 별도 서비스 계정 생성 (Vertex와 분리 권장)
  - 이름 예: `soksok-play-verify`
- [ ] JSON 키 다운로드
- [ ] Play Console → 설정 → API 접근에서 Cloud 프로젝트 연결 + 위 SA에 권한 부여 (재무 데이터/주문/구독 보기)
- [ ] 권한 반영 대기 (~24시간)

자세한 절차: `supabase/functions/verify-purchase/README.md`

### Part E — Supabase ⏳ 미완료

- [ ] Supabase CLI 설치 + `supabase login` + `supabase link --project-ref <ref>`
- [ ] DB 마이그레이션 적용: `supabase db push`
  - `supabase/migrations/20260518000000_ai_quota.sql`
  - `supabase/migrations/20260519000000_quota_status_client_grant.sql`
- [ ] Secret 등록:
  - **enrich-word용**: `VERTEX_PROJECT_ID`, `VERTEX_LOCATION`, `VERTEX_SA_CLIENT_EMAIL`, `VERTEX_SA_PRIVATE_KEY`
  - **verify-purchase용**: `PLAY_SA_CLIENT_EMAIL`, `PLAY_SA_PRIVATE_KEY`, `ANDROID_PACKAGE_NAME=com.soksokvoca`
- [ ] Edge Function 배포:
  - `supabase functions deploy enrich-word`
  - `supabase functions deploy verify-purchase`
- [ ] 앱 환경변수 `EXPO_PUBLIC_ENRICH_VIA_EDGE=1` (EAS Secret)
- [ ] GCP Budget cap (월 $20 등) + Vertex AI Quotas cap 권장

### Part F — 패키지 보정 ⏳ 미완료 (개발자 측)

- [ ] `pnpm install` — OneDrive 이슈로 직접 편집한 의존성(react-native-google-mobile-ads, expo-iap) 잠금파일 보정
- [ ] `pnpm lint` — 변경분 점검
- [ ] EAS dev build (네이티브 모듈 포함이라 새 빌드 필요)

---

## 작업 의존도 그래프

```
Phase 0 (사용자 인프라, 병렬 — Part B·C·D·E 미완)
   • Part B AdMob 등록·광고 단위 발급
   • Part C Play 인앱구독 등록
   • Part D Play Developer API SA 생성·권한 부여
   • Part E Supabase 마이그레이션 + Secret + Edge deploy

Phase 1 ✅ 완료
   • #10 FAQ 전면 개정
   • #3 Edge Function 코드 (enrich-word)
   • #6 클라이언트 enrich 흐름 교체
   • #7 설정 UI 개편

Phase 2 ✅ 완료
   • #4 AdMob SDK 통합 (배너 + 보상형 + 한도 카운터)
   • #5 Pro 인앱구매 통합 (verify-purchase Edge Function 포함)

Phase 3 ✅ 완료
   • #11 약관·개인정보·계정삭제 페이지 갱신

Phase 4 (Part B~E 완료 후) ← 다음 작업
   • 학습 화면 답 버튼 16dp 정밀 보정 (출시 차단 위험)
   • #14 통합 테스트 + Production AAB 재빌드 → 내부 테스트 트랙 업데이트
   • 데이터 보안 폼 갱신 (광고 ID + 구매 내역)
   • 콘텐츠 등급 설문 재답변 (디지털 구매·광고 = 예)
```

---

## 다음 세션에서 진행할 작업 (우선순위 순)

### A. 사용자 측 진척 확인 (대화 시작 시 묻기)

- [ ] **Part B (AdMob)** — 광고 단위 ID 발급 완료? EAS Secret 등록 완료?
- [ ] **Part C (Play 구독)** — `pro_monthly`/`pro_yearly` 상품 등록 + 7일 trial offer 완료?
- [ ] **Part D (Play Developer API SA)** — 서비스 계정 생성 + Play Console 권한 부여 (~24h 반영)?
- [ ] **Part E (Supabase)** — `db push` + Secret 6종 + `enrich-word`/`verify-purchase` deploy 완료?
- [ ] **Part F (`pnpm install`)** — OneDrive 직접 편집한 의존성 보정 완료?

### B. 코드 작업 (사용자 사전 작업과 병렬 진행 가능)

#### B-1. 🔴 학습 화면 답 버튼 16dp 정밀 보정 — **즉시 시작 권장**

**왜 우선**: AdMob 정책 위반 시 광고 거부 → 출시 차단 위험. 의존성 없이 즉시 가능.

작업 대상 4개 화면:
- `features/study/flashcards/screen.tsx`
- `features/study/quiz/screen.tsx`
- `features/study/examples/screen.tsx`
- `features/study/autoplay/screen.tsx`

각 화면에 이미 `// TODO(#4): bottom-anchor 배너 + 답 버튼 영역 paddingBottom = insets.bottom + BANNER_SLOT_HEIGHT + 16 정밀 보정` 코멘트 있음.

수정 패턴:
1. 답 버튼이 들어가는 wrapper View (flex column 마지막에 있는 답 버튼 영역) 찾기
2. 그 wrapper의 `paddingBottom`을 `insets.bottom + BANNER_SLOT_HEIGHT + 16`으로 변경
3. `BANNER_SLOT_HEIGHT`는 `@/components/ads/AppBannerAd`에서 import
4. 광고 가드(`useQuota` + `useAuth`)로 광고 없을 때는 `insets.bottom`만 적용 — 빈 공간 회피
   - 단순화 옵션: 항상 50px 보정 (광고 없을 때 50px 추가 공간만 발생, UX 손상 최소)

#### B-2. 🟡 14세 미만 자가 신고 동의 흐름

**왜 필요**: `isAdsAllowed`의 `isUnder14`가 현재 하드코딩 `false`. AdMob 정책 + KR 아동 보호 규정상 14세 미만은 광고 비활성 필수.

옵션:
- 가장 가벼운: `ProfileSettings`에 `isUnder14: boolean` 추가 + 설정 화면에 토글 (자가 신고)
- 표준: 약관 동의 onboarding 단계에 만 14세 미만 체크박스
- 엄격: 생년 입력 → 만 나이 자동 계산

v1.1 출시 단계는 가장 가벼운 옵션으로 충분. v1.2에서 강화.

수정 지점:
- `shared/contracts` `ProfileSettingsSchema`에 필드 추가
- `features/settings/store.ts` 기본값
- `components/ads/AppBannerAd.tsx` 의 `useAuth + useSettings`로 isUnder14 주입
- `app/(tabs)/settings.tsx`에 토글 UI

#### B-3. 🟡 Pro 한도 초과 UX

**증상**: Pro 사용자가 1,000단어/일 초과 시 현재 fallback 동작(영어 dictionaryapi 또는 빈 결과). "내일 다시" 안내 없음.

수정:
- `lib/translation-api.ts:autoFillWord`에서 quota_exceeded + tier='pro'면 별도 상태로 분리
- `useQuotaStore`에 `proLimitReachedAt` 필드 추가
- RewardedAdModal과는 별개의 모달 (Pro는 광고 시청 X — Pro 약속 무결성)
- 또는 단순히 plans.tsx로 리다이렉트하지 않고 Snackbar로 "내일 자정 초기화" 안내

### C. 통합 테스트 (Part B~E 완료 후, B-1·B-2 완료 후)

EAS dev build로 다음 시나리오 검증:

1. **배너 가드** — Free/Pro/게스트/under14 각 케이스에서 배너 노출/숨김 검증
2. **보상형 광고** — Free 한도 100단어 초과 → 자동 모달 → 시청 → +50 단어 → 추가 enrich 동작 확인
3. **보상형 일 cap** — 보상 4회(+200) 후엔 모달이 "오늘 광고 보너스 상한" 메시지 표시
4. **Pro 구독** — 월/연 각각 결제 → verify-purchase 응답 ok → tier='pro' 반영 + 광고 제거
5. **Pro 트라이얼** — 신규 가입 7일 트라이얼 → Pro 동급 동작
6. **Pro 복원** — 앱 재설치 후 "이전 구매 복원" → tier='pro' 복원
7. **Pro 한도 초과** — 1,000단어 초과 시 UX (B-3 완료 후)
8. **KST 자정 초기화** — 한국 표준시 자정에 사용량 0으로 리셋

### D. Production AAB 빌드 + 출시

1. `EAS_SKIP_AUTO_FINGERPRINT=1` + `eas build --profile production --platform android`
2. Play Console 정책 갱신:
   - 광고 ID 선언 '사용함'으로 변경
   - 데이터 보안 폼: 광고 ID + 구매 내역 + Pro 구독 데이터 추가
   - 콘텐츠 등급 설문: "디지털 구매 = 예", "광고 = 예" 재답변
3. `eas submit -p android --latest` → 내부 테스트 트랙
4. 본인 기기 옵트인·설치·검증

### v1.2로 미루는 항목

- iOS Liquid Glass NativeTabs 배너
- AdMob SSV(서버측 검증)
- iOS StoreKit 검증 (verify-purchase iOS 지원)
- 실시간 갱신 알림(RTDN) webhook

---

## 알려진 이슈 / 주의사항

### Play Console 정책 (v1.1 업로드 시 필수)
- **광고 ID 선언**: '사용함'으로 다시 변경 (v1.1엔 AdMob SDK 포함 → `AD_ID` 권한 자동 매니페스트)
- **데이터 보안 폼**: "광고 ID 수집" + "구매 내역 수집" + "Pro 구독 관련 데이터" 추가
- **콘텐츠 등급 설문**: "디지털 구매 = 예", "광고 = 예"로 재답변 필요할 수 있음

### AdMob 정책 (출시 차단 위험)
- 신규 광고 단위는 활성화까지 ~24시간
- 14세 미만 사용자에게는 광고 비활성 — **현재 코드는 가드 함수에 `isUnder14: false` 하드코딩**. 약관 동의 흐름에 생년/만 14세 미만 자가 신고 추가 필요 (v1.1 출시 전 권장, 또는 v1.1엔 모두 광고 노출 + v1.2에 동의 흐름)
- **학습 화면 배너 16dp 간격** — 답 버튼과 거리 미흡. 정밀 보정 follow-up 필수

### Pro 결제 UX
- Pro 사용자가 1,000단어 한도 초과 → 현재 fallback 동작(영어 dictionaryapi 또는 빈 결과). "내일 다시" 안내 메시지가 없어 UX 개선 follow-up 권장
- Pro 구독 활성 상태에서 plans.tsx의 구매 버튼은 숨김 처리됨 (코드 확인됨)

### EAS 빌드
- `EAS_SKIP_AUTO_FINGERPRINT=1` 환경변수 다음 빌드에도 필요 (brace-expansion 이슈, 출시 후 해결)
- versionCode 자동 증분 (3 → 4 → ...)
- GOOGLE_SERVICES_JSON EAS Secret으로 주입됨
- AdMob plugin이 추가됐으므로 dev build 캐시 무효화 필수

### Supabase 마이그레이션
- 마이그레이션 2개를 순서대로 적용:
  1. `20260518000000_ai_quota.sql` (user_subscriptions, ai_usage_daily, RPC들)
  2. `20260519000000_quota_status_client_grant.sql` (클라이언트 RPC grant 보강)
- 마이그레이션 미적용 상태에서 클라이언트가 RPC 호출하면 권한 에러

### CLAUDE.md "No backend server" 정책
- Supabase Edge Function은 BaaS 서버리스라 정책 준수 OK
- Express 서버 부활 아님

### 큐레이션
- 어린 왕자 단어장 제거 완료
- Alice/Sherlock은 PD 명시 (한국·전세계 PD)
- 큐레이션 신고 기능 v1.x에서 추가 권장 (UGC 정책 강화)

---

## 환경/계정 메모

| 항목 | 값 |
|---|---|
| Expo/EAS 프로젝트 | `@baekeunjoeng/soksok-voca` |
| Expo projectId | `2d560de2-a41b-4ac1-a019-d287f7aaa2d6` |
| Play 패키지명 | `com.soksokvoca` |
| Firebase 프로젝트 | `avocado-491710` |
| GCP 프로젝트 (Agent Platform) | 사용자가 별도 보관 |
| 서비스 계정 (Vertex) | `avocado-ai-proxy@...iam.gserviceaccount.com` |
| 서비스 계정 (Play Verify) | ⏳ 신규 생성 필요 — `soksok-play-verify@...iam.gserviceaccount.com` 권장 |
| Supabase URL | `https://ithqbclnwvyeultkyxbn.supabase.co` |
| 개인정보 처리방침 | https://eunjbaek12.github.io/NewSokSok/privacy-policy.html |
| 계정 삭제 안내 | https://eunjbaek12.github.io/NewSokSok/account-deletion.html |
| v1 AAB | https://expo.dev/artifacts/eas/jSwoo5f88KR1C2jf4PMXL8.aab |
| 출시 가격 | Pro 월 3,900원 / 연 35,900원 |
| Pro 상품 SKU | `pro_monthly`, `pro_yearly` (env override 가능) |

---

## 빠른 명령 모음

```bash
# === 개발자 측 ===
# 의존성 보정 (OneDrive 이슈로 직접 편집한 package.json)
pnpm install
pnpm lint

# 빌드 상태
eas build:list --platform android --limit 3

# 새 빌드 (v1.1) — AdMob/expo-iap 네이티브 모듈 포함이라 dev/production 모두 새 빌드 필요
$env:EAS_SKIP_AUTO_FINGERPRINT=1; eas build --profile production --platform android --non-interactive

# Secret 점검
eas env:list production

# 자격증명
eas credentials --platform android

# Play 제출
eas submit -p android --latest

# === 사용자 측 (Supabase) ===
# CLI 설치
scoop install supabase

# 로그인 + 프로젝트 연결
supabase login
supabase link --project-ref ithqbclnwvyeultkyxbn

# 마이그레이션 적용 (2개 순서대로 자동 적용)
supabase db push

# Secret 등록 예시
supabase secrets set \
  VERTEX_PROJECT_ID=<project> \
  VERTEX_LOCATION=us-central1 \
  PLAY_SA_CLIENT_EMAIL=soksok-play-verify@<project>.iam.gserviceaccount.com \
  ANDROID_PACKAGE_NAME=com.soksokvoca
# private key는 파일에서 추출 (jq 사용 시)
supabase secrets set VERTEX_SA_PRIVATE_KEY="$(cat vertex-key.json | jq -r .private_key)"
supabase secrets set PLAY_SA_PRIVATE_KEY="$(cat play-key.json | jq -r .private_key)"

# Edge Function 배포
supabase functions deploy enrich-word
supabase functions deploy verify-purchase
```

---

## 참고 문서

- `CLAUDE.md` — 코드 정책 (모네타이제이션 섹션 포함)
- `docs/handoff-play-release.md` — v1 빌드 시점 인수인계 (2026-05-15)
- `docs/handoff-monetization-setup.md` — 사용자 인프라 가이드 (GCP·AdMob·Play 인앱)
- `docs/handoff-play-console-setup.md` — Play Console 등록 가이드
- `supabase/functions/enrich-word/README.md` — enrich-word Edge Function deploy 가이드
- `supabase/functions/verify-purchase/README.md` — verify-purchase Edge Function deploy 가이드 + Play SA 등록 절차
- `store-assets/` — 스토어 자산 (스크린샷·아이콘·그래픽·정책 답변지)
