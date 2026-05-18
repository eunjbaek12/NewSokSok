# v1.1 (광고·인앱구독) 작업 인수인계

작성일: 2026-05-18

다음 세션으로 이어갈 인수인계 문서. v1 내부 테스트 출시 + v1.1 코드 작업 계속.

---

## 한 줄 현재 상황

**v1 AAB(versionCode 3, Naver 포함)** 를 Play Console 내부 테스트 트랙에 업로드 중. 광고 ID 선언 충돌로 보류 → "광고 ID 사용 안 함"으로 변경 후 재업로드. **v1.1 코드 작업**(Edge Function·AdMob·Pro 결제 등)은 사용자 인프라 작업 완료 대기 중.

---

## 정책 확정사항 (Task #1 — 완료)

### 단계적 출시 (v1 → v1.1)

```
v1 (현재): 3-tier
   • Free (게스트 + 로그인 무료)
   • BYOK (자기 Gemini 키)
   • Pro 미구현 — 다음 빌드에서

v1.1 (목표): 3-tier + 광고 + 결제
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

## 완료된 작업 (이번 세션)

### 코드 변경 (미커밋 — 정리 필요)

| 영역 | 파일 | 작업 |
|---|---|---|
| Naver 제거 | `lib/naver-dict-api.ts` (삭제), `lib/datamuse-api.ts` (신규), `lib/translation-api.ts`, `app/add-word.tsx` | 비공식 API 호출 제거. Datamuse(영어 자동완성)만 분리 보존. 외부 링크는 유지 |
| 테스트 정리 | `__tests__/batch-import-pipeline.test.ts`, `__tests__/photo-import-pipeline.test.ts` | Naver mock·시나리오 제거, Gemini-only 재작성. 45/45 통과 |
| 큐레이션 저작권 | `constants/curationData.ts` | 어린 왕자 제거(496줄). Alice/Sherlock description에 "PD" 출처 명시 |
| 라이선스 페이지 | `app/licenses.tsx` (신규), `app/(tabs)/settings.tsx`, `i18n/locales/{ko,en}.json` | "오픈소스 및 데이터 출처" 페이지 추가 (5섹션) |
| 정책 문서 | `CLAUDE.md` | sync debounce 30초 정정, AI Calls 섹션 갱신, Backend strategy 변경, Monetization 섹션 신규, Curation Licensing 섹션 신규 |
| 가이드 문서 | `docs/handoff-monetization-setup.md` (신규), `docs/handoff-play-console-setup.md` (신규) | 운영자 인프라 + Play Console 등록 가이드 |
| 계정 삭제 페이지 | `docs/account-deletion.html` ✅ 커밋·push 완료 | `https://eunjbaek12.github.io/NewSokSok/account-deletion.html` |

### 정리 예정 커밋 (4묶음)

1. `chore: Naver 비공식 API 호출 제거` — naver-dict-api 삭제, datamuse-api 신규, translation-api, add-word, 테스트 2개
2. `chore: 어린왕자 큐레이션 제거 + Alice/Sherlock PD 출처 명시` — curationData
3. `feat: 오픈소스 및 데이터 출처 페이지 추가` — licenses.tsx, settings.tsx, i18n
4. `docs: v1.1 정책·인프라 가이드 + CLAUDE.md 갱신` — CLAUDE.md, handoff-monetization-setup.md, handoff-play-console-setup.md

> 미커밋 사항: `.claude/settings.local.json` 변경은 사용자 로컬이라 커밋 X (gitignore 추가 검토).

---

## 사용자 측 진행 상황 (운영자 작업)

### Play Console v1 등록 (진행 중)

| 단계 | 상태 |
|---|---|
| 1. 앱 생성 | ✅ |
| 2. 정책 선언 10개 (콘텐츠 등급·데이터 보안·앱 액세스·광고·타겟층 등) | ✅ |
| 3. 스토어 등록정보 | ✅ |
| 4. AAB 업로드 (내부 테스트 트랙) | ⏳ **광고 ID 선언 충돌 해결 후 재시도** |
| 5. SHA-1 → Google OAuth 등록 | ⏳ |
| 6. 본인 기기 옵트인·설치·검증 | ⏳ |

### 광고 ID 선언 충돌 해결법 (진행 중인 이슈)

**원인**: Play Console "광고 ID 사용함"으로 답함 + v1 AAB에 AdMob SDK 없음 → `AD_ID` 권한 매니페스트에 없음 → 충돌.

**해결**: 
1. Play Console → 정책 → 앱 콘텐츠 → 광고 ID → **"사용 안 함"** 으로 변경
2. 데이터 보안 폼에서도 광고 ID 항목 체크 해제 (필요 시)
3. AAB 업로드 재시도

