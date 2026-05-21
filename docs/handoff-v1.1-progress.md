# v1.1 (광고·인앱구독) 작업 인수인계

작성일: 2026-05-20 (B-4 롤백 — 한국 학습 앱 표준 미수집 패턴 채택)

다음 세션으로 이어갈 인수인계 문서. v1.1 코드·인프라·UI 일관성 완료. **다음 세션은 dev build reload 검증 → Production AAB 빌드**.

> **2026-05-20 갱신**: B-4 (온보딩 생년월일 게이트) 롤백. 자가 신고 생년월일 실효성 부재 + 한국 학습 앱 표준 미수집 패턴 채택(클래스카드/산타토익/해커스 등 동일). 운영자 ignorance 보호는 약관·처리방침 명시 + AdMob 태그 중립화(`tagForChildDirectedTreatment` 필드 생략)로 전환. Play Console target audience 14세+ 설정은 운영자 후속 작업.

---

## 한 줄 현재 상황

**v1.1 코드(기능 + UI 일관성) + 사용자 인프라(A/B/D/E/F) 모두 완료. B-4 게이트는 롤백.** Part B(AdMob)·Part D(Play SA) 활성화 24h 만료(2026-05-20). dev server reload만 하면 새 코드 반영. 남은 건 검증 → Production AAB 빌드 → Play 업로드 → Part C(구독 등록) → 내부 테스트 트랙 제출. **운영자 후속 작업**: Play Console "Target audience" 14세+ 설정.

---

## 다음 세션 즉시 진행할 작업

> **출시 범위 결정**: v1.1은 **한국 first** (Play Console "Countries"에서 한국만 선택). 다국어(ko/en)는 한국 내 외국인 사용자(영어 학습용) 대응으로 유지. 글로벌 확장은 v1.2 별도 작업.
> **이전 세션 갱신**: B-4 (온보딩 생년월일 게이트) 롤백 완료(`1fb6e17`). 약관·처리방침 명시 + AdMob 태그 중립화로 한국 학습 앱 표준에 맞춤. Play Console 운영자 후속 작업 남음.

---

### A. 잔여 검증 (dev server reload, 5분)

사용자가 이미 부분 검증 완료:
- ✅ 설정 화면 "생년월일" row 사라짐

남은 빠른 체크:
- [ ] **신규 사용자 흐름** — 설정 → 개발자 섹션 → "온보딩 다시 보기" → 앱 재시작 → 4슬라이드 → "시작하기" → **/login 직행 (age-gate 미발화)**
- [ ] **광고 정상 노출** — Free 모드 탭에서 테스트 배너 보이는지
- [ ] **약관 화면** — 설정 → 이용약관 → sections[1] 위치에 "이용 대상 연령" 표시

이전 세션 검증 완료(여전히 유효):
- ✅ 배너 가드 (게스트 모드)
- ✅ 학습 화면 4종 배너 16dp 간격 + UI 일관성
- ✅ 퀴즈/예문학습 카드↔선택지 가로폭 정렬

검증 미완 (Production AAB 후 가능):
- ⏳ **Pro 결제 흐름** — Production AAB + Play 구독 상품 등록 후 가능
- ⏳ **보상형 광고** — Free 한도 100단어 초과 → 자동 모달
- ⏳ **Pro 한도 모달** — Pro 사용자 1,000단어 초과 시 안내
- ⏳ **KST 자정 초기화** — 한국 표준시 자정 사용량 리셋

---

### B. GitHub Pages privacy-policy.html 갱신 push (1분)

`docs/privacy-policy.html` §7이 B-4 롤백 반영해 새 본문으로 변경됨 (이미 `1fb6e17`에 포함). GitHub Pages는 push만 하면 자동 배포.

```bash
git push origin main
# 1~2분 후 https://eunjbaek12.github.io/NewSokSok/privacy-policy.html §7이 새 문구로 렌더되는지 브라우저 확인
```