> v1.1 빌드에 AdMob SDK 추가하면 `AD_ID` 권한 자동 포함 → 그때 "사용함"으로 변경.

### 출시 노트 (입력용)
```
<ko-KR>
• 첫 내부 테스트 빌드
• 단어장 학습·AI 자동완성 기본 기능
</ko-KR>
<en-US>
• First internal test build
• Vocabulary learning and AI auto-complete features
</en-US>
```

### Part A — GCP Agent Platform (구 Vertex AI) ✅ 완료

| 항목 | 값 |
|---|---|
| GCP 프로젝트 | 사용자 별도 보관 |
| Agent Platform API (구 Vertex AI API) | ✅ 활성화 |
| 결제 등록 | ✅ |
| 서비스 계정 | `avocado-ai-proxy@<project>.iam.gserviceaccount.com` |
| 역할 | `Agent Platform User` (`roles/aiplatform.user`) |
| JSON 키 파일 | ✅ 발급·안전한 폴더 보관 |

> 2026-04 리브랜딩: Google이 Vertex AI를 "Gemini Enterprise Agent Platform"으로 이름 변경. URL·SDK·기능 동일.

### Part B — AdMob ⏳ 미완료
- v1.1 코드 작업 시작 전 또는 병행
- 필요 값: 앱 ID, 배너 광고 단위 ID, 보상형 광고 단위 ID

### Part C — Play 인앱구독 ⏳ 미완료
- Play Console 앱 등록 완료 후 가능
- 필요 값: `pro_monthly`, `pro_yearly` 상품 ID

---

## v1.1 코드 작업 (남은 Task)

| Task | 작업 | 사용자 사전 작업 필요 | 상태 |
|---|---|---|---|
| #3 | Supabase Edge Function (`enrich-word`) — Agent Platform Gemini 호출 + 사용자별 quota | Vertex AI JSON 키 (deploy 시) | ✅ 코드 작성 완료 (2026-05-18). deploy 대기 |
| #4 | AdMob SDK 통합 (`react-native-google-mobile-ads`) + 배너 + 보상형 | AdMob 광고 단위 ID | ⏳ |
| #5 | Pro 인앱구매 통합 (Play Billing) + 영수증 검증 | Play 구독 상품 ID | ⏳ |
| #6 | 클라이언트 enrich 흐름 → Edge Function 호출로 교체 | #3 완료 후 | ✅ #3과 함께 완료 (EXPO_PUBLIC_ENRICH_VIA_EDGE=1 으로 활성) |
| #7 | 설정 UI 개편 (BYOK 고급 설정 격하, Pro 결제 화면) | #4·#5 완료 후 | ⏳ |
| #10 | FAQ 전면 개정 (Naver 출처 제거, BYOK/Pro 정책 반영, 사진 스캔 다국어) | 사용자 결정 무관 | ✅ 완료 (2026-05-18) |
| #11 | 개인정보 처리방침 + 약관 업데이트 (광고·결제 반영) | #4·#5 완료 후 | ⏳ |
| #14 | 통합 테스트 + Production AAB 재빌드 | 모든 작업 완료 후 | ⏳ |

### #3 Edge Function deploy 체크리스트 (사용자 측)

1. Supabase CLI 설치 (`scoop install supabase` 또는 `brew install supabase/tap/supabase`)
2. `supabase login` + `supabase link --project-ref <ref>`
3. DB 마이그레이션 적용: `supabase db push` (`supabase/migrations/20260518000000_ai_quota.sql`)
4. Secrets 설정 (`supabase/functions/enrich-word/README.md` 참고)
   - `VERTEX_PROJECT_ID`, `VERTEX_LOCATION`, `VERTEX_SA_CLIENT_EMAIL`, `VERTEX_SA_PRIVATE_KEY`
5. 배포: `supabase functions deploy enrich-word`
6. 앱 환경변수에 `EXPO_PUBLIC_ENRICH_VIA_EDGE=1` 추가 (EAS Secret 권장)
7. GCP Budget cap 설정 (월 $20 등) + Vertex AI Quotas cap 권장

### 작업 의존도 그래프
```
Phase 0 (사용자 인프라, 병렬)
   • Part B AdMob 등록·광고 단위 발급
   • Part C Play 인앱구독 등록

Phase 1 (즉시 가능, 사용자 인프라 무관)
   • #10 FAQ 전면 개정

Phase 2 (Vertex AI JSON 필요)
   • #3 Edge Function

Phase 3 (광고 단위·상품 ID 필요)
   • #4 AdMob SDK
   • #5 Pro 인앱구매
   • #6 enrich 흐름 교체

Phase 4
   • #7 UI 개편 (BYOK 격하, Pro 결제 화면)
   • #11 약관·정책 갱신

Phase 5
   • #14 통합 테스트 + AAB 재빌드 → 내부 테스트 트랙 업데이트
```

---

## 다음 세션 시작 흐름

### 1. 미커밋 변경사항 정리 (4묶음 커밋)

Play Console 작업이 막힌 단계가 풀리면 먼저 진행. 사용자 동의 후 시작.

### 2. 사용자 사전 작업 확인
- Vertex AI JSON 키 받았는지 (client_email만 알려주면 OK, JSON은 사용자가 Edge Function 환경변수에 직접 입력)
- AdMob 등록 진행 상황
- Play Console v1 출시 상태

### 3. 즉시 시작 가능한 작업: #10 FAQ 전면 개정
- ko/en 양쪽 FAQ
- Naver 사전 출처 제거
- BYOK/Pro 정책 반영
- 사진 스캔 다국어/출처 수정
- 광고·결제 관련 FAQ 추가

### 4. 사용자 사전 작업 끝나면 Phase 2~5 진행

---

## 알려진 이슈 / 주의사항

### Play Console
- 광고 ID 선언과 매니페스트 권한 일치 필수 (v1.1 시점에 다시 "사용함"으로)
- 데이터 보안 폼: v1.1 빌드 시 "광고 ID 수집" + "구매 내역 수집" 추가
- 콘텐츠 등급 설문: v1.1엔 "디지털 구매 = 예", "광고 = 예"로 답해 등급 갱신 필요할 수도

### AdMob 정책
- 신규 광고 단위는 활성화까지 ~24시간
- 14세 미만 사용자에게는 광고 비활성 (코드에서 처리 필요)
- 학습 화면에는 광고 노출 (퀴즈 화면 답 버튼과 16dp 이상 간격 필수, 오탭 방지)

### EAS 빌드
- `EAS_SKIP_AUTO_FINGERPRINT=1` 환경변수 다음 빌드에도 필요 (brace-expansion 이슈, 출시 후 해결)
- versionCode 자동 증분 (3 → 4 → ...)
- GOOGLE_SERVICES_JSON EAS Secret으로 주입됨

### CLAUDE.md "No backend server" 정책
- Supabase Edge Function은 BaaS 서버리스라 정책 준수 OK
- Express 서버 부활 아님

### 큐레이션 정리
- 어린 왕자 단어장 제거 완료 (글로벌 안전)
- Alice/Sherlock은 PD 명시 (한국·전세계 PD)
- 큐레이션 신고 기능 v1.x에서 추가 권장 (UGC 정책 강화)

---

## 환경/계정 메모 (handoff-play-release.md에서 갱신)

| 항목 | 값 |
|---|---|
| Expo/EAS 프로젝트 | `@baekeunjoeng/soksok-voca` |
| Expo projectId | `2d560de2-a41b-4ac1-a019-d287f7aaa2d6` |
| Play 패키지명 | `com.soksokvoca` |
| Firebase 프로젝트 | `avocado-491710` |
| GCP 프로젝트 (Agent Platform) | 사용자가 별도 보관 (Part A 완료) |
| 서비스 계정 (Agent Platform) | `avocado-ai-proxy@...iam.gserviceaccount.com` |
| Supabase URL | `https://ithqbclnwvyeultkyxbn.supabase.co` |
| 개인정보 처리방침 | https://eunjbaek12.github.io/NewSokSok/privacy-policy.html |
| 계정 삭제 안내 | https://eunjbaek12.github.io/NewSokSok/account-deletion.html ✅ 신규 |
| v1 AAB | https://expo.dev/artifacts/eas/jSwoo5f88KR1C2jf4PMXL8.aab |
| 출시 가격 | Pro 월 3,900원 / 연 35,900원 |

---

## 빠른 명령 모음

```bash
# 빌드 상태
eas build:list --platform android --limit 3

# 새 빌드 (v1.1)
$env:EAS_SKIP_AUTO_FINGERPRINT=1; eas build --profile production --platform android --non-interactive

# Secret 점검
eas env:list production

# 자격증명
eas credentials --platform android

# Play 제출
eas submit -p android --latest

# 미커밋 정리
git status
git log -1
```

---

## 참고 문서

- `CLAUDE.md` — 코드 정책 (모네타이제이션 섹션 포함)
- `docs/handoff-play-release.md` — v1 빌드 시점 인수인계 (2026-05-15)
- `docs/handoff-monetization-setup.md` — 사용자 인프라 가이드 (GCP·AdMob·Play 인앱)
- `docs/handoff-play-console-setup.md` — Play Console 등록 가이드
- `store-assets/` — 스토어 자산 (스크린샷·아이콘·그래픽·정책 답변지)