→ Play Console 데이터 보안 폼 점검 시점에 정책 페이지 최신 상태여야 함. 다음 작업 D보다 먼저.

---

### C. Production AAB 빌드 (15~25분, 백그라운드)

```powershell
$env:EAS_SKIP_AUTO_FINGERPRINT=1
eas build --profile production --platform android --non-interactive
```

- versionCode 자동 증분
- GOOGLE_SERVICES_JSON·AdMob·Supabase Secret 이미 등록되어 자동 주입
- 빌드 진행 중 D·E 병렬 가능

---

### D. Play Console 정책 갱신 (운영자 작업, 5~10분)

| 항목 | 값 |
|---|---|
| **Target audience** | "13세 이상" 또는 "성인" 선택 (mixed audience 분류 회피) |
| **Countries** | 한국만 선택 (v1.2 글로벌 확장 시 추가) |
| **광고 ID 선언** | '사용함'으로 변경 (v1.1엔 AdMob SDK 포함 → AD_ID 권한 매니페스트) |
| **데이터 보안 폼** | "광고 ID" + "구매 내역" + "Pro 구독" 추가. **생년월일은 미포함** (수집 안 함) |
| **콘텐츠 등급 설문** | "디지털 구매 = 예", "광고 = 예" 재답변 |
| **개인정보 처리방침 URL** | 변경 없음 (https://eunjbaek12.github.io/NewSokSok/privacy-policy.html) — B 작업 완료 후 페이지가 최신 상태 |

---

### E. Part C — 인앱 구독 등록 (운영자 작업, Production AAB 업로드 후)

Production AAB가 Play Console에 업로드되면 **"정기결제"** 메뉴 활성화:
- `pro_monthly` (₩3,900/월) + 7일 무료 체험
- `pro_yearly` (₩35,900/연) + 7일 무료 체험
- 라이선스 테스터 등록 (테스트 결제용 본인 이메일)

---

### F. 내부 테스트 트랙 제출 (C 완료 후)

```powershell
eas submit -p android --latest
```

본인 기기 옵트인 → 설치 → Production 검증 시나리오:
1. Pro 구독 흐름 (월/연 결제 → verify-purchase → tier='pro' 반영)
2. Pro 트라이얼 (신규 가입 7일 → Pro 동급)
3. Pro 복원 (앱 재설치 후 이전 구매 복원)
4. 보상형 광고 (Free 한도 초과 → RewardedAdModal → +50단어)
5. KST 자정 초기화

---

## 권장 진행 순서

```
B (push, 1분)
   ↓
C (production build 시작, 백그라운드 15~25분)
   ↓ ┌── 빌드 진행 중 병렬
   │  D (Play Console 정책 갱신, 5~10분)
   │
빌드 완료
   ↓
E (Play Console에서 구독 상품 등록, 30~60분)
   ↓
F (eas submit → 내부 테스트 → 기기 검증)
```

A(검증)는 언제든 가능. dev server가 떠 있으면 즉시 체크.

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
| `f501900` | **B-1·B-2·B-3 follow-up** — 학습 화면 16dp 정밀 보정 + 14세 미만 자가 신고 토글 + Pro 한도 초과 모달 |
| `0a40eea` | **인프라 Part B/D/E/F 완료 반영** — EAS Secret + Supabase 마이그레이션·Secret·Edge Function deploy + pnpm-lock 보정 |
| `0cfde98` | **학습 화면 UI 일관성** — 헤더 통일(progressContainer 8dp, minWidth 70) + 카드 크기 통일(400) + 퀴즈/예문 카드↔선택지 간격 + 자동재생 페이드 제거 + 큐레이션 상세 배너 가림 해소 |
| `f6c1f93` | 퀴즈/예문학습 카드↔선택지 가로폭 정렬 (`choicesArea.paddingHorizontal` 20 → 24) |
| **다음 커밋** | **B-4 — 온보딩 생년월일 게이트(정공법) + AdMob child-directed 태그 전파** — 14세 미만 자가 신고 토글을 neutral age screen으로 교체. Google Play Families Policy + KISA 가이드라인 동시 충족 |

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

### B-1·B-2·B-3 작업 상세 (`f501900`)

**B-1 — 학습 화면 답 버튼 16dp 정밀 보정** (출시 차단 위험 해소)

- `components/ads/AppBannerAd.tsx`
  - `useAdsAllowed()` 훅 추출 — 광고 노출 판단 단일 진입점
  - `useAdsBottomInset()` 훅 신설 — 학습 화면이 광고 위 16dp 간격 확보용 padding 보정값 반환 (광고 표시 시 `BANNER_SLOT_HEIGHT + 16 = 66`, 미표시 시 `0`)
- 4개 학습 화면 모두 TODO 제거 + 적용 패턴 통일:
  - `features/study/flashcards/screen.tsx` — `bottom: insets.bottom + (adsBottomInset || 76)`
  - `features/study/quiz/screen.tsx` — `paddingBottom: insets.bottom + (adsBottomInset || 36)`
  - `features/study/examples/screen.tsx` — `paddingBottom: insets.bottom + (adsBottomInset || 36)`
  - `features/study/autoplay/screen.tsx` — `paddingBottom: insets.bottom + (adsBottomInset || 40)`
- 기존 버그 수정: quiz/examples(`+36`)·autoplay(`+40`)은 배너 높이(50)보다 작아 배너가 답 버튼을 가렸음. 이제 광고 표시 시 정확히 16dp 간격.

**B-2 — 14세 미만 자가 신고 토글** (AdMob + KR 아동 보호 컴플라이언스)

- `shared/contracts.ts` — `ProfileSettingsSchema`에 `isUnder14: z.boolean().default(false)` 추가. 기존 데이터는 default로 false 채워져 마이그레이션 불필요.
- `components/ads/AppBannerAd.tsx` — `useAdsAllowed`가 `profileSettings.isUnder14`까지 평가. 배너·`useAdsBottomInset` 자동 차단.
- `app/_layout.tsx` — `GlobalRewardedAdModal`에 `useAdsAllowed` 가드 추가. 14세 미만은 보상형 광고도 표시 안 됨.
- `app/(tabs)/settings.tsx` — "요금제 · 더보기" 섹션에 `Switch` row 추가 (고급 설정 아래)
- `i18n/locales/{ko,en}.json` — `settings.under14` / `settings.under14Desc` 키 추가

**B-3 — Pro 한도 초과 안내 모달** (Pro 약속 무결성 유지)

- `features/quota/store.ts`
  - `proLimitReachedAt: number` 필드 신설 (Free의 `quotaExceededAt`과 분리)
  - `notifyQuotaExceeded`에서 tier 분기: Pro면 `proLimitReachedAt`만 설정 (광고 trigger 안 함). Free는 기존 흐름.
  - `dismissProLimitReached` 메서드 추가
- `components/ads/ProLimitReachedModal.tsx` — 신규. 시계 아이콘 + 제목 + "KST 자정 자동 초기화" 안내 + 닫기. 광고 시청 흐름 없음.
- `app/_layout.tsx` — `GlobalProLimitReachedModal` 마운트
- `i18n/locales/{ko,en}.json` — `ads.proLimitTitle` / `ads.proLimitBody` 키 추가

### B-4 작업 상세 (다음 커밋) — 온보딩 생년월일 게이트

**배경**: B-2(설정 화면 14세 미만 자가 신고 토글)가 자유 ON/OFF여서 광고 회피 목적으로 악용 가능. 추가 조사 결과:
1. Google Play Families Policy "neutral age screen" 표준 — Duolingo/Quizlet/Memrise 모두 가입 시점 1회 수집
2. 한국 KISA 가이드라인 — "법정 생년월일" 직접 입력 또는 "만 14세 이상" 체크
3. `lib/ads/admob.ts`의 `tagForChildDirectedTreatment` / `tagForUnderAgeOfConsent` 둘 다 `false` 박혀 있어 AdMob 정책 누락 1건

→ 정공법으로 전환: 온보딩에서 생년월일 1회 수집 + 변경 시 고객센터 문의.

**신규/수정 파일**:
- `shared/contracts.ts` — `BirthdayStringSchema` 신설 + `ProfileSettingsSchema`에 `birthday?: string` (YYYY-MM-DD) + `birthdaySetAt?: number` 추가. `isUnder14`는 birthday 파생 필드로 격하 (직접 토글 불가)
- `lib/age.ts` (신규) — `computeAgeYears(iso, now)`, `isUnder14From(iso, now)`, `validateBirthday(iso, now)` 순수 함수
- `features/onboarding/BirthdayGateScreen.tsx` (신규) — Year/Month/Day TextInput 3개 (number-pad). placeholder 출발, 자동 포커스 이동, validate 후 confirm. Google neutral age screen 정책 준수 (기본값 미리 채우기 X, 연령 힌트 X)
- `app/age-gate.tsx` (신규) — `useLocalSearchParams<{from?: string}>()`로 'onboarding' vs 'migration' 분기. BackHandler 차단. submit 시 `updateProfileSettings({birthday, isUnder14, birthdaySetAt})` + `applyAdMobChildTags({isUnder14})` + 적절한 라우팅
- `features/onboarding/screen.tsx` — `handleFinish`가 `/login` 대신 `/age-gate?from=onboarding`으로 이동. `markOnboardingDone()`은 그대로 호출
- `app/_layout.tsx`:
  - `AppHydrators`: hydrate를 `Promise.all` await → birthday 있으면 `isUnder14From(birthday)` 재계산 → store 동기화 → `initAdMob()` 호출. 만 14세 생일 도래 시 cold start만으로 자동 해제됨
  - `applyAdMobChildTags`를 `isUnder14` 변경 감지 effect로 호출 (idempotent, 다음 광고 요청부터 적용)
  - `AppStack`: birthday 빈 값 + isOnboardingDone=true 시 `/age-gate`로 replace (기존 사용자 마이그레이션). auth 가드의 `inAuthScreen`에 'age-gate' 추가
  - `<Stack.Screen name="age-gate" />` 등록 (headerShown:false, gestureEnabled:false, animation:'fade')
- `app/(tabs)/settings.tsx` — `Switch` 제거. read-only Pressable row로 교체 → 좌측 calendar 아이콘 + "생년월일" + 값(`formatBirthday(iso, locale)`) + 14세 미만이면 " · 광고 비활성" 부착. 탭하면 Alert로 "한 번만 설정 가능, 변경은 고객센터 문의" 안내
- `lib/ads/admob.ts` — `applyAdMobChildTags({isUnder14})` 함수 분리. `setRequestConfiguration`이 `tagForChildDirectedTreatment` + `tagForUnderAgeOfConsent` + `maxAdContentRating`(14세 미만은 G, 아니면 PG)을 동적 반영. `initAdMob()`은 보수적 기본값(`isUnder14: false`)으로 초기 호출 후 effect가 실제 값으로 덮어씀
- `i18n/locales/{ko,en}.json` — 신규 키 13개:
  - `onboarding.birthday.title` / `.subtitle` / `.migrationNotice` / `.year` / `.month` / `.day` / `.confirm` / `.invalid` / `.future`
  - `settings.birthday` / `.birthdayNotSet` / `.birthdayChangeNotice` / `.adsDisabledUnder14`
  - 기존 `settings.under14` / `.under14Desc`은 deprecated (사용처 없음, 삭제는 v1.2)

**검증 시나리오** (dev build 재빌드 후 진행):
1. 신규 사용자: 온보딩 4 슬라이드 → "시작하기" → `/age-gate` → 14세 미만 입력 → AdMob 광고 차단
2. 기존 사용자(`isOnboardingDone=true`, birthday 빈 값): 앱 진입 즉시 `/age-gate?from=migration` → 입력 → 원래 탭 복귀
3. 기존 v1.0 토글러: 위 (2)와 동일. 14세 이상 입력 시 isUnder14 자동 false 덮어쓰기
4. AdMob 태그: ad request 헤더에 `tagForChildDirectedTreatment=true` 전파 확인 (logcat)
5. 자동 해제: 시스템 시간 +1년 조작 후 cold start → `isUnder14From` 재계산 → 광고 자동 노출

**위험/트레이드오프**:
- 입력 거부 시 앱 사용 불가 (정공법 표준 — Duolingo/Quizlet 동일)
- 변조 가능성: 루팅 단말에서 AsyncStorage 조작 가능. `birthdaySetAt`은 best-effort 흔적용 (v1.2에서 SecureStore 검토)
- 번역 초안: ko/en만. 일/중 출시 시점에 보강

### 학습 화면 UI 일관성 작업 상세 (`0cfde98`)

dev build 검증으로 발견한 5개 학습 흐름 UI 이슈 일괄 정리 (1차/2차/4차 라운드 통합):

**헤더 통일**:
- 단어장 상세(`app/list/[id].tsx`) + 학습 화면 4종 `progressContainer.paddingBottom: 8dp` 통일
- 학습 화면 4종 `progressText.minWidth: 60 → 70` (단어장 상세 따라감) — progressBar 길이 일치

**카드 크기 통일** (`features/study/{flashcards,autoplay}/screen.tsx`):
- 플래시카드: `card.minHeight: 400` 유지
- 자동재생: `card.minHeight: 450 → 400` (플래시카드와 동일)

**퀴즈/예문 (`features/study/{quiz,examples}/screen.tsx`)**:
- `choicesArea.marginTop: -12 → 12` (음수 margin 제거)
- ScrollView contentContainerStyle `paddingTop: 0 → 16` (헤더 ↔ 카드 16dp)

**자동재생** (`features/study/autoplay/screen.tsx`):
- `controlsGradient` LinearGradient + 스타일 제거 (사용자에겐 '뿌옇게' 거슬림)

**큐레이션 상세 배너 가림 해소** (`features/curation/screen.tsx`):
- `selectedTheme` 진입 시 `mode="tab-anchor"` 배너 숨김 — masterBar(단어장 추가) 가려지던 버그 해소

**플래시카드 카드 ↔ bottomBar trade-off (의도적 결정)**:
- 1차에서 paddingBottom 200 → 120, 4차에서 자동재생과 카드 시작 위치 통일 시도했으나 작은 폰에서 카드/버튼 간섭 발생
- 최종: paddingBottom 200, bottomBar offset +32 유지 (안전 우선)
- 자동재생과의 카드 시작 위치 절대 일치는 화면 크기 변동성 때문에 포기. 각 화면에서 안전한 자연 spacing 유지

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
| ~~학습 화면 답 버튼 16dp 정밀 보정~~ | ✅ 완료 (`f501900`) | quiz/examples/autoplay 배너 겹침 버그 함께 해소 |
| ~~14세 미만 자가 신고 동의 흐름~~ | ✅ 완료 (`f501900`) | 설정 화면 토글. v1.1은 가장 가벼운 옵션 (자가 신고). v1.2에서 onboarding 동의 강화 검토 |
| ~~Pro 한도 초과 UX~~ | ✅ 완료 (`f501900`) | ProLimitReachedModal + tier 분기 |
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
| 서비스 계정 | `avocado-ai-proxy-806@avocado-491710.iam.gserviceaccount.com` |
| 역할 | `roles/aiplatform.user` |
| JSON 키 | ✅ 발급·보관 |

### Part B — AdMob ✅ 완료 (2026-05-19)

- [x] AdMob 앱 등록 — "아보카도"
- [x] 배너 광고 단위 ID 발급: `ca-app-pub-2552217172819688/1006191991`
- [x] 보상형 광고 단위 ID 발급: `ca-app-pub-2552217172819688/9960062757`
- [x] App ID: `ca-app-pub-2552217172819688~7571600348`
- [x] EAS Secret 3종 등록:
  - `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID`
  - `EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID`
  - `EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID`

> ⏳ 광고 단위 활성화까지 ~24시간 대기 (그동안 테스트 ID로 동작 검증 가능)

### Part C — Play 인앱구독 ⏳ 미완료 (Production AAB 업로드 후 가능)

- [ ] Play Console에 정기결제 상품 등록:
  - `pro_monthly` (₩3,900/월)
  - `pro_yearly` (₩35,900/연)
- [ ] 각 상품에 7일 무료 체험 offer 추가
- [ ] 라이선스 테스터 등록 (테스트 결제용)

> Play Console은 결제 라이브러리(`expo-iap`) 포함된 빌드가 업로드되어야 구독 메뉴 활성화. v1.1 Production AAB 업로드 후 진행 가능.

### Part D — Play Developer API 서비스 계정 ✅ 완료 (2026-05-19)

- [x] GCP Console에서 SA 생성: `avocado-play-verify@avocado-491710.iam.gserviceaccount.com`
- [x] JSON 키 다운로드 + 채팅 노출 사고 후 재발급 1회
- [x] Play Console "사용자 및 권한"에서 SA 초대 + 권한 부여
  - 재무 데이터, 주문 및 취소 결제 조사 보기 ✓
  - 주문 및 구독 보기 ✓

> ⏳ 권한 전파 ~24시간 대기. (Play Console "API 액세스" 메뉴는 신규 계정엔 사이드바에서 숨겨져 있어 "사용자 및 권한" 경로로 우회)

### Part E — Supabase ✅ 완료 (2026-05-19)

- [x] `supabase link --project-ref ithqbclnwvyeultkyxbn`
- [x] DB 마이그레이션 2개 적용:
  - `20260518000000_ai_quota.sql` ✓ (user_subscriptions, ai_usage_daily, RPC)
  - `20260519000000_quota_status_client_grant.sql` ✓ (클라이언트 RPC grant)
- [x] Supabase Secrets 7종 등록:
  - **enrich-word용**: `VERTEX_PROJECT_ID=avocado-491710`, `VERTEX_LOCATION=us-central1`, `VERTEX_SA_CLIENT_EMAIL`, `VERTEX_SA_PRIVATE_KEY`
  - **verify-purchase용**: `ANDROID_PACKAGE_NAME=com.soksokvoca`, `PLAY_SA_CLIENT_EMAIL`, `PLAY_SA_PRIVATE_KEY`
- [x] Edge Function 2개 배포 (둘 다 status `ACTIVE`):
  - `enrich-word` (version 2)
  - `verify-purchase` (version 2)
- [x] EAS Secret `EXPO_PUBLIC_ENRICH_VIA_EDGE=1` 등록
- [ ] GCP Budget cap (월 $20 등) + Vertex AI Quotas cap (선택, 출시 후 권장)

> Vertex AI SA: `avocado-ai-proxy-806@avocado-491710.iam.gserviceaccount.com`. Private key 2종은 PEM 줄바꿈 파싱 이슈로 Supabase 웹 대시보드에서 직접 등록 (CLI env-file은 BOM 이슈로 실패).

### Part F — 패키지 보정 ✅ 완료 (2026-05-19)

- [x] `pnpm install` — `expo-iap`, `react-native-google-mobile-ads` lock 보정 완료 (+5 −101 packages)
- [ ] `pnpm lint` — 변경분 점검 (선택)
- [ ] EAS dev build (네이티브 모듈 포함이라 새 빌드 필요)

---

## 작업 의존도 그래프

```
Phase 0 (사용자 인프라)
   ✅ Part B AdMob 등록·광고 단위 발급·EAS Secret (활성화 24h 대기)
   ⏳ Part C Play 인앱구독 등록 (Production AAB 업로드 후 가능)
   ✅ Part D Play Developer API SA 생성·권한 부여 (전파 24h 대기)
   ✅ Part E Supabase 마이그레이션 + Secret + Edge deploy
   ✅ Part F pnpm install 보정

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

Phase 4 ✅ 완료 (B-1·B-2·B-3, `f501900`)
   • 학습 화면 답 버튼 16dp 정밀 보정 (출시 차단 위험 해소)
   • 14세 미만 자가 신고 토글
   • Pro 한도 초과 안내 모달

Phase 5 (Part B~E 완료 후) ← 다음 작업
   • #14 통합 테스트 + Production AAB 재빌드 → 내부 테스트 트랙 업데이트
   • 데이터 보안 폼 갱신 (광고 ID + 구매 내역)
   • 콘텐츠 등급 설문 재답변 (디지털 구매·광고 = 예)
```

---

## 다음 세션에서 진행할 작업 (우선순위 순)

### A. 사용자 측 진척 확인 (대화 시작 시 묻기)

- [x] **Part B (AdMob)** — App ID + Banner + Rewarded ID 발급, EAS Secret 등록 완료 ✅
- [ ] **Part C (Play 구독)** — Production AAB 업로드 후 진행. 라이선스 테스터 등록 포함
- [x] **Part D (Play Verify SA)** — SA 생성, 권한 부여 완료 ✅ (전파 ~24h 대기)
- [x] **Part E (Supabase)** — 마이그레이션 적용, Secret 7종, Edge Function 2개 deploy 모두 완료 ✅
- [x] **Part F (`pnpm install`)** — 의존성 보정 완료 ✅
- [ ] **광고 단위 활성화** — Part B 등록 후 ~24h 대기 (시작: 2026-05-19)
- [ ] **Play SA 권한 전파** — Part D 부여 후 ~24h 대기 (시작: 2026-05-19)

### B. 코드 작업 — ✅ 완료 (`f501900`)

B-1·B-2·B-3 모두 완료. 상세는 위 "B-1·B-2·B-3 작업 상세" 섹션 참고.

남은 코드 follow-up은 모두 v1.2 또는 iOS 출시 시점 항목 (위 Follow-up 표 참조).

### C. 통합 테스트 (Part B~E 완료 후)

EAS dev build로 다음 시나리오 검증:

1. **배너 가드** — Free/Pro/게스트/under14 각 케이스에서 배너 노출/숨김 검증
2. **보상형 광고** — Free 한도 100단어 초과 → 자동 모달 → 시청 → +50 단어 → 추가 enrich 동작 확인
3. **보상형 일 cap** — 보상 4회(+200) 후엔 모달이 "오늘 광고 보너스 상한" 메시지 표시
4. **Pro 구독** — 월/연 각각 결제 → verify-purchase 응답 ok → tier='pro' 반영 + 광고 제거
5. **Pro 트라이얼** — 신규 가입 7일 트라이얼 → Pro 동급 동작
6. **Pro 복원** — 앱 재설치 후 "이전 구매 복원" → tier='pro' 복원
7. **Pro 한도 초과** — 1,000단어 초과 시 ProLimitReachedModal 표시 + "KST 자정 초기화" 안내 (광고 흐름 없음)
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

### AdMob 정책
- 신규 광고 단위는 활성화까지 ~24시간
- ~~14세 미만~~ ✅ `f501900` 설정 화면 자가 신고 토글로 해결. v1.2에서 onboarding 동의 흐름으로 강화 검토.
- ~~학습 화면 배너 16dp 간격~~ ✅ `f501900` `useAdsBottomInset` 훅으로 4개 화면 모두 정밀 보정

### Pro 결제 UX
- ~~Pro 사용자 1,000단어 한도 초과 안내 부재~~ ✅ `f501900` ProLimitReachedModal 추가. `notifyQuotaExceeded`가 tier별 분기.
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
| 서비스 계정 (Vertex) | `avocado-ai-proxy-806@avocado-491710.iam.gserviceaccount.com` |
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
